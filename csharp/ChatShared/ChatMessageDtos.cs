namespace ChatShared;

public enum MessageType
{
    Text = 0,
    Image = 1,
    File = 2,
    Sticker = 3,
    System = 4
}

/// <summary>DTO dùng chung — 9 properties + computed.</summary>
public sealed class ChatMessageDto
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = "";
    public string Content { get; set; } = "";
    public MessageType Type { get; set; }
    public DateTime SentAt { get; set; }
    public string? FileUrl { get; set; }
    public string? FileName { get; set; }

    public bool IsMine { get; set; }

    public string Preview => Type switch
    {
        MessageType.Image => "[Image]",
        MessageType.File => string.IsNullOrWhiteSpace(FileName) ? "[File]" : FileName!,
        MessageType.Sticker => "[Sticker]",
        MessageType.System => Content,
        _ => Content
    };

    public string TimeText => SentAt.ToLocalTime().ToString("hh:mm tt");

    public bool HasAttachment => Type is MessageType.Image or MessageType.File or MessageType.Sticker;
}
