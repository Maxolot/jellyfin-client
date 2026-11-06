using System.Collections.Concurrent;
using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Jellyfin.Plugin.MovieSources;

[ApiController]
[Authorize]
[Route("MovieSources")]
public sealed partial class MovieSourcesController : ControllerBase
{
    private static readonly HttpClient Client = new(new SocketsHttpHandler { AllowAutoRedirect = false, ConnectTimeout = TimeSpan.FromSeconds(5) }) { Timeout = TimeSpan.FromSeconds(20) };
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static readonly ConcurrentDictionary<string, (DateTime Until, bool Found, string[] Languages)> Cache = new();
    private static DateTime _lastSearch = DateTime.MinValue;
    [GeneratedRegex("^tt[0-9]{5,10}$", RegexOptions.CultureInvariant)]
    private static partial Regex ImdbPattern();
    [HttpGet("Capabilities")]
    public IActionResult Capabilities() { Response.Headers.CacheControl = "no-store"; return Ok(new { Enabled = Plugin.Instance?.Configuration.Enabled == true, Series = true }); }
    [HttpGet("Movies/{imdbId}")]
    public async Task<IActionResult> Search(string imdbId, CancellationToken cancellation)
    {
        Response.Headers.CacheControl = "no-store";
        if (!ImdbPattern().IsMatch(imdbId)) return BadRequest();
        var config = Plugin.Instance?.Configuration;
        if (config is null || !config.Enabled || string.IsNullOrWhiteSpace(config.ApiKey) || !Uri.TryCreate(config.Address.TrimEnd('/') + "/", UriKind.Absolute, out var root) || (root.Scheme != Uri.UriSchemeHttp && root.Scheme != Uri.UriSchemeHttps) || !string.IsNullOrEmpty(root.UserInfo) || !string.IsNullOrEmpty(root.Query) || !string.IsNullOrEmpty(root.Fragment)) return StatusCode(503);
        var cacheKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(root.AbsoluteUri + "\n" + config.ApiKey))) + imdbId;
        if (Cache.TryGetValue(cacheKey, out var cached) && cached.Until > DateTime.UtcNow) return Ok(new { Found = cached.Found, Languages = cached.Languages });
        if (!await Gate.WaitAsync(0, cancellation).ConfigureAwait(false)) return StatusCode(429);
        try
        {
            if (Cache.TryGetValue(cacheKey, out cached) && cached.Until > DateTime.UtcNow) return Ok(new { Found = cached.Found, Languages = cached.Languages });
            if (DateTime.UtcNow - _lastSearch < TimeSpan.FromSeconds(5)) return StatusCode(429);
            _lastSearch = DateTime.UtcNow;
            var found = await ProwlarrSearch.Query(Client, root, config.ApiKey, imdbId, cancellation).ConfigureAwait(false);
            if (Cache.Count >= 256) Cache.Clear();
            Cache[cacheKey] = (DateTime.UtcNow.AddMinutes(5), found.Found, found.Languages);
            return Ok(new { Found = found.Found, Languages = found.Languages });
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException) { return StatusCode(503); }
        finally { Gate.Release(); }
    }

    /// <summary>Season-by-season availability of a series (at most 12 seasons per call), same limits and cache as films.</summary>
    [HttpGet("Series/{imdbId}")]
    public async Task<IActionResult> Seasons(string imdbId, [FromQuery] string seasons, CancellationToken cancellation)
    {
        Response.Headers.CacheControl = "no-store";
        var numbers = (seasons ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => int.TryParse(value, out var number) && number is > 0 and <= 99 ? number : -1).Distinct().ToList();
        if (!ImdbPattern().IsMatch(imdbId) || numbers.Count == 0 || numbers.Count > 12 || numbers.Contains(-1)) return BadRequest();
        var config = Plugin.Instance?.Configuration;
        if (config is null || !config.Enabled || string.IsNullOrWhiteSpace(config.ApiKey) || !Uri.TryCreate(config.Address.TrimEnd('/') + "/", UriKind.Absolute, out var root) || (root.Scheme != Uri.UriSchemeHttp && root.Scheme != Uri.UriSchemeHttps)) return StatusCode(503);
        var prefix = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(root.AbsoluteUri + "\n" + config.ApiKey))) + imdbId + ":S";
        var result = new Dictionary<string, bool>();
        var languages = new Dictionary<string, string[]>();
        foreach (var number in numbers.ToList())
        {
            if (Cache.TryGetValue(prefix + number, out var cached) && cached.Until > DateTime.UtcNow) { result[number.ToString()] = cached.Found; languages[number.ToString()] = cached.Languages; numbers.Remove(number); }
        }
        if (numbers.Count == 0) return Ok(new { Seasons = result, Languages = languages });
        if (!await Gate.WaitAsync(0, cancellation).ConfigureAwait(false)) return StatusCode(429);
        try
        {
            if (DateTime.UtcNow - _lastSearch < TimeSpan.FromSeconds(5)) return StatusCode(429);
            _lastSearch = DateTime.UtcNow;
            var first = true;
            foreach (var number in numbers)
            {
                if (!first) await Task.Delay(TimeSpan.FromSeconds(1), cancellation).ConfigureAwait(false);
                first = false;
                try
                {
                    var found = await ProwlarrSearch.QuerySeason(Client, root, config.ApiKey, imdbId, number, cancellation).ConfigureAwait(false);
                    if (Cache.Count >= 256) Cache.Clear();
                    Cache[prefix + number] = (DateTime.UtcNow.AddMinutes(5), found.Found, found.Languages);
                    result[number.ToString()] = found.Found;
                    languages[number.ToString()] = found.Languages;
                }
                catch (Exception ex) when (ex is HttpRequestException or JsonException or InvalidOperationException) { /* A failed season stays unknown. */ }
            }
            return Ok(new { Seasons = result, Languages = languages });
        }
        catch (TaskCanceledException) { return StatusCode(503); }
        finally { Gate.Release(); }
    }
}
