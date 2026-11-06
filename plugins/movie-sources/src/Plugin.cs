using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
namespace Jellyfin.Plugin.MovieSources;
public sealed class MovieSourcesConfiguration : BasePluginConfiguration
{
    public bool Enabled { get; set; }
    public string Address { get; set; } = "";
    public string ApiKey { get; set; } = "";
}
public sealed class Plugin : BasePlugin<MovieSourcesConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths paths, IXmlSerializer serializer) : base(paths, serializer) { Instance = this; }
    public static Plugin? Instance { get; private set; }
    public override string Name => "Movie Sources";
    public override string Description => "Optional film source availability through Prowlarr.";
    public override Guid Id => Guid.Parse("894c6e88-9250-4627-9d43-f45da80f30eb");
    public IEnumerable<PluginPageInfo> GetPages() => [new() { Name = "MovieSources", EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html" }];
}
