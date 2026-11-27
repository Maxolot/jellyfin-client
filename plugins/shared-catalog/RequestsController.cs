using Jellyfin.Data;
using Jellyfin.Database.Implementations.Enums;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SharedCatalog;

public sealed partial class CatalogController
{
    [HttpGet("Requests")]
    public async Task<IActionResult> Requests([FromServices] RequestRuntime runtime, CancellationToken ct)
    {
        if (CurrentUser() is not { } user) return Forbid();
        Response.Headers.CacheControl = "no-store";
        var items = await runtime.Read(user.Id, user.HasPermission(PermissionKind.IsAdministrator), ct);
        return items is null ? NotFound() : new JsonResult(items, Json);
    }

    [HttpGet("Requests/{id:int:min(1)}")]
    public async Task<IActionResult> RequestDetail(int id, [FromServices] RequestRuntime runtime, CancellationToken ct)
    {
        if (CurrentUser() is not { } user) return Forbid();
        Response.Headers.CacheControl = "no-store";
        var items = await runtime.Read(user.Id, user.HasPermission(PermissionKind.IsAdministrator), ct);
        var item = items?.FirstOrDefault(candidate => candidate.Id == id);
        return item is null ? NotFound() : new JsonResult(item, Json);
    }
}
