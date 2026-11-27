namespace Jellyfin.Plugin.SharedCatalog;

internal sealed record SeerrRequest(int Id, string Type, int Tmdb, int Tvdb, int ArrId, Guid? Owner,
    bool Ultra, int Status, int MediaStatus, DateTimeOffset Updated, int[] Seasons,
    DateTimeOffset? Created = null, RequestTransfer[]? Transfers = null);
internal sealed record RequestTitle(string Name, string? Poster);
internal sealed record RequestTransfer(string Id, long Size, long Remaining, string Status, string State, bool ImportFailed, int? Season, TimeSpan? TimeLeft = null, DateTimeOffset? ExpectedAt = null);
internal sealed record RequestEpisode(int Season, int Number);
internal sealed record RequestLibrary(Guid? ItemId, string? Title, RequestEpisode[] Episodes);
internal sealed record RequestSeason(int Number, int Available, int? Total, int[] Episodes);
internal sealed record RequestArr(RequestTransfer[] Queue, RequestEpisode[] Episodes, string? History, bool Known);
internal sealed record RequestMeasurement(DateTimeOffset At, DateTimeOffset LastProgress, string Jobs, long Remaining, double Rate);
internal sealed record RequestSnapshot(int Id, string Type, int Tmdb, string Title, string? Poster, bool Ultra, string Stage, string? Reason,
    DateTimeOffset Updated, Guid? ItemId, RequestSeason[] Seasons, int? Percent, long? BytesRemaining, long? BytesPerSecond,
    DateTimeOffset? EtaFrom, DateTimeOffset? EtaTo, bool Active);

internal static class RequestProgress
{
    internal static (RequestSnapshot Snapshot, RequestMeasurement? Measurement) Calculate(
        SeerrRequest request, RequestTitle title, RequestLibrary library, RequestArr arr, bool? vpnHealthy,
        RequestMeasurement? previous, DateTimeOffset now)
    {
        var seasons = Seasons(request.Seasons, library.Episodes, arr.Episodes);
        var jobs = arr.Queue.Where(job => request.Type == "movie" || job.Season is { } season && request.Seasons.Contains(season))
            .GroupBy(job => job.Id).Select(group => group.First()).OrderBy(job => job.Id, StringComparer.Ordinal).ToArray();
        var size = jobs.Sum(job => Math.Max(job.Size, 0));
        var remaining = jobs.Sum(job => Math.Clamp(job.Remaining, 0, Math.Max(job.Size, 0)));
        var measurement = Measure(jobs, remaining, previous, now);
        var available = Available(request, library, seasons);
        var (stage, reason) = Stage(request, arr, jobs, measurement, available, vpnHealthy, now);
        var active = stage is not ("available" or "declined" or "failed" or "removed" or "partial");
        var percent = size > 0 ? (int)Math.Round(100d * (size - remaining) / size) : (int?)null;
        var rate = measurement?.Rate > 0 ? (long?)Math.Round(measurement.Rate) : null;
        var (from, to) = Estimate(stage, reason, remaining, rate, jobs, now);
        return (new(request.Id, request.Type, request.Tmdb, title.Name, title.Poster, request.Ultra, stage, reason, request.Updated,
            library.ItemId, seasons, percent, size > 0 ? remaining : null, rate, from, to, active), measurement);
    }

    private static RequestSeason[] Seasons(int[] requested, RequestEpisode[] local, RequestEpisode[] expected) =>
        requested.Distinct().Order().Select(season =>
        {
            var available = local.Where(episode => episode.Season == season).Select(episode => episode.Number).Distinct().Order().ToArray();
            var total = expected.Where(episode => episode.Season == season).Select(episode => episode.Number).Distinct().Count();
            return new RequestSeason(season, available.Length, total > 0 ? Math.Max(total, available.Length) : null, available);
        }).ToArray();

    private static bool Available(SeerrRequest request, RequestLibrary library, RequestSeason[] seasons)
    {
        if (library.ItemId is null || request.Ultra && request.MediaStatus != 5) return false;
        if (request.Type == "movie") return true;
        return seasons.Length > 0 && seasons.All(season => season.Total is { } total ? season.Available >= total : season.Available > 0 && request.MediaStatus == 5);
    }

    private static RequestMeasurement? Measure(RequestTransfer[] jobs, long remaining, RequestMeasurement? old, DateTimeOffset now)
    {
        if (jobs.Length == 0) return null;
        var keys = string.Join('|', jobs.Select(job => job.Id));
        if (old is null || old.Jobs != keys || remaining > old.Remaining) return new(now, now, keys, remaining, 0);
        var seconds = (now - old.At).TotalSeconds;
        if (seconds < 1) return old;
        var bytes = old.Remaining - remaining;
        var sample = bytes / seconds;
        var rate = old.Rate > 0 ? old.Rate * 0.65 + sample * 0.35 : sample;
        if (now - old.LastProgress > TimeSpan.FromSeconds(75) && bytes == 0) rate = 0;
        return new(now, bytes > 0 ? now : old.LastProgress, keys, remaining, rate);
    }

    private static (string, string?) Stage(SeerrRequest request, RequestArr arr, RequestTransfer[] jobs, RequestMeasurement? sample,
        bool available, bool? vpnHealthy, DateTimeOffset now)
    {
        if (request.Status == 3) return ("declined", null);
        if (available) return ("available", null);
        if (request.Status == 1) return ("requested", null);
        if (jobs.Any(job => job.ImportFailed)) return ("blocked", "importFailed");
        if (request.Status == 4) return ("failed", null);
        // Seerr already closed the request, or the media left the server: no download queue to watch.
        if (request.MediaStatus == 7) return ("removed", null);
        if (request.Status == 5 && !arr.Known) return (request.MediaStatus == 4 ? "partial" : "library", null);
        if (jobs.Any(job => job.State is "importPending" or "importing" or "importBlocked" || job.Status == "completed"))
            return ("import", null);
        if (arr.History == "import" && jobs.Length == 0 || request.MediaStatus == 5) return ("library", null);
        if (vpnHealthy == false) return ("blocked", "vpn");
        if (sample is not null && now - sample.LastProgress >= TimeSpan.FromMinutes(15))
            return ("blocked", "stalled");
        if (jobs.Any(job => job.Status is "downloading" or "paused"))
            return ("downloading", sample?.Rate > 0 ? null : "waitingForSpeed");
        if (now - request.Updated < TimeSpan.FromSeconds(60)) return ("approved", null);
        if (arr.Known && jobs.Length == 0 && now - request.Updated > TimeSpan.FromHours(2))
            return ("blocked", arr.History == "grab" ? "transferMissing" : "noSource");
        return ("searching", arr.Known ? null : "trackingUnavailable");
    }

    private static (DateTimeOffset?, DateTimeOffset?) Estimate(string stage, string? reason, long left, long? rate, RequestTransfer[] jobs, DateTimeOffset now)
    {
        if (stage != "downloading" || reason is not null || rate is null or <= 0 || left <= 0) return (null, null);
        var seconds = (double)left / rate.Value;
        if (seconds > TimeSpan.FromDays(7).TotalSeconds) return (null, null);
        var arrSeconds = jobs.Select(job => job.ExpectedAt is { } arrival ? (arrival - now).TotalSeconds : job.TimeLeft?.TotalSeconds)
            .Where(value => value > seconds * 0.5 && value < seconds * 2).DefaultIfEmpty().Max();
        return (now.AddSeconds(seconds * 0.85 + 120), now.AddSeconds(Math.Max(seconds * 1.35, arrSeconds ?? 0) + 600));
    }
}
