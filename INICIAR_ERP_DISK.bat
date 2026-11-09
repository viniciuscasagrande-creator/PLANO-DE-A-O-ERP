@echo off
chcp 65001 >nul
title Disk Ingressos ERP - Controle de Ajustes de Sistemas (Porta 3001)
cd /d "%~dp0"
echo ============================================================================
echo   DISK INGRESSOS ERP - CONTROLE DE AJUSTES DE SISTEMAS ^& 5W2H
echo   Sincronizacao Bidirecional: Planilhas Excel (D: e E:) ^<=^> ERP PostgreSQL
echo   Acesse no navegador: http://localhost:3001
echo ============================================================================
start "" "http://localhost:3001"
npx tsx apps/api/src/index.ts
pause
