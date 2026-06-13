namespace ChatWeb.Data.Models;

public class Room
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public bool IsGroup { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public ICollection<RoomMember> Members { get; set; } = new List<RoomMember>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
    public ICollection<Call> Calls { get; set; } = new List<Call>();
}
