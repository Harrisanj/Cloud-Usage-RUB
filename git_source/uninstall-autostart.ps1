# Removes Claude Widget autostart: deletes the shortcut from the Windows Startup folder.
#
# Run: powershell -ExecutionPolicy Bypass -File uninstall-autostart.ps1
#
# NOTE: ASCII-only on purpose (see install-autostart.ps1 for the encoding reason).

$ErrorActionPreference = 'Stop'

$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'Claude Widget.lnk'

if (Test-Path $lnkPath) {
    Remove-Item $lnkPath -Force
    Write-Host "Autostart removed: $lnkPath" -ForegroundColor Green
} else {
    Write-Host "No autostart shortcut found - nothing to remove." -ForegroundColor Yellow
}
