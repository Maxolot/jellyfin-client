using System.Text.Json;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Collections;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SharedCatalog;

public sealed partial class CatalogController
{
    private const int MaxSavedCollections = 1000;
    private static readonly SemaphoreSlim CollectionsGate = new(1);

    [HttpGet("Collections/{id:guid}/Followed")]
    public Task<IActionResult> CollectionFollowed(Guid id, CancellationToken ct, [FromQuery] int? limit = null) =>
        CollectionMemberships(id, false, async (actor, titles) =>
        {
            if (titles.Count == 0) return (false, new JsonResult(new { items = Array.Empty<FolderItem>(), total = 0 }, Json));
            var followed = await ReadFollowed(Plugin.Instance!.DataFolderPath, ct);
            var matches = FindFollowedLocal(actor, titles);
            var items = titles.Where(key => followed.Contains(key) || matches.ContainsKey(key))
                .Select(key => (key, item: new FolderItem(matches.TryGetValue(key, out var match) ? match : null,
                    key.Type, key.TmdbId, Followed: true))).ToArray();
            var existing = matches.Count == 0 ? [] : NativeCollectionProviders(id, actor);
            var additions = items.Where(entry => !existing.Contains(entry.key)).Select(entry => entry.item).ToArray();
            var result = limit.HasValue ? additions.Take(Math.Clamp(limit.Value, 1, 4)) : items.Select(entry => entry.item);
            return (false, new JsonResult(new { items = result, total = additions.Length }, Json));
        }, ct);

    [HttpPut("Collections/{id:guid}/Followed/{type}/{tmdbId:int}")]
    public Task<IActionResult> AddFollowedCollection(Guid id, string type, int tmdbId, CancellationToken ct) =>
        CollectionMemberships(id, true, async (_, titles) =>
        {
            var key = new FollowedTitle(type, tmdbId);
            if (!key.Valid || !(await ReadFollowed(Plugin.Instance!.DataFolderPath, ct)).Contains(key))
                return (false, NotFound());
            if (titles.Contains(key)) return (false, NoContent());
            if (titles.Count >= FolderCatalog.MaxItems) return (false, Conflict(new { code = "itemLimit" }));
            titles.Add(key);
            return (true, NoContent());
        }, ct);

    [HttpDelete("Collections/{id:guid}/Followed/{type}/{tmdbId:int}")]
    public Task<IActionResult> RemoveFollowedCollection(Guid id, string type, int tmdbId, CancellationToken ct) =>
        CollectionMemberships(id, true, (_, titles) =>
        {
            var changed = titles.Remove(new FollowedTitle(type, tmdbId));
            return Task.FromResult<(bool, IActionResult)>((changed, changed ? NoContent() : NotFound()));
        }, ct);

    [HttpPost("Collections/{id:guid}/Followed/Promote")]
    public Task<IActionResult> PromoteFollowedCollection(Guid id, [FromServices] ICollectionManager collections, CancellationToken ct) =>
        CollectionMemberships(id, true, async (actor, titles) =>
        {
            if (titles.Count == 0) return (false, NoContent());
            var matches = FindFollowedLocal(actor, titles);
            if (matches.Count == 0) return (false, NoContent());
            var existing = NativeCollectionProviders(id, actor);
            var additions = matches.Where(pair => !existing.Contains(pair.Key)).Select(pair => pair.Value).Distinct().ToArray();
            if (additions.Length != 0) await collections.AddToCollectionAsync(id, additions);
            titles.RemoveAll(matches.ContainsKey);
            return (true, NoContent());
        }, ct);

    private HashSet<FollowedTitle> NativeCollectionProviders(Guid id, User actor) =>
        library.GetItemList(new InternalItemsQuery(actor) { ParentId = id, IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Series] })
            .Select(FollowedTitle.FromItem).OfType<FollowedTitle>().ToHashSet();

    private async Task<IActionResult> CollectionMemberships(Guid id, bool editing, Func<User, List<FollowedTitle>, Task<(bool Changed, IActionResult Result)>> operation,
        CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        if (CurrentUser() is not { } actor) return Forbid();
        if (editing && !actor.HasPermission(PermissionKind.IsAdministrator) && !actor.HasPermission(PermissionKind.EnableCollectionManagement))
            return Forbid();
        if (library.GetItemById<BoxSet>(id, actor.Id) is null) return NotFound();
        if (Plugin.Instance is not { } plugin) return StatusCode(503);
        var path = Path.Combine(plugin.DataFolderPath, "collection-followed.json");
        await CollectionsGate.WaitAsync(ct);
        try
        {
            var all = await LoadCollectionMemberships(path, ct);
            var entries = all.GetValueOrDefault(id) ?? [];
            var (changed, result) = await operation(actor, entries);
            if (!changed) return result;
            if (entries.Count == 0) all.Remove(id);
            else
            {
                if (!all.ContainsKey(id) && all.Count >= MaxSavedCollections) return Conflict(new { code = "collectionLimit" });
                all[id] = entries;
            }
            await SaveCollectionMemberships(path, all, ct);
            return result;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
        {
            return StatusCode(503, new { code = "collectionMembershipsUnavailable" });
        }
        finally
        {
            CollectionsGate.Release();
        }
    }

    private static async Task<Dictionary<Guid, List<FollowedTitle>>> LoadCollectionMemberships(string path, CancellationToken ct)
    {
        try
        {
            await using var stream = System.IO.File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<Dictionary<Guid, List<FollowedTitle>>>(stream, Json, ct)
                ?? throw new JsonException("Missing collection memberships.");
        }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException)
        {
            return [];
        }
    }

    private static async Task SaveCollectionMemberships(string path, Dictionary<Guid, List<FollowedTitle>> members, CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous))
                await JsonSerializer.SerializeAsync(stream, members, Json, ct);
            ct.ThrowIfCancellationRequested();
            System.IO.File.Move(temporary, path, overwrite: true);
        }
        finally
        {
            System.IO.File.Delete(temporary);
        }
    }
}
