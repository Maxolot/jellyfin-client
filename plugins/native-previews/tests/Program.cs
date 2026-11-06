using System.Globalization;
using Jellyfin.Plugin.NativePreviews.Core;

var root = Path.Combine(Path.GetTempPath(), "native-previews-test-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
var count = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); count++; }
void Throws(Action action, string message) { try { action(); } catch (ArgumentException) { count++; return; } throw new Exception(message); }
try
{
    Throws(() => PreviewPolicy.Validate(new SceneRequest(double.NaN)), "NaN start accepted");
    Throws(() => PreviewPolicy.Validate(new SceneRequest(0, 31)), "Full movie allowed");
    Throws(() => PreviewPolicy.Validate(new SceneRequest(-1, 10)), "Negative scene allowed");
    Check(PreviewPolicy.AutomaticScene(null) is null, "Missing duration accepted for automatic scene");
    Check(PreviewPolicy.AutomaticScene(TimeSpan.TicksPerSecond * 7L) is null, "Very short source accepted");
    var auto = PreviewPolicy.AutomaticScene(TimeSpan.TicksPerSecond * 1000L);
    Check(auto is { Approved: true, StartSeconds: 80, DurationSeconds: 20 }, "Incorrect automatic scene bounds");
    var shortAuto = PreviewPolicy.AutomaticScene(TimeSpan.TicksPerSecond * 12L);
    Check(shortAuto is not null && shortAuto.StartSeconds + shortAuto.DurationSeconds < 12, "Automatic scene exceeds short source");
    Check(!PreviewPolicy.IsCacheKey("../../outside"), "Traversal key accepted");
    Check(!PreviewPolicy.IsVariant("../full"), "Traversal variant accepted");
    var key = new string('a', 64);
    var tickets = new PreviewTickets(root);
    var grant = new MediaTicket(Guid.NewGuid(), Guid.NewGuid(), "compact", key, DateTimeOffset.UtcNow.AddMinutes(3).ToUnixTimeSeconds());
    var token = tickets.Issue(grant);
    Check(tickets.Validate(token, DateTime.UtcNow) == grant, "Valid grant rejected");
    Check(tickets.Validate(token[..^3] + "abc", DateTime.UtcNow) is null, "Forged grant accepted");
    Check(tickets.Validate(token, DateTime.UtcNow.AddMinutes(4)) is null, "Expired grant accepted");
    Check(new PreviewTickets(root).Validate(token, DateTime.UtcNow) == grant, "Grant did not survive restart");
    Check(tickets.Validate(tickets.Issue(grant with { Variant = "../full" }), DateTime.UtcNow) is null, "Invalid signed variant accepted");
    Check(tickets.Validate(tickets.Issue(grant with { Expires = DateTimeOffset.UtcNow.AddHours(2).ToUnixTimeSeconds() }), DateTime.UtcNow) is null, "Excessive grant lifetime accepted");
    var recoverRoot = Path.Combine(root, "recovery");
    Directory.CreateDirectory(recoverRoot);
    File.WriteAllText(Path.Combine(recoverRoot, "scenes.json"), "broken");
    var recovered = new PreviewStore(recoverRoot, () => new PreviewOptions());
    Check(recovered.Scenes().Length == 0 && Directory.GetFiles(recoverRoot, "scenes.json.corrupt-*").Length == 1, "Corrupt catalogue was not preserved and isolated");
    var keyRoot = Path.Combine(root, "key-recovery");
    var oldKey = new PreviewTickets(keyRoot);
    var oldGrant = oldKey.Issue(grant);
    File.WriteAllBytes(Path.Combine(keyRoot, ".ticket-key"), []);
    Check(new PreviewTickets(keyRoot).Validate(oldGrant, DateTime.UtcNow) is null, "Partial key was not safely rotated");
    var options = new PreviewOptions { MaxCacheMiB = 64, ReserveFreeMiB = 64 };
    var store = new PreviewStore(Path.Combine(root, "store"), () => options);
    var first = store.Save(Guid.NewGuid(), Guid.NewGuid(), new SceneRequest(2, 3, Approved: true));
    var firstKey = new string('b', 64);
    Directory.CreateDirectory(store.CacheDirectory(firstKey));
    using (var file = File.Create(Path.Combine(store.CacheDirectory(firstKey), "compact.mp4"))) file.SetLength(40 * 1024L * 1024L);
    store.State(first.ItemId, first.Revision, "ready", key: firstKey);
    using var held = store.Open(first.ItemId, firstKey, "compact")?.Stream;
    Check(held is not null, "Ready clip not opened");
    Thread.Sleep(20);
    var second = store.Save(Guid.NewGuid(), Guid.NewGuid(), new SceneRequest(2, 3, Approved: true));
    var secondKey = new string('c', 64);
    Directory.CreateDirectory(store.CacheDirectory(secondKey));
    using (var file = File.Create(Path.Combine(store.CacheDirectory(secondKey), "compact.mp4"))) file.SetLength(40 * 1024L * 1024L);
    store.State(second.ItemId, second.Revision, "ready", key: secondKey);
    store.EnsureSpace(0);
    Check(store.Get(first.ItemId)?.State == "evicted", "LRU did not evict oldest clip");
    Check(store.Get(first.ItemId)?.Approved == true, "Eviction discarded scene approval");
    Check(store.Get(second.ItemId)?.State == "ready", "LRU evicted recent clip");
    Check(held!.ReadByte() == 0, "Eviction broke an already open response");
    Check(store.Open(first.ItemId, firstKey, "compact") is null, "Evicted ticket can reopen clip");
    var sameScene = store.SaveAutomaticIfAbsent(first.ItemId, Guid.NewGuid(), new SceneRequest(10, 5, Approved: true));
    Check(sameScene.Revision == first.Revision && sameScene.SourceItemId == first.SourceItemId, "Automatic scene replaced existing approval");
    var raceId = Guid.NewGuid();
    Parallel.For(0, 20, _ => store.SaveAutomaticIfAbsent(raceId, Guid.NewGuid(), new SceneRequest(2, 3, Approved: true)));
    Check(store.Get(raceId) is { Revision: 1, Automatic: true }, "Concurrent automatic selections replaced one another");
    var pending = store.Save(second.ItemId, second.SourceItemId, new SceneRequest(1, 3));
    Check(store.Open(pending.ItemId, secondKey, "compact") is null, "Unapproved scene can be served");
    store.State(second.ItemId, second.Revision, "ready", key: secondKey);
    Check(store.Get(second.ItemId)?.Revision == pending.Revision && store.Get(second.ItemId)?.State == "pending", "Superseded worker published its scene");
    using (var reservation = store.Reserve(48 * 1024L * 1024L))
    {
        var refused = false;
        try { using var extra = store.Reserve(32 * 1024L * 1024L); } catch (IOException) { refused = true; }
        Check(refused, "Concurrent work overcommitted the cache budget");
    }
    using (var released = store.Reserve(32 * 1024L * 1024L)) Check(true, "Released cache reservation not reclaimed");
    var media = Path.Combine(root, "source \"quoted\" ; .mp4");
    File.WriteAllText(media, "synthetic");
    var fingerprint = PreviewStore.Fingerprint(media, first);
    Check(fingerprint == PreviewStore.Fingerprint(media, first), "Cache key unstable");
    File.AppendAllText(media, "changed");
    Check(fingerprint != PreviewStore.Fingerprint(media, first), "Source replacement not in cache identity");
    CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
    var arguments = PreviewEncoder.Arguments(media, root, first with { StartSeconds = 1.5 }, new VideoProbe(60, 1920, 1080, false, true), 2);
    Check(arguments.Contains("1.5") && !arguments.Contains("1,5"), "Locale broke seek time");
    Check(arguments.Contains(media), "Source path was shell-interpolated");
    Check(arguments.Count(x => x == "-i") == 1 && arguments.Count(x => x == "libx264") == 2, "Scene decoded twice");
    Check(arguments.Contains("file,pipe"), "Network protocols not restricted");
    if (args.Length > 0)
    {
        var encoder = new PreviewEncoder("/usr/bin/ffmpeg", "/usr/bin/ffprobe");
        var source = args[0];
        var probe = await encoder.Probe(source, CancellationToken.None);
        var output = Path.Combine(root, "encoded");
        await encoder.Encode(source, output, first with { StartSeconds = 1, DurationSeconds = 2 }, probe, options, "software", CancellationToken.None);
        foreach (var variant in new[] { "compact", "full" })
        {
            var actual = await encoder.Probe(Path.Combine(output, variant + ".mp4"), CancellationToken.None);
            Check(actual.Duration is >= 1.9 and <= 2.2, "Incorrect clip duration");
            Check(actual.Height <= probe.Height && actual.Height <= (variant == "compact" ? 480 : 1080), "Preview was upscaled");
        }
        var importedSource = Path.Combine(output, "full.mp4");
        var importedProbe = await encoder.Probe(importedSource, CancellationToken.None);
        var importedScene = first with { StartSeconds = 0, DurationSeconds = importedProbe.Duration, Imported = true };
        var importedArgs = PreviewEncoder.Arguments(importedSource, root, importedScene, importedProbe, 2);
        Check(importedArgs.Contains("copy"), "Compatible imported master was reencoded");
        var importedOutput = Path.Combine(root, "imported");
        await encoder.Encode(importedSource, importedOutput, importedScene, importedProbe, options, "software", CancellationToken.None);
        string PacketHash(string path)
        {
            using var process = new System.Diagnostics.Process { StartInfo = new System.Diagnostics.ProcessStartInfo("/usr/bin/ffmpeg") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false } };
            foreach (var argument in new[] { "-v", "error", "-i", path, "-map", "0:v:0", "-c:v", "copy", "-f", "hash", "-hash", "sha256", "-" }) process.StartInfo.ArgumentList.Add(argument);
            process.Start();
            var hash = process.StandardOutput.ReadToEnd();
            process.WaitForExit();
            if (process.ExitCode != 0) throw new Exception("Video packet comparison failed");
            return hash;
        }
        Check(PacketHash(importedSource) == PacketHash(Path.Combine(importedOutput, "full.mp4")), "Imported master video packets changed");
        var fallback = await encoder.Encode(source, Path.Combine(root, "fallback"), first with { StartSeconds = 1, DurationSeconds = 2 }, probe, options, "qsv", CancellationToken.None, "/dev/dri/renderD999999");
        Check(fallback == "software", "Failed hardware encoder did not fall back to CPU");

    }
    Console.WriteLine($"{count} preview assertions passed (tickets, LRU, approvals, concurrency, source fingerprint and encoder).");
}
finally { Directory.Delete(root, true); }
