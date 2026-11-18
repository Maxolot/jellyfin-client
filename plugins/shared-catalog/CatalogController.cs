using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Jellyfin.Data;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SharedCatalog;

[Authorize]
[ApiController]
[Route("SharedCatalog")]
public sealed partial class CatalogController(IUserManager users, ILibraryManager library, MediaBrowser.Controller.Session.ISessionManager sessions) : ControllerBase
{
    private static readonly SemaphoreSlim Gate = new(1);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [HttpGet("Items")]
    public Task<IActionResult> List(CancellationToken cancellation) =>
        Access(items => (false, new JsonResult(items, Json)), cancellation);

    [HttpPut("Items/{type}/{id:int}")]
    [RequestSizeLimit(16384)]
    public Task<IActionResult> Add(string type, int id, EntryInput input, CancellationToken cancellation)
    {
        if (type is not ("movie" or "tv") || id <= 0 || string.IsNullOrWhiteSpace(input.Title))
            return Task.FromResult<IActionResult>(BadRequest());
        return Access(items =>
        {
            if (items.Any(item => item.Type == type && item.Id == id)) return (false, NoContent());
            if (items.Count >= 10000) return (false, Conflict());
            // Who followed the title and when: the client shows what the other accounts followed lately.
            items.Insert(0, new(type, id, input.Title.Trim(), input.Overview, input.Year, input.PosterPath, input.BackdropPath,
                CurrentUser()?.Id.ToString("N"), DateTimeOffset.UtcNow));
            return (true, NoContent());
        }, cancellation);
    }

    [HttpDelete("Items/{type}/{id:int}")]
    public async Task<IActionResult> Remove(string type, int id, CancellationToken cancellation)
    {
        if (CurrentUser() is not { } user || !user.HasPermission(PermissionKind.IsAdministrator))
            return Forbid();
        if (!await RemovalGate.WaitAsync(0, cancellation)) return Conflict(new { code = "busy" });
        try
        {
            return await Access(items => (items.RemoveAll(item => item.Type == type && item.Id == id) > 0, NoContent()), cancellation);
        }
        finally
        {
            RemovalGate.Release();
        }
    }

    private User? CurrentUser() =>
        Guid.TryParse(User.FindFirst("Jellyfin-UserId")?.Value, out var id) && id != Guid.Empty
            && users.GetUserById(id) is { } user && !user.HasPermission(PermissionKind.IsDisabled) ? user : null;

    private async Task<IActionResult> Access(
        Func<List<Entry>, (bool Changed, IActionResult Result)> operation, CancellationToken cancellation)
    {
        if (CurrentUser() is null) return Forbid();
        if (Plugin.Instance is not { } plugin) return StatusCode(503);
        Response.Headers.CacheControl = "no-store";
        var path = Path.Combine(plugin.DataFolderPath, "catalog.json");
        await Gate.WaitAsync(cancellation);
        try
        {
            var items = System.IO.File.Exists(path)
                ? JsonSerializer.Deserialize<List<Entry>>(await System.IO.File.ReadAllTextAsync(path, cancellation), Json)
                    ?? throw new JsonException("Missing catalog list.")
                : [];
            var (changed, result) = operation(items);
            if (changed)
            {
                Directory.CreateDirectory(plugin.DataFolderPath);
                await System.IO.File.WriteAllTextAsync(path + ".tmp", JsonSerializer.Serialize(items, Json), cancellation);
                System.IO.File.Move(path + ".tmp", path, overwrite: true);
            }
            return result;
        }
        finally
        {
            Gate.Release();
        }
    }

    public sealed record EntryInput(
        [Required, StringLength(300)] string Title,
        [StringLength(6000)] string? Overview,
        [Range(1, 9999)] int? Year,
        [RegularExpression("^/[a-zA-Z0-9._-]{1,180}$")] string? PosterPath,
        [RegularExpression("^/[a-zA-Z0-9._-]{1,180}$")] string? BackdropPath);

    // AddedBy and AddedAt are absent from entries saved before 0.3.0 and stay empty for them.
    private sealed record Entry(string Type, int Id, string Title, string? Overview, int? Year, string? PosterPath, string? BackdropPath,
        string? AddedBy = null, DateTimeOffset? AddedAt = null);
}
