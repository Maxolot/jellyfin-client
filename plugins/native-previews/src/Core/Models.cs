namespace Jellyfin.Plugin.NativePreviews.Core;

public sealed class PreviewOptions
{
    public bool Enabled { get; set; } = true;
    public bool AutomaticScenes { get; set; }
    public int MaxCacheMiB { get; set; } = 2048;
    public int ReserveFreeMiB { get; set; } = 2048;
    public int Threads { get; set; } = 2;
    public int IdleDays { get; set; } = 30;
    public int JobTimeoutSeconds { get; set; } = 300;
    public bool PauseDuringPlayback { get; set; } = true;
    public string Encoder { get; set; } = "auto";
}
public sealed record SceneRequest(double StartSeconds, double DurationSeconds = 20, Guid? SourceItemId = null, bool Approved = false);
public sealed record SceneRecord(Guid ItemId, Guid SourceItemId, double StartSeconds, double DurationSeconds, bool Approved, long Revision)
{
    public string State { get; set; } = "pending";
    public string? CacheKey { get; set; }
    public DateTime LastAccessUtc { get; set; } = DateTime.UtcNow;
    public string? Error { get; set; }
    public string? ImportHash { get; set; }
    public int ProfileVersion { get; set; }
    public bool Imported { get; set; }
    public bool Automatic { get; set; }
}
public sealed record VideoProbe(double Duration, int Width, int Height, bool Hdr, bool HasAudio, double FrameRate = 24)
{
    public string? VideoCodec { get; init; }
    public string? PixelFormat { get; init; }
    public string? AudioCodec { get; init; }
    public int AudioChannels { get; init; }
    public long BitRate { get; init; }
}
public sealed record PreviewVariant(string Url, int Width, int Height);
public sealed record PreviewManifest(Guid ItemId, double DurationSeconds, DateTime ExpiresAt, Dictionary<string, PreviewVariant> Sources);
public sealed record MediaTicket(Guid UserId, Guid ItemId, string Variant, string CacheKey, long Expires);

public static class PreviewPolicy
{
    public const int ProfileVersion = 3;
    public static void Validate(SceneRequest request)
    {
        if (!double.IsFinite(request.StartSeconds) || !double.IsFinite(request.DurationSeconds)
            || request.StartSeconds < 0 || request.DurationSeconds < 1 || request.DurationSeconds > 30)
            throw new ArgumentException("The scene must start at a positive position and last 1–30 seconds.");
    }
    // Automatic selection is an approximation; it cannot detect story spoilers.
    public static SceneRequest? AutomaticScene(long? ticks)
    {
        if (ticks is null || ticks.Value < TimeSpan.TicksPerSecond * 8L) return null;
        var seconds = ticks.Value / (double)TimeSpan.TicksPerSecond;
        var duration = Math.Min(20, seconds / 4);
        var start = Math.Min(seconds * .08, seconds - duration - 1);
        return new SceneRequest(Math.Max(0, start), duration, Approved: true);
    }
    public static bool IsCacheKey(string? key) => key is { Length: 64 } && key.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
    public static bool IsVariant(string? value) => value is "compact" or "full";
    public static long Budget(PreviewOptions options) => Math.Clamp(options.MaxCacheMiB, 64, 102400) * 1024L * 1024L;
}
