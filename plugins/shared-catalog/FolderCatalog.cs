using System.Text.Json;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.SharedCatalog;

internal sealed record FolderItem(Guid? ItemId, string Type, int? TmdbId, DateTimeOffset? AddedAt = null, bool Followed = false)
{
    [JsonIgnore]
    internal FollowedTitle? Provider => TmdbId is > 0 ? new(Type, TmdbId.Value) : null;

    [JsonIgnore]
    internal string Key => Followed && Provider is { } followed ? followed.Key : ItemId?.ToString("N") ?? "";
}
internal sealed record FolderShare(Guid UserId, bool CanEdit);
internal sealed record FolderSummary(Guid Id, string Name, Guid OwnerId, string Access);
internal sealed record FolderDetails(FolderSummary Folder, IReadOnlyList<FolderItem> Items, IReadOnlyList<FolderShare>? Shares);
internal sealed record SavedFolder(Guid Id, string Name, Guid OwnerId, List<FolderItem> Items, List<FolderShare> Shares);
internal sealed class FolderProblem(int status, string code) : Exception(code)
{
    public int Status { get; } = status;
}

internal sealed class FolderCatalog(string path, Guid actor, Func<Guid, FolderItem?> resolveItem, Func<Guid, bool> canShareWith,
    IReadOnlySet<FollowedTitle>? followed = null,
    Func<IReadOnlyCollection<FollowedTitle>, Dictionary<FollowedTitle, Guid>>? resolveFollowed = null)
{
    private const int MaxFolders = 1000;
    private const int MaxOwned = 100;
    internal const int MaxItems = 500;
    internal const int MaxShares = 50;
    internal const int MaxNameLength = 120;

    private static readonly SemaphoreSlim Gate = new(1);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        RespectRequiredConstructorParameters = true,
        RespectNullableAnnotations = true
    };

    public Task<FolderSummary[]> List(CancellationToken ct) => Read(folders => folders
        .Select(Summarize)
        .Where(folder => folder is not null)
        .Select(folder => folder!)
        .OrderBy(folder => folder.Name, StringComparer.OrdinalIgnoreCase)
        .ThenBy(folder => folder.Id)
        .ToArray(), ct);

    public Task<FolderDetails> Get(Guid id, CancellationToken ct) => Edit(folders =>
    {
        var (folder, summary) = Find(folders, id);
        var visible = Visible(folder.Items).ToArray();
        var changed = false;
        if (summary.Access != "viewer")
        {
            foreach (var (index, item) in visible)
            {
                if (!item.Followed || !item.ItemId.HasValue || folder.Items[index].ItemId.HasValue) continue;
                // Save the first real link; the provider remains the stable key and allows read access per viewer.
                folder.Items[index] = item;
                changed = true;
            }
        }
        var details = new FolderDetails(summary, visible.Select(entry => entry.Item).ToArray(),
            summary.Access == "owner" ? folder.Shares.ToArray() : null);
        return (changed, details);
    }, ct);

    public Task<FolderSummary> Create(string? name, CancellationToken ct) => Edit(folders =>
    {
        var title = NormalizeName(name);
        if (folders.Count >= MaxFolders || folders.Count(folder => folder.OwnerId == actor) >= MaxOwned)
            throw new FolderProblem(409, "folderLimit");
        var folder = new SavedFolder(Guid.NewGuid(), title, actor, [], []);
        folders.Add(folder);
        return (true, Summarize(folder)!);
    }, ct);

    public Task Rename(Guid id, string? name, CancellationToken ct) => Edit(folders =>
    {
        var folder = Require(folders, id);
        var title = NormalizeName(name);
        if (folder.Name == title) return (false, false);
        folders[folders.IndexOf(folder)] = folder with { Name = title };
        return (true, true);
    }, ct);

    public Task Delete(Guid id, CancellationToken ct) => Edit(folders =>
        (folders.Remove(Require(folders, id, ownerOnly: true)), true), ct);

    public Task Add(Guid id, Guid? itemId, CancellationToken ct) => Edit(folders =>
    {
        var folder = Require(folders, id);
        var item = RequireLocal(itemId);
        return (AddMember(folder, item), true);
    }, ct);

    public Task AddFollowed(Guid folderId, FollowedTitle title, CancellationToken ct) => Edit(folders =>
    {
        var folder = Require(folders, folderId);
        return (AddMember(folder, RequireFollowed(title)), true);
    }, ct);

    public Task<Dictionary<string, DateTimeOffset?>> Filed(CancellationToken ct) => Read(folders => Visible(folders
        .Where(folder => folder.OwnerId == actor).SelectMany(folder => folder.Items).ToList())
        .Select(entry => entry.Item)
        .GroupBy(item => item.ItemId?.ToString("N") ?? item.Key)
        .ToDictionary(group => group.Key, group => group.Min(item => item.AddedAt)), ct);

    public Task<Guid> SaveForLater(Guid itemId, CancellationToken ct) =>
        SaveForLater(() => RequireLocal(itemId), ct);

    public Task<Guid> SaveForLater(FollowedTitle title, CancellationToken ct) =>
        SaveForLater(() => RequireFollowed(title), ct);

    private Task<Guid> SaveForLater(Func<FolderItem> resolve, CancellationToken ct) => Edit(folders =>
    {
        var item = resolve();
        const string name = "À voir plus tard";
        var folder = folders.Find(candidate => candidate.OwnerId == actor && string.Equals(candidate.Name, name, StringComparison.OrdinalIgnoreCase));
        if (folder is null)
        {
            if (folders.Count >= MaxFolders || folders.Count(candidate => candidate.OwnerId == actor) >= MaxOwned)
                throw new FolderProblem(409, "folderLimit");
            folder = new SavedFolder(Guid.NewGuid(), name, actor, [], []);
            folders.Add(folder);
        }
        return (AddMember(folder, item), folder.Id);
    }, ct);

    private FolderItem RequireLocal(Guid? itemId)
    {
        var item = itemId is { } id && id != Guid.Empty ? resolveItem(id) : null;
        if (item is null || item.ItemId != itemId || item.Type is not ("movie" or "tv"))
            throw new FolderProblem(404, "itemNotFound");
        return item;
    }

    private FolderItem RequireFollowed(FollowedTitle title) =>
        title.Valid && followed?.Contains(title) == true ? new(null, title.Type, title.TmdbId, Followed: true)
            : throw new FolderProblem(404, "itemNotFound");

    private bool AddMember(SavedFolder folder, FolderItem item)
    {
        if (folder.Items.Any(existing => existing.Key == item.Key)) return false;
        if (item.Provider is { } provider)
        {
            if (item.Followed && folder.Items.Any(existing => !existing.Followed && existing.Provider == provider
                && existing.ItemId is { } id && resolveItem(id) is not null)) return false;
            var index = folder.Items.FindIndex(existing => existing.Followed && existing.Provider == provider);
            if (!item.Followed && index >= 0)
            {
                folder.Items[index] = folder.Items[index] with { ItemId = item.ItemId };
                return true;
            }
        }
        if (folder.Items.Count >= MaxItems) throw new FolderProblem(409, "itemLimit");
        folder.Items.Add(item with { AddedAt = DateTimeOffset.UtcNow });
        return true;
    }

    public Task Remove(Guid id, Guid? itemId, CancellationToken ct) => Edit(folders =>
    {
        var folder = Require(folders, id);
        var item = RequireLocal(itemId);
        return (folder.Items.RemoveAll(entry => entry.Key == item.Key || entry.Followed && entry.ItemId == itemId) > 0, true);
    }, ct);

    public Task RemoveFollowed(Guid id, FollowedTitle title, CancellationToken ct) => Edit(folders =>
    {
        var folder = Require(folders, id);
        return (folder.Items.RemoveAll(item => item.Followed && item.Provider == title) > 0, true);
    }, ct);

    public Task Reorder(Guid id, IReadOnlyList<Guid>? itemIds, CancellationToken ct) =>
        Reorder(id, itemIds?.Select(item => item.ToString("N")).ToArray(), false, ct);

    public Task ReorderFollowed(Guid id, IReadOnlyList<string>? keys, CancellationToken ct) =>
        Reorder(id, keys, true, ct);

    private Task Reorder(Guid id, IReadOnlyList<string>? keys, bool includeFollowed, CancellationToken ct) => Edit(folders =>
    {
        var folder = Require(folders, id);
        var slots = Visible(folder.Items).Where(entry => includeFollowed || !entry.Item.Followed).ToArray();
        var visible = slots.ToDictionary(entry => entry.Item.Key, entry => folder.Items[entry.Index]);
        if (keys is null || keys.Count != slots.Length || keys.Distinct().Count() != keys.Count || !keys.All(visible.ContainsKey))
            throw new FolderProblem(400, "invalidOrder");
        if (slots.Select(entry => entry.Item.Key).SequenceEqual(keys)) return (false, false);
        for (var i = 0; i < slots.Length; i++)
            folder.Items[slots[i].Index] = visible[keys[i]];
        return (true, true);
    }, ct);

    private IEnumerable<(int Index, FolderItem Item)> Visible(List<FolderItem> items)
    {
        var existing = items.Select((item, index) => (Index: index, Item: item))
            .Where(entry => (!entry.Item.Followed || followed is null) && entry.Item.ItemId is { } id && resolveItem(id) is not null)
            .ToDictionary(entry => entry.Index, entry => entry.Item with { Followed = false });
        var localProviders = existing.Values.Select(item => item.Provider).OfType<FollowedTitle>().ToHashSet();
        var external = items.Where(item => item.Followed).Select(item => item.Provider).OfType<FollowedTitle>()
            .Where(key => !localProviders.Contains(key)).Distinct().ToArray();
        var matches = external.Length == 0 ? [] : resolveFollowed?.Invoke(external) ?? [];
        for (var i = 0; i < items.Count; i++)
        {
            if (existing.TryGetValue(i, out var local))
            {
                yield return (i, local);
                continue;
            }
            var item = items[i];
            if (followed is not null && item.Followed && item.Provider is { } provider && !localProviders.Contains(provider))
            {
                if (item.ItemId is { } pinned && resolveItem(pinned)?.Provider == provider) yield return (i, item);
                else if (matches.TryGetValue(provider, out var id)) yield return (i, item with { ItemId = id });
                else if (followed?.Contains(provider) == true) yield return (i, item with { ItemId = null });
            }
        }
    }

    public Task Share(Guid id, IReadOnlyList<FolderShare?>? shares, CancellationToken ct) => Edit(folders =>
    {
        var folder = Require(folders, id, ownerOnly: true);
        if (shares is null || shares.Count > MaxShares) throw new FolderProblem(400, "invalidShares");
        var ids = new HashSet<Guid>();
        var previous = folder.Shares.Select(share => share.UserId).ToHashSet();
        var next = new List<FolderShare>();
        foreach (var share in shares)
        {
            // A recipient who was made hidden later can be retained or revoked by the owner.
            if (share is null || share.UserId == Guid.Empty || share.UserId == actor || !ids.Add(share.UserId)
                || (!previous.Contains(share.UserId) && !canShareWith(share.UserId)))
                throw new FolderProblem(400, "invalidShares");
            next.Add(share);
        }
        if (folder.Shares.SequenceEqual(next)) return (false, false);
        folders[folders.IndexOf(folder)] = folder with { Shares = next };
        return (true, true);
    }, ct);

    private (SavedFolder Folder, FolderSummary Summary) Find(List<SavedFolder> folders, Guid id)
    {
        var folder = folders.Find(entry => entry.Id == id);
        if (folder is null || Summarize(folder) is not { } summary)
            throw new FolderProblem(404, "folderNotFound");
        return (folder, summary);
    }

    private SavedFolder Require(List<SavedFolder> folders, Guid id, bool ownerOnly = false)
    {
        var (folder, summary) = Find(folders, id);
        if (summary.Access == "viewer" || (ownerOnly && summary.Access != "owner"))
            throw new FolderProblem(403, "folderForbidden");
        return folder;
    }

    private FolderSummary? Summarize(SavedFolder folder)
    {
        if (folder.OwnerId == actor) return new(folder.Id, folder.Name, folder.OwnerId, "owner");
        var share = folder.Shares.Find(entry => entry.UserId == actor);
        return share is null ? null : new(folder.Id, folder.Name, folder.OwnerId, share.CanEdit ? "editor" : "viewer");
    }

    private static string NormalizeName(string? name)
    {
        var value = name?.Trim();
        if (string.IsNullOrEmpty(value) || value.Length > MaxNameLength || value.Any(char.IsControl))
            throw new FolderProblem(400, "invalidFolderName");
        return value;
    }

    private Task<T> Read<T>(Func<List<SavedFolder>, T> read, CancellationToken ct) =>
        Edit(folders => (false, read(folders)), ct);

    private async Task<T> Edit<T>(Func<List<SavedFolder>, (bool Changed, T Result)> operation, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var folders = await Load(ct);
            var (changed, result) = operation(folders);
            if (changed) await Save(folders, ct);
            return result;
        }
        finally
        {
            Gate.Release();
        }
    }

    private async Task<List<SavedFolder>> Load(CancellationToken ct)
    {
        FileStream stream;
        try
        {
            stream = File.OpenRead(path);
        }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException)
        {
            return [];
        }

        await using (stream)
            return await JsonSerializer.DeserializeAsync<List<SavedFolder>>(stream, Json, ct)
                ?? throw new JsonException("Missing folder list.");
    }

    private async Task Save(List<SavedFolder> folders, CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = $"{path}.{Guid.NewGuid():N}.tmp";
        var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Options = FileOptions.Asynchronous };
        if (!OperatingSystem.IsWindows())
            options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
        try
        {
            await using (var stream = new FileStream(temporary, options))
                await JsonSerializer.SerializeAsync(stream, folders, Json, ct);
            ct.ThrowIfCancellationRequested();
            File.Move(temporary, path, overwrite: true);
        }
        finally
        {
            File.Delete(temporary);
        }
    }
}
