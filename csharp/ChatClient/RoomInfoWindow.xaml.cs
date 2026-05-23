using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

using ChatShared;

namespace ChatClient;

public partial class RoomInfoWindow : Window
{
    private readonly string _httpBase;
    private readonly IReadOnlyList<ChatMessageDto> _messages;
    private readonly Action<string, string?> _openImage;
    private readonly Func<string, string, Task> _downloadFile;

    public RoomInfoWindow(
        string roomName,
        IReadOnlyList<ChatMessageDto> messages,
        string httpBase,
        Action<string, string?> openImage,
        Func<string, string, Task> downloadFile)
    {
        InitializeComponent();

        RoomNameText.Text = roomName;
        _messages = messages;
        _httpBase = httpBase;
        _openImage = openImage;
        _downloadFile = downloadFile;

        Loaded += (_, _) => Populate();
        KeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) Close();
        };
    }

    private void Populate()
    {
        PopulateMedia();
        PopulateFiles();
        PopulateLinks();
    }

    private void PopulateMedia()
    {
        MediaWrap.Children.Clear();

        var media = _messages
            .Where(m => MediaHelper.ShouldRenderAsImage(m) && !string.IsNullOrWhiteSpace(m.FileUrl))
            .OrderByDescending(m => m.SentAt)
            .ToList();

        if (media.Count == 0)
        {
            MediaWrap.Children.Add(new TextBlock
            {
                Text = "Khong co file phuong tien.",
                Foreground = (Brush)FindResource("MutedBrush")!,
                Margin = new Thickness(4)
            });
            return;
        }

        foreach (var msg in media)
        {
            var resolved = MediaHelper.ResolveFileUrl(msg.FileUrl, _httpBase);
            var preview = MediaHelper.CreateImagePreview(resolved, _httpBase, maxHeight: 120);

            if (preview is Image img)
            {
                img.MaxWidth = 160;
                img.Margin = new Thickness(6);
                img.Cursor = Cursors.Hand;
                img.MouseLeftButtonUp += (_, _) =>
                {
                    if (!string.IsNullOrWhiteSpace(resolved))
                        _openImage(resolved, msg.FileName);
                };
            }

            var border = new Border
            {
                BorderBrush = (Brush)FindResource("LineBrush")!,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(12),
                Child = preview,
                Margin = new Thickness(4),
                Background = Brushes.White
            };

            MediaWrap.Children.Add(border);
        }
    }

    private void PopulateFiles()
    {
        FilesPanel.Children.Clear();

        var files = _messages
            .Where(m => !string.IsNullOrWhiteSpace(m.FileUrl) && !MediaHelper.ShouldRenderAsImage(m))
            .OrderByDescending(m => m.SentAt)
            .ToList();

        if (files.Count == 0)
        {
            FilesPanel.Children.Add(new TextBlock
            {
                Text = "Khong co file.",
                Foreground = (Brush)FindResource("MutedBrush")!,
                Margin = new Thickness(4)
            });
            return;
        }

        foreach (var msg in files)
        {
            var row = new StackPanel { Margin = new Thickness(0, 0, 0, 10) };

            var btn = new Button
            {
                Content = $"📄 {msg.FileName ?? "file"}",
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(6, 4, 6, 4),
                Cursor = Cursors.Hand
            };

            btn.Click += async (_, _) =>
            {
                if (!string.IsNullOrWhiteSpace(msg.FileUrl))
                    await _downloadFile(msg.FileUrl!, msg.FileName ?? "file");
            };

            row.Children.Add(btn);

            row.Children.Add(new TextBlock
            {
                Text = $"{msg.SenderName} • {msg.TimeText}",
                Foreground = (Brush)FindResource("MutedBrush")!,
                FontSize = 11,
                Margin = new Thickness(8, 1, 0, 0)
            });

            FilesPanel.Children.Add(row);

            FilesPanel.Children.Add(new Border
            {
                Height = 1,
                Background = (Brush)FindResource("LineBrush")!,
                Margin = new Thickness(4, 0, 4, 8)
            });
        }
    }

    private void PopulateLinks()
    {
        LinksPanel.Children.Clear();

        var linkRegex = new Regex(@"https?://\S+", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        var links = new List<(string url, ChatMessageDto msg)>();
        foreach (var msg in _messages.OrderByDescending(m => m.SentAt))
        {
            if (string.IsNullOrWhiteSpace(msg.Content)) continue;

            foreach (Match m in linkRegex.Matches(msg.Content))
            {
                var url = m.Value.TrimEnd('.', ',', ')', ']', '}', '"', '\'');
                if (!string.IsNullOrWhiteSpace(url))
                    links.Add((url, msg));
            }
        }

        if (links.Count == 0)
        {
            LinksPanel.Children.Add(new TextBlock
            {
                Text = "Khong co lien ket.",
                Foreground = (Brush)FindResource("MutedBrush")!,
                Margin = new Thickness(4)
            });
            return;
        }

        foreach (var (url, msg) in links)
        {
            var btn = new Button
            {
                Content = url,
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(6, 4, 6, 4),
                Cursor = Cursors.Hand
            };

            btn.Click += (_, _) =>
            {
                try
                {
                    Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                }
                catch
                {
                    // ignore
                }
            };

            LinksPanel.Children.Add(btn);
            LinksPanel.Children.Add(new TextBlock
            {
                Text = $"{msg.SenderName} • {msg.TimeText}",
                Foreground = (Brush)FindResource("MutedBrush")!,
                FontSize = 11,
                Margin = new Thickness(8, 0, 0, 10)
            });

            LinksPanel.Children.Add(new Border
            {
                Height = 1,
                Background = (Brush)FindResource("LineBrush")!,
                Margin = new Thickness(4, 0, 4, 8)
            });
        }
    }
}
