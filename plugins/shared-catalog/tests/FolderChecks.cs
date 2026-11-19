using System.Text.Json;
using Jellyfin.Plugin.SharedCatalog;

internal static class FolderChecks
{
    public static async Task Run()
    {
        var directory = Directory.CreateTempSubdirectory("shared-catalog-folders-");
        try
        {
            await Run(Path.Combine(directory.FullName, "folders.json"));
        }
        finally
        {
            directory.Delete(recursive: true);
        }
    }

    private static async Task Run(string path)
    {
        var ct = CancellationToken.None;
        var owner = Guid.NewGuid();
        var viewer = Guid.NewGuid();
        var editor = Guid.NewGuid();
        var outsider = Guid.NewGuid();
        var movie = new FolderItem(Guid.NewGuid(), "movie", 101);
        var series = new FolderItem(Guid.NewGuid(), "tv", 101);
        var edition = new FolderItem(Guid.NewGuid(), "movie", null);
        var episode = new FolderItem(Guid.NewGuid(), "episode", null);

        bool ShareTarget(Guid id) => id == viewer || id == editor;
        FolderItem? Normal(Guid id) => new[] { movie, series, edition }.SingleOrDefault(item => item.ItemId == id);
        FolderItem? Restricted(Guid id) => id == series.ItemId ? null : Normal(id);
        var mine = new FolderCatalog(path, owner, id => id == episode.ItemId ? episode : Normal(id), ShareTarget);
        var reading = new FolderCatalog(path, viewer, Restricted, _ => false);
        var editing = new FolderCatalog(path, editor, Restricted, _ => false);
        var outside = new FolderCatalog(path, outsider, Normal, _ => true);

        var created = await mine.Create(" Automne ", ct);
        var id = created.Id;
        Require(created.Name == "Automne" && created.OwnerId == owner && created.Access == "owner", "Private folder creation");
        Require((await outside.List(ct)).Length == 0 && (await reading.List(ct)).Length == 0, "Folders are private by default");
        await Expect(() => outside.Get(id, ct), 404, "folderNotFound");
        await Expect(() => outside.Rename(id, "No", ct), 404, "folderNotFound");
        await Expect(() => outside.Share(id, [], ct), 404, "folderNotFound");
        await Expect(() => mine.Create(" ", ct), 400, "invalidFolderName");

        await mine.Add(id, movie.ItemId, ct);
        await mine.Add(id, series.ItemId, ct);
        await mine.Add(id, edition.ItemId, ct);
        await mine.Add(id, movie.ItemId, ct);
        await Expect(() => mine.Add(id, episode.ItemId, ct), 404, "itemNotFound");
        await Expect(() => mine.Add(id, Guid.Empty, ct), 404, "itemNotFound");
        Require((await mine.Get(id, ct)).Items.SequenceEqual([movie, series, edition]), "Movie and series identities and idempotent add");

        var other = await mine.Create("Favoris", ct);
        await mine.Add(other.Id, movie.ItemId, ct);
        Require((await mine.Get(other.Id, ct)).Items.SequenceEqual([movie]), "A title can belong to multiple folders");

        await mine.Share(id, [new(viewer, false), new(editor, true)], ct);
        var shared = await reading.Get(id, ct);
        Require(shared.Folder.Access == "viewer" && shared.Shares is null && shared.Items.SequenceEqual([movie, edition]), "Viewer sees only visible titles and cannot list recipients");
        Require((await reading.List(ct)).Single().Id == id && (await editing.List(ct)).Single().Access == "editor", "Shared folders are discoverable");
        Require((await mine.Get(id, ct)).Shares?.Count == 2, "Owner sees the complete grant list");
        await Expect(() => reading.Rename(id, "No", ct), 403, "folderForbidden");
        await Expect(() => reading.Add(id, movie.ItemId, ct), 403, "folderForbidden");
        await Expect(() => reading.Remove(id, movie.ItemId, ct), 403, "folderForbidden");
        await Expect(() => reading.Reorder(id, [edition.ItemId, movie.ItemId], ct), 403, "folderForbidden");
        await Expect(() => editing.Delete(id, ct), 403, "folderForbidden");
        await Expect(() => editing.Share(id, [new(outsider, true)], ct), 403, "folderForbidden");
        await Expect(() => editing.Add(id, series.ItemId, ct), 404, "itemNotFound");
        await Expect(() => editing.Remove(id, series.ItemId, ct), 404, "itemNotFound");

        await editing.Remove(id, edition.ItemId, ct);
        await editing.Add(id, edition.ItemId, ct);
        await editing.Rename(id, "Automne partagé", ct);
        await Expect(() => editing.Reorder(id, [movie.ItemId, series.ItemId], ct), 400, "invalidOrder");
        await Expect(() => editing.Reorder(id, [movie.ItemId, movie.ItemId], ct), 400, "invalidOrder");
        await editing.Reorder(id, [edition.ItemId, movie.ItemId], ct);
        var ordered = await mine.Get(id, ct);
        Require(ordered.Folder.Name == "Automne partagé" && ordered.Items.SequenceEqual([edition, series, movie]), "Reorder keeps the invisible title in its slot");

        await Expect(() => mine.Share(id, [new(owner, true)], ct), 400, "invalidShares");
        await Expect(() => mine.Share(id, [new(outsider, true)], ct), 400, "invalidShares");
        await Expect(() => mine.Share(id, [new(viewer, false), new(viewer, true)], ct), 400, "invalidShares");
        await Expect(() => mine.Share(id, [null], ct), 400, "invalidShares");
        Require((await mine.Get(id, ct)).Shares?.Count == 2, "Invalid updates preserve every grant");

        await mine.Share(id, [new(editor, false)], ct);
        await Expect(() => reading.Get(id, ct), 404, "folderNotFound");
        await Expect(() => editing.Remove(id, movie.ItemId, ct), 403, "folderForbidden");
        await mine.Remove(id, movie.ItemId, ct);
        await mine.Remove(id, movie.ItemId, ct);
        Require((await mine.Get(id, ct)).Items.SequenceEqual([edition, series]), "Removing a visible reference is idempotent");

        var create = await Task.WhenAll(Enumerable.Range(0, 12).Select(i =>
            new FolderCatalog(path, owner, Normal, ShareTarget).Create($"Concurrent {i}", ct)));
        Require(create.Select(folder => folder.Id).Distinct().Count() == 12, "Concurrent creations use distinct IDs");
        var reopened = new FolderCatalog(path, owner, Normal, ShareTarget);
        Require((await reopened.List(ct)).Length == 14 && (await reopened.Get(id, ct)).Items.SequenceEqual([edition, series]), "Concurrent writes and reopen preserve persisted data");
        await reopened.Delete(id, ct);
        await Expect(() => editing.Get(id, ct), 404, "folderNotFound");
        Require((await reopened.Get(other.Id, ct)).Items.SequenceEqual([movie]), "Folder deletion preserves other folders and titles");

        if (OperatingSystem.IsLinux())
            Require(File.GetUnixFileMode(path) == (UnixFileMode.UserRead | UnixFileMode.UserWrite), "Folder file uses private permissions");
        await File.WriteAllTextAsync(path, "{broken", ct);
        try
        {
            await mine.Create("Never overwrite corrupt data", ct);
            throw new InvalidOperationException("Expected JsonException");
        }
        catch (JsonException)
        {
            Require(await File.ReadAllTextAsync(path, ct) == "{broken", "Corrupted data must never be overwritten");
        }
        Console.WriteLine("Folder checks passed: privacy, roles, item visibility, order, grants, revocation, persistence and concurrent writes.");
    }

    private static async Task Expect(Func<Task> action, int status, string code)
    {
        try { await action(); }
        catch (FolderProblem problem) when (problem.Status == status && problem.Message == code) { return; }
        throw new InvalidOperationException("Expected folder problem: " + code);
    }

    private static void Require(bool valid, string message)
    {
        if (!valid) throw new InvalidOperationException(message);
    }
}
