using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SharedCatalog;

public sealed partial class CatalogController
{
    [HttpGet("Notifications")]
    public async Task<IActionResult> Notifications([FromServices] RequestRuntime runtime, [FromServices] NotificationStore notifications, CancellationToken ct)
    {
        if (CurrentUser() is not { } user) return Forbid();
        Response.Headers.CacheControl = "no-store";
        if (!await runtime.IsEnabled(ct)) return NotFound();
        return new JsonResult(await notifications.Read(user.Id, ct), Json);
    }

    [HttpPost("Notifications/Read")]
    [RequestSizeLimit(16384)]
    public async Task<IActionResult> MarkNotifications(ReadNotifications input, [FromServices] RequestRuntime runtime,
        [FromServices] NotificationStore notifications, CancellationToken ct)
    {
        if (CurrentUser() is not { } user) return Forbid();
        Response.Headers.CacheControl = "no-store";
        if (input.Ids?.Length > 300) return BadRequest();
        if (!await runtime.IsEnabled(ct)) return NotFound();
        await notifications.Mark(user.Id, input.Ids, ct);
        return NoContent();
    }

    public sealed record ReadNotifications(Guid[]? Ids);
}
