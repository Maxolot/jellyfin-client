using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SharedCatalog;

internal static class NtfyAdminAlerts
{
    private static readonly HttpClient Http = new(new SocketsHttpHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(10)
    };
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    internal static async Task Send(string directory, IReadOnlyList<RequestNotification> alerts, ILogger logger, CancellationToken ct)
    {
        var settings = await GetSettings(directory, logger, ct);
        if (settings is not { Enabled: true } || string.IsNullOrWhiteSpace(settings.Token)
            || !Uri.TryCreate(settings.Url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https")
            || uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0) return;
        foreach (var alert in alerts.Where(row => row.Reason is "stalled" or "noSource" or "importFailed" or "transferMissing").Take(10))
        {
            try
            {
                using var message = new HttpRequestMessage(HttpMethod.Post, settings.Url.TrimEnd('/') + "/media-stack");
                message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.Token);
                message.Headers.Add("Title", "Demande Jellyfin bloquee");
                message.Headers.Add("Priority", "4");
                message.Headers.Add("Tags", "warning");
                if (Uri.TryCreate(settings.ClickUrl, UriKind.Absolute, out var click) && click.Scheme is "https" or "http")
                    message.Headers.Add("Click", click.ToString());
                message.Content = new StringContent(Body(alert), Encoding.UTF8, "text/plain");
                using var response = await Http.SendAsync(message, ct);
                if (!response.IsSuccessStatusCode)
                    logger.LogWarning("Shared Catalog notification refused by ntfy (HTTP {Status}).", (int)response.StatusCode);
            }
            catch (Exception exception) when (exception is HttpRequestException or FormatException || exception is OperationCanceledException && !ct.IsCancellationRequested)
            {
                logger.LogWarning("Shared Catalog could not send an admin alert ({ErrorType}).", exception.GetType().Name);
            }
        }
    }

    private static string Body(RequestNotification alert)
    {
        var reason = alert.Reason switch
        {
            "noSource" => "Aucune source trouvée.",
            "importFailed" => "Import en échec.",
            "transferMissing" => "Le transfert a disparu de la file.",
            _ => "Téléchargement bloqué."
        };
        return $"{alert.Title}\n{reason}";
    }

    private static async Task<Settings?> GetSettings(string directory, ILogger logger, CancellationToken ct)
    {
        try
        {
            var path = Path.Combine(directory, "notify.json");
            if (!File.Exists(path)) return null;
            await using var data = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<Settings>(data, Json, ct);
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            logger.LogWarning("Shared Catalog could not read admin notification settings ({ErrorType}).", exception.GetType().Name);
            return null;
        }
    }

    private sealed record Settings(bool Enabled, string Url, string Token, string? ClickUrl);
}
