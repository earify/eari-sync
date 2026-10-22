# Install eari-sync plugin into an Obsidian vault
param(
  [Parameter(Mandatory=$true)][string]$VaultPath
)
$pluginDir = Join-Path $VaultPath ".obsidian\plugins\eari-sync"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
$root = Split-Path -Parent $PSScriptRoot
Copy-Item (Join-Path $root "plugin\main.js") $pluginDir -Force
Copy-Item (Join-Path $root "plugin\manifest.json") $pluginDir -Force
Copy-Item (Join-Path $root "plugin\styles.css") $pluginDir -Force
Write-Host "Installed to $pluginDir"
Write-Host "Enable 'eari-sync' in Obsidian: Settings -> Community plugins"