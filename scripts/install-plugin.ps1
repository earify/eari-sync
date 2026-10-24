# Install eari-sync plugin into an Obsidian vault
param(
  [Parameter(Mandatory=$true)][string]$VaultPath
)
$pluginDir = Join-Path $VaultPath ".obsidian\plugins\eari-sync"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
$root = Split-Path -Parent $PSScriptRoot
Copy-Item (Join-Path $root "main.js") $pluginDir -Force
Copy-Item (Join-Path $root "manifest.json") $pluginDir -Force
Copy-Item (Join-Path $root "styles.css") $pluginDir -Force
Write-Host "Installed to $pluginDir"
Write-Host "Enable 'eari-sync' in Obsidian: Settings -> Community plugins"
