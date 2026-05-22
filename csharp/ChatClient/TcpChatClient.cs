using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using ChatShared;

namespace ChatClient;

public sealed class TcpChatClient : IAsyncDisposable
{
    private TcpClient? _tcp;
    private StreamReader? _reader;
    private StreamWriter? _writer;
    private CancellationTokenSource? _readCts;

    public string Host { get; }
    public int TcpPort { get; }
    public int HttpPort { get; }
    public Guid? UserId { get; private set; }
    public string DisplayName { get; private set; } = "";

    public event Action<WirePacket>? PacketReceived;
    public event Action<string>? Error;

    public TcpChatClient(string host, int tcpPort, int httpPort)
    {
        Host = host;
        TcpPort = tcpPort;
        HttpPort = httpPort;
    }

    public string HttpBase => $"http://{Host}:{HttpPort}";

    public async Task ConnectAsync()
    {
        _tcp = new TcpClient();
        await _tcp.ConnectAsync(Host, TcpPort);
        var stream = _tcp.GetStream();
        _reader = new StreamReader(stream, Encoding.UTF8);
        _writer = new StreamWriter(stream, Encoding.UTF8) { AutoFlush = true };
        _readCts = new CancellationTokenSource();
        _ = ReadLoopAsync(_readCts.Token);
    }

    public async Task SendAsync(WirePacket packet)
    {
        if (_writer == null) return;
        var json = JsonSerializer.Serialize(packet, WireProtocol.JsonOptions);
        await _writer.WriteLineAsync(json);
    }

    public async Task LoginAsync(string username, string password, bool register, string? displayName = null)
    {
        await SendAsync(new WirePacket
        {
            Op = register ? "register" : "login",
            Username = username,
            Password = password,
            DisplayName = displayName
        });
    }

    private async Task ReadLoopAsync(CancellationToken token)
    {
        try
        {
            while (!token.IsCancellationRequested && _reader != null)
            {
                var line = await _reader.ReadLineAsync(token);
                if (line == null) break;
                var packet = JsonSerializer.Deserialize<WirePacket>(line, WireProtocol.JsonOptions);
                if (packet == null) continue;

                if (packet.Op == "ok")
                {
                    UserId = packet.UserId;
                    DisplayName = packet.DisplayName ?? "";
                }
                if (packet.Op == "error")
                {
                    Error?.Invoke(packet.Message ?? "Error");
                }

                PacketReceived?.Invoke(packet);
            }
        }
        catch (Exception ex) when (!token.IsCancellationRequested)
        {
            Error?.Invoke(ex.Message);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _readCts?.Cancel();
        _reader?.Dispose();
        _writer?.Dispose();
        _tcp?.Close();
    }
}
