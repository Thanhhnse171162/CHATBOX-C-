using System.Security.Cryptography;
using System.Text;
using ChatWeb.Data;
using ChatWeb.Data.Models;
using ChatWeb.Hubs;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;

// ─── Config ───────────────────────────────────────────────────────────
var builder = WebApplication.CreateBuilder(args);

var config = builder.Configuration;
var dbProvider = config["Database:Provider"] ?? "Sqlite";
var uploadRoot = Path.Combine(builder.Environment.ContentRootPath, config["Storage:UploadPath"] ?? "uploads");
Directory.CreateDirectory(uploadRoot);

// ─── Database ─────────────────────────────────────────────────────────
if (dbProvider.Equals("Postgres", StringComparison.OrdinalIgnoreCase)
    || dbProvider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase))
{
    var conn = config.GetConnectionString("Postgres")
        ?? "Host=localhost;Port=5432;Database=chatting_group;Username=postgres;Password=postgres";
    builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(conn));
}
else
{
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
    builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(sqliteConn));
}

// ─── SignalR ──────────────────────────────────────────────────────────
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 1024 * 1024; // 1 MB
    options.EnableDetailedErrors = true;
});

// ─── CORS (for dev) ───────────────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()
              .SetIsOriginAllowed(_ => true);
    });
});

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = long.MaxValue;
});

var app = builder.Build();

// ─── Ensure DB ────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();

    // Seed default room
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

// ─── Middleware ────────────────────────────────────────────────────────
app.UseCors();
app.UseStaticFiles(); // Serve wwwroot

// ─── File Upload API ──────────────────────────────────────────────────
app.MapPost("/api/files/upload", async (HttpRequest req, AppDbContext db) =>
{
    if (!req.Headers.TryGetValue("X-User-Id", out var userHeader) || !Guid.TryParse(userHeader, out var userId))
        return Results.Unauthorized();

    var form = await req.ReadFormAsync(new FormOptions { MultipartBodyLengthLimit = long.MaxValue });
    var file = form.Files.FirstOrDefault();
    if (file == null) return Results.BadRequest(new { error = "No file" });

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
        url = $"/api/files/{record.Id}",
        name = record.OriginalName,
        type = record.ContentType,
        size = record.Size
    });
});

app.MapGet("/api/files/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var file = await db.FileRecords.FindAsync(id);
    if (file == null) return Results.NotFound();
    var path = Path.Combine(uploadRoot, file.StoredPath);
    if (!File.Exists(path)) return Results.NotFound();
    return Results.File(path, file.ContentType, file.OriginalName);
});

// ─── SignalR Hub ──────────────────────────────────────────────────────
app.MapHub<ChatHub>("/chatHub");

// ─── Fallback to index.html for SPA ───────────────────────────────────
app.MapFallbackToFile("index.html");

Console.WriteLine("=== Chatting Group Web Server ===");
Console.WriteLine($"DB: {dbProvider}");
Console.WriteLine("Open http://localhost:5000 in your browser");

app.Run("http://0.0.0.0:5000");

// ─── Helpers ──────────────────────────────────────────────────────────
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
