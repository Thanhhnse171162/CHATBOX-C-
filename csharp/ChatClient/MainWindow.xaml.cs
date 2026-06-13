using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using System.Globalization;
using ChatShared;

namespace ChatClient;

public partial class MainWindow : Window
{
    private readonly TcpChatClient _client;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromHours(6) };
    private readonly Dictionary<Guid, List<ChatMessageDto>> _history = new();
    private readonly List<RoomWireDto> _rooms = new();
    private Guid? _activeRoomId;
    private CallWindow? _callWindow;

    public MainWindow(TcpChatClient client)
    {
        InitializeComponent();
        _client = client;
        AvatarInitial.Text = !string.IsNullOrWhiteSpace(client.DisplayName) ? client.DisplayName[0].ToString().ToUpper() : "?";
        ChatTitleText.Text = "Messages";

        _client.PacketReceived += OnPacket;
        _client.Error += msg => Dispatcher.Invoke(() => MessageBox.Show(msg, "Error"));

        LoadStickers();
        LoadEmojis();
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

    private async void Image_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "Anh|*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp|Tat ca|*.*"
        };
        if (dlg.ShowDialog() == true)
            await UploadAndSendAsync(dlg.FileName);
    }

    private async void Attach_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new Microsoft.Win32.OpenFileDialog();
        if (dlg.ShowDialog() == true)
            await UploadAndSendAsync(dlg.FileName);
    }

    private async Task UploadAndSendAsync(string filePath)
    {
        if (_activeRoomId == null || _client.UserId == null) return;

        var fileName = Path.GetFileName(filePath);
        var roomName = _rooms.FirstOrDefault(r => r.Id == _activeRoomId)?.Name ?? "Chat";

        try
        {
            var contentType = MediaHelper.IsImageFile(fileName)
                ? GuessMime(fileName)
                : "application/octet-stream";

            ChatTitleText.Text = $"Uploading {fileName} (0%)...";

            await using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 1024 * 1024, useAsync: true);
            var content = new ProgressStreamContent(fs, 1024 * 1024, pct =>
            {
                Dispatcher.Invoke(() => ChatTitleText.Text = $"Uploading {fileName} ({pct}%)...");
            });
            content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);

            using var req = new HttpRequestMessage(HttpMethod.Post, $"{_client.HttpBase}/api/files/upload-stream")
            {
                Content = content
            };
            req.Headers.Add("X-User-Id", _client.UserId.Value.ToString());
            req.Headers.Add("X-File-Name", fileName);
            req.Headers.Add("X-Content-Type", contentType);

            var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);
            if (!res.IsSuccessStatusCode)
            {
                var err = await res.Content.ReadAsStringAsync();
                throw new Exception(string.IsNullOrWhiteSpace(err) ? res.ReasonPhrase ?? "Upload failed" : err);
            }

            var json = await res.Content.ReadAsStringAsync();
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            var fileId = root.GetProperty("fileId").GetGuid();
            var url = root.GetProperty("url").GetString();
            var name = root.GetProperty("name").GetString();
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : contentType;
            var msgType = MediaHelper.DetectMessageType(name, type);

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
            ChatTitleText.Text = roomName;
        }
        catch (Exception ex)
        {
            ChatTitleText.Text = roomName;
            MessageBox.Show(ex.Message, "Upload");
        }
    }

    private static string GuessMime(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".bmp" => "image/bmp",
            _ => "application/octet-stream"
        };
    }

    private void Emoji_Click(object sender, RoutedEventArgs e)
    {
        StickerPopup.IsOpen = false;
        EmojiPopup.IsOpen = !EmojiPopup.IsOpen;
    }

    private void Sticker_Click(object sender, RoutedEventArgs e)
    {
        EmojiPopup.IsOpen = false;
        StickerPopup.IsOpen = !StickerPopup.IsOpen;
    }

    private void Info_Click(object sender, RoutedEventArgs e)
    {
        if (_activeRoomId == null) return;

        var room = _rooms.FirstOrDefault(r => r.Id == _activeRoomId);
        var roomName = room?.Name ?? ChatTitleText.Text;
        var messages = _history.TryGetValue(_activeRoomId.Value, out var list) ? list : new List<ChatMessageDto>();

        var w = new RoomInfoWindow(
            roomName,
            messages,
            _client.HttpBase,
            (url, title) => OpenImageViewer(url, title),
            (url, name) => DownloadFileAsync(url, name))
        {
            Owner = this
        };

        w.ShowDialog();
    }

    private async void QuickEmoji_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string emoji)
            await SendQuickEmojiAsync(emoji);
    }

    private async Task SendQuickEmojiAsync(string emoji)
    {
        if (_activeRoomId == null) return;
        await _client.SendAsync(new WirePacket
        {
            Op = "send",
            RoomId = _activeRoomId,
            Content = emoji,
            Type = MessageType.Text
        });
    }

    private void LoadEmojis()
    {
        EmojiPanel.Children.Clear();

        var categories = new (string Label, string[] Emojis)[]
        {
            ("Recent", new[] { "👍", "❤️", "😂", "🔥", "🙏", "💯", "😊", "🎉", "🤣", "😅", "😍", "😘", "😎", "🥳", "🥺", "🥰" }),
            ("Faces - Smileys", new[] {
                "😀","😃","😄","😁","😆","😅","🤣","😂",
                "🙂","🙃","😉","😊","😇","🥰","😍","🤩",
                "😘","😗","😚","😙","🥲","😋","😛","😜",
                "🤪","😝","🤑","🤗","🤭","🤫","🤔","🫡",
                "🤐","🤨","😐","😑","😶","😏","😒","🙄",
                "😬","🤥","😌","😔","😪","🤤","😴","😷",
                "🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴",
                "😵","🤯","🤠","🥳","🥸","😎","🤓","🧐",
                "😕","😟","🙁","☹️","😮","😯","😲","😳",
                "🥺","😦","😧","😨","😰","😥","😢","😭",
                "😱","😖","😣","😞","😓","😩","😫","🥱",
                "😤","😡","😠","🤬","😈","👿","💀","☠️",
                "💩","🤡","👹","👺","👻","👽","👾","🤖"
            }),
            ("Hearts & Symbols", new[] {
                "❤️","🧡","💛","💚","💙","💜","🖤","🤍",
                "🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗",
                "💖","💘","💝","💟","☮️","✨","⭐","🌟",
                "💫","🔥","💥","🎯","💎","👑","💯","✅",
                "🎉","🎊","🎈","🎁","🥳","🏆","🥇","🎖️"
            }),
            ("People & Hands", new[] {
                "👋","🤚","🖐️","✋","🖖","🤙","💪","🦾",
                "👍","👎","👏","🙌","🤲","🤝","🙏","✌️",
                "🤞","🤟","🤘","👈","👉","👆","👇",
                "☝️","👌","🤌","🤏","🫶","🫂","💏"
            }),
            ("Animals", new[] {
                "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼",
                "🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈",
                "🙉","🙊","🐔","🐧","🐦","🐤","🦆","🦅",
                "🦉","🦇","🐺","🦄","🐝","🦋","🐌","🐞"
            }),
            ("Food", new[] {
                "🍎","🍊","🍋","🍇","🍓","🫐","🍒","🍑",
                "🥭","🍍","🥥","🥝","🍅","🫒","🥑","🍆",
                "🌽","🍕","🍔","🍟","🌭","🍿","🧂","🥓",
                "🍜","🍱","🍣","🍦","🎂","🍰","🧁","🍩"
            }),
        };

        foreach (var (label, emojis) in categories)
        {
            EmojiPanel.Children.Add(new TextBlock
            {
                Text       = label,
                FontFamily = new System.Windows.Media.FontFamily("Segoe UI"),
                FontSize   = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(101, 103, 107)),
                Margin     = new Thickness(6, 12, 6, 6),
                Width      = 320,
            });

            foreach (var emoji in emojis)
            {
                var emojiCopy = emoji;

                var btn = new Button
                {
                    Width = 38,
                    Height = 38,
                    Background = Brushes.Transparent,
                    BorderThickness = new Thickness(0),
                    Cursor = Cursors.Hand,
                    Tag = emojiCopy,
                    ToolTip = emojiCopy
                };

                var tb = new TextBlock
                {
                    Text = emojiCopy,
                    FontFamily = new System.Windows.Media.FontFamily("Segoe UI Emoji"),
                    FontSize = 24,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                };
                System.Windows.Media.TextOptions.SetTextFormattingMode(tb, TextFormattingMode.Display);
                System.Windows.Media.TextOptions.SetTextRenderingMode(tb, TextRenderingMode.ClearType);

                btn.Content = tb;
                btn.Click += async (s, e) => {
                    EmojiPopup.IsOpen = false;
                    if (_activeRoomId == null) return;
                    MessageInput.Text += emojiCopy;
                    await SendTextAsync();
                };

                // Hover effect
                btn.MouseEnter += (s, e) =>
                    btn.Background = new SolidColorBrush(Color.FromRgb(240, 242, 245));
                btn.MouseLeave += (s, e) =>
                    btn.Background = Brushes.Transparent;

                EmojiPanel.Children.Add(btn);
            }
        }
    }

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
            foreach (var emoji in new[] { "👍", "❤", "🔥", "😂", "🎉", "💯", "😍", "👏", "🙏", "✨" })
            {
                var btn = new Button { Content = emoji, Width = 44, Height = 44, Margin = new Thickness(2), FontSize = 22 };
                btn.Click += async (_, _) =>
                {
                    StickerPopup.IsOpen = false;
                    await SendStickerAsync(emoji);
                };
                StickerPanel.Children.Add(btn);
            }
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

        // Add Date Separator "TODAY"
        var sepBorder = new Border
        {
            Background = new SolidColorBrush(Color.FromRgb(240, 242, 245)),
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(8, 4, 8, 4),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 12, 0, 16)
        };
        sepBorder.Child = new TextBlock
        {
            Text = "TODAY",
            FontSize = 12,
            Foreground = new SolidColorBrush(Color.FromRgb(101, 103, 107)),
            FontWeight = FontWeights.Bold
        };
        MessagesPanel.Children.Add(sepBorder);

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
                Foreground = new SolidColorBrush(Color.FromRgb(101, 103, 107)),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 6, 0, 6),
                FontSize = 12,
                FontWeight = FontWeights.SemiBold
            });
            return;
        }

        var row = new StackPanel
        {
            Margin = new Thickness(0, 2, 0, 8),
            HorizontalAlignment = msg.IsMine ? HorizontalAlignment.Right : HorizontalAlignment.Left,
            MaxWidth = 480
        };

        if (!msg.IsMine)
        {
            // Name label — dùng helper method, không dùng Converter trực tiếp
            row.Children.Add(new TextBlock
            {
                Text = msg.SenderName,
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = NameToColorBrush(msg.SenderName),
                Margin = new Thickness(4, 0, 0, 3)
            });
        }

        var bubble = new Border
        {
            CornerRadius = msg.IsMine ? new CornerRadius(18, 18, 4, 18) : new CornerRadius(18, 18, 18, 4),
            Padding = new Thickness(12, 9, 12, 9),
            Background = msg.IsMine
                ? new SolidColorBrush(Color.FromRgb(0, 132, 255))
                : new SolidColorBrush(Color.FromRgb(240, 242, 245))
        };

        var inner = new StackPanel();
        var fg = msg.IsMine
            ? Brushes.White
            : new SolidColorBrush(Color.FromRgb(28, 30, 33));

        if (MediaHelper.ShouldRenderAsImage(msg))
        {
            var preview = MediaHelper.CreateImagePreview(msg.FileUrl, _client.HttpBase, 240);
            if (preview is Image img)
            {
                img.Cursor = Cursors.Hand;
                img.MouseLeftButtonUp += (_, _) =>
                {
                    var resolved = MediaHelper.ResolveFileUrl(msg.FileUrl, _client.HttpBase);
                    if (!string.IsNullOrWhiteSpace(resolved))
                    {
                        OpenImageViewer(resolved, msg.FileName);
                    }
                };
            }

            // Image border styling
            var imgBorder = new Border
            {
                CornerRadius = new CornerRadius(14),
                ClipToBounds = true,
                Child = preview
            };
            inner.Children.Add(imgBorder);
            bubble.Padding = new Thickness(4);
            bubble.Background = Brushes.Transparent;
        }
        else if (!string.IsNullOrEmpty(msg.FileUrl))
        {
            var fileBtn = new Button
            {
                Content = $"📄 {msg.FileName}",
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Foreground = fg,
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Cursor = System.Windows.Input.Cursors.Hand,
                FontFamily = new System.Windows.Media.FontFamily("Segoe UI Emoji"),
                FontSize = 14
            };
            fileBtn.Click += async (_, _) => await DownloadFileAsync(msg.FileUrl!, msg.FileName ?? "file");
            inner.Children.Add(fileBtn);
        }
        else
        {
            var textContent = msg.Type == MessageType.Sticker
                ? $"[Sticker] {msg.Content}"
                : msg.Content;

            // dùng helper method thay vì Converter trực tiếp
            var isEmojiOnly = IsEmojiOnly(textContent);

            var tb = new TextBlock
            {
                Text = textContent,
                TextWrapping = TextWrapping.Wrap,
                Foreground = fg,
                FontFamily = new System.Windows.Media.FontFamily("Segoe UI Emoji"),
                FontSize = isEmojiOnly ? 42 : 14
            };
            System.Windows.Media.TextOptions.SetTextFormattingMode(tb, TextFormattingMode.Display);

            if (isEmojiOnly)
            {
                bubble.Background = Brushes.Transparent;
                bubble.Padding = new Thickness(0);
            }

            inner.Children.Add(tb);
        }

        bubble.Child = inner;
        row.Children.Add(bubble);

        // Timestamp row
        var bottomInfo = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = msg.IsMine ? HorizontalAlignment.Right : HorizontalAlignment.Left
        };

        if (msg.IsMine)
        {
            bottomInfo.Children.Add(new TextBlock
            {
                Text = "👍❤️",
                FontSize = 12,
                FontFamily = new System.Windows.Media.FontFamily("Segoe UI Emoji"),
                Margin = new Thickness(0, 3, 6, 0)
            });
        }

        bottomInfo.Children.Add(new TextBlock
        {
            Text = msg.TimeText,
            FontSize = 11,
            Foreground = new SolidColorBrush(Color.FromRgb(188, 192, 196)),
            Margin = new Thickness(msg.IsMine ? 0 : 4, 3, msg.IsMine ? 4 : 0, 0)
        });

        row.Children.Add(bottomInfo);
        MessagesPanel.Children.Add(row);
    }

    private void OpenImageViewer(string absoluteUrl, string? title)
    {
        try
        {
            var w = new Window
            {
                Owner = this,
                Title = string.IsNullOrWhiteSpace(title) ? "Image" : title,
                Width = 980,
                Height = 720,
                WindowStartupLocation = WindowStartupLocation.CenterOwner,
                Background = Brushes.Black
            };

            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.UriSource = new Uri(absoluteUrl, UriKind.Absolute);
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.EndInit();

            var image = new Image
            {
                Source = bitmap,
                Stretch = Stretch.Uniform,
                Margin = new Thickness(12)
            };

            var scroll = new ScrollViewer
            {
                Content = image,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Auto
            };

            w.Content = scroll;
            w.KeyDown += (_, e) =>
            {
                if (e.Key == Key.Escape) w.Close();
            };

            w.ShowDialog();
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Image", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task DownloadFileAsync(string url, string fileName)
    {
        url = MediaHelper.ResolveFileUrl(url, _client.HttpBase);
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

    // ── Helper: avatar color by name ──────────────────────────────────
    private static SolidColorBrush NameToColorBrush(string? name)
    {
        if (string.IsNullOrEmpty(name))
            return new SolidColorBrush(Color.FromRgb(0, 132, 255));

        return char.ToUpper(name[0]) switch
        {
            'A' => new SolidColorBrush(Color.FromRgb(255, 107, 107)),
            'B' => new SolidColorBrush(Color.FromRgb(78,  205, 196)),
            'C' => new SolidColorBrush(Color.FromRgb(69,  183, 209)),
            'D' => new SolidColorBrush(Color.FromRgb(231, 76,  60)),
            'E' => new SolidColorBrush(Color.FromRgb(46,  204, 113)),
            'G' => new SolidColorBrush(Color.FromRgb(155, 89,  182)),
            'H' => new SolidColorBrush(Color.FromRgb(243, 156, 18)),
            'K' => new SolidColorBrush(Color.FromRgb(26,  188, 156)),
            'L' => new SolidColorBrush(Color.FromRgb(142, 68,  173)),
            'M' => new SolidColorBrush(Color.FromRgb(78,  205, 196)),
            'N' => new SolidColorBrush(Color.FromRgb(150, 206, 180)),
            'P' => new SolidColorBrush(Color.FromRgb(253, 121, 168)),
            'Q' => new SolidColorBrush(Color.FromRgb(108, 92,  231)),
            'S' => new SolidColorBrush(Color.FromRgb(69,  183, 209)),
            'T' => new SolidColorBrush(Color.FromRgb(79,  156, 249)),
            'V' => new SolidColorBrush(Color.FromRgb(52,  152, 219)),
            'X' => new SolidColorBrush(Color.FromRgb(255, 118, 117)),
            _   => new SolidColorBrush(Color.FromRgb(0,   132, 255)),
        };
    }

    // ── Helper: detect emoji-only message ─────────────────────────────
    private static bool IsEmojiOnly(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        var clean = text.Trim();
        if (clean.Length > 12) return false;

        // Count text elements (handles multi-codepoint emoji)
        var enumerator = StringInfo.GetTextElementEnumerator(clean);
        int count = 0;
        while (enumerator.MoveNext())
        {
            count++;
            if (count > 3) return false; // max 3 emoji
        }

        // Validate all chars are emoji-related
        foreach (var c in clean)
        {
            // ZWJ, variation selector, combining enclosing keycap
            if (c == '\u200D' || c == '\uFE0F' || c == '\u20E3') continue;
            // Surrogate pairs (most emoji on Windows)
            if (c >= '\uD800' && c <= '\uDFFF') continue;
            // High codepoint symbols
            if (c > '\u2000') continue;
            // Whitespace between emoji
            if (char.IsWhiteSpace(c)) continue;
            // Anything else = not emoji only
            return false;
        }
        return count > 0;
    }
}