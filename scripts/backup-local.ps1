# Backup completo do Banco PostgreSQL Local (data/pgdata) + Planilhas Excel Sincronizadas
$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $RootDir "backups"
if (!(Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$ZipPath = Join-Path $BackupDir "disk_erp_backup_$Timestamp.zip"

$DataDir = Join-Path $RootDir "data"
Compress-Archive -Path "$DataDir\*" -DestinationPath $ZipPath -Force
Write-Host "[OK] Backup criado com sucesso em: $ZipPath" -ForegroundColor Green
