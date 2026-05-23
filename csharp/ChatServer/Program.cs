using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ChatServer.Data;
using ChatServer.Data.Models;
using ChatShared;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;

// ─── Config ───────────────────────────────────────────────────────────
var config = new ConfigurationBuilder()
    .SetBasePath(AppContext.BaseDirectory)
    .AddJsonFile("appsettings.json", optional: true)
    .AddEnvironmentVariables()
    .Build();

var dbProvider = config["Database:Provider"] ?? "Sqlite";
var uploadRoot = Path.GetFullPath(config["Storage:UploadPath"] ?? "uploads");
Directory.CreateDirectory(uploadRoot);

var dbOptions = CreateDbOptions(config, dbProvider);

await using (var db = new AppDbContext(dbOptions))
{
    await db.Database.EnsureCreatedAsync();
    await SeedAsync(db);
}

var tcpPort = WireProtocol.TcpPort;
var httpPort = WireProtocol.HttpPort;

if (!IsPortAvailable(tcpPort))
{
    Console.Error.WriteLine($"[ERROR] TCP port {tcpPort} is already in use.");
    Console.Error.WriteLine("Stop the other ChatServer window (Ctrl+C) or run:");
    Console.Error.WriteLine($"  Get-NetTCPConnection -LocalPort {tcpPort} | %% Stop-Process -Id OwningProcess -Force");
    return 1;
}

if (!IsPortAvailable(httpPort))
{
    Console.Error.WriteLine($"[ERROR] HTTP port {httpPort} is already in use.");
    Console.Error.WriteLine("Stop the other ChatServer window (Ctrl+C) or run:");
    Console.Error.WriteLine($"  Get-NetTCPConnection -LocalPort {httpPort} | %% Stop-Process -Id OwningProcess -Force");
    return 1;
}

var sessions = new ConcurrentDictionary<Guid, ClientSession>();
var cts = new CancellationTokenSource();

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://0.0.0.0:{WireProtocol.HttpPort}");
var http = builder.Build();

http.MapPost("/api/files/upload", async (HttpRequest req) =>
{
    if (!req.Headers.TryGetValue("X-User-Id", out var userHeader) || !Guid.TryParse(userHeader, out var userId))
        return Results.Unauthorized();

    var form = await req.ReadFormAsync(new FormOptions { MultipartBodyLengthLimit = long.MaxValue });
    var file = form.Files.FirstOrDefault();
    if (file == null) return Results.BadRequest(new { error = "No file" });

    await using var db = new AppDbContext(dbOptions);
    var storedName = $"{Guid.NewGuid()}-{file.FileName}";
    var path = Path.Combine(uploadRoot, storedName);
    await using (var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 1024 * 1024, useAsync: true))
    {
        await file.CopyToAsync(fs);
    }

    var contentType = GuessContentType(file.FileName, file.ContentType);
    var record = new FileRecord
    {
        Id = Guid.NewGuid(),
        OriginalName = file.FileName,
        StoredPath = storedName,
        ContentType = contentType,
        Size = file.Length,
        UploadedAtUtc = DateTime.UtcNow,
        UploadedById = userId
    };
    db.FileRecords.Add(record);
    await db.SaveChangesAsync();

    return Results.Json(new
    {
        fileId = record.Id,
        url = $"http://{req.Host}/api/files/{record.Id}",
        name = record.OriginalName,
        type = record.ContentType,
        size = record.Size
    });
});

http.MapGet("/api/files/{id:guid}", async (Guid id) =>
{
    await using var db = new AppDbContext(dbOptions);
    var file = await db.FileRecords.FindAsync(id);
    if (file == null) return Results.NotFound();
    var path = Path.Combine(uploadRoot, file.StoredPath);
    if (!File.Exists(path)) return Results.NotFound();
    return Results.File(path, file.ContentType, file.OriginalName);
});

Console.WriteLine("=== Chatting Group Server ===");
Console.WriteLine($"TCP  : {tcpPort}");
Console.WriteLine($"HTTP : {httpPort}");
Console.WriteLine($"DB   : {dbProvider} ({DescribeDatabase(config, dbProvider)})");
PrintLan(tcpPort, httpPort);

