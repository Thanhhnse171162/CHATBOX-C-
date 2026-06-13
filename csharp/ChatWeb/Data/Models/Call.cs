namespace ChatWeb.Data.Models;

public class Call
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public string Kind { get; set; } = "voice";
    public string Status { get; set; } = "active";
    public DateTime StartedAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }

    public ICollection<CallParticipant> Participants { get; set; } = new List<CallParticipant>();
}
