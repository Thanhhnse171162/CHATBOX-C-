using System.IO;
using System.Net;
using System.Net.Http;

namespace ChatClient;

internal sealed class ProgressStreamContent : HttpContent
{
    private readonly Stream _stream;
    private readonly int _bufferSize;
    private readonly Action<int> _onProgress;

    public ProgressStreamContent(Stream stream, int bufferSize, Action<int> onProgress)
    {
        _stream = stream;
        _bufferSize = bufferSize;
        _onProgress = onProgress;
    }

    protected override async Task SerializeToStreamAsync(Stream target, TransportContext? context)
    {
        var buffer = new byte[_bufferSize];
        var total = _stream.CanSeek ? _stream.Length : -1L;
        long uploaded = 0;

        int read;
        while ((read = await _stream.ReadAsync(buffer)) > 0)
        {
            await target.WriteAsync(buffer.AsMemory(0, read));
            uploaded += read;
            if (total > 0)
                _onProgress((int)Math.Min(100, uploaded * 100 / total));
        }

        _onProgress(100);
    }

    protected override bool TryComputeLength(out long length)
    {
        if (_stream.CanSeek) { length = _stream.Length; return true; }
        length = -1;
        return false;
    }
}
