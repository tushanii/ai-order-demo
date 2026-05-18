$nodePath = "C:\Users\Administrator\AppData\Local\OpenAI\Codex\bin\node.exe"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path $nodePath)) {
  Write-Host "Node runtime not found:" -ForegroundColor Red
  Write-Host $nodePath -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Please update start.ps1 with the correct node.exe path." -ForegroundColor Yellow
  exit 1
}

Set-Location $projectRoot
Write-Host "Starting AI order demo..." -ForegroundColor Cyan
Write-Host "Open http://localhost:3000" -ForegroundColor Green
Write-Host ""
& $nodePath '.\server.js'
