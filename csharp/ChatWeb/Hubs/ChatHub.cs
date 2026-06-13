using System.Security.Cryptography;
using System.Text;
using ChatShared;
using ChatWeb.Data;
using ChatWeb.Data.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChatWeb.Hubs;

/// <summary>
/// SignalR hub that replaces the raw TCP server.
/// Each connected browser is a "session" managed by SignalR automatically.
/// </summary>
public sealed class ChatHub : Hub
{
    // ── In-memory state per connection ─────────────────────────────────
    // SignalR connection ID → user metadata
    private static readonly Dictionary<string, UserSession> Sessions = new();
    private static readonly object Lock = new();

    private readonly AppDbContext _db;

    public ChatHub(AppDbContext db)
    {
        _db = db;
    }

    // ── Login / Register ──────────────────────────────────────────────
    public async Task Login(string username, string password, string? displayName)
    {
        username = (username ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(username))
        {
            await Clients.Caller.SendAsync("Error", "Username required");
            return;
        }

        var hash = HashPassword(password ?? "");
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);

        if (user == null || user.PasswordHash != hash)
        {
            await Clients.Caller.SendAsync("Error", "Invalid login");
            return;
        }

        user.IsOnline = true;
        user.LastSeenUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        RegisterSession(user);

        await Clients.Caller.SendAsync("LoginOk", new
        {
            userId = user.Id,
            displayName = user.DisplayName,
            message = "Logged in"
        });

