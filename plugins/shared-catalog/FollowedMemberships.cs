using System.Globalization;
using System.Text.Json;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SharedCatalog;

internal readonly record struct FollowedTitle(string Type, int TmdbId)
{
    internal bool Valid => Type is "movie" or "tv" && TmdbId > 0;
    internal string Key => $"seerr-{Type}-{TmdbId.ToString(CultureInfo.InvariantCulture)}";

    internal static FollowedTitle? FromItem(BaseItem item) =>
        item is Movie or Series && item.ProviderIds.TryGetValue("Tmdb", out var value) && int.TryParse(value, out var tmdbId) && tmdbId > 0
            ? new(item is Movie ? "movie" : "tv", tmdbId)
            : null;
}

public sealed partial class CatalogController
{
    [HttpGet("Memberships")]
    public IActionResult FollowedCapability()
    {
        Response.Headers.CacheControl = "no-store";
        return CurrentUser() is null ? Forbid() : new JsonResult(new { followed = true }, Json);
    }

    private static async Task<HashSet<FollowedTitle>> ReadFollowed(string directory, CancellationToken ct)
    {
        try
        {
            await using var stream = new FileStream(Path.Combine(directory, "catalog.json"), FileMode.Open,
                FileAccess.Read, FileShare.Read | FileShare.Delete, 4096, FileOptions.Asynchronous);
            var entries = await JsonSerializer.DeserializeAsync<List<Entry>>(stream, Json, ct)
                ?? throw new JsonException("Missing catalog list.");
            return entries.Select(entry => new FollowedTitle(entry.Type, entry.Id)).Where(key => key.Valid).ToHashSet();
        }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException)
        {
            return [];
        }
    }

    private Dictionary<FollowedTitle, Guid> FindFollowedLocal(User actor, IReadOnlyCollection<FollowedTitle> requested)
    {
        if (requested.Count == 0) return [];
        var keys = requested.ToHashSet();
        var ids = keys.Select(key => key.TmdbId.ToString(CultureInfo.InvariantCulture)).Distinct().ToArray();
        var local = library.GetItemList(new InternalItemsQuery(actor)
        {
            Recursive = true, IsVirtualItem = false, IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Series],
            HasAnyProviderIds = new(StringComparer.OrdinalIgnoreCase) { ["Tmdb"] = ids }
        });
        var result = new Dictionary<FollowedTitle, Guid>();
        foreach (var item in local.OrderBy(item => item.Id))
        {
            if (FollowedTitle.FromItem(item) is not { } key || !keys.Contains(key)) continue;
            if (library.GetItemById<BaseItem>(item.Id, actor.Id) is null) continue;
            result.TryAdd(key, item.Id);
        }
        return result;
    }
}
