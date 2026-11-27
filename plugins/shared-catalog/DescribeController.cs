using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SharedCatalog;

public sealed partial class CatalogController
{
    private static readonly HttpClient DescribeHttp = new(new SocketsHttpHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(8),
        MaxResponseContentBufferSize = 65536
    };

    [HttpGet("Describe")]
    public async Task<IActionResult> Describe([FromQuery] string? q, CancellationToken ct)
    {
        if (CurrentUser() is not { } user) return Forbid();
        Response.Headers.CacheControl = "no-store";
        if (Plugin.Instance is not { } plugin) return NotFound();
        var path = Path.Combine(plugin.DataFolderPath, "describe.json");
        if (!System.IO.File.Exists(path)) return NotFound();

        try
        {
            await using var stream = System.IO.File.OpenRead(path);
            var config = await JsonSerializer.DeserializeAsync<DescribeConfiguration>(stream, Json, ct);
            if (config is null || !Uri.TryCreate(config.Url, UriKind.Absolute, out var baseUri) || baseUri.Scheme is not ("http" or "https")
                || baseUri.UserInfo.Length > 0 || baseUri.Query.Length > 0 || baseUri.Fragment.Length > 0) return NotFound();
            if (q is null) return new JsonResult(new { available = true }, Json);
            q = q.Trim();
            if (q.Length is < 1 or > 240) return BadRequest();

            using var request = new HttpRequestMessage(HttpMethod.Get,
                new Uri(new Uri(baseUri.ToString().TrimEnd('/') + "/"), $"search?limit=50&q={Uri.EscapeDataString(q)}"));
            if (!string.IsNullOrWhiteSpace(config.Token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.Token);
            using var response = await DescribeHttp.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return StatusCode(503);
            var found = await response.Content.ReadFromJsonAsync<DescribeResponse>(Json, ct);
            if (found?.Results is null) return StatusCode(503);
            return await Access(entries => (false, new JsonResult(new { results = DescribeVisible(found.Results, user.Id, entries) }, Json)), ct);
        }
        catch (Exception error) when (error is HttpRequestException or IOException or JsonException or FormatException
            || error is OperationCanceledException && !ct.IsCancellationRequested)
        {
            return StatusCode(503);
        }
    }

    private DescribeResult[] DescribeVisible(DescribeCandidate[] results, Guid user, List<Entry> entries)
    {
        var known = new Dictionary<string, DescribeResult>(StringComparer.Ordinal);
        foreach (var candidate in results.Take(50))
        {
            if (candidate.Type is not ("movie" or "tv") || !double.IsFinite(candidate.Score) || candidate.Score is < 0 or > 1)
                continue;
            var result = DescribeIdentity(candidate, user, entries);
            if (result is null) continue;
            var identity = result.Tmdb is { } provider ? $"{result.Type}:{provider}" : $"local:{result.ItemId}";
            if (!known.TryGetValue(identity, out var previous))
                known.Add(identity, result);
            else if (previous.ItemId is null && result.ItemId is not null)
                known[identity] = result;
        }
        return known.Values.Take(10).ToArray();
    }

    private DescribeResult? DescribeIdentity(DescribeCandidate candidate, Guid user, List<Entry> entries)
    {
        var reason = Limit(candidate.Reason, 130) ?? "Résumé proche";
        if (!string.IsNullOrEmpty(candidate.ItemId))
        {
            if (!Guid.TryParse(candidate.ItemId, out var id) || library.GetItemById<BaseItem>(id, user) is not { } item
                || item is not (Movie or Series)) return null;
            var type = item is Movie ? "movie" : "tv";
            var tmdb = TryProvider(item, "Tmdb", out var provider) ? (int?)provider : null;
            return new(item.Id.ToString("N"), tmdb, type, Limit(item.Name, 300) ?? "", null, candidate.Score, reason);
        }
        var tracked = entries.FirstOrDefault(entry => entry.Type == candidate.Type && entry.Id == candidate.Tmdb);
        return tracked is null ? null : new(null, tracked.Id, tracked.Type, tracked.Title, tracked.PosterPath, candidate.Score, reason);
    }

    private sealed record DescribeConfiguration(string Url, string? Token);
    private sealed record DescribeResponse(DescribeCandidate[] Results);
    private sealed record DescribeCandidate(string? ItemId, int? Tmdb, string Type, double Score, string? Reason);
    private sealed record DescribeResult(string? ItemId, int? Tmdb, string Type, string Title, string? Poster, double Score, string Reason);
}
