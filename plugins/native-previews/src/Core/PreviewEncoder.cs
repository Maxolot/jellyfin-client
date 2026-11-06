using System.Diagnostics;
using System.Globalization;
using System.Text.Json;

namespace Jellyfin.Plugin.NativePreviews.Core;

public sealed class PreviewEncoder(string encoderPath, string probePath)
{
    public static string[] Arguments(string source, string output, SceneRecord scene, VideoProbe probe, int threads, string hardware = "software", string? device = null)
    {
        PreviewPolicy.Validate(new SceneRequest(scene.StartSeconds, scene.DurationSeconds));
        var qsv = hardware == "qsv";
        var nvenc = hardware == "nvenc";
        var copyFull = scene.Imported && scene.StartSeconds == 0 && Math.Abs(scene.DurationSeconds - probe.Duration) < .5
            && probe.VideoCodec == "h264" && probe.PixelFormat == "yuv420p" && !probe.Hdr && probe.Width <= 4096 && probe.Height <= 1080
            && probe.FrameRate <= 30 && probe.BitRate is > 0 and <= 3600000;
        var hdr = probe.Hdr ? "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv," : "";
        var pixelFormat = qsv ? "nv12" : "yuv420p";
        string Scale(int height) => $"scale=w=trunc(oh*dar/2)*2:h=trunc(min({height}\\,ih)/2)*2,setsar=1,format={pixelFormat}";
        var frameRate = Math.Clamp(probe.FrameRate, 1, 30).ToString("0.######", CultureInfo.InvariantCulture);
        var prefix = $"[0:v:0]fps={frameRate},{hdr}";
        var filters = copyFull ? prefix + Scale(480) + "[compact]" : prefix + $"split=2[a][b];[a]{Scale(480)}[compact];[b]{Scale(1080)}[full]";
        var args = new List<string> { "-nostdin", "-hide_banner", "-loglevel", "error", "-y" };
        if (qsv)
        {
            if (device is null || !System.Text.RegularExpressions.Regex.IsMatch(device, "^/dev/dri/renderD[0-9]{1,6}$")) throw new ArgumentException("A local DRM render node is required for QSV.");
            args.AddRange(["-init_hw_device", "qsv=preview:hw,child_device=" + device]);
        }
        args.AddRange(["-threads", Math.Clamp(threads, 1, 4).ToString(CultureInfo.InvariantCulture), "-ss", scene.StartSeconds.ToString("R", CultureInfo.InvariantCulture), "-protocol_whitelist", "file,pipe", "-i", source, "-filter_complex_threads", "1", "-filter_complex", filters]);
        foreach (var variant in new[] { "compact", "full" })
        {
            var copy = copyFull && variant == "full";
            args.AddRange(["-map", copy ? "0:v:0" : $"[{variant}]", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1", "-t", scene.DurationSeconds.ToString("R", CultureInfo.InvariantCulture)]);
            if (copy) args.AddRange(["-c:v", "copy"]);
            else
            {
                args.AddRange(["-c:v", qsv ? "h264_qsv" : nvenc ? "h264_nvenc" : "libx264", "-preset", nvenc ? "p4" : "veryfast"]);
                if (qsv) args.AddRange(["-b:v", variant == "compact" ? "600k" : "2500k", "-look_ahead", "0"]);
                else args.AddRange([nvenc ? "-cq" : "-crf", variant == "compact" ? "25" : "22"]);
                args.AddRange(["-maxrate", variant == "compact" ? "800k" : "3500k", "-bufsize", variant == "compact" ? "1600k" : "7000k", "-threads", Math.Clamp(threads, 1, 4).ToString(CultureInfo.InvariantCulture), "-pix_fmt", pixelFormat]);
            }
            if (copy && probe.AudioCodec == "aac" && probe.AudioChannels <= 2) args.AddRange(["-c:a", "copy"]);
            else args.AddRange(["-c:a", "aac", "-b:a", "96k", "-ac", "2"]);
            args.AddRange(["-movflags", "+faststart", "-fs", "33554432", "-f", "mp4", Path.Combine(output, variant + ".mp4")]);
        }
        return args.ToArray();
    }
    public async Task<VideoProbe> Probe(string source, CancellationToken cancellation)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(TimeSpan.FromSeconds(30));
        var text = await Run(probePath, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration,bit_rate:stream=codec_type,codec_name,pix_fmt,channels,width,height,color_transfer,avg_frame_rate:stream_side_data=dv_profile", "-of", "json", source], deadline.Token, true).ConfigureAwait(false);
        using var json = JsonDocument.Parse(text);
        var streams = json.RootElement.GetProperty("streams").EnumerateArray().ToArray();
        var video = streams.First(x => x.GetProperty("codec_type").GetString() == "video");
        var duration = double.Parse(json.RootElement.GetProperty("format").GetProperty("duration").GetString()!, CultureInfo.InvariantCulture);
        var transfer = video.TryGetProperty("color_transfer", out var property) ? property.GetString() : null;
        if (!double.IsFinite(duration) || duration <= 0) throw new InvalidDataException("Invalid media duration.");
        var width = video.GetProperty("width").GetInt32();
        var height = video.GetProperty("height").GetInt32();
        if (width < 2 || height < 2 || (long)width * height > 33554432) throw new NotSupportedException("Preview source dimensions exceed the supported bound.");
        if (video.TryGetProperty("side_data_list", out var sideData) && sideData.EnumerateArray().Any(data => data.TryGetProperty("dv_profile", out var profile) && profile.GetInt32() == 5)) throw new NotSupportedException("Dolby Vision profile5 requires a separately validated tone-mapping pipeline.");
        var rate = 24.0;
        if (video.TryGetProperty("avg_frame_rate", out var rateProperty))
        {
            var parts = rateProperty.GetString()?.Split('/');
            if (parts is { Length: 2 } && double.TryParse(parts[0], CultureInfo.InvariantCulture, out var numerator) && double.TryParse(parts[1], CultureInfo.InvariantCulture, out var denominator) && denominator > 0 && numerator > 0) rate = numerator / denominator;
        }
        var audio = streams.FirstOrDefault(x => x.GetProperty("codec_type").GetString() == "audio");
        long bitRate = 0;
        if (json.RootElement.GetProperty("format").TryGetProperty("bit_rate", out var bitRateProperty)) long.TryParse(bitRateProperty.GetString(), out bitRate);
        return new VideoProbe(duration, width, height, transfer is "smpte2084" or "arib-std-b67", audio.ValueKind != JsonValueKind.Undefined, Math.Clamp(rate, 1, 240))
        {
            VideoCodec = video.GetProperty("codec_name").GetString(), PixelFormat = video.GetProperty("pix_fmt").GetString(), BitRate = bitRate,
            AudioCodec = audio.ValueKind == JsonValueKind.Undefined ? null : audio.GetProperty("codec_name").GetString(),
            AudioChannels = audio.ValueKind != JsonValueKind.Undefined && audio.TryGetProperty("channels", out var channels) ? channels.GetInt32() : 0
        };
    }
    public async Task<string> Encode(string source, string output, SceneRecord scene, VideoProbe probe, PreviewOptions options, string hardware, CancellationToken cancellation, string? device = null)
    {
        Directory.CreateDirectory(output);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(options.JobTimeoutSeconds, 30, 900)));
        try { await Run(encoderPath, Arguments(source, output, scene, probe, options.Threads, hardware, device), deadline.Token).ConfigureAwait(false); }
        catch (InvalidOperationException) when (hardware != "software")
        {
            await Run(encoderPath, Arguments(source, output, scene, probe, options.Threads), deadline.Token).ConfigureAwait(false);
            hardware = "software";
        }
        foreach (var variant in new[] { "compact", "full" })
        {
            var path = Path.Combine(output, variant + ".mp4");
            var result = await Probe(path, deadline.Token).ConfigureAwait(false);
            if (result.Duration > 30.5 || new FileInfo(path).Length > 32 * 1024L * 1024L) throw new InvalidDataException("Encoded preview exceeds its bounds.");
            await File.WriteAllTextAsync(Path.Combine(output, variant + ".json"), JsonSerializer.Serialize(result), cancellation).ConfigureAwait(false);
        }
        return hardware;
    }
    private static async Task<string> Run(string executable, string[] arguments, CancellationToken cancellation, bool capture = false)
    {
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var process = new Process { StartInfo = start };
        if (!process.Start()) throw new InvalidOperationException("Preview process could not start.");
        try { process.PriorityClass = ProcessPriorityClass.BelowNormal; } catch (Exception error) when (error is System.ComponentModel.Win32Exception or PlatformNotSupportedException or InvalidOperationException) { }
        async Task<string> ReadBounded(StreamReader reader)
        {
            var buffer = new char[2048];
            var result = new System.Text.StringBuilder();
            int length;
            while ((length = await reader.ReadAsync(buffer, cancellation).ConfigureAwait(false)) > 0)
            {
                if (result.Length < 65536) result.Append(buffer, 0, Math.Min(length, 65536 - result.Length));
            }
            return result.ToString();
        }
        var output = ReadBounded(process.StandardOutput);
        var errors = ReadBounded(process.StandardError);
        try
        {
            await process.WaitForExitAsync(cancellation).ConfigureAwait(false);
            var text = await output.ConfigureAwait(false);
            await errors.ConfigureAwait(false);
            if (process.ExitCode != 0) throw new InvalidOperationException("Preview encoder failed.");
            return capture ? text : "";
        }
        finally
        {
            if (!process.HasExited) process.Kill(true);
            try { await Task.WhenAll(output, errors).ConfigureAwait(false); } catch (OperationCanceledException) { }
        }
    }
}
