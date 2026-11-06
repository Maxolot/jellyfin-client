using Jellyfin.Data;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Extensions;
using Jellyfin.Data.Enums;
using System.Collections.Concurrent;
using System.Threading.Channels;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.NativePreviews.Core;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.MediaEncoding;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Configuration;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.NativePreviews;

public sealed class PreviewRuntime : BackgroundService
{
    private readonly ILibraryManager _library;
    private readonly IUserManager _users;
    private readonly ISessionManager _sessions;
    private readonly IMediaEncoder _mediaEncoder;
    private readonly IServerConfigurationManager _configuration;
    private readonly ILogger<PreviewRuntime> _logger;
    private readonly Channel<(Guid Id, long Revision)> _queue = Channel.CreateBounded<(Guid, long)>(new BoundedChannelOptions(64) { FullMode = BoundedChannelFullMode.Wait, SingleReader = true });
    private readonly ConcurrentDictionary<Guid, long> _pending = new();
    private Task? _maintenance;
    public readonly SemaphoreSlim ImportGate = new(1, 1);
    public PreviewStore Store { get; }
    public PreviewTickets Tickets { get; }
    public PreviewEncoder Encoder => new(_mediaEncoder.EncoderPath, _mediaEncoder.ProbePath);
    public PreviewOptions Options => Plugin.Instance!.Configuration.Options;
    public PreviewRuntime(ILibraryManager library, IUserManager users, ISessionManager sessions, IMediaEncoder mediaEncoder, IServerConfigurationManager configuration, ILogger<PreviewRuntime> logger)
    {
        _library = library; _users = users; _sessions = sessions; _mediaEncoder = mediaEncoder; _configuration = configuration; _logger = logger;
        var root = Plugin.Instance?.DataFolderPath ?? throw new InvalidOperationException("Preview plugin not initialized.");
        Store = new PreviewStore(root, () => Options);
        Tickets = new PreviewTickets(root);
        Directory.CreateDirectory(Path.Combine(root, "imports"));
        _library.ItemUpdated += OnItemUpdated;
    }
    private void OnItemUpdated(object? sender, ItemChangeEventArgs args)
    {
        if (args.Item is Video { Path: { } path } video) Store.CheckSource(video.Id, path);
    }
    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken).ConfigureAwait(false);
        if (_maintenance is not null)
        {
            try { await _maintenance.ConfigureAwait(false); } catch (OperationCanceledException) { }
        }
    }
    public override void Dispose()
    {
        _library.ItemUpdated -= OnItemUpdated;
        ImportGate.Dispose();
        base.Dispose();
    }
    public BaseItem? Visible(Guid id, Guid userId)
    {
        var user = _users.GetUserById(userId);
        if (user is null || user.HasPermission(PermissionKind.IsDisabled) || !user.HasPermission(PermissionKind.EnableMediaPlayback)) return null;
        return _library.GetItemById<BaseItem>(id, userId);
    }
    public bool IsAdmin(Guid id) => _users.GetUserById(id) is { } user && !user.HasPermission(PermissionKind.IsDisabled) && user.HasPermission(PermissionKind.IsAdministrator);
    public Guid Source(BaseItem item, Guid? requested, Guid userId)
    {
        if (requested is { } sourceId)
        {
            var source = Visible(sourceId, userId);
            if (source is not Video || (source.Id != item.Id && (source is not Episode episode || episode.SeriesId != item.Id))) throw new ArgumentException("The source does not belong to the selected item.");
            return source.Id;
        }
        if (item is Video) return item.Id;
        if (item is Series)
        {
            var children = _library.GetItemList(new InternalItemsQuery(_users.GetUserById(userId)) { AncestorIds = [item.Id], IncludeItemTypes = [BaseItemKind.Episode], IsVirtualItem = false, ParentIndexNumber = 1, IndexNumber = 1, Recursive = true, OrderBy = [(ItemSortBy.ParentIndexNumber, SortOrder.Ascending), (ItemSortBy.IndexNumber, SortOrder.Ascending)], Limit = 1 });
            if (children.FirstOrDefault() is Video first) return first.Id;
        }
        throw new ArgumentException("Only local films, series and episodes can have previews.");
    }
    public SceneRecord? AutomaticScene(BaseItem item, Guid userId)
    {
        if (!Options.AutomaticScenes || item is not (Movie or Episode or Series)) return null;
        try
        {
            var sourceId = Source(item, null, userId);
            if (Visible(sourceId, userId) is not Video source) return null;
            var selection = PreviewPolicy.AutomaticScene(source.RunTimeTicks);
            return selection is null ? null : Store.SaveAutomaticIfAbsent(item.Id, sourceId, selection);
        }
        catch (ArgumentException) { return null; }
    }
    public bool Enqueue(SceneRecord scene)
    {
        if (!scene.Approved || !Options.Enabled || (scene.Automatic && !Options.AutomaticScenes)) return false;
        if (!_pending.TryAdd(scene.ItemId, scene.Revision)) return true;
        if (_queue.Writer.TryWrite((scene.ItemId, scene.Revision))) { Store.State(scene.ItemId, scene.Revision, "queued"); return true; }
        _pending.TryRemove(scene.ItemId, out _);
        return false;
    }
    public string ImportPath(SceneRecord scene)
    {
        var stem = scene.ImportHash is null ? scene.ItemId.ToString("N") : PreviewPolicy.IsCacheKey(scene.ImportHash) ? scene.ImportHash : throw new InvalidDataException("Invalid import identity.");
        return Path.Combine(Store.Root, "imports", stem + ".mp4");
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (string.IsNullOrWhiteSpace(_mediaEncoder.EncoderPath) || string.IsNullOrWhiteSpace(_mediaEncoder.ProbePath))
            await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken).ConfigureAwait(false);
        foreach (var scene in Store.Scenes().Where(x => x.Approved && x.State is "queued" or "encoding")) Enqueue(scene);
        _maintenance = Maintain(stoppingToken);
        await foreach (var job in _queue.Reader.ReadAllAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                var scene = Store.Get(job.Id);
                if (scene is null || !scene.Approved || scene.Revision != job.Revision || (scene.Automatic && !Options.AutomaticScenes)) continue;
                while ((!Options.Enabled || (Options.PauseDuringPlayback && _sessions.Sessions.Any(s => s.NowPlayingItem is not null && s.PlayState?.IsPaused != true))) && !stoppingToken.IsCancellationRequested)
                    await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken).ConfigureAwait(false);
                if (scene.Automatic && !Options.AutomaticScenes) continue;
                using var work = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                var yielded = false;
                var monitor = Task.Run(async () =>
                {
                    while (!work.IsCancellationRequested)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(2), work.Token).ConfigureAwait(false);
                        if ((scene.Automatic && !Options.AutomaticScenes) || (Options.PauseDuringPlayback && _sessions.Sessions.Any(s => s.NowPlayingItem is not null && s.PlayState?.IsPaused != true))) { yielded = true; work.Cancel(); }
                    }
                }, stoppingToken);
                try { await Generate(scene, work.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) when (yielded && !stoppingToken.IsCancellationRequested) { Store.State(scene.ItemId, scene.Revision, "queued"); }
                finally
                {
                    work.Cancel();
                    try { await monitor.ConfigureAwait(false); } catch (OperationCanceledException) { }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error)
            {
                Store.State(job.Id, job.Revision, "failed", error is IOException ? "cache-or-source-unavailable" : "encoding-failed");
                _logger.LogWarning(error, "Preview job {ItemId} failed ({FailureKind})", job.Id, error.GetType().Name);
            }
            finally
            {
                _pending.TryRemove(job.Id, out _);
                var current = Store.Get(job.Id);
                if (current is { Approved: true } && (current.Revision != job.Revision || current.State == "queued")) Enqueue(current);
            }
        }
    }
    private async Task Maintain(CancellationToken cancellation)
    {
        while (!cancellation.IsCancellationRequested)
        {
            try { Store.EnsureSpace(0); }
            catch (IOException) { _logger.LogWarning("Preview cache is limited by available disk space."); }
            await Task.Delay(TimeSpan.FromMinutes(10), cancellation).ConfigureAwait(false);
        }
    }
    private async Task Generate(SceneRecord scene, CancellationToken cancellation)
    {
        var source = scene.Imported ? ImportPath(scene) : (_library.GetItemById(scene.SourceItemId) as Video)?.Path;
        if (source is null || !Path.IsPathFullyQualified(source) || !File.Exists(source)) throw new IOException("Local preview source unavailable.");
        if (!new[] { ".mp4", ".mkv", ".webm", ".m4v", ".mov", ".avi", ".ts", ".m2ts", ".mpg", ".mpeg", ".wmv" }.Contains(Path.GetExtension(source).ToLowerInvariant())) throw new ArgumentException("A local video file is required.");
        var key = PreviewStore.Fingerprint(source, scene);
        var target = Store.CacheDirectory(key);
        if (File.Exists(Path.Combine(target, "compact.mp4")) && File.Exists(Path.Combine(target, "full.mp4")) && File.Exists(Path.Combine(target, "compact.json")) && File.Exists(Path.Combine(target, "full.json"))) { Store.State(scene.ItemId, scene.Revision, "ready", key: key); return; }
        using var reservation = Store.Reserve(64 * 1024L * 1024L);
        var work = Path.Combine(Store.Root, "work", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(work);
        try
        {
            Store.State(scene.ItemId, scene.Revision, "encoding");
            _logger.LogDebug("Preview pipeline: probing source");
            var probe = await Encoder.Probe(source, cancellation).ConfigureAwait(false);
            if (scene.StartSeconds + scene.DurationSeconds > probe.Duration + .1) throw new ArgumentException("Scene extends past the source duration.");
            _logger.LogDebug("Preview pipeline: reading encoder configuration");
            var configuration = _configuration.GetConfiguration("encoding") as EncodingOptions;
            var hardware = Options.Encoder == "auto" ? configuration?.HardwareAccelerationType.ToString() ?? "software" : Options.Encoder;
            if (hardware is not ("nvenc" or "qsv") || !_mediaEncoder.SupportsEncoder(hardware == "qsv" ? "h264_qsv" : "h264_nvenc")) hardware = "software";
            var device = configuration?.QsvDevice;
            if (device is null || !device.StartsWith("/dev/dri/renderD", StringComparison.Ordinal)) device = configuration?.VaapiDevice;
            if (device is null || !device.StartsWith("/dev/dri/renderD", StringComparison.Ordinal)) device = "/dev/dri/renderD128";
            if (hardware == "qsv" && !OperatingSystem.IsLinux()) hardware = "software";
            _logger.LogDebug("Preview pipeline: encoding scene");
            var used = await Encoder.Encode(source, work, scene, probe, Options, hardware, cancellation, device).ConfigureAwait(false);
            _logger.LogDebug("Preview encoder used {Encoder}", used);
            _logger.LogDebug("Preview pipeline: publishing outputs");
            Store.Publish(scene, work, key, reservation);
        }
        finally { if (Directory.Exists(work)) Directory.Delete(work, true); }
    }
}
