# Windows (PowerShell). Requer Node 20+, Docker Desktop e Git instalados.
$ErrorActionPreference = "Stop"
foreach ($c in "node","npm","docker","git") { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Write-Host "Falta instalar: $c"; exit 1 } }
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm run db:up
Start-Sleep -Seconds 5
npm run db:migrate
Write-Host "Pronto. Rode: npm run dev:api  e  npm run dev:web"
