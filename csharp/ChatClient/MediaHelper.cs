using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using ChatShared;

namespace ChatClient;

internal static class MediaHelper
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".jfif"
    };

    public static bool IsImageFile(string? fileName, string? contentType = null)
    {
        if (!string.IsNullOrWhiteSpace(contentType) && contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return true;
        return !string.IsNullOrWhiteSpace(fileName) && ImageExtensions.Contains(Path.GetExtension(fileName));
    }

    public static bool ShouldRenderAsImage(ChatMessageDto msg) =>
        msg.Type == MessageType.Image || (!string.IsNullOrEmpty(msg.FileUrl) && IsImageFile(msg.FileName));

    public static MessageType DetectMessageType(string? fileName, string? contentType) =>
        IsImageFile(fileName, contentType) ? MessageType.Image : MessageType.File;

    public static string ResolveFileUrl(string? url, string httpBase)
    {
        if (string.IsNullOrWhiteSpace(url)) return "";
        if (Uri.TryCreate(url, UriKind.Absolute, out var abs)) return abs.ToString();
        return new Uri(new Uri(httpBase.TrimEnd('/') + "/"), url.TrimStart('/')).ToString();
    }

    public static UIElement CreateImagePreview(string? url, string httpBase, double maxHeight = 240)
    {
        var resolved = ResolveFileUrl(url, httpBase);
        var image = new Image { MaxHeight = maxHeight, MaxWidth = 360, Stretch = Stretch.Uniform, Margin = new Thickness(0, 2, 0, 2) };
        if (string.IsNullOrWhiteSpace(resolved)) return image;

        try
        {
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.UriSource = new Uri(resolved, UriKind.Absolute);
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.EndInit();
            image.Source = bitmap;
        }
        catch { /* ignore */ }

        return image;
    }
}
