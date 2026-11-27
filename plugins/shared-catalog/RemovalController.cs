using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Jellyfin.Data;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SharedCatalog;

public sealed partial class CatalogController
{
    private static readonly SemaphoreSlim RemovalGate = new(1);

    [HttpGet("Storage/Capabilities")]
    public async Task<IActionResult> RemovalCapabilities(CancellationToken ct)
    {
        if (!IsAdministrator()) return Forbid();
        Response.Headers.CacheControl = "no-store";
        var settings = await ReadRemovalSettings(ct);
        return new JsonResult(new { radarr = IsConfigured(settings?.Radarr), sonarr = IsConfigured(settings?.Sonarr) }, Json);
    }

    [HttpGet("Storage/{itemId:guid}")]
    public Task<IActionResult> PreviewRemoval(Guid itemId, [FromQuery] int? season, CancellationToken ct) =>
        StorageAction(itemId, season, null, ct);

    [HttpPost("Storage/{itemId:guid}")]
    [RequestSizeLimit(4096)]
    public Task<IActionResult> RemoveFiles(Guid itemId, RemovalConfirmation input, CancellationToken ct) =>
        StorageAction(itemId, input.Season, input, ct);

    public sealed record RemovalConfirmation(
        [Required, RegularExpression("^[0-9A-F]{64}$")] string Revision, int? Season, ArtworkInput? Artwork = null);

    private bool IsAdministrator() => CurrentUser()?.HasPermission(PermissionKind.IsAdministrator) == true;

    private async Task<IActionResult> StorageAction(Guid itemId, int? season, RemovalConfirmation? confirmation, CancellationToken ct)
    {
        if (CurrentUser() is not { } user || !user.HasPermission(PermissionKind.IsAdministrator)) return Forbid();
        Response.Headers.CacheControl = "no-store";
        if (library.GetItemById<BaseItem>(itemId, user.Id) is not { } item || item is not (Movie or Series)) return NotFound();
        var series = item is Series;
        if ((!series && season is not null) || season is < 0 or > 9999) return BadRequest();

        try
        {
            if (!TryProvider(item, "Tmdb", out var tmdb)) throw new RemovalConflict("unmanaged");
            var providerId = tmdb;
            if (series && !TryProvider(item, "Tvdb", out providerId)) throw new RemovalConflict("unmanaged");
            var settings = await ReadRemovalSettings(ct);
            var connection = series ? settings?.Sonarr : settings?.Radarr;
            if (!IsConfigured(connection)) return StatusCode(503, new { code = "notConfigured" });
            var arr = new ArrRemoval(connection!, series, providerId, season);
            if (confirmation is null)
            {
                CheckPlayback(item);
                return new JsonResult(await arr.Preview(ct), Json);
            }

            if (!await RemovalGate.WaitAsync(0, ct)) throw new RemovalConflict("busy");
            try
            {
                // Finish an accepted operation even if the browser disconnects. Keep an upper time limit.
                using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
                await arr.Remove(confirmation.Revision, () => KeepEntry(item, series ? "tv" : "movie", tmdb, confirmation.Artwork, deadline.Token),
                    () => CheckPlayback(item), deadline.Token);
                library.QueueLibraryScan();
                return NoContent();
            }
            finally
            {
                RemovalGate.Release();
            }
        }
        catch (RemovalConflict ex)
        {
            return Conflict(new { code = ex.Message });
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or IOException or InvalidOperationException or OperationCanceledException)
        {
            return StatusCode(503, new { code = confirmation is null ? "arrUnavailable" : "checkPartial" });
        }
    }

    private void CheckPlayback(BaseItem item)
    {
        if (sessions.Sessions.Any(session => session.NowPlayingItem is { } playing
            && (playing.Id == item.Id || playing.SeriesId == item.Id)))
            throw new RemovalConflict("playing");
    }

    private async Task KeepEntry(BaseItem item, string type, int id, ArtworkInput? artwork, CancellationToken ct)
    {
        var result = await Access(items =>
        {
            var index = items.FindIndex(entry => entry.Type == type && entry.Id == id);
            if (index >= 0) return (FillArtwork(items, index, artwork), NoContent());
            if (items.Count >= 10000) throw new RemovalConflict("catalogFull");
            items.Insert(0, new(type, id, Limit(item.Name, 300) ?? $"TMDb {id}", Limit(item.Overview, 6000),
                item.ProductionYear, artwork?.PosterPath, artwork?.BackdropPath));
            return (true, NoContent());
        }, ct);
        if (result is not NoContentResult) throw new RemovalConflict("catalogUnavailable");
    }

    private static string? Limit(string? value, int max) => value?.Length > max ? value[..max] : value;

    private static bool TryProvider(BaseItem item, string type, out int id) =>
        int.TryParse(item.ProviderIds.GetValueOrDefault(type), out id) && id > 0;

    private static async Task<RemovalSettings?> ReadRemovalSettings(CancellationToken ct)
    {
        if (Plugin.Instance is not { } plugin) return null;
        var file = Path.Combine(plugin.DataFolderPath, "storage.json");
        if (!System.IO.File.Exists(file)) return null;
        await using var stream = System.IO.File.OpenRead(file);
        return await JsonSerializer.DeserializeAsync<RemovalSettings>(stream, Json, ct);
    }

    private static bool IsConfigured(ArrConnection? connection) =>
        !string.IsNullOrWhiteSpace(connection?.ApiKey) && Uri.TryCreate(connection.Url, UriKind.Absolute, out var uri)
        && uri.Scheme is "http" or "https" && string.IsNullOrEmpty(uri.UserInfo)
        && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment);
}
