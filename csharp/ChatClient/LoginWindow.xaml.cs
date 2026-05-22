using System.Windows;
using ChatShared;

namespace ChatClient;

public partial class LoginWindow : Window
{
    public LoginWindow()
    {
        InitializeComponent();
        UserBox.Text = Environment.UserName;
    }

    private async void Join_Click(object sender, RoutedEventArgs e) => await DoAuthAsync(register: false);

    private async void Register_Click(object sender, RoutedEventArgs e) => await DoAuthAsync(register: true);

    private async Task DoAuthAsync(bool register)
    {
        StatusText.Text = "Connecting...";
        try
        {
            var (host, tcpPort) = ParseHostPort(HostBox.Text.Trim(), WireProtocol.TcpPort);
            if (!int.TryParse(HttpPortBox.Text.Trim(), out var httpPort))
            {
                httpPort = WireProtocol.HttpPort;
            }

            var client = new TcpChatClient(host, tcpPort, httpPort);
            await client.ConnectAsync();

            var tcs = new TaskCompletionSource<bool>();
            void Handler(WirePacket p)
            {
                if (p.Op == "ok") tcs.TrySetResult(true);
                if (p.Op == "error") tcs.TrySetException(new Exception(p.Message ?? "Login failed"));
            }
            client.PacketReceived += Handler;
            client.Error += msg => tcs.TrySetException(new Exception(msg));

            await client.LoginAsync(UserBox.Text.Trim(), PassBox.Password, register, UserBox.Text.Trim());
            await tcs.Task.WaitAsync(TimeSpan.FromSeconds(10));
            client.PacketReceived -= Handler;

            var main = new MainWindow(client);
            main.Show();
            Close();
        }
        catch (Exception ex)
        {
            StatusText.Text = ex.Message switch
            {
                "Invalid login" when !register =>
                    "Chua co tai khoan hoac sai mat khau. Lan dau hay bam Register.",
                "Username taken" => "Ten da ton tai, doi username khac.",
                _ => ex.Message
            };
        }
    }

    public static (string host, int port) ParseHostPort(string input, int defaultPort)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return ("localhost", defaultPort);
        }

        var parts = input.Split(':', 2);
        if (parts.Length == 2 && int.TryParse(parts[1], out var port))
        {
            return (parts[0].Trim(), port);
        }

        return (input.Trim(), defaultPort);
    }
}
