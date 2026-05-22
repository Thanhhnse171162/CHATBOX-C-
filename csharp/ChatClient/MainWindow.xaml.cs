using System.IO;
using System.Net.Http;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using ChatShared;

namespace ChatClient;

public partial class MainWindow : Window
{
    private readonly TcpChatClient _client;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromHours(2) };
    private readonly Dictionary<Guid, List<ChatMessageDto>> _history = new();
    private readonly List<RoomWireDto> _rooms = new();
    private Guid? _activeRoomId;
    private CallWindow? _callWindow;

    public MainWindow(TcpChatClient client)
    {
        InitializeComponent();
        _client = client;
        CurrentUserText.Text = client.DisplayName;
        ChatTitleText.Text = "Messages";

        _client.PacketReceived += OnPacket;
        _client.Error += msg => Dispatcher.Invoke(() => MessageBox.Show(msg, "Error"));

        LoadStickers();
        _ = _client.SendAsync(new WirePacket { Op = "rooms" });
    }

    private void OnPacket(WirePacket packet)
    {
        Dispatcher.Invoke(() =>
        {
            switch (packet.Op)
            {
                case "rooms":
                    if (packet.Rooms != null)
                    {
                        _rooms.Clear();
                        _rooms.AddRange(packet.Rooms);
                        RoomsList.ItemsSource = null;
                        RoomsList.ItemsSource = _rooms;
                        if (_activeRoomId == null && _rooms.Count > 0)
                        {
                            RoomsList.SelectedIndex = 0;
                        }
                    }
                    break;
                case "history":
                    if (packet.RoomId.HasValue && packet.Messages != null)
                    {
                        _history[packet.RoomId.Value] = packet.Messages;
                        if (_activeRoomId == packet.RoomId)
                        {
                            RenderMessages(packet.Messages);
                        }
                    }
                    break;
                case "message":
                    if (packet.ChatMessage != null)
                    {
                        var msg = packet.ChatMessage;
                        msg.IsMine = msg.SenderId == _client.UserId;
                        if (!_history.ContainsKey(msg.RoomId))
                        {
                            _history[msg.RoomId] = new();
                        }
                        _history[msg.RoomId].Add(msg);
                        if (_activeRoomId == msg.RoomId)
                        {
                            AppendMessageBubble(msg);
                            MessagesScroll.ScrollToEnd();
                        }
                    }
                    break;
                case "users":
                    break;
                case "call":
                    if (packet.Message == "started" && packet.RoomId == _activeRoomId)
                    {
                        OpenCallWindow(packet.CallKind ?? "voice", packet.CallId, packet.DisplayName, incoming: true);
                    }
                    break;
            }
        });
    }

    private void RoomsList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (RoomsList.SelectedItem is not RoomWireDto room) return;
        _activeRoomId = room.Id;
        ChatTitleText.Text = room.Name;
        _ = _client.SendAsync(new WirePacket { Op = "join", RoomId = room.Id });
        if (_history.TryGetValue(room.Id, out var list))
        {
            RenderMessages(list);
        }
        else
        {
            MessagesPanel.Children.Clear();
        }
    }

    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        var q = SearchBox.Text.Trim();
        RoomsList.ItemsSource = string.IsNullOrEmpty(q)
            ? _rooms
            : _rooms.Where(r => r.Name.Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();
    }

    private async void Send_Click(object sender, RoutedEventArgs e) => await SendTextAsync();

    private async void MessageInput_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.Enter)
        {
            await SendTextAsync();
        }
    }

    private async Task SendTextAsync()
    {
        if (_activeRoomId == null) return;
        var text = MessageInput.Text.Trim();
        if (string.IsNullOrEmpty(text)) return;
        MessageInput.Clear();
        await _client.SendAsync(new WirePacket
        {
            Op = "send",
            RoomId = _activeRoomId,
            Content = text,
            Type = MessageType.Text
        });
    }

    private async void Attach_Click(object sender, RoutedEventArgs e)
    {
        if (_activeRoomId == null || _client.UserId == null) return;
        var dlg = new Microsoft.Win32.OpenFileDialog();
        if (dlg.ShowDialog() != true) return;

        try
        {
            ChatTitleText.Text = "Uploading...";
            using var form = new MultipartFormDataContent();
            await using var fs = File.OpenRead(dlg.FileName);
            form.Add(new StreamContent(fs), "file", Path.GetFileName(dlg.FileName));
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{_client.HttpBase}/api/files/upload") { Content = form };
            req.Headers.Add("X-User-Id", _client.UserId.Value.ToString());
            var res = await _http.SendAsync(req);
            res.EnsureSuccessStatusCode();
            var json = await res.Content.ReadAsStringAsync();
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            var fileId = root.GetProperty("fileId").GetGuid();
            var url = root.GetProperty("url").GetString();
            var name = root.GetProperty("name").GetString();
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : "";
            var msgType = type?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) == true
                ? MessageType.Image
                : MessageType.File;

            await _client.SendAsync(new WirePacket
            {
                Op = "send",
                RoomId = _activeRoomId,
                Content = msgType == MessageType.Image ? "" : name ?? "",
                Type = msgType,
                FileId = fileId,
                FileUrl = url,
                FileName = name
            });
            ChatTitleText.Text = _rooms.FirstOrDefault(r => r.Id == _activeRoomId)?.Name ?? "Chat";
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Upload");
        }
    }

    private void Sticker_Click(object sender, RoutedEventArgs e) => StickerPopup.IsOpen = true;

    private void LoadStickers()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "Assets", "Stickers");
        if (!Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var files = Directory.GetFiles(dir, "*.png");
        if (files.Length == 0)
        {
            var btn = new Button { Content = "👍", Width = 40, Height = 40, Margin = new Thickness(2) };
            btn.Click += async (_, _) =>
            {
                StickerPopup.IsOpen = false;
                await SendStickerAsync("👍");
            };
            StickerPanel.Children.Add(btn);
            return;
        }

        foreach (var file in files)
        {
            var img = new Image
            {
                Width = 48,
                Height = 48,
                Margin = new Thickness(2),
                Source = new System.Windows.Media.Imaging.BitmapImage(new Uri(file)),
                Cursor = System.Windows.Input.Cursors.Hand
            };
            img.MouseLeftButtonUp += async (_, _) =>
            {
                StickerPopup.IsOpen = false;
                await SendStickerAsync(Path.GetFileNameWithoutExtension(file));
            };
            StickerPanel.Children.Add(img);
        }
    }

    private async Task SendStickerAsync(string name)
    {
        if (_activeRoomId == null) return;
        await _client.SendAsync(new WirePacket
        {
            Op = "send",
            RoomId = _activeRoomId,
            Content = name,
            Type = MessageType.Sticker
        });
    }

    private async void CreateGroup_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new PromptDialog("Ten nhom:", "Create Group", "My Group") { Owner = this };
        if (dlg.ShowDialog() == true && !string.IsNullOrWhiteSpace(dlg.Value))
        {
            await _client.SendAsync(new WirePacket { Op = "create_room", RoomName = dlg.Value.Trim() });
        }
    }

    private async void VoiceCall_Click(object sender, RoutedEventArgs e) => await StartCallAsync("voice");

    private async void VideoCall_Click(object sender, RoutedEventArgs e) => await StartCallAsync("video");

    private async Task StartCallAsync(string kind)
    {
        if (_activeRoomId == null) return;
        await _client.SendAsync(new WirePacket { Op = "call_start", RoomId = _activeRoomId, CallKind = kind });
        OpenCallWindow(kind, null, _client.DisplayName, incoming: false);
    }

    private void OpenCallWindow(string kind, Guid? callId, string? peer, bool incoming)
    {
        _callWindow?.Close();
        _callWindow = new CallWindow(kind, peer ?? "Someone", incoming, callId, _client, _activeRoomId);
        _callWindow.Show();
    }

    private void Logout_Click(object sender, RoutedEventArgs e)
    {
        var login = new LoginWindow();
        login.Show();
        Close();
    }

    private void RenderMessages(List<ChatMessageDto> messages)
    {
        MessagesPanel.Children.Clear();
        foreach (var m in messages)
        {
            m.IsMine = m.SenderId == _client.UserId;
            AppendMessageBubble(m);
        }
        MessagesScroll.ScrollToEnd();
    }

    private void AppendMessageBubble(ChatMessageDto msg)
    {
        if (msg.Type == MessageType.System)
        {
            MessagesPanel.Children.Add(new TextBlock
            {
                Text = msg.Content,
                Foreground = Brushes.Gray,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 6, 0, 6)
            });
            return;
        }

        var row = new StackPanel
        {
            Margin = new Thickness(8, 6, 8, 6),
            HorizontalAlignment = msg.IsMine ? HorizontalAlignment.Right : HorizontalAlignment.Left,
            MaxWidth = 480
        };

        if (!msg.IsMine)
        {
            row.Children.Add(new TextBlock
            {
                Text = msg.SenderName,
                FontSize = 11,
                Foreground = Brushes.Gray,
                Margin = new Thickness(4, 0, 0, 2)
            });
        }

        var bubble = new Border
        {
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(12, 8, 12, 8),
            Background = msg.IsMine ? (Brush)FindResource("PrimaryBrush")! : Brushes.White,
            BorderBrush = (Brush)FindResource("LineBrush")!,
            BorderThickness = msg.IsMine ? new Thickness(0) : new Thickness(1)
        };

        var inner = new StackPanel();
        var fg = msg.IsMine ? Brushes.White : (Brush)FindResource("TextBrush")!;

        if (msg.Type == MessageType.Image && !string.IsNullOrEmpty(msg.FileUrl))
        {
            inner.Children.Add(new Image
            {
                Source = new System.Windows.Media.Imaging.BitmapImage(new Uri(msg.FileUrl)),
                MaxHeight = 220,
                Stretch = Stretch.Uniform
            });
        }
        else if (msg.Type == MessageType.File && !string.IsNullOrEmpty(msg.FileUrl))
        {
            var fileBtn = new Button
            {
                Content = $"📄 {msg.FileName}",
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Foreground = fg,
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Cursor = System.Windows.Input.Cursors.Hand
            };
            fileBtn.Click += async (_, _) => await DownloadFileAsync(msg.FileUrl!, msg.FileName ?? "file");
            inner.Children.Add(fileBtn);
        }
        else
        {
            inner.Children.Add(new TextBlock
            {
                Text = msg.Type == MessageType.Sticker ? $"[Sticker] {msg.Content}" : msg.Content,
                TextWrapping = TextWrapping.Wrap,
                Foreground = fg
            });
        }

        bubble.Child = inner;
        row.Children.Add(bubble);
        row.Children.Add(new TextBlock
        {
            Text = msg.TimeText,
            FontSize = 10,
            Foreground = Brushes.Gray,
            HorizontalAlignment = msg.IsMine ? HorizontalAlignment.Right : HorizontalAlignment.Left,
            Margin = new Thickness(4, 2, 0, 0)
        });
        MessagesPanel.Children.Add(row);
    }

    private async Task DownloadFileAsync(string url, string fileName)
    {
        var save = new Microsoft.Win32.SaveFileDialog { FileName = fileName };
        if (save.ShowDialog() != true) return;

        DownloadPanel.Visibility = Visibility.Visible;
        DownloadNameText.Text = fileName;

        using var res = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        res.EnsureSuccessStatusCode();
        var total = res.Content.Headers.ContentLength ?? -1;
        await using var stream = await res.Content.ReadAsStreamAsync();
        await using var file = File.Create(save.FileName);

        var buffer = new byte[81920];
        long loaded = 0;
        var started = DateTime.UtcNow;
        var last = started;
        var lastLoaded = 0L;

        while (true)
        {
            var read = await stream.ReadAsync(buffer);
            if (read == 0) break;
            await file.WriteAsync(buffer.AsMemory(0, read));
            loaded += read;

            var now = DateTime.UtcNow;
            if ((now - last).TotalSeconds >= 0.25)
            {
                var speed = (loaded - lastLoaded) / (now - last).TotalSeconds;
                lastLoaded = loaded;
                last = now;
                var pct = total > 0 ? loaded * 100.0 / total : 0;
                DownloadBar.Value = pct;
                DownloadStatsText.Text = $"{FormatBytes(speed)}/s — {FormatBytes(loaded)} / {(total > 0 ? FormatBytes(total) : "...")}";
            }
        }

        DownloadBar.Value = 100;
        DownloadStatsText.Text = "Tai xuong hoan tat!";
        await Task.Delay(2000);
        DownloadPanel.Visibility = Visibility.Collapsed;
    }

    private static string FormatBytes(double bytes)
    {
        string[] u = { "B", "KB", "MB", "GB" };
        var v = bytes;
        var i = 0;
        while (v >= 1024 && i < u.Length - 1) { v /= 1024; i++; }
        return $"{v:F1} {u[i]}";
    }

    protected override async void OnClosed(EventArgs e)
    {
        await _client.DisposeAsync();
        base.OnClosed(e);
    }
}
