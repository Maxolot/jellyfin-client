using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.SharedCatalog;

public sealed class Plugin : BasePlugin<BasePluginConfiguration>
{
    public Plugin(IApplicationPaths paths, IXmlSerializer serializer) : base(paths, serializer)
    {
        Instance = this;
    }

    internal static Plugin? Instance { get; private set; }
    public override string Name => "Shared Catalog";
    public override string Description => "Keeps shared film and series entries independently of their media files.";
    public override Guid Id => new("d63d5a26-fbd6-4167-8ffb-426199825b06");
}

public sealed class RequestServiceRegistrator : MediaBrowser.Controller.Plugins.IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection services, MediaBrowser.Controller.IServerApplicationHost applicationHost)
    {
        services.AddSingleton<RequestRuntime>();
        services.AddHostedService(provider => provider.GetRequiredService<RequestRuntime>());
    }
}
