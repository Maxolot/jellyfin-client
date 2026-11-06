#!/bin/sh
set -eu
native_previews_dotnet_root=${DOTNET_ROOT:-"$HOME/.dotnet"}
if test -x "$native_previews_dotnet_root/dotnet" && test "$("$native_previews_dotnet_root/dotnet" --version 2>/dev/null)" = "10.0.403"; then exit 0; fi
native_previews_sdk_archive=$(mktemp)
trap 'rm -f "$native_previews_sdk_archive"' EXIT
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 'https://builds.dotnet.microsoft.com/dotnet/Sdk/10.0.403/dotnet-sdk-10.0.403-linux-x64.tar.gz' -o "$native_previews_sdk_archive"
printf '%s  %s\n' 'b7b3d8461cf98b07d2552ce9199702fa3ad010ac2671a5f8cd5136f7534e50f6855ba7bbb02b11494563f1d04156276a31cda1103b900e5eecd0d9473dc7b9c5' "$native_previews_sdk_archive" | sha512sum -c -
mkdir -p "$native_previews_dotnet_root"
tar -xzf "$native_previews_sdk_archive" -C "$native_previews_dotnet_root"
