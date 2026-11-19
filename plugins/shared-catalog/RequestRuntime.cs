using System.Collections.Concurrent;
using System.Text.Json;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SharedCatalog;

public sealed class RequestRuntime(ILibraryManager library, NotificationStore notifications, ILogger<RequestRuntime> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan SlowInterval = TimeSpan.FromMinutes(1);
    private static readonly RequestArr NoArr = new([], [], null, false);
    private static readonly HttpClient Http = new(new SocketsHttpHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(5)
    };

    private readonly RequestSources _sources = new(Http);
    private readonly SemaphoreSlim _gate = new(1);
    private readonly ConcurrentDictionary<(string Type, int Tmdb), RequestTitle> _titles = new();
    private readonly Dictionary<(string Type, int Tmdb), Guid> _libraryIds = [];
    private readonly TimeProvider _clock = TimeProvider.System;
    private volatile Tracked[] _items = [];
    private DateTimeOffset _lastAttempt = DateTimeOffset.MinValue;
    private volatile bool _enabled;
    private volatile bool _stale;
    private int _changes = 1;
    private int _indexed;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        library.ItemAdded += OnItemChange;
        library.ItemRemoved += OnItemChange;
        try
        {
            await Refresh(stoppingToken);
            using var timer = new PeriodicTimer(Interval);
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                if (_items.Any(item => item.Result.Active) || _items.Length > 0 && _indexed != Volatile.Read(ref _changes))
                    await Refresh(stoppingToken);
            }
        }
        finally
        {
            library.ItemAdded -= OnItemChange;
            library.ItemRemoved -= OnItemChange;
        }
    }

    private void OnItemChange(object? sender, ItemChangeEventArgs args)
    {
        if (args.Item is Episode or Series or MediaBrowser.Controller.Entities.Movies.Movie)
            Interlocked.Increment(ref _changes);
    }

    internal async Task<bool> IsEnabled(CancellationToken ct)
    {
        await Refresh(ct);
        return _enabled;
    }

    internal async Task<RequestSnapshot[]?> Read(Guid userId, bool admin, CancellationToken ct)
    {
        await Refresh(ct);
        if (!_enabled) return null;
        return _items.Where(item => admin || item.Source.Owner == userId).Select(item =>
        {
            var result = item.Result;
            if (result.ItemId is { } id && library.GetItemById<BaseItem>(id, userId) is null) result = result with { ItemId = null };
            if (_stale && result.Active) result = result with { EtaFrom = null, EtaTo = null, BytesPerSecond = null };
            return result;
        }).ToArray();
    }

    private async Task Refresh(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var now = _clock.GetUtcNow();
            var wait = _items.Any(item => Urgent(item, now)) ? Interval : SlowInterval;
            if (now - _lastAttempt >= wait)
            {
                _lastAttempt = now;
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
                deadline.CancelAfter(TimeSpan.FromSeconds(18));
                await RefreshSources(now, deadline.Token);
                return;
            }
            if (Volatile.Read(ref _changes) != _indexed && _items.Length > 0)
            {
                RefreshLibrary();
                _items = _items.Select(item => Recheck(item, now)).ToArray();
                await CaptureNotifications(ct);
            }
        }
        catch (Exception exception) when (Recoverable(exception, ct))
        {
            _stale = true;
            // Upstream failures can include private service URLs or payloads. Log the category only.
            logger.LogWarning("Shared Catalog request refresh failed ({ErrorType}).", exception.GetType().Name);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task RefreshSources(DateTimeOffset now, CancellationToken ct)
    {
        var connections = await RequestSources.Settings(ct);
        _enabled = connections is not null;
        if (connections is null)
        {
            _items = [];
            _titles.Clear();
            return;
        }

        var settings = connections.Settings;
        var requests = await _sources.List(settings.Seerr, ct);
        if (requests.Length != 0) RefreshLibrary();
        var active = requests.Where(request => request.Status == 2 && request.MediaStatus != 5).ToArray();
        var radarr = connections.Arr?.Radarr;
        var sonarr = connections.Arr?.Sonarr;
        var movies = active.Any(request => request.Type == "movie")
            ? TryRead(() => _sources.Queue(radarr, false, ct), ct) : Task.FromResult<JsonElement[]?>(null);
        var series = active.Any(request => request.Type == "tv")
            ? TryRead(() => _sources.Queue(sonarr, true, ct), ct) : Task.FromResult<JsonElement[]?>(null);
        var vpn = active.Length > 0 ? TryRead(() => _sources.Vpn(settings.VpnHealthUrl, ct), ct) : Task.FromResult<bool?>(null);
        await Task.WhenAll(movies, series, vpn);
        var previous = _items.ToDictionary(item => item.Source.Id);
        var results = new Tracked[requests.Length];
        await Parallel.ForEachAsync(Enumerable.Range(0, requests.Length),
            new ParallelOptions { MaxDegreeOfParallelism = 6, CancellationToken = ct }, async (index, token) =>
            {
                var request = requests[index];
                var show = request.Type == "tv";
                var title = await Title(request, settings.Seerr, token);
                var data = request.Status == 2 && request.MediaStatus != 5
                    ? await TryRead(() => _sources.Observe(request, show ? sonarr : radarr, show ? series.Result : movies.Result, token), token)
                    : null;
                var old = previous.GetValueOrDefault(request.Id);
                var observation = data ?? NoArr;
                if (observation.Episodes.Length == 0 && old is { Observation.Episodes.Length: > 0 })
                    observation = observation with { Episodes = old.Observation.Episodes };
                if (!observation.Known && request.Transfers is { Length: > 0 })
                    observation = observation with { Queue = request.Transfers };
                results[index] = Recheck(new(request, title, observation, vpn.Result, old?.Measurement, null!), now);
            });
        _items = results;
        _stale = false;
        await CaptureNotifications(ct);
    }

    // Downloads, imports and requests made in the last six hours are refreshed every ten seconds;
    // long-waiting searches only every minute, to keep Radarr and Sonarr quiet.
    private static bool Urgent(Tracked item, DateTimeOffset now) => item.Result.Active
        && (item.Result.Stage is "approved" or "downloading" or "import" or "library" || now - item.Source.Updated < TimeSpan.FromHours(6));

    private Task CaptureNotifications(CancellationToken ct) =>
        notifications.Capture(_items.Select(item => (item.Source.Owner, item.Result)), ct);

    private async Task<RequestTitle> Title(SeerrRequest request, RequestServiceConnection connection, CancellationToken ct)
    {
        var key = (request.Type, request.Tmdb);
        if (_titles.TryGetValue(key, out var cached)) return cached;
        var title = await TryRead(() => _sources.Title(request, connection, ct), ct);
        if (title is not null) _titles.TryAdd(key, title);
        return title ?? new($"TMDb {request.Tmdb}", null);
    }

    private Tracked Recheck(Tracked entry, DateTimeOffset now)
    {
        var local = Find(entry.Source);
        var title = entry.Title with { Name = entry.Title.Name.StartsWith("TMDb ", StringComparison.Ordinal) ? local.Title ?? entry.Title.Name : entry.Title.Name };
        var (snapshot, measurement) = RequestProgress.Calculate(entry.Source, title, local, entry.Observation, entry.Vpn, entry.Measurement, now);
        return entry with { Result = snapshot, Measurement = measurement };
    }

    private void RefreshLibrary()
    {
        var revision = Volatile.Read(ref _changes);
        if (_indexed == revision) return;
        var items = library.GetItemList(new InternalItemsQuery
        {
            IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Series],
            IsVirtualItem = false,
            Recursive = true
        });
        _libraryIds.Clear();
        foreach (var item in items)
        {
            if (int.TryParse(item.ProviderIds.GetValueOrDefault("Tmdb"), out var id) && id > 0)
                _libraryIds.TryAdd((item is Series ? "tv" : "movie", id), item.Id);
        }
        _indexed = revision;
    }

    private RequestLibrary Find(SeerrRequest request)
    {
        if (!_libraryIds.TryGetValue((request.Type, request.Tmdb), out var id) || library.GetItemById(id) is not { } item)
            return new(null, null, []);
        if (request.Type == "movie") return new(id, item.Name, []);
        var episodes = library.GetItemList(new InternalItemsQuery
        {
            AncestorIds = [id],
            IncludeItemTypes = [BaseItemKind.Episode],
            IsVirtualItem = false,
            Recursive = true
        }).OfType<Episode>().Where(episode => episode.ParentIndexNumber > 0 && episode.IndexNumber > 0)
            .Select(episode => new RequestEpisode(episode.ParentIndexNumber!.Value, episode.IndexNumber!.Value)).Distinct().ToArray();
        return new(id, item.Name, episodes);
    }

    private static async Task<T?> TryRead<T>(Func<Task<T>> read, CancellationToken ct)
    {
        try { return await read(); }
        catch (Exception exception) when (Recoverable(exception, ct)) { return default; }
    }

    private static bool Recoverable(Exception exception, CancellationToken ct) =>
        exception is HttpRequestException or IOException or JsonException or InvalidOperationException
        || exception is OperationCanceledException && !ct.IsCancellationRequested;

    private sealed record Tracked(SeerrRequest Source, RequestTitle Title, RequestArr Observation, bool? Vpn,
        RequestMeasurement? Measurement, RequestSnapshot Result);
}
