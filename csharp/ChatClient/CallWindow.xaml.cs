using System.Windows;
using System.Windows.Threading;
using ChatShared;

namespace ChatClient;

public partial class CallWindow : Window
{
    private readonly TcpChatClient _client;
    private readonly Guid? _roomId;
    private readonly Guid? _callId;
    private readonly DispatcherTimer _timer;
    private TimeSpan _elapsed;

    public CallWindow(string kind, string peer, bool incoming, Guid? callId, TcpChatClient client, Guid? roomId)
    {
        InitializeComponent();
        _client = client;
        _roomId = roomId;
        _callId = callId;
        KindText.Text = incoming ? $"Incoming {kind} call" : $"{kind} call";
        PeerText.Text = peer;

        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _timer.Tick += (_, _) =>
        {
            _elapsed = _elapsed.Add(TimeSpan.FromSeconds(1));
            TimerText.Text = _elapsed.ToString(@"mm\:ss");
        };
        _timer.Start();
    }

    private async void EndCall_Click(object sender, RoutedEventArgs e)
    {
        if (_callId.HasValue)
        {
            await _client.SendAsync(new WirePacket { Op = "call_end", CallId = _callId });
        }
        Close();
    }

    protected override void OnClosed(EventArgs e)
    {
        _timer.Stop();
        base.OnClosed(e);
    }
}
