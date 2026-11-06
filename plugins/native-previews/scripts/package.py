#!/usr/bin/env python3
"""Package only committed source and the plugin assembly; never runtime media/data."""
import argparse,datetime,hashlib,json,os,re,subprocess,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--download-url');args=p.parse_args()
root=Path(__file__).resolve().parent.parent
os.chdir(root)
def git(*parts):return subprocess.check_output(['git',*parts],text=True).strip()
if git('status','--porcelain'):raise SystemExit('Package requires a clean committed checkout')
version=re.search(r'<Version>([^<]+)</Version>',Path('src/Jellyfin.Plugin.NativePreviews.csproj').read_text()).group(1)
assembly=Path('src/bin/Release/net10.0/Jellyfin.Plugin.NativePreviews.dll');assert assembly.is_file()
out=Path('artifacts');out.mkdir(exist_ok=True)
name=f'native-previews-{version}.zip';package=out/name
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
 for source,dest in [(assembly,'Jellyfin.Plugin.NativePreviews.dll'),(Path('LICENSE'),'LICENSE'),(Path('README.md'),'README.md')]:
  info=zipfile.ZipInfo(dest,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,source.read_bytes())
source=out/f'native-previews-{version}-source.tar.gz';subprocess.run(['git','archive','--format=tar.gz','--output='+str(source),'HEAD'],check=True)
commit=git('rev-parse','HEAD');stamp=git('show','-s','--format=%cI','HEAD')
manifest={'project':'native-previews','version':version,'commit':commit,'targetAbi':'12.0.0.0','assemblySha256':hashlib.sha256(assembly.read_bytes()).hexdigest(),'sourceArchive':source.name,'dirty':False}
(out/'build.json').write_text(json.dumps(manifest,indent=2)+'\n')
url=args.download_url or os.environ.get('PREVIEWS_DOWNLOAD_URL')
if not url and os.environ.get('GITHUB_SERVER_URL') and os.environ.get('GITHUB_REPOSITORY'):
 url=os.environ['GITHUB_SERVER_URL']+'/'+os.environ['GITHUB_REPOSITORY']+'/releases/download/v'+version+'/'+name
if url:
 from urllib.parse import urlparse
 parsed=urlparse(url);assert parsed.scheme in ['http','https'] and not parsed.username and not parsed.password
 catalogue=[{'guid':'14d4d2e1-8801-44df-bd61-7bb2d8ba2c8e','name':'Native Previews','description':'Approved native scene clips with bounded cache and authenticated delivery.','overview':'Optional Jellyfin12 preview provider.','owner':'Maxolot','category':'General','versions':[{'version':version+'.0','targetAbi':'12.0.0.0','sourceUrl':url,'checksum':hashlib.md5(package.read_bytes(),usedforsecurity=False).hexdigest(),'timestamp':stamp,'changelog':'Initial provider: approved scenes, compact/full clips, scoped tickets and bounded cache.'}]}]
 (out/'manifest.json').write_text(json.dumps(catalogue,indent=2)+'\n')
files=[f for f in out.iterdir() if f.is_file() and f.name!='SHA256SUMS'];(out/'SHA256SUMS').write_text(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n' for f in sorted(files)))
print('Packaged',version,commit[:10],'with matching sources and SHA256SUMS.')
