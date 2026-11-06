using System.Text.Json;
using System.Text.RegularExpressions;
namespace Jellyfin.Plugin.MovieSources;
/// <summary>Whether a release was found and in which French audio/subtitle flavours (vf, vostfr, multi) its titles announce.</summary>
public sealed record SourceResult(bool Found, string[] Languages);

public static partial class ProwlarrSearch
{
    [GeneratedRegex("(?<![a-z0-9])(multi|vff|vfq|vfi|vf2|vf|truefrench|french)(?![a-z0-9])", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex AudioPattern();
    [GeneratedRegex("(?<![a-z0-9])(vostfr|subfrench|stfr|vost)(?![a-z0-9])", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex SubtitlePattern();

    /// <summary>Reads the language tags of one release title; MULTi counts as multi only, French audio tags as vf, French subtitles as vostfr.</summary>
    public static IEnumerable<string> Languages(string title)
    {
        var audio = AudioPattern().Matches(title).Select(match => match.Value.ToLowerInvariant()).ToList();
        if (audio.Contains("multi")) yield return "multi";
        if (audio.Any(tag => tag != "multi")) yield return "vf";
        if (SubtitlePattern().IsMatch(title)) yield return "vostfr";
    }

    public static Task<SourceResult> Query(HttpClient client, Uri root, string credential, string imdbId, CancellationToken cancellation) =>
        Run(client, new Uri(root, "api/v1/search?type=movie&categories=2000&query=" + Uri.EscapeDataString("{ImdbId:" + imdbId + "}")), credential, cancellation);

    /// <summary>Searches one season of a series with Prowlarr's tvsearch (standard TV categories).</summary>
    public static Task<SourceResult> QuerySeason(HttpClient client, Uri root, string credential, string imdbId, int season, CancellationToken cancellation) =>
        Run(client, new Uri(root, "api/v1/search?type=tvsearch&categories=5000&query=" + Uri.EscapeDataString("{ImdbId:" + imdbId + "}{Season:" + season + "}")), credential, cancellation);

    private static async Task<SourceResult> Run(HttpClient client, Uri uri, string credential, CancellationToken cancellation)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.TryAddWithoutValidation("X-Api-Key", credential);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellation).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength > 8 * 1024 * 1024) throw new HttpRequestException();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellation).ConfigureAwait(false);
        using var limited = new MemoryStream();
        var buffer = new byte[16384]; int count;
        while ((count = await stream.ReadAsync(buffer, cancellation).ConfigureAwait(false)) != 0) { if (limited.Length + count > 8 * 1024 * 1024) throw new HttpRequestException(); limited.Write(buffer, 0, count); }
        limited.Position = 0;
        using var document = await JsonDocument.ParseAsync(limited, cancellationToken: cancellation).ConfigureAwait(false);
        if (document.RootElement.ValueKind != JsonValueKind.Array) throw new JsonException();
        var languages = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var release in document.RootElement.EnumerateArray().Take(500))
        {
            if (release.ValueKind == JsonValueKind.Object && release.TryGetProperty("title", out var title) && title.ValueKind == JsonValueKind.String)
                foreach (var tag in Languages(title.GetString() ?? "")) languages.Add(tag);
        }
        return new SourceResult(document.RootElement.GetArrayLength() > 0, languages.ToArray());
    }
}
