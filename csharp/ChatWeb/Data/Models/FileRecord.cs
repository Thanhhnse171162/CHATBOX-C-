namespace ChatWeb.Data.Models;

public class FileRecord
{
    public Guid Id { get; set; }
    public string OriginalName { get; set; } = "";
    public string StoredPath { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long Size { get; set; }
    public DateTime UploadedAtUtc { get; set; }
    public Guid UploadedById { get; set; }
    public User UploadedBy { get; set; } = null!;
}
