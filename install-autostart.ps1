# Installs Claude Widget autostart: creates a shortcut in the Windows Startup folder
# that launches start-widget.vbs via wscript.exe (which runs `npm start` hidden).
#
# Run:       powershell -ExecutionPolicy Bypass -File install-autostart.ps1
# Uninstall: powershell -ExecutionPolicy Bypass -File uninstall-autostart.ps1
#
# NOTE: kept ASCII-only on purpose. Windows PowerShell 5.1 reads .ps1 files without a
# BOM as ANSI, so non-ASCII (Cyrillic) here would break. User-facing docs live in INSTALL.md.

$ErrorActionPreference = 'Stop'

# Project dir = folder containing this script (no hardcoded paths -> portable)
$projectDir = $PSScriptRoot
$vbs = Join-Path $projectDir 'start-widget.vbs'

if (-not (Test-Path $vbs)) {
    throw "start-widget.vbs not found in $projectDir - run this script from the project folder."
}

# Make sure Node.js + npm are available, otherwise the autostart shortcut would be
# installed but the widget would silently fail to start on login.
$node = Get-Command node -ErrorAction SilentlyContinue
$npm  = Get-Command npm  -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
    Write-Host "Node.js / npm not found in PATH." -ForegroundColor Red
    Write-Host "Install Node.js 18+ from https://nodejs.org , open a NEW terminal, then re-run." -ForegroundColor Red
    throw "Node.js and npm are required for autostart."
}
Write-Host "Node $(& node -v), npm $(& npm -v) detected." -ForegroundColor DarkGray

# Warn (don't block) if dependencies were never installed.
if (-not (Test-Path (Join-Path $projectDir 'node_modules'))) {
    Write-Host "WARNING: node_modules is missing - run 'npm install' before relying on autostart." -ForegroundColor Yellow
}

$startup  = [Environment]::GetFolderPath('Startup')
$lnkPath  = Join-Path $startup 'Claude Widget.lnk'

$sh  = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($lnkPath)
$lnk.TargetPath       = Join-Path $env:WINDIR 'System32\wscript.exe'
$lnk.Arguments        = "`"$vbs`""
$lnk.WorkingDirectory = $projectDir
$lnk.WindowStyle      = 1
$lnk.Description       = 'Claude Usage Overlay autostart'
$lnk.Save()

Write-Host "Autostart installed:" -ForegroundColor Green
Write-Host "  Shortcut : $lnkPath"
Write-Host "  Target   : wscript.exe `"$vbs`""
Write-Host "  WorkDir  : $projectDir"
Write-Host ""
Write-Host "The widget will start on Windows login (hidden, no console window)."
