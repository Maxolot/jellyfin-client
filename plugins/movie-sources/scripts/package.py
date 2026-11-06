#!/usr/bin/env python3
"""Package the built plugin as a Jellyfin catalogue: a zip, and with --download-url a manifest.json.

Only committed sources and the Release assembly are packaged, never configuration or credentials.
Build first: dotnet build src/Jellyfin.Plugin.MovieSources.csproj -c Release
Then: python3 scripts/package.py --download-url https://example.org/jellyfin/movie-sources-0.1.0.zip
Host the zip at that address and manifest.json next to it; add the manifest address as a plugin
repository in Jellyfin (or let the client do it from Settings > Server > Sources).
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import zipfile
from pathlib import Path
from urllib.parse import urlparse

GUID = '894c6e88-9250-4627-9d43-f45da80f30eb'
TARGET_ABI = '12.0.0.0'

parser = argparse.ArgumentParser()
parser.add_argument('--download-url', help='Public address of the zip, written in the manifest')
parser.add_argument('--allow-dirty', action='store_true', help='Local tests only: package uncommitted changes')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
os.chdir(root)


def git(*parts):
    return subprocess.check_output(['git', *parts], text=True).strip()


if git('status', '--porcelain') and not args.allow_dirty:
    raise SystemExit('Package requires a clean committed checkout')
version = re.search(r'<Version>([^<]+)</Version>', Path('src/Jellyfin.Plugin.MovieSources.csproj').read_text()).group(1)
assembly = Path('src/bin/Release/net10.0/Jellyfin.Plugin.MovieSources.dll')
if not assembly.is_file():
    raise SystemExit('Build the Release assembly first')
out = Path('artifacts')
out.mkdir(exist_ok=True)
name = f'movie-sources-{version}.zip'
package = out / name
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for source, dest in [(assembly, assembly.name), (Path('LICENSE'), 'LICENSE'), (Path('README.md'), 'README.md')]:
        info = zipfile.ZipInfo(dest, (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, source.read_bytes())
commit = git('rev-parse', 'HEAD')
stamp = git('show', '-s', '--format=%cI', 'HEAD')
build = {'project': 'movie-sources', 'version': version, 'commit': commit, 'targetAbi': TARGET_ABI,
         'assemblySha256': hashlib.sha256(assembly.read_bytes()).hexdigest(), 'dirty': bool(git('status', '--porcelain'))}
(out / 'build.json').write_text(json.dumps(build, indent=2) + '\n')
url = args.download_url or os.environ.get('MOVIE_SOURCES_DOWNLOAD_URL')
if url:
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or parsed.username or parsed.password:
        raise SystemExit('The download address must be http(s) without credentials')
    catalogue = [{
        'guid': GUID, 'name': 'Movie Sources', 'owner': 'Maxolot', 'category': 'General',
        'description': 'Tells compatible clients whether a film or season has published releases, and in which languages.',
        'overview': 'Optional on-demand Prowlarr lookup for Jellyfin 12 clients.',
        'versions': [{'version': version + '.0', 'targetAbi': TARGET_ABI, 'sourceUrl': url,
                      'checksum': hashlib.md5(package.read_bytes(), usedforsecurity=False).hexdigest(),
                      'timestamp': stamp or datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      'changelog': 'Films and seasons, release languages (VF, VOSTFR, MULTi).'}]
    }]
    (out / 'manifest.json').write_text(json.dumps(catalogue, indent=2) + '\n')
files = [entry for entry in out.iterdir() if entry.is_file() and entry.name != 'SHA256SUMS']
(out / 'SHA256SUMS').write_text(''.join(hashlib.sha256(entry.read_bytes()).hexdigest() + '  ' + entry.name + '\n' for entry in sorted(files)))
print('Packaged', version, commit[:10], 'manifest' if url else 'without manifest')
