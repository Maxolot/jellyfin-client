using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SharedCatalog;

public sealed partial class CatalogController
{
    private static readonly SemaphoreSlim TonightGate = new(1);

    [HttpGet("Tonight")]
    public Task<IActionResult> TonightOptions(CancellationToken ct) =>
        TonightState(async (state, user) =>
        {
            var settings = state.GetValueOrDefault(user.Id) ?? new TonightPreferences(false, []);
            var targets = users.GetUsers().Where(candidate => IsShareTarget(candidate, user.Id)
                && state.GetValueOrDefault(candidate.Id)?.AllowTogether == true)
                .Select(candidate => new { id = candidate.Id, name = candidate.Username })
                .OrderBy(candidate => candidate.name, StringComparer.OrdinalIgnoreCase).ToArray();
            return (false, await Folders(async store => new JsonResult(new
            {
                allowTogether = settings.AllowTogether,
                hidden = settings.Hidden.Where(part => part.Value > DateTimeOffset.UtcNow).Select(part => part.Key).ToArray(),
                partners = targets,
                filed = await store.Filed(ct)
            }, Json), ct, true));
        }, ct);

    [HttpGet("Tonight/Series")]
    public IActionResult TonightSeries(CancellationToken ct)
    {
        if (CurrentUser() is not { } user) return Forbid();
        Response.Headers.CacheControl = "no-store";
        var episodes = library.GetItemList(new InternalItemsQuery(user)
        {
            Recursive = true, IsVirtualItem = false, IncludeItemTypes = [BaseItemKind.Episode]
        });
        var results = new List<object>();
        var started = StartedSeries(user).ToHashSet();
        foreach (var series in episodes.OfType<Episode>().Where(episode => episode.SeriesId != Guid.Empty)
            .GroupBy(episode => episode.SeriesId))
        {
            ct.ThrowIfCancellationRequested();
            var minutes = series.Select(episode => episode.RunTimeTicks ?? 0).Where(value => value > 0).Order().ToArray();
            results.Add(new { itemId = series.Key.ToString("N"), episodes = series.Count(),
                episodeMinutes = minutes.Length == 0 ? (int?)null : (int)Math.Ceiling(minutes[minutes.Length / 2] / 6e8),
                started = started.Contains(series.Key) });
        }
        return new JsonResult(results, Json);
    }

    [HttpPut("Tonight/Privacy")]
    [RequestSizeLimit(4096)]
    public Task<IActionResult> TonightPrivacy(TonightConsent input, CancellationToken ct) =>
        TonightState((state, user) =>
        {
            var previous = state.GetValueOrDefault(user.Id) ?? new TonightPreferences(false, []);
            state[user.Id] = previous with { AllowTogether = input.AllowTogether };
            return Task.FromResult<(bool, IActionResult)>((true, NoContent()));
        }, ct);

    [HttpPut("Tonight/Hide")]
    [RequestSizeLimit(4096)]
    public Task<IActionResult> TonightHide(TonightHideInput input, CancellationToken ct) =>
        TonightState((state, user) =>
        {
            var now = DateTimeOffset.UtcNow;
            var previous = state.GetValueOrDefault(user.Id) ?? new TonightPreferences(false, []);
            var hidden = previous.Hidden.Where(part => part.Value > now).OrderByDescending(part => part.Value)
                .Take(499).ToDictionary(part => part.Key, part => part.Value);
            var key = Guid.TryParse(input.Key, out var itemId) ? itemId.ToString("N") : input.Key;
            hidden[key] = now.AddDays(30);
            state[user.Id] = previous with { Hidden = hidden };
            return Task.FromResult<(bool, IActionResult)>((true, NoContent()));
        }, ct);

    [HttpPut("Tonight/Later/{itemId:guid}")]
    public Task<IActionResult> TonightLater(Guid itemId, CancellationToken ct) =>
        Folders(async store => new JsonResult(new { folderId = await store.SaveForLater(itemId, ct) }, Json));

    [HttpPut("Tonight/Later/{type}/{tmdbId:int}")]
    public Task<IActionResult> TonightLaterFollowed(string type, int tmdbId, CancellationToken ct) =>
        Folders(async store => new JsonResult(new { folderId = await store.SaveForLater(new FollowedTitle(type, tmdbId), ct) }, Json), ct, true);

    [HttpGet("Tonight/Together")]
    public Task<IActionResult> TonightTogether([FromQuery] Guid partner, [FromServices] IUserDataManager data, CancellationToken ct) =>
        TonightState((state, actor) =>
        {
            var other = users.GetUserById(partner);
            if (other is null || !IsShareTarget(other, actor.Id) || state.GetValueOrDefault(partner)?.AllowTogether != true)
                return Task.FromResult<(bool, IActionResult)>((false, NotFound()));
            return Task.FromResult<(bool, IActionResult)>((false, new JsonResult(new { results = Together(actor, other, data, ct) }, Json)));
        }, ct);

