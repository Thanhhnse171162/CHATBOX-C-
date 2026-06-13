using System;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using System.Text.RegularExpressions;

namespace ChatClient.Converters;

public class NameToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        string? name = value as string;
        if (string.IsNullOrWhiteSpace(name)) return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0084FF"));

        char firstChar = char.ToUpperInvariant(name.Trim()[0]);
        string hexColor = firstChar switch
        {
            'T' => "#4F9CF9",
            'A' => "#FF6B6B",
            'M' => "#4ECDC4",
            'S' => "#45B7D1",
            'H' => "#F39C12",
            'N' => "#96CEB4",
            'G' => "#9B59B6",
            'D' => "#E74C3C",
            _   => "#0084FF"
        };
        return new SolidColorBrush((Color)ColorConverter.ConvertFromString(hexColor));
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotImplementedException();
}

public class NameToInitialsConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        string? name = value as string;
        if (string.IsNullOrWhiteSpace(name)) return "?";

        var parts = name.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 2)
        {
            return (parts[0][0].ToString() + parts[parts.Length - 1][0].ToString()).ToUpperInvariant();
        }
        else if (name.Length >= 2)
        {
            return name.Substring(0, 2).ToUpperInvariant();
        }
        return name.Substring(0, 1).ToUpperInvariant();
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotImplementedException();
}

public class IsEmojiOnlyConverter : IValueConverter
{
    private static readonly Regex EmojiRegex = new Regex(
        @"^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])+$",
        RegexOptions.Compiled);

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        string? text = value as string;
        if (string.IsNullOrEmpty(text)) return false;

        // Check if length is short (count of text elements <= 3)
        var stringInfo = new StringInfo(text);
        if (stringInfo.LengthInTextElements > 3) return false;

        // Strip whitespace and check if only emojis
        string trimmed = text.Replace(" ", "");
        if (string.IsNullOrEmpty(trimmed)) return false;

        return EmojiRegex.IsMatch(trimmed);
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotImplementedException();
}

public class BoolToAlignmentConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is bool isMine)
        {
            return isMine ? HorizontalAlignment.Right : HorizontalAlignment.Left;
        }
        return HorizontalAlignment.Left;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotImplementedException();
}

public class BoolToCornerRadiusConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is bool isMine)
        {
            return isMine ? new CornerRadius(18, 18, 4, 18) : new CornerRadius(18, 18, 18, 4);
        }
        return new CornerRadius(18, 18, 18, 4);
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotImplementedException();
}
