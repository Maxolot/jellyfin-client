#!/bin/sh
set -eu
# Run after quality checks and production compilation, from the repository root.
test -s dist/index.html
mkdir -p artifacts
node --input-type=module <<'JS'
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const manifest={project:'jellyfin-client',commit:git('rev-parse','HEAD'),upstreamTag:'v12.0',upstreamCommit:'0e83c6a724b31f3e9b5a499244331a288c060a4a',node:process.version,lockfileSha256:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),dirty:!!git('status','--porcelain')};
writeFileSync('dist/fork-build.json',JSON.stringify(manifest,null,2)+'\n');
writeFileSync('artifacts/fork-build.json',JSON.stringify(manifest,null,2)+'\n');
JS
cp LICENSE dist/COPYING
cp FORK.md dist/FORK.md
tar -czf artifacts/jellyfin-client-web.tar.gz -C dist .
git archive --format=tar.gz --output=artifacts/jellyfin-client-source.tar.gz HEAD
(cd artifacts && sha256sum jellyfin-client-web.tar.gz jellyfin-client-source.tar.gz fork-build.json > SHA256SUMS)
