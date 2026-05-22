using System.Text.Json;
using System.Text.Json.Serialization;

namespace ChatShared;

public static class WireProtocol
{
    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public const int TcpPort = 7000;
    public const int HttpPort = 7001;
}

public sealed class WirePacket
{
    public string Op { get; set; } = "";
    public string? Username { get; set; }
    public string? Password { get; set; }
    public Guid? UserId { get; set; }
    public string? DisplayName { get; set; }
    public Guid? RoomId { get; set; }
    public string? RoomName { get; set; }
    public string? Content { get; set; }
    public MessageType? Type { get; set; }
    public Guid? FileId { get; set; }
    public string? FileUrl { get; set; }
    public string? FileName { get; set; }
    public string? Message { get; set; }
    public List<RoomWireDto>? Rooms { get; set; }
    public List<UserWireDto>? Users { get; set; }
    public List<ChatMessageDto>? Messages { get; set; }
    public ChatMessageDto? ChatMessage { get; set; }
    public Guid? CallId { get; set; }
    public string? CallKind { get; set; }
}

public sealed class RoomWireDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public bool IsGroup { get; set; }
}

public sealed class UserWireDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public bool Online { get; set; }
}
