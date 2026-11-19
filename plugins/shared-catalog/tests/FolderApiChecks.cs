using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Jellyfin.Data;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.SharedCatalog;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

internal static class FolderApiChecks
{
    private const string Root = "/SharedCatalog/Folders";

    public static async Task Run()
    {
        var temporary = Directory.CreateTempSubdirectory("shared-catalog-http-");
        try
        {
            await Run(temporary.FullName);
        }
        finally
        {
            temporary.Delete(recursive: true);
        }
    }

    private static async Task Run(string directory)
    {
        var owner = new User("Owner", "fixture", "fixture");
        var recipient = new User("Recipient", "fixture", "fixture");
        var outsider = new User("Outsider", "fixture", "fixture");
        var hidden = new User("Hidden", "fixture", "fixture");
        var disabled = new User("Disabled", "fixture", "fixture");
        outsider.SetPermission(PermissionKind.IsAdministrator, true);
        hidden.SetPermission(PermissionKind.IsHidden, true);
        disabled.SetPermission(PermissionKind.IsDisabled, true);
        var accounts = new[] { owner, recipient, outsider, hidden, disabled };
        var movie = new Movie { Id = Guid.NewGuid(), Name = "Fixture film" };
        movie.ProviderIds["Tmdb"] = "123";
        var paths = FixtureProxy.Make<IApplicationPaths>((method, _) =>
            method.Name.StartsWith("get_", StringComparison.Ordinal) ? directory : throw new NotSupportedException(method.Name));
        var plugin = new Plugin(paths, FixtureProxy.Make<IXmlSerializer>((method, _) => throw new NotSupportedException(method.Name)));
        if (!Path.GetFullPath(plugin.DataFolderPath).StartsWith(directory + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            throw new InvalidOperationException("Fixture data path must stay under the test directory.");

        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services.AddAuthentication("fixture").AddScheme<AuthenticationSchemeOptions, FixtureAuthentication>("fixture", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddControllers().AddApplicationPart(typeof(CatalogController).Assembly);
        builder.Services.AddSingleton(FixtureProxy.Make<IUserManager>((method, arguments) => method.Name switch
        {
            nameof(IUserManager.GetUsers) => accounts,
            nameof(IUserManager.GetUserById) => accounts.SingleOrDefault(user => user.Id == (Guid)arguments![0]!),
            _ => throw new NotSupportedException(method.Name)
        }));
        builder.Services.AddSingleton(FixtureProxy.Make<ILibraryManager>((method, arguments) => method.Name switch
        {
            nameof(ILibraryManager.GetItemById) => (Guid)arguments![0]! == movie.Id && (Guid)arguments[1]! == owner.Id ? movie : null,
            _ => throw new NotSupportedException(method.Name)
        }));
        builder.Services.AddSingleton(FixtureProxy.Make<ISessionManager>((method, _) => throw new NotSupportedException(method.Name)));

        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();
        await app.StartAsync();
        var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        using var http = new HttpClient { BaseAddress = new Uri(address) };

        await Request(http, HttpMethod.Get, Root, null, null, HttpStatusCode.Unauthorized);
        await Request(http, HttpMethod.Get, Root, Guid.NewGuid(), null, HttpStatusCode.Forbidden);
        await Request(http, HttpMethod.Get, Root, disabled.Id, null, HttpStatusCode.Forbidden);
        var created = await Request(http, HttpMethod.Post, Root, owner.Id,
            new { name = "Automne", ownerId = outsider.Id }, HttpStatusCode.Created);
        var id = created.Body!.Value.GetProperty("id").GetGuid();
        var folder = $"{Root}/{id:D}";
        Check(created.Body.Value.GetProperty("ownerId").GetGuid() == owner.Id && created.Location == folder, "Creation takes ownership from authentication and returns its route.");
        Check(created.NoStore, "Private responses cannot be cached.");
        await Request(http, HttpMethod.Get, folder, outsider.Id, null, HttpStatusCode.NotFound);

        var targets = await Request(http, HttpMethod.Get, Root + "/ShareTargets", owner.Id, null, HttpStatusCode.OK);
        Check(targets.Body!.Value.EnumerateArray().Select(target => target.GetProperty("userId").GetGuid()).ToHashSet()
            .SetEquals([recipient.Id, outsider.Id]), "The share picker excludes the caller.");
        await Request(http, HttpMethod.Put, folder + "/Shares", owner.Id,
            new { shares = new[] { new { userId = hidden.Id, canEdit = false } } }, HttpStatusCode.BadRequest);
        await Request(http, HttpMethod.Put, folder + "/Shares", owner.Id,
            new { shares = new[] { new { userId = recipient.Id, canEdit = false } } }, HttpStatusCode.NoContent);
        var empty = await Request(http, HttpMethod.Get, folder, recipient.Id, null, HttpStatusCode.OK);
        Check(empty.Body!.Value.GetProperty("folder").GetProperty("access").GetString() == "viewer", "Recipient has read access.");
        await Request(http, HttpMethod.Patch, folder, recipient.Id, new { name = "Refused" }, HttpStatusCode.Forbidden);

        await Request(http, HttpMethod.Put, $"{folder}/Items/{movie.Id:D}", owner.Id, null, HttpStatusCode.NoContent);
        var visible = await Request(http, HttpMethod.Get, folder, owner.Id, null, HttpStatusCode.OK);
        Check(visible.Body!.Value.GetProperty("items")[0].GetProperty("tmdbId").GetInt32() == 123, "Media identities are resolved by the server.");
        var invisible = await Request(http, HttpMethod.Get, folder, recipient.Id, null, HttpStatusCode.OK);
        Check(invisible.Body!.Value.GetProperty("items").GetArrayLength() == 0, "A folder does not grant access to its media.");
        await Request(http, HttpMethod.Put, folder + "/Shares", owner.Id,
            new { shares = new[] { new { userId = recipient.Id, canEdit = true } } }, HttpStatusCode.NoContent);
        await Request(http, HttpMethod.Patch, folder, recipient.Id, new { name = "Édité" }, HttpStatusCode.NoContent);
        await Request(http, HttpMethod.Put, folder + "/Order", recipient.Id, new { itemIds = Array.Empty<Guid>() }, HttpStatusCode.NoContent);
        await Request(http, HttpMethod.Delete, folder, recipient.Id, null, HttpStatusCode.Forbidden);
        await Request(http, HttpMethod.Put, folder + "/Shares", owner.Id, new { shares = Array.Empty<object>() }, HttpStatusCode.NoContent);
        await Request(http, HttpMethod.Get, folder, recipient.Id, null, HttpStatusCode.NotFound);
        await Request(http, HttpMethod.Delete, $"{folder}/Items/{movie.Id:D}", owner.Id, null, HttpStatusCode.NoContent);
        await Request(http, HttpMethod.Delete, folder, owner.Id, null, HttpStatusCode.NoContent);
        await Request(http, HttpMethod.Get, folder, owner.Id, null, HttpStatusCode.NotFound);
        Console.WriteLine("Folder HTTP checks passed: authentication, ownership, routing, JSON, no-store and media visibility.");
    }

    private static async Task<(JsonElement? Body, string? Location, bool NoStore)> Request(
        HttpClient http, HttpMethod method, string path, Guid? actor, object? input, HttpStatusCode expected)
    {
        using var request = new HttpRequestMessage(method, path);
        if (actor is { } id) request.Headers.Add("X-Fixture-User", id.ToString("D"));
        if (input is not null) request.Content = JsonContent.Create(input);
        using var response = await http.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        Check(response.StatusCode == expected, $"{method} {path} returned {(int)response.StatusCode}, expected {(int)expected}.");
        using var json = text.Length > 0 ? JsonDocument.Parse(text) : null;
        return (json?.RootElement.Clone(), response.Headers.Location?.ToString(), response.Headers.CacheControl?.NoStore == true);
    }

    private static void Check(bool valid, string message)
    {
        if (!valid) throw new InvalidOperationException(message);
    }

    public class FixtureProxy : DispatchProxy
    {
        private Func<MethodInfo, object?[]?, object?> _run = null!;

        public static T Make<T>(Func<MethodInfo, object?[]?, object?> run) where T : class
        {
            var proxy = Create<T, FixtureProxy>();
            ((FixtureProxy)(object)proxy)._run = run;
            return proxy;
        }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => _run(targetMethod!, args);
    }

    public sealed class FixtureAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Fixture-User", out var id))
                return Task.FromResult(AuthenticateResult.NoResult());
            var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim("Jellyfin-UserId", id.ToString())], Scheme.Name));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name)));
        }
    }
}