static DbContextOptions<AppDbContext> CreateDbOptions(IConfiguration config, string provider)
{
    var builder = new DbContextOptionsBuilder<AppDbContext>();

    if (provider.Equals("Postgres", StringComparison.OrdinalIgnoreCase)
        || provider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase))
    {
        var conn = config.GetConnectionString("Postgres")
            ?? "Host=localhost;Port=5432;Database=chatting_group;Username=postgres;Password=postgres";
        builder.UseNpgsql(conn);
        return builder.Options;
    }

    var sqliteConn = config.GetConnectionString("Sqlite") ?? "Data Source=chatting_group.db";
    if (sqliteConn.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase))
    {
        var file = sqliteConn["Data Source=".Length..].Trim();
        if (!Path.IsPathRooted(file))
        {
            file = Path.Combine(AppContext.BaseDirectory, file);
        }
        sqliteConn = $"Data Source={file}";
    }

    builder.UseSqlite(sqliteConn);
    return builder.Options;
}

static string DescribeDatabase(IConfiguration config, string provider)
{
    if (provider.Equals("Postgres", StringComparison.OrdinalIgnoreCase)
        || provider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase))
    {
        return config.GetConnectionString("Postgres") ?? "PostgreSQL";
    }

    return config.GetConnectionString("Sqlite") ?? "chatting_group.db";
}

try
{
    var tcpTask  = RunTcpServerAsync(dbOptions, sessions, tcpPort, cts.Token);
    var httpTask = http.RunAsync(cts.Token);

    await Task.WhenAny(tcpTask, httpTask);
}
finally
{
    cts.Cancel();
}

return 0;

// ─── TCP ──────────────────────────────────────────────────────────────
static bool IsPortAvailable(int port)
{
    try
    {
        using var listener = new TcpListener(IPAddress.Any, port);
        listener.Start();
        listener.Stop();
        return true;
    }
    catch (SocketException)
    {
        return false;
    }
}

static async Task RunTcpServerAsync(
    DbContextOptions<AppDbContext> dbOptions,
    ConcurrentDictionary<Guid, ClientSession> sessions,
    int tcpPort,
    CancellationToken token)
{
    var listener = new TcpListener(IPAddress.Any, tcpPort);
    listener.Start();
    Console.WriteLine($"[TCP] Listening on {tcpPort}");

    while (!token.IsCancellationRequested)
    {
        var client = await listener.AcceptTcpClientAsync(token);
        _ = HandleClientAsync(client, dbOptions, sessions, token);
    }
}

