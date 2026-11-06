using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Jellyfin.Plugin.NativePreviews.Core;

public sealed class PreviewStore
{
    private readonly object _gate = new();
    private readonly string _root;
    private long _reservedBytes;
    private readonly Func<PreviewOptions> _options;
    private Dictionary<Guid, SceneRecord> _scenes;
    public string Root => _root;
    public PreviewStore(string root, Func<PreviewOptions> options)
    {
        _root = Path.GetFullPath(root);
        _options = options;
        Directory.CreateDirectory(_root);
        Directory.CreateDirectory(Path.Combine(_root, "cache"));
        Directory.CreateDirectory(Path.Combine(_root, "work"));
        Directory.CreateDirectory(Path.Combine(_root, "imports"));
        foreach (var entry in new DirectoryInfo(Path.Combine(_root, "work")).EnumerateFileSystemInfos())
        {
            if ((entry.Attributes & FileAttributes.ReparsePoint) != 0 || !Guid.TryParseExact(Path.GetFileNameWithoutExtension(entry.Name), "N", out _)) continue;
            if (entry is DirectoryInfo directory) directory.Delete(true); else entry.Delete();
        }
        var path = Path.Combine(_root, "scenes.json");
        try
        {
            _scenes = File.Exists(path) ? JsonSerializer.Deserialize<Dictionary<Guid, SceneRecord>>(File.ReadAllText(path)) ?? [] : [];
            if (_scenes.Any(pair => pair.Value is null || pair.Key != pair.Value.ItemId || pair.Key == Guid.Empty || pair.Value.SourceItemId == Guid.Empty)) throw new JsonException("Invalid scene catalogue.");
        }
        catch (JsonException)
        {
            File.Copy(path, path + ".corrupt-" + DateTime.UtcNow.Ticks, true);
            _scenes = [];
        }
        foreach (var scene in _scenes.Values)
        {
            if (scene.State == "encoding") scene.State = "queued";
            if (scene.State == "ready" && scene.ProfileVersion != PreviewPolicy.ProfileVersion) { scene.State = "evicted"; scene.CacheKey = null; }
        }
    }
    public SceneRecord[] Scenes() { lock (_gate) return _scenes.Values.Select(s => s with { }).ToArray(); }
    public SceneRecord? Get(Guid id) { lock (_gate) return _scenes.GetValueOrDefault(id) is { } scene ? scene with { } : null; }
    public SceneRecord Save(Guid id, Guid sourceId, SceneRequest request, bool imported = false, string? importHash = null)
    {
        PreviewPolicy.Validate(request);
        lock (_gate)
        {
            var scene = new SceneRecord(id, sourceId, request.StartSeconds, request.DurationSeconds, request.Approved,
                (_scenes.GetValueOrDefault(id)?.Revision ?? 0) + 1) { State = request.Approved ? "queued" : "pending", Imported = imported, ImportHash = importHash };
            _scenes[id] = scene;
            Persist();
            return scene with { };
        }
    }
    public SceneRecord SaveAutomaticIfAbsent(Guid id, Guid sourceId, SceneRequest request)
    {
        PreviewPolicy.Validate(request);
        if (!request.Approved) throw new ArgumentException("Automatic selection must be explicitly enabled.");
        lock (_gate)
        {
            if (_scenes.TryGetValue(id, out var existing)) return existing with { };
            var scene = new SceneRecord(id, sourceId, request.StartSeconds, request.DurationSeconds, true, 1) { State = "queued", Automatic = true };
            _scenes[id] = scene;
            Persist();
            return scene with { };
        }
    }
    public void State(Guid id, long revision, string state, string? error = null, string? key = null)
    {
        lock (_gate)
        {
            if (!_scenes.TryGetValue(id, out var scene) || scene.Revision != revision) return;
            scene.State = state; scene.Error = error;
            if (key is not null) scene.CacheKey = key;
            if (state == "ready") scene.ProfileVersion = PreviewPolicy.ProfileVersion;
            Persist();
        }
    }
    public string CacheDirectory(string key)
    {
        if (!PreviewPolicy.IsCacheKey(key)) throw new ArgumentException("Invalid cache key.");
        return Path.Combine(_root, "cache", key);
    }
    public (FileStream Stream, DateTime Modified)? Open(Guid id, string key, string variant)
    {
        if (!PreviewPolicy.IsVariant(variant) || !PreviewPolicy.IsCacheKey(key)) return null;
        lock (_gate)
        {
            if (!_scenes.TryGetValue(id, out var scene) || !scene.Approved || scene.State != "ready" || scene.CacheKey != key) return null;
            var path = Path.Combine(CacheDirectory(key), variant + ".mp4");
            if (!File.Exists(path)) return null;
            var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete);
            var modified = File.GetLastWriteTimeUtc(path);
            if (DateTime.UtcNow - scene.LastAccessUtc > TimeSpan.FromMinutes(5)) { scene.LastAccessUtc = DateTime.UtcNow; Persist(); }
            return (stream, modified);
        }
    }
    public void EnsureSpace(long reservation, string? preserve = null)
    {
        lock (_gate)
        {
            var options = _options();
            var budget = PreviewPolicy.Budget(options);
            var directories = new DirectoryInfo(Path.Combine(_root, "cache")).GetDirectories().Where(d => PreviewPolicy.IsCacheKey(d.Name) && (d.Attributes & FileAttributes.ReparsePoint) == 0).ToArray();
            var sizes = directories.ToDictionary(d => d.Name, d => d.EnumerateFiles().Sum(f => f.Length));
            var enumeration = new EnumerationOptions { RecurseSubdirectories = true, AttributesToSkip = FileAttributes.ReparsePoint, IgnoreInaccessible = true };
            long Bytes(string name) => new DirectoryInfo(Path.Combine(_root, name)).EnumerateFiles("*", enumeration).Sum(file => file.Length);
            var workBytes = Bytes("work");
            var total = sizes.Values.Sum() + Bytes("imports") + Math.Max(workBytes, _reservedBytes);
            var unwrittenReservation = Math.Max(0, _reservedBytes - workBytes);
            var reserve = Math.Clamp(options.ReserveFreeMiB, 64, 102400) * 1024L * 1024L;
            long Free() => new DriveInfo(_root).AvailableFreeSpace;
            foreach (var directory in directories.OrderBy(d => _scenes.Values.Where(s => s.CacheKey == d.Name).Select(s => s.LastAccessUtc).DefaultIfEmpty(d.LastWriteTimeUtc).Max()))
            {
                var access = _scenes.Values.Where(s => s.CacheKey == directory.Name).Select(s => s.LastAccessUtc).DefaultIfEmpty(directory.LastWriteTimeUtc).Max();
                if (directory.Name == preserve || (total + reservation <= budget && Free() - reservation - unwrittenReservation >= reserve && DateTime.UtcNow - access < TimeSpan.FromDays(Math.Clamp(options.IdleDays, 1, 365)) )) continue;
                directory.Delete(true); total -= sizes[directory.Name];
                foreach (var scene in _scenes.Values.Where(s => s.CacheKey == directory.Name)) { scene.State = "evicted"; scene.CacheKey = null; }
            }
            Persist();
            if (total + reservation > budget || Free() - reservation - unwrittenReservation < reserve) throw new IOException("Preview cache space limit reached.");
        }
    }
    public void CheckSource(Guid id, string path)
    {
        lock (_gate)
        {
            var changed = false;
            foreach (var scene in _scenes.Values.Where(scene => !scene.Imported && scene.SourceItemId == id && scene.State == "ready"))
            {
                try
                {
                    if (File.Exists(path) && scene.CacheKey == Fingerprint(path, scene)) continue;
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
                scene.State = "stale";
                changed = true;
            }
            if (changed) Persist();
        }
    }
    public IDisposable Reserve(long bytes)
    {
        if (bytes < 0) throw new ArgumentOutOfRangeException(nameof(bytes));
        lock (_gate)
        {
            EnsureSpace(bytes);
            _reservedBytes += bytes;
            return new SpaceLease(this, bytes);
        }
    }
    private sealed class SpaceLease(PreviewStore owner, long bytes) : IDisposable
    {
        private int _released;
        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) != 0) return;
            lock (owner._gate) owner._reservedBytes -= bytes;
        }
    }
    public void Publish(SceneRecord scene, string work, string key, IDisposable reservation)
    {
        lock (_gate)
        {
            if (_scenes.GetValueOrDefault(scene.ItemId)?.Revision != scene.Revision) return;
            var target = CacheDirectory(key);
            if (Directory.Exists(target)) Directory.Delete(target, true);
            Directory.Move(work, target);
            reservation.Dispose();
            State(scene.ItemId, scene.Revision, "ready", key: key);
            EnsureSpace(0, key);
        }
    }
    public SceneRecord Import(Guid id, Guid sourceId, string temp, double duration, IDisposable reservation)
    {
        lock (_gate)
        {
            string hash;
            using (var stream = File.OpenRead(temp)) hash = Convert.ToHexStringLower(SHA256.HashData(stream));
            var destination = Path.Combine(_root, "imports", hash + ".mp4");
            if (File.Exists(destination)) File.Delete(temp); else File.Move(temp, destination);
            reservation.Dispose();
            var previous = _scenes.GetValueOrDefault(id);
            if (previous is { Approved: true, Imported: true } && previous.SourceItemId == sourceId && previous.ImportHash == hash) return previous with { };
            return Save(id, sourceId, new SceneRequest(0, duration, sourceId, true), true, hash);
        }
    }
    public static string Fingerprint(string path, SceneRecord scene)
    {
        var info = new FileInfo(path);
        var data = FormattableString.Invariant($"profile-v{PreviewPolicy.ProfileVersion}|{path}|{info.Length}|{info.LastWriteTimeUtc.Ticks}|{scene.StartSeconds:R}|{scene.DurationSeconds:R}");
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(data)));
    }
    private void Persist()
    {
        var path = Path.Combine(_root, "scenes.json");
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(_scenes));
        File.Move(temp, path, true);
    }
}
