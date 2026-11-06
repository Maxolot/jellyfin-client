using System.Net;
using Jellyfin.Plugin.MovieSources;
var handler = new Stub();
using var client = new HttpClient(handler);
var root = new Uri("http://localhost:9999/base/");
async Task<bool> Search() => (await ProwlarrSearch.Query(client, root, "fixture", "tt1234567", CancellationToken.None)).Found;
handler.Body = "[{\"title\":\"sample\"}]";
if (!await Search()) throw new Exception("Expected a result");
if (handler.Path != "/base/api/v1/search?type=movie&categories=2000&query=%7BImdbId%3Att1234567%7D" || handler.Header != "fixture") throw new Exception("Incorrect query or authentication header");
handler.Body = "[]";
if (await Search()) throw new Exception("Expected empty result");
handler.Body = "{}";
try { await Search(); throw new Exception("Accepted invalid body"); } catch (System.Text.Json.JsonException) { }
handler.Code = HttpStatusCode.Unauthorized;
try { await Search(); throw new Exception("Accepted error response"); } catch (HttpRequestException) { }
handler.Code = HttpStatusCode.OK;
handler.Body = "[{\"title\":\"sample S01\"}]";
if (!(await ProwlarrSearch.QuerySeason(client, root, "fixture", "tt1234567", 2, CancellationToken.None)).Found) throw new Exception("Expected a season result");
if (handler.Path != "/base/api/v1/search?type=tvsearch&categories=5000&query=%7BImdbId%3Att1234567%7D%7BSeason%3A2%7D" || handler.Header != "fixture") throw new Exception("Incorrect season query");
handler.Body = "[]";
if ((await ProwlarrSearch.QuerySeason(client, root, "fixture", "tt1234567", 3, CancellationToken.None)).Found) throw new Exception("Expected empty season");
string Tags(string title) => string.Join(",", ProwlarrSearch.Languages(title).OrderBy(tag => tag));
if (Tags("Show.S04.MULTi.1080p.WEB.H264-GRP") != "multi") throw new Exception("MULTi");
if (Tags("Show.S04.TRUEFRENCH.1080p") != "vf" || Tags("Show.S04.VFF.1080p") != "vf") throw new Exception("VF");
if (Tags("Show.S04.VOSTFR.1080p") != "vostfr" || Tags("Show.S04.SUBFRENCH.720p") != "vostfr") throw new Exception("VOSTFR");
if (Tags("Show.S04.MULTi.VFF.VOSTFR.2160p") != "multi,vf,vostfr") throw new Exception("combined");
if (Tags("Show.S04.1080p.WEB-DL") != "" || Tags("Frenchie.S01.1080p") != "") throw new Exception("false positive");
handler.Body = "[{\"title\":\"Show.S04.MULTi.1080p\"},{\"title\":\"Show.S04.VOSTFR.720p\"}]";
if (string.Join(",", (await ProwlarrSearch.QuerySeason(client, root, "fixture", "tt1234567", 4, CancellationToken.None)).Languages) != "multi,vostfr") throw new Exception("languages of a search");
Console.WriteLine("Prowlarr search: 13 checks passed");
sealed class Stub : HttpMessageHandler
{
    public string Body { get; set; } = "[]";
    public HttpStatusCode Code { get; set; } = HttpStatusCode.OK;
    public string? Path { get; private set; }
    public string? Header { get; private set; }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Path = request.RequestUri?.PathAndQuery;
        Header = request.Headers.TryGetValues("X-Api-Key", out var values) ? values.Single() : null;
        return Task.FromResult(new HttpResponseMessage(Code) { Content = new StringContent(Body) });
    }
}