static async Task HandleClientAsync(
    TcpClient tcp,
    DbContextOptions<AppDbContext> dbOptions,
    ConcurrentDictionary<Guid, ClientSession> sessions,
    CancellationToken token)
{
    var sessionId = Guid.NewGuid();
    await using var stream = tcp.GetStream();
    using var reader = new StreamReader(stream, Encoding.UTF8);
    await using var writer = new StreamWriter(stream, Encoding.UTF8) { AutoFlush = true };
    var session = new ClientSession(sessionId, writer);
    sessions[sessionId] = session;

    try
    {
        while (!token.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(token);
            if (line == null) break;
            if (string.IsNullOrWhiteSpace(line)) continue;

            WirePacket? packet;
            try
            {
                packet = JsonSerializer.Deserialize<WirePacket>(line, WireProtocol.JsonOptions);
            }
            catch
            {
                await SendAsync(session, new WirePacket { Op = "error", Message = "Invalid JSON" });
                continue;
            }

            if (packet == null) continue;
            await DispatchAsync(packet, session, dbOptions, sessions);
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[TCP] Client error: {ex.Message}");
    }
    finally
    {
        sessions.TryRemove(sessionId, out _);
        if (session.UserId.HasValue)
        {
            await using var db = new AppDbContext(dbOptions);
            var user = await db.Users.FindAsync(session.UserId.Value);
            if (user != null)
            {
                user.IsOnline = false;
                user.LastSeenUtc = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
            await BroadcastPresenceAsync(dbOptions, sessions);
        }
        tcp.Close();
    }
}

static async Task DispatchAsync(
    WirePacket packet,
    ClientSession session,
    DbContextOptions<AppDbContext> dbOptions,
    ConcurrentDictionary<Guid, ClientSession> sessions)
{
    switch (packet.Op.ToLowerInvariant())
    {
        case "login":
        case "register":
            await HandleLoginAsync(packet, session, dbOptions, sessions, isRegister: packet.Op == "register");
            break;
        case "rooms":
            await SendRoomsAsync(session, dbOptions);
            break;
        case "create_room":
            await HandleCreateRoomAsync(packet, session, dbOptions, sessions);
            break;
        case "join":
            await HandleJoinAsync(packet, session, dbOptions);
            break;
        case "send":
            await HandleSendAsync(packet, session, dbOptions, sessions);
            break;
        case "call_start":
            await HandleCallStartAsync(packet, session, dbOptions, sessions);
            break;
        case "call_end":
            await HandleCallEndAsync(packet, session, dbOptions, sessions);
            break;
        default:
            await SendAsync(session, new WirePacket { Op = "error", Message = $"Unknown op: {packet.Op}" });
            break;
    }
}

static async Task HandleLoginAsync(
    WirePacket packet,
    ClientSession session,
    DbContextOptions<AppDbContext> dbOptions,
    ConcurrentDictionary<Guid, ClientSession> sessions,
    bool isRegister)
{
    var username = (packet.Username ?? "").Trim().ToLowerInvariant();
    var password = packet.Password ?? "";
    if (string.IsNullOrWhiteSpace(username))
    {
        await SendAsync(session, new WirePacket { Op = "error", Message = "Username required" });
        return;
    }

    await using var db = new AppDbContext(dbOptions);
    var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
    var hash = HashPassword(password);

    if (isRegister)
    {
        if (user != null)
        {
            await SendAsync(session, new WirePacket { Op = "error", Message = "Username taken" });
            return;
        }
        user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            DisplayName = packet.DisplayName?.Trim() ?? username,
            PasswordHash = hash,
            IsOnline = true,
            LastSeenUtc = DateTime.UtcNow
        };
        db.Users.Add(user);
        var global = await db.Rooms.FirstAsync(r => r.Name == "Thế giới");
        db.RoomMembers.Add(new RoomMember { RoomId = global.Id, UserId = user.Id, JoinedAtUtc = DateTime.UtcNow });
        await db.SaveChangesAsync();
    }
    else
    {
        if (user == null || user.PasswordHash != hash)
        {
            await SendAsync(session, new WirePacket { Op = "error", Message = "Invalid login" });
            return;
        }
        user.IsOnline = true;
        user.LastSeenUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    session.UserId = user!.Id;
    session.DisplayName = user.DisplayName;

    await SendAsync(session, new WirePacket
    {
        Op = "ok",
        UserId = user.Id,
        DisplayName = user.DisplayName,
        Message = isRegister ? "Registered" : "Logged in"
    });
    await SendRoomsAsync(session, dbOptions);
    await BroadcastPresenceAsync(dbOptions, sessions);
}

static async Task SendRoomsAsync(ClientSession session, DbContextOptions<AppDbContext> dbOptions)
{
    await using var db = new AppDbContext(dbOptions);
    var rooms = await db.Rooms.OrderBy(r => r.Name).Select(r => new RoomWireDto
    {
        Id = r.Id,
        Name = r.Name,
        IsGroup = r.IsGroup
    }).ToListAsync();

    await SendAsync(session, new WirePacket { Op = "rooms", Rooms = rooms });
}

static async Task HandleCreateRoomAsync(
    WirePacket packet,
    ClientSession session,
    DbContextOptions<AppDbContext> dbOptions,
    ConcurrentDictionary<Guid, ClientSession> sessions)
{
    if (!session.UserId.HasValue) return;
    var name = (packet.RoomName ?? "").Trim();
    if (string.IsNullOrWhiteSpace(name)) return;

    await using var db = new AppDbContext(dbOptions);
    var room = new Room
    {
        Id = Guid.NewGuid(),
        Name = name,
        IsGroup = true,
        CreatedAtUtc = DateTime.UtcNow
    };
    db.Rooms.Add(room);
    db.RoomMembers.Add(new RoomMember
    {
        RoomId = room.Id,
        UserId = session.UserId.Value,
        JoinedAtUtc = DateTime.UtcNow
    });
    await db.SaveChangesAsync();
    await SendRoomsAsync(session, dbOptions);
    await BroadcastToAllAsync(sessions, new WirePacket { Op = "rooms", Rooms = await GetAllRoomsAsync(dbOptions) });
}

static async Task HandleJoinAsync(WirePacket packet, ClientSession session, DbContextOptions<AppDbContext> dbOptions)
{
    if (!session.UserId.HasValue || !packet.RoomId.HasValue) return;
    session.RoomId = packet.RoomId;

    await using var db = new AppDbContext(dbOptions);
    var exists = await db.RoomMembers.AnyAsync(m => m.RoomId == packet.RoomId && m.UserId == session.UserId);
    if (!exists)
    {
        db.RoomMembers.Add(new RoomMember
        {
            RoomId = packet.RoomId.Value,
            UserId = session.UserId.Value,
            JoinedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
    }

    var messages = await db.Messages
        .Where(m => m.RoomId == packet.RoomId)
        .OrderBy(m => m.SentAtUtc)
        .Take(200)
        .Include(m => m.Sender)
        .Include(m => m.FileRecord)
        .ToListAsync();

    var dtos = messages.Select(m => ToDto(m, $"http://localhost:{WireProtocol.HttpPort}")).ToList();
    await SendAsync(session, new WirePacket { Op = "history", RoomId = packet.RoomId, Messages = dtos });
}

static async Task HandleSendAsync(
    WirePacket packet,
    ClientSession session,
    DbContextOptions<AppDbContext> dbOptions,
    ConcurrentDictionary<Guid, ClientSession> sessions)
{
    if (!session.UserId.HasValue || !packet.RoomId.HasValue) return;

    await using var db = new AppDbContext(dbOptions);
    var sender = await db.Users.FindAsync(session.UserId.Value);
    if (sender == null) return;

    Guid? fileId = packet.FileId;
    FileRecord? file = null;
    if (fileId.HasValue)
    {
        file = await db.FileRecords.FindAsync(fileId.Value);
    }

    var msg = new Message
    {
        Id = Guid.NewGuid(),
        RoomId = packet.RoomId.Value,
        SenderId = session.UserId.Value,
        Content = packet.Content ?? "",
        Type = packet.Type ?? MessageType.Text,
        SentAtUtc = DateTime.UtcNow,
        FileRecordId = file?.Id
    };
    db.Messages.Add(msg);
    await db.SaveChangesAsync();

    var dto = new ChatMessageDto
    {
        Id = msg.Id,
        RoomId = msg.RoomId,
        SenderId = msg.SenderId,
        SenderName = sender.DisplayName,
        Content = msg.Content,
        Type = msg.Type,
        SentAt = msg.SentAtUtc,
        FileUrl = file == null ? packet.FileUrl : $"http://localhost:{WireProtocol.HttpPort}/api/files/{file.Id}",
        FileName = file?.OriginalName ?? packet.FileName
    };

    await BroadcastToRoomAsync(packet.RoomId.Value, sessions, new WirePacket { Op = "message", ChatMessage = dto });
}

static async Task HandleCallStartAsync(
    WirePacket packet,
    ClientSession session,
    DbContextOptions<AppDbContext> dbOptions,
    ConcurrentDictionary<Guid, ClientSession> sessions)
{
    if (!session.UserId.HasValue || !packet.RoomId.HasValue) return;
    await using var db = new AppDbContext(dbOptions);
    var call = new Call
    {
        Id = Guid.NewGuid(),
        RoomId = packet.RoomId.Value,
        Kind = packet.CallKind ?? "voice",
        Status = "active",
        StartedAtUtc = DateTime.UtcNow
    };
    db.Calls.Add(call);
    db.CallParticipants.Add(new CallParticipant
    {
        CallId = call.Id,
        UserId = session.UserId.Value,
        JoinedAtUtc = DateTime.UtcNow
    });
    await db.SaveChangesAsync();

    await BroadcastToRoomAsync(packet.RoomId.Value, sessions, new WirePacket
    {
        Op = "call",
        CallId = call.Id,
        RoomId = packet.RoomId,
        CallKind = call.Kind,
        DisplayName = session.DisplayName,
        Message = "started"
    });
}

static async Task HandleCallEndAsync(
    WirePacket packet,
    ClientSession session,
    DbContextOptions<AppDbContext> dbOptions,
    ConcurrentDictionary<Guid, ClientSession> sessions)
{
    if (!packet.CallId.HasValue) return;
    await using var db = new AppDbContext(dbOptions);
    var call = await db.Calls.FindAsync(packet.CallId.Value);
    if (call == null) return;
    call.Status = "ended";
    call.EndedAtUtc = DateTime.UtcNow;
    await db.SaveChangesAsync();
    await BroadcastToRoomAsync(call.RoomId, sessions, new WirePacket
    {
        Op = "call",
        CallId = call.Id,
        RoomId = call.RoomId,
        Message = "ended"
    });
}

static async Task BroadcastPresenceAsync(
    DbContextOptions<AppDbContext> dbOptions,
    ConcurrentDictionary<Guid, ClientSession> sessions)
{
    await using var db = new AppDbContext(dbOptions);
    var users = await db.Users.Select(u => new UserWireDto
    {
        Id = u.Id,
        Username = u.Username,
        DisplayName = u.DisplayName,
        Online = u.IsOnline
    }).ToListAsync();

    await BroadcastToAllAsync(sessions, new WirePacket { Op = "users", Users = users });
}

static async Task<List<RoomWireDto>> GetAllRoomsAsync(DbContextOptions<AppDbContext> dbOptions)
{
    await using var db = new AppDbContext(dbOptions);
    return await db.Rooms.OrderBy(r => r.Name).Select(r => new RoomWireDto
    {
        Id = r.Id,
        Name = r.Name,
        IsGroup = r.IsGroup
    }).ToListAsync();
}

static async Task BroadcastToRoomAsync(Guid roomId, ConcurrentDictionary<Guid, ClientSession> sessions, WirePacket packet)
{
    foreach (var s in sessions.Values.Where(s => s.RoomId == roomId))
    {
        await SendAsync(s, packet);
    }
}

static async Task BroadcastToAllAsync(ConcurrentDictionary<Guid, ClientSession> sessions, WirePacket packet)
{
    foreach (var s in sessions.Values)
    {
        await SendAsync(s, packet);
    }
}

static async Task SendAsync(ClientSession session, WirePacket packet)
{
    var json = JsonSerializer.Serialize(packet, WireProtocol.JsonOptions);
    await session.Writer.WriteLineAsync(json);
}

static ChatMessageDto ToDto(Message m, string httpBase)
{
    return new ChatMessageDto
    {
        Id = m.Id,
        RoomId = m.RoomId,
        SenderId = m.SenderId,
        SenderName = m.Sender.DisplayName,
        Content = m.Content,
        Type = m.Type,
        SentAt = m.SentAtUtc,
        FileUrl = m.FileRecord == null ? null : $"{httpBase}/api/files/{m.FileRecord.Id}",
        FileName = m.FileRecord?.OriginalName
    };
}

static string GuessContentType(string? fileName, string? fallback)
{
    if (!string.IsNullOrWhiteSpace(fallback) && fallback != "application/octet-stream")
        return fallback;
    var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
    return ext switch
    {
        ".png" => "image/png",
        ".jpg" or ".jpeg" or ".jfif" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".bmp" => "image/bmp",
        ".pdf" => "application/pdf",
        ".zip" => "application/zip",
        ".mp4" => "video/mp4",
        ".mp3" => "audio/mpeg",
        _ => "application/octet-stream"
    };
}

static string HashPassword(string password)
{
    var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
    return Convert.ToHexString(bytes);
}

static async Task SeedAsync(AppDbContext db)
{
    if (!await db.Rooms.AnyAsync())
    {
        var global = new Room
        {
            Id = Guid.Parse("00000000-0000-0000-0000-000000000001"),
            Name = "Thế giới",
            IsGroup = true,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.Rooms.Add(global);
        await db.SaveChangesAsync();
    }
}

static void PrintLan(int tcp, int http)
{
    foreach (var ip in Dns.GetHostAddresses(Dns.GetHostName()))
    {
        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            Console.WriteLine($"  TCP  {ip}:{tcp}  |  HTTP {ip}:{http}");
        }
    }
}

sealed class ClientSession
{
    public ClientSession(Guid id, StreamWriter writer)
    {
        Id = id;
        Writer = writer;
    }

    public Guid Id { get; }
    public StreamWriter Writer { get; }
    public Guid? UserId { get; set; }
    public string? DisplayName { get; set; }
    public Guid? RoomId { get; set; }
}
