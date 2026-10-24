# Build the plugin release artifact (main.js + manifest.json + styles.css)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
node esbuild.config.mjs production
Pop-Location
Write-Host ""
Write-Host "Release assets to upload: main.js, manifest.json, styles.css"
