using ChatShared;

namespace ChatServer.Data.Models;

public class Message
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public Guid SenderId { get; set; }
    public User Sender { get; set; } = null!;
    public string Content { get; set; } = "";
    public MessageType Type { get; set; }
    public DateTime SentAtUtc { get; set; }
    public Guid? FileRecordId { get; set; }
    public FileRecord? FileRecord { get; set; }
}