        await SendRoomsToCaller();
        await BroadcastPresence();
    }

    public async Task Register(string username, string password, string? displayName)
    {
        username = (username ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(username))
        {
            await Clients.Caller.SendAsync("Error", "Username required");
            return;
        }

        var existing = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (existing != null)
        {
            await Clients.Caller.SendAsync("Error", "Username taken");
            return;
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            DisplayName = displayName?.Trim() ?? username,
            PasswordHash = HashPassword(password ?? ""),
            IsOnline = true,
            LastSeenUtc = DateTime.UtcNow
        };
        _db.Users.Add(user);

        var global = await _db.Rooms.FirstAsync(r => r.Name == "Thế giới");
        _db.RoomMembers.Add(new RoomMember
        {
            RoomId = global.Id,
            UserId = user.Id,
            JoinedAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        RegisterSession(user);

        await Clients.Caller.SendAsync("LoginOk", new
        {
            userId = user.Id,
            displayName = user.DisplayName,
            message = "Registered"
        });

        await SendRoomsToCaller();
        await BroadcastPresence();
    }

    // ── Rooms ─────────────────────────────────────────────────────────
    public async Task GetRooms()
    {
        await SendRoomsToCaller();
    }

    public async Task CreateRoom(string roomName)
    {
        var session = GetSession();
        if (session == null) return;

        roomName = (roomName ?? "").Trim();
        if (string.IsNullOrWhiteSpace(roomName)) return;

        var room = new Room
        {
            Id = Guid.NewGuid(),
            Name = roomName,
            IsGroup = true,
            CreatedAtUtc = DateTime.UtcNow
        };
        _db.Rooms.Add(room);
        _db.RoomMembers.Add(new RoomMember
        {
            RoomId = room.Id,
            UserId = session.UserId,
            JoinedAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        // Broadcast updated room list to all clients
        var rooms = await GetAllRooms();
        await Clients.All.SendAsync("Rooms", rooms);
    }

    // ── Join Room (SignalR Group) ──────────────────────────────────────
    public async Task JoinRoom(Guid roomId)
    {
        var session = GetSession();
        if (session == null) return;

        // Leave previous room group
        if (session.RoomId.HasValue)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, session.RoomId.Value.ToString());
        }

        session.RoomId = roomId;

        // Add to SignalR group
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId.ToString());

        // Ensure DB membership
        var exists = await _db.RoomMembers.AnyAsync(m => m.RoomId == roomId && m.UserId == session.UserId);
        if (!exists)
        {
            _db.RoomMembers.Add(new RoomMember
            {
                RoomId = roomId,
                UserId = session.UserId,
                JoinedAtUtc = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }

        // Send history (latest 50 messages)
        var messagesDesc = await _db.Messages
            .Where(m => m.RoomId == roomId)
            .OrderByDescending(m => m.SentAtUtc)
            .Take(50)
            .Include(m => m.Sender)
            .Include(m => m.FileRecord)
            .Select(m => new
            {
                id = m.Id,
                roomId = m.RoomId,
                senderId = m.SenderId,
                senderName = m.Sender.DisplayName,
                content = m.Content,
                type = (int)m.Type,
                sentAt = m.SentAtUtc,
                fileUrl = m.FileRecord == null ? null : $"/api/files/{m.FileRecord.Id}",
                fileName = m.FileRecord == null ? null : m.FileRecord.OriginalName
            })
            .ToListAsync();

        messagesDesc.Reverse();
        await Clients.Caller.SendAsync("History", roomId, messagesDesc);
    }

    // ── Send Message ──────────────────────────────────────────────────
    public async Task SendMessage(Guid roomId, string content, int type, Guid? fileId, string? fileUrl, string? fileName)
    {
        var session = GetSession();
        if (session == null) return;

        var sender = await _db.Users.FindAsync(session.UserId);
        if (sender == null) return;

        FileRecord? file = null;
        if (fileId.HasValue)
        {
            file = await _db.FileRecords.FindAsync(fileId.Value);
        }

        var msg = new Message
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            SenderId = session.UserId,
            Content = content ?? "",
            Type = (MessageType)type,
            SentAtUtc = DateTime.UtcNow,
            FileRecordId = file?.Id
        };
        _db.Messages.Add(msg);
        await _db.SaveChangesAsync();

        var dto = new
        {
            id = msg.Id,
            roomId = msg.RoomId,
            senderId = msg.SenderId,
            senderName = sender.DisplayName,
            content = msg.Content,
            type = (int)msg.Type,
            sentAt = msg.SentAtUtc,
            fileUrl = file == null ? fileUrl : $"/api/files/{file.Id}",
            fileName = file?.OriginalName ?? fileName
        };

        await Clients.Group(roomId.ToString()).SendAsync("NewMessage", dto);
    }

    // ── Calls ─────────────────────────────────────────────────────────
    public async Task StartCall(Guid roomId, string callKind)
    {
        var session = GetSession();
        if (session == null) return;

        var call = new Call
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            Kind = callKind ?? "voice",
            Status = "active",
            StartedAtUtc = DateTime.UtcNow
        };
        _db.Calls.Add(call);
        _db.CallParticipants.Add(new CallParticipant
        {
            CallId = call.Id,
            UserId = session.UserId,
            JoinedAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        await Clients.Group(roomId.ToString()).SendAsync("CallStarted", new
        {
            callId = call.Id,
            roomId,
            kind = call.Kind,
            startedBy = session.DisplayName,
            message = "started"
        });
    }

    public async Task EndCall(Guid callId)
    {
        var call = await _db.Calls.FindAsync(callId);
        if (call == null) return;

        call.Status = "ended";
        call.EndedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await Clients.Group(call.RoomId.ToString()).SendAsync("CallEnded", new
        {
            callId = call.Id,
            roomId = call.RoomId,
            message = "ended"
        });
    }

    // ── Typing Indicator ──────────────────────────────────────────────
    public async Task Typing(Guid roomId)
    {
        var session = GetSession();
        if (session == null) return;

        await Clients.OthersInGroup(roomId.ToString()).SendAsync("UserTyping", new
        {
            userId = session.UserId,
            displayName = session.DisplayName,
            roomId
        });
    }

    // ── Disconnect ────────────────────────────────────────────────────
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        UserSession? session;
        lock (Lock)
        {
            Sessions.TryGetValue(Context.ConnectionId, out session);
            Sessions.Remove(Context.ConnectionId);
        }

        if (session != null)
        {
            var user = await _db.Users.FindAsync(session.UserId);
            if (user != null)
            {
                user.IsOnline = false;
                user.LastSeenUtc = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
            await BroadcastPresence();
        }

        await base.OnDisconnectedAsync(exception);
    }

    // ── Helpers ───────────────────────────────────────────────────────
    private void RegisterSession(User user)
    {
        lock (Lock)
        {
            Sessions[Context.ConnectionId] = new UserSession
            {
                UserId = user.Id,
                DisplayName = user.DisplayName
            };
        }
    }

    private UserSession? GetSession()
    {
        lock (Lock)
        {
            Sessions.TryGetValue(Context.ConnectionId, out var s);
            return s;
        }
    }

    private async Task SendRoomsToCaller()
    {
        var rooms = await GetAllRooms();
        await Clients.Caller.SendAsync("Rooms", rooms);
    }

    private async Task<List<object>> GetAllRooms()
    {
        return await _db.Rooms.OrderBy(r => r.Name).Select(r => (object)new
        {
            id = r.Id,
            name = r.Name,
            isGroup = r.IsGroup
        }).ToListAsync();
    }

    private async Task BroadcastPresence()
    {
        var users = await _db.Users.Select(u => new
        {
            id = u.Id,
            username = u.Username,
            displayName = u.DisplayName,
            online = u.IsOnline
        }).ToListAsync();

        await Clients.All.SendAsync("Users", users);
    }

    private static string HashPassword(string password)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        return Convert.ToHexString(bytes);
    }

    private sealed class UserSession
    {
        public Guid UserId { get; set; }
        public string DisplayName { get; set; } = "";
        public Guid? RoomId { get; set; }
    }
}
