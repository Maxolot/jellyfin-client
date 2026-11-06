using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace Jellyfin.Plugin.NativePreviews.Core;

public sealed class PreviewTickets
{
    private readonly byte[] _key;
    public PreviewTickets(string directory)
    {
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, ".ticket-key");
        if (File.Exists(path) && new FileInfo(path).Length == 32) _key = File.ReadAllBytes(path);
        else
        {
            _key = RandomNumberGenerator.GetBytes(32);
            var temp = path + ".tmp";
            var options = new FileStreamOptions { Mode = FileMode.Create, Access = FileAccess.Write, Share = FileShare.None };
            if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            using (var file = new FileStream(temp, options)) { file.Write(_key); file.Flush(true); }
            File.Move(temp, path, true);
        }
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
    }
    public string Issue(MediaTicket ticket)
    {
        var data = JsonSerializer.SerializeToUtf8Bytes(ticket);
        return WebEncoders.Base64UrlEncode(data) + "." + WebEncoders.Base64UrlEncode(HMACSHA256.HashData(_key, data));
    }
    public MediaTicket? Validate(string? token, DateTime utcNow)
    {
        if (token is null || token.Length > 2048) return null;
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 2) return null;
            var data = WebEncoders.Base64UrlDecode(parts[0]);
            var signature = WebEncoders.Base64UrlDecode(parts[1]);
            if (!CryptographicOperations.FixedTimeEquals(signature, HMACSHA256.HashData(_key, data))) return null;
            var ticket = JsonSerializer.Deserialize<MediaTicket>(data);
            var now = new DateTimeOffset(utcNow).ToUnixTimeSeconds();
            return ticket is not null && ticket.UserId != Guid.Empty && ticket.ItemId != Guid.Empty
                && ticket.Expires > now && ticket.Expires <= now + 600
                && PreviewPolicy.IsVariant(ticket.Variant) && PreviewPolicy.IsCacheKey(ticket.CacheKey) ? ticket : null;
        }
        catch (Exception error) when (error is FormatException or JsonException or ArgumentException) { return null; }
    }
}
