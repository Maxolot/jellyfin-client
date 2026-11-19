using System.Net;
using System.Text;
using System.Text.Json;
using Jellyfin.Plugin.SharedCatalog;

internal static class RequestChecks
{
    public static async Task Run()
    {
        var owner = Guid.NewGuid();
        var fixture = new Sources(owner);
        using var http = new HttpClient(fixture);
        var sources = new RequestSources(http);
        var server = new ArrConnection("http://fixture.invalid", "simulated");
        var now = DateTimeOffset.Parse("2026-11-19T19:00:00Z", System.Globalization.CultureInfo.InvariantCulture);
        var requests = await sources.List(new("http://fixture.invalid", "simulated"), default);
        var film = requests.Single();
        Check(film.Owner == owner && film.ArrId == 8, "Seerr identities must come from its linked Jellyfin user and explicit Arr id");
        var title = await sources.Title(film, new(server.Url, server.ApiKey), default);
        var empty = new RequestLibrary(null, null, []);
        async Task<RequestArr> ReadArr() => await sources.Observe(film, server, await sources.Queue(server, false, default), default);
        var first = RequestProgress.Calculate(film, title, empty, await ReadArr(), true, null, now);
        Check(first.Snapshot.Stage == "downloading" && first.Snapshot.EtaFrom is null, "No ETA before a measurable sample");
        fixture.Remaining = 800_000_000;
        var fast = RequestProgress.Calculate(film, title, empty, await ReadArr(), true, first.Measurement, now.AddSeconds(25));
        Check(fast.Snapshot is { Percent: 20, BytesPerSecond: 8_000_000 } && fast.Snapshot.EtaTo > fast.Snapshot.EtaFrom, "A fast transfer has a measured range");
        fixture.Remaining = 990_000_000;
        var slow = RequestProgress.Calculate(film, title, empty, await ReadArr(), true, first.Measurement, now.AddSeconds(25));
        Check(slow.Snapshot.EtaFrom > fast.Snapshot.EtaFrom, "A slow transfer arrives later");
        var stalled = RequestProgress.Calculate(film, title, empty, await ReadArr(), true, slow.Measurement, now.AddMinutes(16));
        Check(stalled.Snapshot is { Stage: "blocked", Reason: "stalled", EtaFrom: null }, "An idle download must not keep its ETA");
        var vpn = await sources.Vpn(server.Url + "/health", default);
        var cutoff = RequestProgress.Calculate(film, title, empty, await ReadArr(), vpn, fast.Measurement, now);
        Check(cutoff.Snapshot is { Stage: "blocked", Reason: "vpn", EtaFrom: null }, "VPN failure suppresses ETA");
        fixture.Stage = "importBlocked";
        var import = RequestProgress.Calculate(film, title, empty, await ReadArr(), true, null, now).Snapshot;
        Check(import is { Stage: "blocked", Reason: "importFailed" } && !JsonSerializer.Serialize(import).Contains("/private/", StringComparison.Ordinal),
            "Import errors are classified without copying private Queue information");
        fixture.Queued = false;
        var search = RequestProgress.Calculate(film, title, empty, await ReadArr(), true, null, now).Snapshot;
        Check(search is { Stage: "blocked", Reason: "noSource", EtaFrom: null }, "Known empty queues past the threshold are explicit");
        fixture.History = "downloadFolderImported";
        Check(RequestProgress.Calculate(film, title, empty, await ReadArr(), true, null, now).Snapshot.Stage == "library", "Arr history confirms import");
        Check(RequestProgress.Calculate(film, title, new(Guid.NewGuid(), null, []), await ReadArr(), true, null, now).Snapshot.Stage == "available",
            "A local item wins over Seerr scanning lag");
        var show = film with { Type = "tv", Seasons = [1, 2], MediaStatus = 4 };
        var episodes = new RequestArr([], [new(1, 1), new(1, 2), new(2, 1)], null, true);
        var local = new RequestLibrary(Guid.NewGuid(), "Série fixture", [new(1, 1)]);
        var partial = RequestProgress.Calculate(show, title, local, episodes, true, null, now).Snapshot;
        Check(partial.Active && partial.Seasons is [{ Number: 1, Available: 1, Total: 2 }, { Number: 2, Available: 0, Total: 1 }],
            "Season progress includes available episode numbers and verified totals");
        Console.WriteLine("Request checks passed: Seerr, Arr/qBittorrent queue, ETA, stalled, empty, import, VPN and seasons.");
    }

    private static void Check(bool result, string message)
    {
        if (!result) throw new InvalidOperationException(message);
    }

    private sealed class Sources(Guid owner) : HttpMessageHandler
    {
        public long Remaining { get; set; } = 1_000_000_000;
        public string Stage { get; set; } = "downloading";
        public string? History { get; set; }
        public bool Queued { get; set; } = true;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri?.AbsolutePath;
            var data = path switch
            {
                "/api/v1/request" => JsonSerializer.Serialize(new { results = new[] { new
                {
                    id = 27, type = "movie", status = 2, updatedAt = "2026-11-19T14:00:00Z",
                    requestedBy = new { jellyfinUserId = owner.ToString("N") },
                    media = new { tmdbId = 41, externalServiceId = 8, status = 3 }
                } } }),
                "/api/v1/movie/41" => """{"title":"Cinéma fixture","posterPath":"/poster.jpg"}""",
                "/api/v3/movie/8" => """{"id":8,"tmdbId":41}""",
                "/api/v3/queue" when Queued => JsonSerializer.Serialize(new { totalRecords = 1, records = new[] { new
                {
                    id = 1, movieId = 8, size = 1_000_000_000, sizeleft = Remaining, status = "downloading", trackedDownloadState = Stage,
                    downloadId = "transfer", outputPath = "/private/source", statusMessages = new[] { "Matched by ID: /private/source" }
                } } }),
                "/api/v3/queue" => """{"totalRecords":0,"records":[]}""",
                "/api/v3/history" when History is not null => JsonSerializer.Serialize(new { records = new[] { new { movieId = 8, date = "2026-11-19T17:00:00Z", eventType = History } } }),
                _ => """{"records":[]}"""
            };
            return Task.FromResult(new HttpResponseMessage(path == "/health" ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK)
            {
                Content = new StringContent(data, Encoding.UTF8, "application/json")
            });
        }
    }
}
