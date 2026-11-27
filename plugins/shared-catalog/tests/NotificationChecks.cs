using Jellyfin.Plugin.SharedCatalog;

internal static class NotificationChecks
{
    internal static async Task Run(NotificationStore store, Guid owner, Guid other)
    {
        var now = DateTimeOffset.UtcNow;
        var request = new RequestSnapshot(731, "tv", 41, "Série fixture", "/fixture.jpg", false, "requested", null, now, null,
            [new(2, 0, 4, [])], null, null, null, null, null, true);
        var ct = CancellationToken.None;
        await store.Capture([(owner, request)], ct);
        Check((await store.Read(owner, ct)).Length == 0, "A pending request has no approval notification");
        var download = request with { Stage = "downloading" };
        await store.Capture([(owner, download)], ct);
        await store.Capture([(owner, download)], ct);
        var approval = await store.Read(owner, ct);
        Check(approval.Length == 2 && approval.Select(row => row.Event).Order().SequenceEqual(["approved", "downloading"]),
            "Approval and download events are emitted exactly once");
        Check((await store.Read(other, ct)).Length == 0 && await store.Mark(other, [approval[0].Id], ct) == 0,
            "Another user cannot inspect or mark these entries");
        Check(await store.Mark(owner, [approval[0].Id], ct) == 1 && await store.Mark(owner, [approval[0].Id], ct) == 0, "Read state is idempotent");
        var sampled = download with { EtaFrom = now.AddMinutes(10), EtaTo = now.AddMinutes(20) };
        await store.Capture([(owner, sampled)], ct);
        Check((await store.Read(owner, ct)).Single(row => row.Event == "downloading").EtaTo == sampled.EtaTo, "An ETA is added after a measured sample");
        await store.Capture([(owner, download with { Seasons = [new(2, 2, 4, [1, 2])] })], ct);
        Check((await store.Read(owner, ct)).Single(row => row.Event == "episodes") is { Season: 2, Episodes: 2 },
            "A new group of episodes notifies without duplicating availability");
        await store.Capture([(owner, download with { Stage = "blocked", Reason = "importFailed" })], ct);
        Check((await store.Read(owner, ct)).Single(row => row.Event == "blocked").Reason == "importFailed", "Block reason is preserved");
        Check(!NotificationStore.Events(download with { Updated = now.AddDays(-30) }, null, now).Any(),
            "Historical requests do not generate a burst on first run");
        Console.WriteLine("Notification checks passed: account scope, deduplication, read state, ETA and new episodes.");
    }

    private static void Check(bool result, string message)
    {
        if (!result) throw new InvalidOperationException(message);
    }
}
