using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Jellyfin.Data;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SharedCatalog;

public sealed partial class CatalogController
{
    [HttpGet("Folders")]
    public Task<IActionResult> ListFolders(CancellationToken ct) =>
        Folders(async store => new JsonResult(await store.List(ct), Json));

    [HttpGet("Folders/{folderId:guid}")]
    public Task<IActionResult> GetFolder(Guid folderId, CancellationToken ct) =>
        Folders(async store => new JsonResult(await store.Get(folderId, ct), Json));

    [HttpGet("Folders/ShareTargets")]
    public IActionResult FolderShareTargets()
    {
        Response.Headers.CacheControl = "no-store";
        if (CurrentUser() is not { } actor) return Forbid();
        var targets = users.GetUsers().Where(user => IsShareTarget(user, actor.Id))
            .OrderBy(user => user.Username, StringComparer.OrdinalIgnoreCase)
            .Select(user => new { userId = user.Id, name = user.Username }).ToArray();
        return new JsonResult(targets, Json);
    }

    [HttpPost("Folders")]
    [RequestSizeLimit(4096)]
    public Task<IActionResult> CreateFolder(FolderName input, CancellationToken ct) =>
        Folders(async store =>
        {
            var folder = await store.Create(input.Name, ct);
            Response.Headers.Location = Url.Action(nameof(GetFolder), new { folderId = folder.Id });
            return new JsonResult(folder, Json) { StatusCode = 201 };
        });

    [HttpPatch("Folders/{folderId:guid}")]
    [RequestSizeLimit(4096)]
    public Task<IActionResult> RenameFolder(Guid folderId, FolderName input, CancellationToken ct) =>
        ChangeFolder(store => store.Rename(folderId, input.Name, ct));

    [HttpDelete("Folders/{folderId:guid}")]
    public Task<IActionResult> DeleteFolder(Guid folderId, CancellationToken ct) =>
        ChangeFolder(store => store.Delete(folderId, ct));

    [HttpPut("Folders/{folderId:guid}/Items/{itemId:guid}")]
    public Task<IActionResult> AddFolderItem(Guid folderId, Guid itemId, CancellationToken ct) =>
        ChangeFolder(store => store.Add(folderId, itemId, ct));

    [HttpDelete("Folders/{folderId:guid}/Items/{itemId:guid}")]
    public Task<IActionResult> RemoveFolderItem(Guid folderId, Guid itemId, CancellationToken ct) =>
        ChangeFolder(store => store.Remove(folderId, itemId, ct));

    [HttpPut("Folders/{folderId:guid}/Order")]
    [RequestSizeLimit(24576)]
    public Task<IActionResult> OrderFolder(Guid folderId, FolderOrder input, CancellationToken ct) =>
        ChangeFolder(store => store.Reorder(folderId, input.ItemIds, ct));

    [HttpPut("Folders/{folderId:guid}/Shares")]
    [RequestSizeLimit(8192)]
    public Task<IActionResult> ShareFolder(Guid folderId, FolderShares input, CancellationToken ct) =>
        ChangeFolder(store => store.Share(folderId, input.Shares?.Select(share => share is null
            ? null : new FolderShare(share.UserId, share.CanEdit)).ToArray(), ct));

    private Task<IActionResult> ChangeFolder(Func<FolderCatalog, Task> action) =>
        Folders(async store =>
        {
            await action(store);
            return NoContent();
        });

    private async Task<IActionResult> Folders(Func<FolderCatalog, Task<IActionResult>> action)
    {
        Response.Headers.CacheControl = "no-store";
        if (CurrentUser() is not { } actor) return Forbid();
        if (Plugin.Instance is not { } plugin) return StatusCode(503);
        var store = new FolderCatalog(Path.Combine(plugin.DataFolderPath, "folders.json"), actor.Id,
            itemId => ResolveFolderItem(itemId, actor.Id),
            userId => users.GetUserById(userId) is { } recipient && IsShareTarget(recipient, actor.Id));
        try
        {
            return await action(store);
        }
        catch (FolderProblem problem)
        {
            return StatusCode(problem.Status, new { code = problem.Message });
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
        {
            return StatusCode(503, new { code = "foldersUnavailable" });
        }
    }

    private FolderItem? ResolveFolderItem(Guid id, Guid actor)
    {
        var item = library.GetItemById<BaseItem>(id, actor);
        if (item is not (Movie or Series)) return null;
        return new(item.Id, item is Movie ? "movie" : "tv", TryProvider(item, "Tmdb", out var tmdb) ? tmdb : null);
    }

    private static bool IsShareTarget(User user, Guid actor) =>
        user.Id != actor && !user.HasPermission(PermissionKind.IsDisabled) && !user.HasPermission(PermissionKind.IsHidden);

    public sealed record FolderName([Required, StringLength(FolderCatalog.MaxNameLength)] string Name);
    public sealed record FolderOrder([Required, MaxLength(FolderCatalog.MaxItems)] Guid[] ItemIds);
    public sealed record FolderShares([Required, MaxLength(FolderCatalog.MaxShares)] ShareInput?[] Shares);
    public sealed record ShareInput(Guid UserId, bool CanEdit);
}
