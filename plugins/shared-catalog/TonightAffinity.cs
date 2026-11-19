namespace Jellyfin.Plugin.SharedCatalog;

internal sealed record TonightSignal(string[] Genres, double? Rating, bool Favorite, bool Played);

internal static class TonightAffinity
{
    internal static Dictionary<string, double> Taste(IEnumerable<TonightSignal> signals)
    {
        var scores = new Dictionary<string, List<double>>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in signals)
        {
            var weight = entry.Rating switch { >= 8 => 1.2, <= 4 => -1.5, _ => 0 };
            weight += (entry.Favorite ? 0.7 : 0) + (entry.Played ? 0.2 : 0);
            if (weight == 0) continue;
            foreach (var genre in entry.Genres.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!scores.TryGetValue(genre, out var values)) scores[genre] = values = [];
                values.Add(weight);
            }
        }
        return scores.ToDictionary(part => part.Key, part => part.Value.Sum() / Math.Max(3, part.Value.Count), StringComparer.OrdinalIgnoreCase);
    }

    internal static double Preference(string[] genres, IReadOnlyDictionary<string, double> tastes) =>
        genres.Length == 0 ? 0 : genres.Average(genre => tastes.GetValueOrDefault(genre));

    internal static double Together(double first, double second, double? firstRating, double? secondRating) =>
        (first + second) / 2 + Math.Min(0, Math.Min(first, second)) * 1.5 - (firstRating is <= 4 || secondRating is <= 4 ? 2 : 0);
}
