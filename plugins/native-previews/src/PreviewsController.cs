using System.Text.Json;
using Jellyfin.Plugin.NativePreviews.Core;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.NativePreviews;

[ApiController]
[Authorize]
[Route("NativePreviews")]
public sealed class PreviewsController(PreviewRuntime runtime) : ControllerBase
{
    private Guid UserId => Guid.TryParse(User.FindFirst("Jellyfin-UserId")?.Value, out var id) ? id : Guid.Empty;
    [HttpGet("Capabilities")]
    public ActionResult Capabilities() => Ok(new { Version = 1, Enabled = runtime.Options.Enabled, Variants = new[] { "compact", "full" }, MaxDurationSeconds = 30, SceneApprovalRequired = !runtime.Options.AutomaticScenes });

    [HttpGet("Items/{itemId:guid}/Manifest")]
    public ActionResult Manifest(Guid itemId, [FromQuery] bool seriesFallback = false)
    {
        Response.Headers.CacheControl = "no-store";
        if (!runtime.Options.Enabled || runtime.Visible(itemId, UserId) is null) return NotFound();
        var scene = runtime.Store.Get(itemId);
        if (scene is null && seriesFallback && runtime.Visible(itemId, UserId) is MediaBrowser.Controller.Entities.TV.Episode episode) scene = runtime.Store.Get(episode.SeriesId);
        scene ??= runtime.AutomaticScene(runtime.Visible(itemId, UserId)!, UserId);
        if (scene is null || (scene.Automatic && !runtime.Options.AutomaticScenes) || runtime.Visible(scene.ItemId, UserId) is null || !scene.Approved || runtime.Visible(scene.SourceItemId, UserId) is null) return NoContent();
        if (scene.State != "ready" || scene.CacheKey is null)
        {
            if (scene.State is "evicted" or "queued") runtime.Enqueue(scene);
            Response.Headers.RetryAfter = "5";
            return NoContent();
        }
        var expires = DateTime.UtcNow.AddMinutes(3);
        var sources = new Dictionary<string, PreviewVariant>();
        foreach (var variant in new[] { "compact", "full" })
        {
            var file = Path.Combine(runtime.Store.CacheDirectory(scene.CacheKey), variant + ".json");
            if (!System.IO.File.Exists(file)) continue;
            var probe = JsonSerializer.Deserialize<VideoProbe>(System.IO.File.ReadAllText(file));
            if (probe is null) continue;
            var ticket = runtime.Tickets.Issue(new MediaTicket(UserId, scene.ItemId, variant, scene.CacheKey, new DateTimeOffset(expires).ToUnixTimeSeconds()));
            var url = Request.PathBase + $"/NativePreviews/Media/{scene.ItemId:N}/{variant}.mp4?ticket=" + ticket;
            sources[variant] = new PreviewVariant(url, probe.Width, probe.Height);
        }
        return sources.Count == 0 ? NoContent() : Ok(new PreviewManifest(scene.ItemId, scene.DurationSeconds, expires, sources));
    }
    [AllowAnonymous]
    [HttpGet("Media/{itemId:guid}/{variant}.mp4")]
    [HttpHead("Media/{itemId:guid}/{variant}.mp4")]
    public ActionResult Media(Guid itemId, string variant, [FromQuery] string? ticket)
    {
        var grant = runtime.Tickets.Validate(ticket, DateTime.UtcNow);
        if (!runtime.Options.Enabled || grant is null || grant.ItemId != itemId || grant.Variant != variant || runtime.Visible(itemId, grant.UserId) is null) return NotFound();
        var scene = runtime.Store.Get(itemId);
        if (scene is null || (scene.Automatic && !runtime.Options.AutomaticScenes) || runtime.Visible(scene.SourceItemId, grant.UserId) is null) return NotFound();
        var clip = runtime.Store.Open(itemId, grant.CacheKey, variant);
        if (clip is null) return NotFound();
        Response.Headers.CacheControl = "private, max-age=60";
        Response.Headers["Referrer-Policy"] = "no-referrer";
        return new FileStreamResult(clip.Value.Stream, "video/mp4") { EnableRangeProcessing = true, LastModified = clip.Value.Modified, EntityTag = new EntityTagHeaderValue('"' + grant.CacheKey + '-' + variant + '"') };
    }
    [HttpGet("Admin/Scenes")]
    public ActionResult Scenes() => runtime.IsAdmin(UserId) ? Ok(runtime.Store.Scenes()) : Forbid();