    private TogetherSuggestion[] Together(User actor, User other, IUserDataManager data, CancellationToken ct)
    {
        var first = library.GetItemList(TonightTitles(actor));
        var second = library.GetItemList(TonightTitles(other));
        var allowed = second.Select(item => item.Id).ToHashSet();
        var common = first.Where(item => allowed.Contains(item.Id)).ToArray();
        var firstData = data.GetUserDataBatch(first, actor);
        var secondData = data.GetUserDataBatch(second, other);
        var started = StartedSeries(actor).Concat(StartedSeries(other)).ToHashSet();
        var likesA = TonightAffinity.Taste(first.Select(item => Signals(item, firstData.GetValueOrDefault(item.Id))));
        var likesB = TonightAffinity.Taste(second.Select(item => Signals(item, secondData.GetValueOrDefault(item.Id))));

        var ranked = new List<(TogetherSuggestion Suggestion, double Score)>();
        foreach (var item in common)
        {
            ct.ThrowIfCancellationRequested();
            var firstState = firstData.GetValueOrDefault(item.Id);
            var secondState = secondData.GetValueOrDefault(item.Id);
            if (Seen(firstState) || Seen(secondState) || started.Contains(item.Id)) continue;
            var a = TonightAffinity.Preference(item.Genres, likesA);
            var b = TonightAffinity.Preference(item.Genres, likesB);
            var score = TonightAffinity.Together(a, b, firstState?.Rating, secondState?.Rating);
            var reason = a > 0 && b > 0 ? "Pour vous deux : des genres qui vous plaisent" : "Pour vous deux : une découverte commune";
            ranked.Add((new(item.Id.ToString("N"), reason), score));
        }
        return ranked.OrderByDescending(part => part.Score).ThenBy(part => part.Suggestion.ItemId)
            .Take(800).Select(part => part.Suggestion).ToArray();
    }

    private IEnumerable<Guid> StartedSeries(User user)
    {
        InternalItemsQuery Query(bool played) => new(user)
        {
            Recursive = true, IsVirtualItem = false, IncludeItemTypes = [BaseItemKind.Episode],
            IsPlayed = played ? true : null, IsResumable = played ? null : true
        };
        return library.GetItemList(Query(true)).Concat(library.GetItemList(Query(false)))
            .OfType<Episode>().Select(episode => episode.SeriesId).Where(id => id != Guid.Empty);
    }

    private static InternalItemsQuery TonightTitles(User user) => new(user)
    {
        Recursive = true, IsVirtualItem = false, IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Series]
    };

    private static bool Seen(UserItemData? data) =>
        data is not null && (data.Played || data.PlaybackPositionTicks > 0);

    private static TonightSignal Signals(BaseItem item, UserItemData? data) =>
        new(item.Genres, data?.Rating, data?.IsFavorite == true, data?.Played == true);

    private async Task<IActionResult> TonightState(Func<Dictionary<Guid, TonightPreferences>, User, Task<(bool Changed, IActionResult Result)>> operation, CancellationToken ct)
    {
        if (CurrentUser() is not { } user) return Forbid();
        if (Plugin.Instance is not { } plugin) return StatusCode(503);
        Response.Headers.CacheControl = "no-store";
        var file = Path.Combine(plugin.DataFolderPath, "tonight.json");
        await TonightGate.WaitAsync(ct);
        try
        {
            var state = System.IO.File.Exists(file)
                ? JsonSerializer.Deserialize<Dictionary<Guid, TonightPreferences>>(await System.IO.File.ReadAllTextAsync(file, ct), Json)
                    ?? throw new JsonException("Missing Tonight state")
                : [];
            var (changed, result) = await operation(state, user);
            if (changed) await SaveTonight(file, state, ct);
            return result;
        }
        catch (Exception error) when (error is JsonException or IOException or UnauthorizedAccessException)
        {
            return StatusCode(503);
        }
        finally
        {
            TonightGate.Release();
        }
    }

    private static async Task SaveTonight(string file, Dictionary<Guid, TonightPreferences> state, CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        var temporary = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
        var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Options = FileOptions.Asynchronous };
        if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
        try
        {
            await using (var stream = new FileStream(temporary, options))
                await JsonSerializer.SerializeAsync(stream, state, Json, ct);
            ct.ThrowIfCancellationRequested();
            System.IO.File.Move(temporary, file, overwrite: true);
        }
        finally
        {
            System.IO.File.Delete(temporary);
        }
    }

    public sealed record TonightConsent(bool AllowTogether);
    public sealed record TonightHideInput([Required, RegularExpression("^(?:[a-fA-F0-9]{32}|[a-fA-F0-9-]{36}|seerr-(?:movie|tv)-[0-9]{1,10})$")] string Key);
    private sealed record TonightPreferences(bool AllowTogether, Dictionary<string, DateTimeOffset> Hidden);
    private sealed record TogetherSuggestion(string ItemId, string Reason);
}
