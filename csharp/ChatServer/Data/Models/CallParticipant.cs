namespace ChatServer.Data.Models;

public class CallParticipant
{
    public Guid CallId { get; set; }
    public Call Call { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public DateTime JoinedAtUtc { get; set; }
    public DateTime? LeftAtUtc { get; set; }
}
