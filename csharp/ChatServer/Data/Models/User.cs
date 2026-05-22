namespace ChatServer.Data.Models;

public class User
{
    public Guid Id { get; set; }
    public string Username { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool IsOnline { get; set; }
    public DateTime? LastSeenUtc { get; set; }

    public ICollection<RoomMember> Memberships { get; set; } = new List<RoomMember>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
