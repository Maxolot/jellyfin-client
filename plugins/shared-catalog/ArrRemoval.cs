using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Jellyfin.Plugin.SharedCatalog;

internal sealed record ArrConnection(string Url, string ApiKey);
internal sealed record RemovalSettings(ArrConnection? Radarr, ArrConnection? Sonarr);
internal sealed record RemovalFile(int Id, string Name, long Size);
internal sealed record RemovalPlan(string Revision, RemovalFile[] Files, long Bytes);
internal sealed class RemovalConflict(string message) : Exception(message);

// All paths and IDs used for writes come from Arr, never from the browser.
internal sealed class ArrRemoval(ArrConnection server, bool series, int providerId, int? season)
{
    private static readonly HttpClient Http = new(new SocketsHttpHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(20)
    };

    private readonly Uri _root = new(server.Url.TrimEnd('/') + "/api/v3/");
    private string TitleRoute => series ? "series" : "movie";
    private string FileRoute => series ? "episodefile" : "moviefile";

    public async Task<RemovalPlan> Preview(CancellationToken ct)
    {
        var state = await Load(ct);
        await CheckQueue(state.Id, ct);
        return Plan(state);
    }

    public async Task Remove(string revision, Func<Task> keepEntry, Action checkPlayback, CancellationToken ct)
    {
        var initial = await Load(ct);
        if (Plan(initial).Revision != revision) throw new RemovalConflict("filesChanged");
        await CheckQueue(initial.Id, ct);
        checkPlayback();
        await keepEntry();

        // Disable monitoring before touching files. Re-read the server's state before deletion.
        await Unmonitor(initial, ct);
        var secured = await Load(ct);
        if (Plan(secured).Revision != revision) throw new RemovalConflict("filesChanged");
        VerifyUnmonitored(secured);
        await CheckQueue(secured.Id, ct);
        checkPlayback();
        foreach (var file in secured.Files)
        {
            checkPlayback();
            // Never retry a DELETE with an uncertain result. A fresh preview resolves the state.
            await Send(HttpMethod.Delete, $"{FileRoute}/{file.Id}", null, ct);
        }
    }

    private async Task Unmonitor(State state, CancellationToken ct)
    {
        if (series)
        {
            foreach (var entry in state.Title["seasons"]!.AsArray())
            {
                if (season is null || Number(entry, "seasonNumber") == season) entry!["monitored"] = false;
            }
        }
        if (!series || season is null) state.Title["monitored"] = false;
        await Send(HttpMethod.Put, $"{TitleRoute}/{state.Id}", state.Title, ct);

        if (series)
        {
            var ids = state.Episodes.Select(episode => Number(episode, "id")).ToArray();
            if (ids.Length != 0)
                await Send(HttpMethod.Put, "episode/monitor", new { episodeIds = ids, monitored = false }, ct);
        }
    }

    private void VerifyUnmonitored(State state)
    {
        if ((!series || season is null) && state.Title["monitored"]?.GetValue<bool>() != false)
            throw new RemovalConflict("monitoring");
        if (!series) return;
        var seasons = state.Title["seasons"]!.AsArray().Where(entry => season is null || Number(entry, "seasonNumber") == season);
        if (seasons.Any(entry => entry?["monitored"]?.GetValue<bool>() != false)
            || state.Episodes.Any(entry => entry?["monitored"]?.GetValue<bool>() != false))
            throw new RemovalConflict("monitoring");
    }

    private async Task<State> Load(CancellationToken ct)
    {
        var titles = (await Send(HttpMethod.Get, TitleRoute, null, ct))!.AsArray();
        var matches = titles.Where(entry => Number(entry, series ? "tvdbId" : "tmdbId") == providerId).ToArray();
        if (matches.Length != 1 || matches[0] is not JsonObject title) throw new RemovalConflict("unmanaged");
        var id = Number(title, "id");
        if (id <= 0) throw new RemovalConflict("unmanaged");
        var episodes = series
            ? (await Send(HttpMethod.Get, $"episode?seriesId={id}", null, ct))!.AsArray()
            : new JsonArray();
        var targetEpisodes = episodes.Where(entry => season is null || Number(entry, "seasonNumber") == season).ToArray();
        var files = (await Send(HttpMethod.Get, $"{FileRoute}?{(series ? "seriesId" : "movieId")}={id}", null, ct))!.AsArray();
        var targetIds = targetEpisodes.Select(entry => Number(entry, "episodeFileId")).Where(value => value > 0).ToHashSet();
        if (series && season is not null && episodes.Any(entry => Number(entry, "seasonNumber") != season && targetIds.Contains(Number(entry, "episodeFileId"))))
            throw new RemovalConflict("sharedFile");
        var scopedFiles = files.Where(entry => season is null || targetIds.Contains(Number(entry, "id"))).ToArray();
        if (scopedFiles.Any(entry => Number(entry, series ? "seriesId" : "movieId") != id))
            throw new RemovalConflict("unmanaged");
        var selected = scopedFiles
            .Select(entry => new RemovalFile(Number(entry, "id"), FileName(entry), entry?["size"]?.GetValue<long>() ?? 0))
            .OrderBy(file => file.Id).ToArray();
        if (selected.Length == 0 || selected.Any(file => file.Id <= 0) || (series && targetIds.Except(selected.Select(file => file.Id)).Any()))
            throw new RemovalConflict("noFiles");
        return new State(id, title, targetEpisodes, selected);
    }

    private async Task CheckQueue(int id, CancellationToken ct)
    {
        const int pageSize = 100;
        for (var page = 1; page <= 100; page++)
        {
            var result = await Send(HttpMethod.Get, $"queue?page={page}&pageSize={pageSize}", null, ct);
            var records = result?["records"]?.AsArray() ?? throw new RemovalConflict("queueUnknown");
            if (records.Any(entry => Number(entry, series ? "seriesId" : "movieId") == id))
                throw new RemovalConflict("queued");
            if (page * pageSize >= (result?["totalRecords"]?.GetValue<int>() ?? int.MaxValue)) return;
        }
        throw new RemovalConflict("queueUnknown");
    }

    private RemovalPlan Plan(State state)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new { series, providerId, season, state.Id, state.Files });
        return new RemovalPlan(Convert.ToHexString(SHA256.HashData(bytes)), state.Files, state.Files.Sum(file => file.Size));
    }

    private async Task<JsonNode?> Send(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, new Uri(_root, path));
        request.Headers.Add("X-Api-Key", server.ApiKey);
        if (body is not null) request.Content = JsonContent.Create(body);
        using var response = await Http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        if (method != HttpMethod.Get) return null;
        return await response.Content.ReadFromJsonAsync<JsonNode>(cancellationToken: ct);
    }

    private static int Number(JsonNode? entry, string key) => entry?[key]?.GetValue<int>() ?? -1;

    private static string FileName(JsonNode? entry)
    {
        var path = entry?["relativePath"]?.GetValue<string>() ?? entry?["path"]?.GetValue<string>() ?? "";
        return Path.GetFileName(path.Replace('\\', '/'));
    }

    private sealed record State(int Id, JsonObject Title, JsonNode?[] Episodes, RemovalFile[] Files);
}
