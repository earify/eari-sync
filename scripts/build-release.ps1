# Build release artifacts
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# shared + server
Push-Location $root
npm run build -w shared
npm run build -w server
# plugin
Push-Location (Join-Path $root "plugin")
node esbuild.config.mjs production
Pop-Location

# package plugin
$rel = Join-Path $root "release"
New-Item -ItemType Directory -Force -Path $rel | Out-Null
$zip = Join-Path $rel "eari-sync-plugin.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $root "plugin\main.js"),(Join-Path $root "plugin\manifest.json"),(Join-Path $root "plugin\styles.css") -DestinationPath $zip
Write-Host "Plugin package: $zip"

# server tarball (zip of server/dist + package.json)
$sz = Join-Path $rel "eari-sync-server.zip"
if (Test-Path $sz) { Remove-Item $sz }
$stage = Join-Path $rel "server-stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item (Join-Path $root "server\dist") (Join-Path $stage "dist") -Recurse
Copy-Item (Join-Path $root "server\package.json") $stage
Copy-Item (Join-Path $root "scripts\setup-termux.sh") $stage
Compress-Archive -Path "$stage\*" -DestinationPath $sz
Remove-Item $stage -Recurse -Force
Write-Host "Server package: $sz"
Pop-Location