using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SharedCatalog;

internal sealed record RequestNotification(Guid Id, int RequestId, string Type, int Tmdb, string Title,
    string Event, DateTimeOffset Created, DateTimeOffset? ReadAt, DateTimeOffset? EtaFrom, DateTimeOffset? EtaTo, string? Reason, int? Season, int? Episodes);
internal sealed record NotificationCheckpoint(Guid? UserId, string Stage, string? Reason,
    Dictionary<int, int[]> Seasons, DateTimeOffset Seen);
internal sealed record NotificationState(Dictionary<int, NotificationCheckpoint> Requests, Dictionary<Guid, List<RequestNotification>> Users);

public sealed class NotificationStore(ILogger<NotificationStore> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan Retention = TimeSpan.FromDays(30);
    private readonly SemaphoreSlim _gate = new(1);
    private readonly TimeProvider _clock = TimeProvider.System;
    private readonly Channel<RequestNotification> _admin = Channel.CreateBounded<RequestNotification>(
        new BoundedChannelOptions(40) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var alert in _admin.Reader.ReadAllAsync(stoppingToken))
        {
            if (Plugin.Instance is { } plugin)
                await NtfyAdminAlerts.Send(plugin.DataFolderPath, [alert], logger, stoppingToken);
        }
    }

    internal Task<RequestNotification[]> Read(Guid user, CancellationToken ct) =>
        Access((state, _) => (false, (state.Users.GetValueOrDefault(user) ?? []).OrderByDescending(row => row.Created).ToArray()), ct);

    internal Task<int> Mark(Guid user, Guid[]? ids, CancellationToken ct) =>
        Access((state, now) =>
        {
            if (!state.Users.TryGetValue(user, out var entries)) return (false, 0);
            var selected = ids?.ToHashSet();
            var changes = 0;
            for (var i = 0; i < entries.Count; i++)
            {
                var row = entries[i];
                if (row.ReadAt is not null || selected is not null && !selected.Contains(row.Id)) continue;
                entries[i] = row with { ReadAt = now };
                changes++;
            }
            return (changes > 0, changes);
        }, ct);

    internal async Task Capture(IEnumerable<(Guid? Owner, RequestSnapshot Request)> requests, CancellationToken ct)
    {
        try
        {
            var alerts = await Access((state, now) =>
            {
                var admin = new List<RequestNotification>();
                var changed = false;
                foreach (var (owner, request) in requests)
                {
                    var previous = state.Requests.GetValueOrDefault(request.Id);
                    if (previous?.UserId != owner) previous = null;
                    var next = Entry(owner, request, previous, now);
                    if (next != previous)
                    {
                        state.Requests[request.Id] = next;
                        changed = true;
                    }
                    if (owner is { } recipient) changed |= UpdateEta(state, recipient, request);
                    foreach (var row in Events(request, previous, now))
                    {
                        if (owner is { } user) Add(state, user, row);
                        if (row.Event == "blocked") admin.Add(row);
                    }
                }
                return (changed, admin);
            }, ct);
            foreach (var alert in alerts) _admin.Writer.TryWrite(alert);
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            logger.LogWarning("Shared Catalog could not save notification events ({ErrorType}).", exception.GetType().Name);
        }
    }

    private static NotificationCheckpoint Entry(Guid? owner, RequestSnapshot request, NotificationCheckpoint? previous, DateTimeOffset now)
    {
        var current = request.Seasons.ToDictionary(season => season.Number, season => season.Episodes);
        if (previous is not null && request.Stage == previous.Stage && request.Reason == previous.Reason
            && current.Count == previous.Seasons.Count && current.All(pair => previous.Seasons.TryGetValue(pair.Key, out var old) && old.SequenceEqual(pair.Value))
            && now - previous.Seen < TimeSpan.FromDays(1)) return previous;
        return new(owner, request.Stage, request.Reason, current, now);
    }

    internal static IEnumerable<RequestNotification> Events(RequestSnapshot request, NotificationCheckpoint? previous, DateTimeOffset now)
    {
        var prior = previous?.Stage;
        if (previous is null && now - request.Updated > TimeSpan.FromHours(12)) yield break;

        if ((prior is null or "requested") && request.Stage is ("approved" or "searching" or "downloading" or "import" or "library" or "available" or "blocked"))
            yield return New(request, "approved", now);
        if (prior != "declined" && request.Stage == "declined")
            yield return New(request, "declined", now);
        if (prior != "downloading" && request.Stage == "downloading" && prior is not ("import" or "library" or "available"))
            yield return New(request, "downloading", now);
        if (prior != "available" && request.Stage == "available")
            yield return New(request, "available", now);
        if ((prior != "blocked" || request.Reason != previous?.Reason) && request.Stage == "blocked")
            yield return New(request, "blocked", now);
        if (previous is null || prior != "available" && request.Stage == "available") yield break;

        foreach (var season in request.Seasons)
        {
            var earlier = previous.Seasons.GetValueOrDefault(season.Number) ?? [];
            var added = season.Episodes.Except(earlier).Count();
            if (added > 0) yield return New(request, "episodes", now) with { Season = season.Number, Episodes = added };
        }
    }

    private static RequestNotification New(RequestSnapshot request, string type, DateTimeOffset at) =>
        new(Guid.NewGuid(), request.Id, request.Type, request.Tmdb, request.Title, type, at, null,
            request.EtaFrom, request.EtaTo, request.Reason, null, null);

    private static bool UpdateEta(NotificationState state, Guid owner, RequestSnapshot request)
    {
        if (request.EtaFrom is null || request.EtaTo is null || !state.Users.TryGetValue(owner, out var entries)) return false;
        var index = entries.FindLastIndex(row => row.RequestId == request.Id && row.Event == "downloading" && row.EtaFrom is null);
        if (index < 0) return false;
        entries[index] = entries[index] with { EtaFrom = request.EtaFrom, EtaTo = request.EtaTo };
        return true;
    }

    private static void Add(NotificationState state, Guid user, RequestNotification row)
    {
        if (!state.Users.TryGetValue(user, out var entries)) state.Users[user] = entries = [];
        if (row.Event != "episodes" && entries.Any(entry => entry.RequestId == row.RequestId && entry.Event == row.Event
            && (row.Event != "blocked" || string.Equals(entry.Reason, row.Reason, StringComparison.Ordinal)))) return;
        entries.Add(row);
    }

    private async Task<T> Access<T>(Func<NotificationState, DateTimeOffset, (bool Changed, T Result)> operation, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var now = _clock.GetUtcNow();
            var plugin = Plugin.Instance ?? throw new InvalidOperationException("Shared Catalog is not available");
            var path = Path.Combine(plugin.DataFolderPath, "notifications.json");
            var state = File.Exists(path)
                ? JsonSerializer.Deserialize<NotificationState>(await File.ReadAllTextAsync(path, ct), Json) ?? throw new JsonException("Missing notification data")
                : new NotificationState([], []);
            var pruned = Purge(state, now);
            var (changed, result) = operation(state, now);
            if (pruned || changed)
            {
                Directory.CreateDirectory(plugin.DataFolderPath);
                await File.WriteAllTextAsync(path + ".tmp", JsonSerializer.Serialize(state, Json), ct);
                File.Move(path + ".tmp", path, overwrite: true);
            }
            return result;
        }
        finally
        {
            _gate.Release();
        }
    }

    private static bool Purge(NotificationState state, DateTimeOffset now)
    {
        var changed = false;
        foreach (var (user, entries) in state.Users)
        {
            changed |= entries.RemoveAll(row => now - row.Created >= Retention) > 0;
            if (entries.Count == 0) state.Users.Remove(user);
        }
        foreach (var (id, checkpoint) in state.Requests)
        {
            if (now - checkpoint.Seen >= Retention) changed |= state.Requests.Remove(id);
        }
        return changed;
    }
}
