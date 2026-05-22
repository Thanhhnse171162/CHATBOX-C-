using System.Windows;

namespace ChatClient;

public partial class PromptDialog : Window
{
    public PromptDialog(string prompt, string title, string defaultValue = "")
    {
        InitializeComponent();
        Title = title;
        PromptText.Text = prompt;
        InputBox.Text = defaultValue;
        InputBox.Focus();
    }

    public string Value => InputBox.Text;

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }
}
