# Build the plugin release artifact (main.js/manifest.json/styles.css + zip)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $root "plugin")
node esbuild.config.mjs production
Pop-Location

$rel = Join-Path $root "release"
New-Item -ItemType Directory -Force -Path $rel | Out-Null
$zip = Join-Path $rel "eari-sync-plugin.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $root "plugin\main.js"),(Join-Path $root "plugin\manifest.json"),(Join-Path $root "plugin\styles.css") -DestinationPath $zip
Write-Host "Plugin package: $zip"
Write-Host ""
Write-Host "Release assets to upload: plugin/main.js, plugin/manifest.json, plugin/styles.css"
