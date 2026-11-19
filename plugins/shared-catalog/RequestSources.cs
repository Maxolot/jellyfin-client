using System.Net.Http.Json;
using System.Text.Json;

namespace Jellyfin.Plugin.SharedCatalog;

internal sealed record RequestServiceConnection(string Url, string ApiKey);
internal sealed record RequestServiceSettings(RequestServiceConnection Seerr, string? VpnHealthUrl = null);
internal sealed record RequestConnections(RequestServiceSettings Settings, RemovalSettings? Arr);

internal sealed class RequestSources(HttpClient http)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    internal static async Task<RequestConnections?> Settings(CancellationToken ct)
    {
        if (Plugin.Instance is not { } plugin) return null;
        var settings = await Read<RequestServiceSettings>(Path.Combine(plugin.DataFolderPath, "requests.json"), ct);
        if (settings?.Seerr is not { } seerr || !Valid(seerr.Url) || string.IsNullOrWhiteSpace(seerr.ApiKey)) return null;
        var arr = await Read<RemovalSettings>(Path.Combine(plugin.DataFolderPath, "storage.json"), ct);
        return new(settings, arr);
    }

    private static async Task<T?> Read<T>(string file, CancellationToken ct)
    {
        if (!File.Exists(file)) return default;
        await using var stream = File.OpenRead(file);
        return await JsonSerializer.DeserializeAsync<T>(stream, Json, ct);
    }

    private static bool Valid(string? url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https"
        && string.IsNullOrEmpty(uri.UserInfo) && string.IsNullOrEmpty(uri.Fragment) && string.IsNullOrEmpty(uri.Query);

    internal async Task<SeerrRequest[]> List(RequestServiceConnection seerr, CancellationToken ct)
    {
        const int size = 100;
        var items = new Dictionary<int, SeerrRequest>();
        for (var skip = 0; skip < 10000; skip += size)
        {
            var page = await Get(seerr.Url, seerr.ApiKey, $"api/v1/request?take={size}&skip={skip}&sort=modified&filter=all", ct);
            var records = Array(Prop(page, "results"));
            foreach (var record in records)
            {
                var request = Parse(record);
                if (request is not null) items.TryAdd(request.Id, request);
            }
            if (records.Length < size) return items.Values.ToArray();
        }
        return items.Values.ToArray();
    }

    internal static SeerrRequest? Parse(JsonElement row)
    {
        var media = Prop(row, "media");
        var id = Num(row, "id");
        var tmdb = Num(media, "tmdbId");
        var type = Str(row, "type");
        if (id <= 0 || tmdb <= 0 || type is not ("movie" or "tv")) return null;
        var ultra = Prop(row, "is4k").ValueKind == JsonValueKind.True;
        var owner = Str(Prop(row, "requestedBy"), "jellyfinUserId");
        var created = Date(row, "createdAt");
        var updated = Date(row, "updatedAt") ?? created ?? DateTimeOffset.UnixEpoch;
        var transfers = Array(Prop(media, ultra ? "downloadStatus4k" : "downloadStatus")).Select((entry, index) =>
        {
            var download = Str(entry, "downloadId") ?? $"seerr:{index}";
            var season = Num(Prop(entry, "episode"), "seasonNumber");
            return new RequestTransfer(download, Count(entry, "size"), Count(entry, "sizeLeft"), Str(entry, "status") ?? "", "", false,
                season > 0 ? season : null, Time(entry, "timeLeft"), Date(entry, "estimatedCompletionTime"));
        }).ToArray();
        return new(id, type, tmdb, Num(media, "tvdbId"), Num(media, ultra ? "externalServiceId4k" : "externalServiceId"),
            Guid.TryParse(owner, out var userId) ? userId : null, ultra, Num(row, "status"), Num(media, ultra ? "status4k" : "status"),
            updated, Array(Prop(row, "seasons")).Select(season => Num(season, "seasonNumber")).Where(number => number > 0).Distinct().ToArray(),
            created, transfers);
    }

    internal async Task<RequestTitle> Title(SeerrRequest request, RequestServiceConnection seerr, CancellationToken ct)
    {
        var data = await Get(seerr.Url, seerr.ApiKey, $"api/v1/{request.Type}/{request.Tmdb}?language=fr", ct);
        var poster = Str(data, "posterPath");
        if (!ValidPoster(poster)) poster = null;
        return new(Str(data, request.Type == "tv" ? "name" : "title") ?? $"TMDb {request.Tmdb}", poster);
    }

    internal static bool ValidPoster(string? value) => value is { Length: > 1 and <= 180 } && value[0] == '/'
        && value.Skip(1).All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '-' or '_');

    internal async Task<bool?> Vpn(string? url, CancellationToken ct)
    {
        if (!Valid(url)) return null;
        using var response = await http.GetAsync(url, ct);
        return response.IsSuccessStatusCode;
    }

    internal async Task<JsonElement[]> Queue(ArrConnection? server, bool tv, CancellationToken ct)
    {
        if (server is null || !Valid(server.Url)) return [];
        var records = new List<JsonElement>();
        const int size = 100;
        for (var page = 1; page <= 20; page++)
        {
            var parameter = tv ? "&includeEpisode=true&includeSeries=true" : "&includeMovie=true";
            var data = await Get(server.Url, server.ApiKey, $"api/v3/queue?page={page}&pageSize={size}{parameter}", ct);
            var next = Array(Prop(data, "records"));
            records.AddRange(next);
            if (next.Length < size || page * size >= Num(data, "totalRecords")) break;
        }
        return records.ToArray();
    }

    internal async Task<RequestArr> Observe(SeerrRequest request, ArrConnection? server, JsonElement[]? queue, CancellationToken ct)
    {
        if (server is null || !Valid(server.Url) || queue is null) return new([], [], null, false);
        var television = request.Type == "tv";
        var route = television ? "series" : "movie";
        var provider = television ? "tvdbId" : "tmdbId";
        var expected = television ? request.Tvdb : request.Tmdb;
        if (expected <= 0) return new([], [], null, false);
        var fromQueue = queue.Where(row => Num(Prop(row, route), provider) == expected).ToArray();
        var arrId = request.ArrId > 0 ? request.ArrId : fromQueue.Select(row => Num(row, route + "Id")).FirstOrDefault(id => id > 0);
        if (arrId == 0) return new([], [], null, false);
        var title = await Get(server.Url, server.ApiKey, $"api/v3/{route}/{arrId}", ct);
        if (Num(title, provider) != expected) return new([], [], null, false);
        var episodes = television ? await Episodes(server, arrId, ct) : [];
        var byEpisodeId = episodes.GroupBy(entry => entry.Id).ToDictionary(group => group.Key, group => group.First().Episode);
        var transfers = queue.Where(row => Num(row, route + "Id") == arrId).Select(row => Transfer(row, byEpisodeId)).ToArray();
        var history = transfers.Length == 0 && request.Status == 2
            ? await History(server, arrId, television, request.Created ?? request.Updated, ct) : null;
        return new(transfers, episodes.Select(entry => entry.Episode).ToArray(), history, true);
    }

    private async Task<(int Id, RequestEpisode Episode)[]> Episodes(ArrConnection server, int id, CancellationToken ct)
    {
        var rows = await Get(server.Url, server.ApiKey, $"api/v3/episode?seriesId={id}", ct);
        return Array(rows).Where(row => Num(row, "id") > 0 && Num(row, "seasonNumber") > 0 && Num(row, "episodeNumber") > 0)
            .Select(row => (Num(row, "id"), new RequestEpisode(Num(row, "seasonNumber"), Num(row, "episodeNumber")))).Distinct().ToArray();
    }

    private async Task<string?> History(ArrConnection server, int id, bool tv, DateTimeOffset since, CancellationToken ct)
    {
        var filter = tv ? $"seriesId={id}" : $"movieId={id}";
        var data = await Get(server.Url, server.ApiKey, $"api/v3/history?page=1&pageSize=30&sortKey=date&sortDirection=descending&{filter}", ct);
        var history = Array(Prop(data, "records")).Where(row =>
            Num(row, tv ? "seriesId" : "movieId") == id && Prop(row, "date").ValueKind == JsonValueKind.String
            && Prop(row, "date").TryGetDateTimeOffset(out var date) && date >= since);
        var latest = history.Select(row => Str(row, "eventType")).FirstOrDefault(value => value is "downloadFolderImported" or "grabbed" or "downloadFailed");
        return latest switch { "downloadFolderImported" => "import", "grabbed" => "grab", _ => null };
    }

    internal static RequestTransfer Transfer(JsonElement row, IReadOnlyDictionary<int, RequestEpisode> episodes)
    {
        var id = Str(row, "downloadId");
        var size = Count(row, "size");
        var state = Str(row, "trackedDownloadState") ?? "";
        var status = Str(row, "status") ?? "";
        var season = Num(Prop(row, "episode"), "seasonNumber");
        if (season <= 0 && episodes.TryGetValue(Num(row, "episodeId"), out var episode)) season = episode.Season;
        var failed = state == "importBlocked" && Array(Prop(row, "statusMessages")).Length > 0;
        return new(string.IsNullOrWhiteSpace(id) ? $"queue:{Num(row, "id")}" : id, size, Count(row, "sizeleft"), status, state, failed,
            season > 0 ? season : null, Time(row, "timeleft"), Date(row, "estimatedCompletionTime"));
    }

    private async Task<JsonElement> Get(string url, string key, string path, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(new Uri(url.TrimEnd('/') + "/"), path));
        request.Headers.Add("X-Api-Key", key);
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
    }

    private static JsonElement Prop(JsonElement value, string name) =>
        value.ValueKind == JsonValueKind.Object && value.TryGetProperty(name, out var member) ? member : default;
    private static JsonElement[] Array(JsonElement value) => value.ValueKind == JsonValueKind.Array ? value.EnumerateArray().ToArray() : [];
    private static string? Str(JsonElement value, string name) => Prop(value, name).ValueKind == JsonValueKind.String ? Prop(value, name).GetString() : null;
    private static int Num(JsonElement value, string name) => Prop(value, name).ValueKind == JsonValueKind.Number && Prop(value, name).TryGetInt32(out var number) ? number : 0;
    private static DateTimeOffset? Date(JsonElement value, string name) =>
        Prop(value, name).ValueKind == JsonValueKind.String && Prop(value, name).TryGetDateTimeOffset(out var date) ? date : null;
    private static TimeSpan? Time(JsonElement value, string name) =>
        TimeSpan.TryParse(Str(value, name), System.Globalization.CultureInfo.InvariantCulture, out var time) ? time : null;
    private static long Count(JsonElement value, string name) => Prop(value, name).ValueKind == JsonValueKind.Number && Prop(value, name).TryGetDouble(out var number)
        && number > 0 && number <= long.MaxValue / 2d ? (long)number : 0;
}
