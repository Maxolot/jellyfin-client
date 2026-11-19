using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Jellyfin.Plugin.SharedCatalog;

using var fixture = new ArrFixture();
var film = new ArrRemoval(fixture.Connection, false, 101, null);
var season = new ArrRemoval(fixture.Connection, true, 202, 1);
var ct = CancellationToken.None;

var filmPlan = await film.Preview(ct);
Require(filmPlan.Files.Select(file => file.Id).SequenceEqual([35]), "Wrong movie file");
fixture.Queued = true;
await ExpectConflict(() => film.Remove(filmPlan.Revision, fixture.Keep, () => { }, ct), "queued");
Require(fixture.Retained.Count == 0 && fixture.Deleted.Count == 0 && fixture.MovieMonitored, "Queue must block all changes");
fixture.Queued = false;
await ExpectConflict(() => film.Remove(new string('A', 64), fixture.Keep, () => { }, ct), "filesChanged");
Require(fixture.Deleted.Count == 0 && fixture.MovieMonitored, "Stale preview must block writes");

fixture.IgnoreMonitoring = true;
await ExpectConflict(() => film.Remove(filmPlan.Revision, fixture.Keep, () => { }, ct), "monitoring");
Require(fixture.Deleted.Count == 0 && fixture.Retained.Count == 1, "Retention must precede monitoring and deletion");
fixture.IgnoreMonitoring = false;
await film.Remove(filmPlan.Revision, fixture.Keep, () => { }, ct);
Require(!fixture.MovieMonitored && fixture.Deleted.SequenceEqual([35]), "Radarr must be unmonitored before removing the movie file");

var seasonPlan = await season.Preview(ct);
Require(seasonPlan.Files.Select(file => file.Id).SequenceEqual([41]), "Wrong season scope");
await season.Remove(seasonPlan.Revision, fixture.Keep, () => { }, ct);
Require(fixture.SeriesMonitored && !fixture.SeasonOne && fixture.SeasonTwo && !fixture.EpisodeOne && fixture.EpisodeTwo
    && fixture.Deleted.SequenceEqual([35, 41]), "Only season one must be removed and unmonitored");

var remaining = new ArrRemoval(fixture.Connection, true, 202, null);
var remainingPlan = await remaining.Preview(ct);
await ExpectConflict(() => remaining.Remove(remainingPlan.Revision, fixture.Keep, () => throw new RemovalConflict("playing"), ct), "playing");
Require(fixture.SeriesMonitored && fixture.Deleted.SequenceEqual([35, 41]), "Playback must block writes");
await remaining.Remove(remainingPlan.Revision, fixture.Keep, () => { }, ct);
Require(!fixture.SeriesMonitored && !fixture.SeasonTwo && !fixture.EpisodeTwo
    && fixture.Deleted.SequenceEqual([35, 41, 42]), "The whole series must be unmonitored before removal");
Console.WriteLine("Storage checks passed: queue, stale preview, failed monitoring, playback, film, season and entire series.");
await FolderChecks.Run();
await FolderApiChecks.Run();

static async Task ExpectConflict(Func<Task> action, string code)
{
    try { await action(); }
    catch (RemovalConflict ex) when (ex.Message == code) { return; }
    throw new InvalidOperationException("Expected conflict: " + code);
}
static void Require(bool valid, string message)
{
    if (!valid) throw new InvalidOperationException(message);
}

sealed class ArrFixture : IDisposable
{
    private readonly HttpListener _listener = new();
    public ArrConnection Connection { get; }
    public bool Queued { get; set; }
    public bool IgnoreMonitoring { get; set; }
    public bool MovieMonitored { get; private set; } = true;
    public bool SeriesMonitored { get; private set; } = true;
    public bool SeasonOne { get; private set; } = true;
    public bool SeasonTwo { get; private set; } = true;
    public bool EpisodeOne { get; private set; } = true;
    public bool EpisodeTwo { get; private set; } = true;
    public List<int> Retained { get; } = [];
    public List<int> Deleted { get; } = [];

    public ArrFixture()
    {
        using var port = new TcpListener(IPAddress.Loopback, 0);
        port.Start();
        var number = ((IPEndPoint)port.LocalEndpoint).Port;
        port.Stop();
        var url = $"http://127.0.0.1:{number}";
        Connection = new(url, "fixture");
        _listener.Prefixes.Add(url + "/");
        _listener.Start();
        _ = Serve();
    }

