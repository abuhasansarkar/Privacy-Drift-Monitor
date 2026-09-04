$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot\..

function Run-Gate([string]$Label, [string]$Cmd) {
  Write-Host "===== $Label =====" -ForegroundColor Cyan
  & powershell -NoProfile -ExecutionPolicy Bypass -Command $Cmd
  Write-Host ""
}

Run-Gate 'LINT'        'npm run lint 2>&1 | Select-Object -Last 30'
Run-Gate 'TERMINOLOGY' 'npm run check:terminology 2>&1 | Select-Object -Last 20'
Run-Gate 'TYPECHECK'   'npm run typecheck 2>&1 | Select-Object -Last 60'
