using MediaBrowser.Model.Plugins;
using Jellyfin.Plugin.NativePreviews.Core;
namespace Jellyfin.Plugin.NativePreviews.Configuration;
public sealed class PluginConfiguration : BasePluginConfiguration
{
    public PreviewOptions Options { get; set; } = new();
}