    public Task Keep()
    {
        Retained.Add(1);
        return Task.CompletedTask;
    }

    private async Task Serve()
    {
        try
        {
            while (_listener.IsListening)
            {
                var context = await _listener.GetContextAsync();
                try { await Reply(context); }
                catch (Exception ex)
                {
                    Console.Error.WriteLine(ex.Message);
                    context.Response.StatusCode = 500;
                }
                finally { context.Response.Close(); }
            }
        }
        catch (HttpListenerException) when (!_listener.IsListening) { }
        catch (ObjectDisposedException) { }
    }

    private async Task Reply(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;
        var path = request.Url!.AbsolutePath["/api/v3/".Length..];
        var method = request.HttpMethod;
        if (method == "GET")
        {
            var movies = new[] { new { id = 1, tmdbId = 101, monitored = MovieMonitored } };
            var shows = new[] { new { id = 2, tvdbId = 202, monitored = SeriesMonitored,
                seasons = new[] { new { seasonNumber = 1, monitored = SeasonOne }, new { seasonNumber = 2, monitored = SeasonTwo } } } };
            var episodes = new[] { new { id = 11, seasonNumber = 1, episodeFileId = Deleted.Contains(41) ? 0 : 41, monitored = EpisodeOne },
                new { id = 22, seasonNumber = 2, episodeFileId = Deleted.Contains(42) ? 0 : 42, monitored = EpisodeTwo } };
            var filmFiles = new[] { new { id = 35, movieId = 1, relativePath = "Film.mkv", size = 100L } };
            var seriesFiles = new[] { new { id = 41, seriesId = 2, relativePath = "S01/Épisode.mkv", size = 50L },
                new { id = 42, seriesId = 2, relativePath = "S02/Épisode.mkv", size = 50L } };
            object body = path switch
            {
                "movie" => movies,
                "series" => shows,
                "episode" => episodes,
                "moviefile" => filmFiles.Where(file => !Deleted.Contains(file.id)),
                "episodefile" => seriesFiles.Where(file => !Deleted.Contains(file.id)),
                "queue" => new { records = Queued ? new[] { new { movieId = 1, seriesId = 2 } } : [], totalRecords = Queued ? 1 : 0 },
                _ => throw new InvalidOperationException("Unknown read: " + path)
            };
            response.ContentType = "application/json";
            await response.OutputStream.WriteAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(body)));
            return;
        }

        if (Retained.Count == 0) throw new InvalidOperationException("Write before catalog retention");
        if (method == "PUT")
        {
            var body = (await JsonNode.ParseAsync(request.InputStream))!;
            switch (path)
            {
                case "movie/1":
                    if (!IgnoreMonitoring) MovieMonitored = body["monitored"]!.GetValue<bool>();
                    break;
                case "series/2":
                    SeriesMonitored = body["monitored"]!.GetValue<bool>();
                    SeasonOne = body["seasons"]![0]!["monitored"]!.GetValue<bool>();
                    SeasonTwo = body["seasons"]![1]!["monitored"]!.GetValue<bool>();
                    break;
                case "episode/monitor":
                    var ids = body["episodeIds"]!.AsArray().Select(id => id!.GetValue<int>()).ToArray();
                    if (ids.Contains(11)) EpisodeOne = body["monitored"]!.GetValue<bool>();
                    if (ids.Contains(22)) EpisodeTwo = body["monitored"]!.GetValue<bool>();
                    break;
                default: throw new InvalidOperationException("Unknown write: " + path);
            }
            response.StatusCode = 202;
            return;
        }

        if (method == "DELETE")
        {
            if (path == "moviefile/35" && !MovieMonitored) Deleted.Add(35);
            else if (path == "episodefile/41" && !SeasonOne && !EpisodeOne) Deleted.Add(41);
            else if (path == "episodefile/42" && !SeasonTwo && !EpisodeTwo) Deleted.Add(42);
            else throw new InvalidOperationException("Unsafe deletion: " + path);
            response.StatusCode = 204;
            return;
        }
        throw new InvalidOperationException("Unexpected method");
    }

    public void Dispose() => _listener.Close();
}