    [HttpPost("Admin/Scenes/{itemId:guid}")]
    public ActionResult Scene(Guid itemId, [FromBody] SceneRequest request)
    {
        if (!runtime.IsAdmin(UserId)) return Forbid();
        var item = runtime.Visible(itemId, UserId);
        if (item is null) return NotFound();
        try
        {
            PreviewPolicy.Validate(request);
            var sourceId = runtime.Source(item, request.SourceItemId, UserId);
            var scene = runtime.Store.Save(itemId, sourceId, request);
            var queued = runtime.Enqueue(scene);
            return Accepted(new { Scene = scene, Queued = queued });
        }
        catch (ArgumentException) { return BadRequest(new { Error = "Choose a local film/episode and a valid scene lasting 1–30 seconds." }); }
    }
    [HttpPost("Admin/Prepare")]
    public ActionResult Prepare([FromBody] Guid[] items)
    {
        if (!runtime.IsAdmin(UserId)) return Forbid();
        if (items.Length > 64) return BadRequest();
        return Accepted(new { Queued = items.Distinct().Count(id => runtime.Store.Get(id) is { Approved: true } scene && runtime.Enqueue(scene)) });
    }
    [HttpPost("Admin/Imports/{itemId:guid}")]
    [RequestSizeLimit(34 * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 34 * 1024 * 1024)]
    public async Task<ActionResult> Import(Guid itemId, [FromForm] IFormFile file, [FromQuery] bool approved = false, [FromQuery] Guid? sourceItemId = null, CancellationToken cancellation = default)
    {
        if (!runtime.IsAdmin(UserId)) return Forbid();
        var item = runtime.Visible(itemId, UserId);
        if (item is null) return NotFound();
        Guid sourceId;
        try { sourceId = runtime.Source(item, sourceItemId, UserId); }
        catch (ArgumentException) { return BadRequest(new { Error = "A film, episode or series with an accessible source is required." }); }
        if (!approved || file.Length is <= 0 or > 32 * 1024 * 1024) return BadRequest(new { Error = "An approved scene clip under 32 MiB is required." });
        await runtime.ImportGate.WaitAsync(cancellation).ConfigureAwait(false);
        var temp = Path.Combine(runtime.Store.Root, "work", Guid.NewGuid().ToString("N") + ".mp4");
        try
        {
            using var reservation = runtime.Store.Reserve(file.Length + 64 * 1024L * 1024L);
            await using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) await file.CopyToAsync(stream, cancellation).ConfigureAwait(false);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            timeout.CancelAfter(TimeSpan.FromSeconds(30));
            var probe = await runtime.Encoder.Probe(temp, timeout.Token).ConfigureAwait(false);
            if (probe.Duration > 30 || probe.Duration < 1) return BadRequest(new { Error = "Imported clips must last 1–30 seconds." });
            var scene = runtime.Store.Import(itemId, sourceId, temp, probe.Duration, reservation);
            return Accepted(new { Scene = scene, Queued = scene.State != "ready" && runtime.Enqueue(scene) });
        }
        catch (Exception error) when (error is InvalidOperationException or InvalidDataException or JsonException or IOException)
        {
            return BadRequest(new { Error = "The clip could not be imported or the cache is full." });
        }
        finally
        {
            if (System.IO.File.Exists(temp)) System.IO.File.Delete(temp);
            runtime.ImportGate.Release();
        }
    }
}
