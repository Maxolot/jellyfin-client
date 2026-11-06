using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.DependencyInjection;
using Jellyfin.Plugin.NativePreviews.Configuration;
using Jellyfin.Plugin.NativePreviews.Core;

namespace Jellyfin.Plugin.NativePreviews;

public sealed class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths paths, IXmlSerializer serializer) : base(paths, serializer) { Instance = this; }
    public static Plugin? Instance { get; private set; }
    public override string Name => "Native Previews";
    public override string Description => "Approved native scene clips, bounded generation and authenticated cached delivery.";
    public override Guid Id => Guid.Parse("14d4d2e1-8801-44df-bd61-7bb2d8ba2c8e");
    public IEnumerable<PluginPageInfo> GetPages() => [new() { Name = "NativePreviews", EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html" }];
}
public sealed class ServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection services, IServerApplicationHost applicationHost)
    {
        services.AddSingleton<PreviewRuntime>();
        services.AddHostedService(provider => provider.GetRequiredService<PreviewRuntime>());
    }
}
