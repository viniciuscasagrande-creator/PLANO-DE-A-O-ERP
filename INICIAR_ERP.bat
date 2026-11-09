@echo off
chcp 65001 >nul
title Disk ERP - Financeiro (Fase 2) & Gestao 5W2H (PostgreSQL 16)
cd /d "E:\PLANO DE AÇÃO ERP"
echo =====================================================================
echo   Iniciando Disk ERP (PostgreSQL 16 + Fastify + React)
echo   URL: http://localhost:3001
echo =====================================================================
start "" "http://localhost:3001"
npx tsx apps/api/src/index.ts
pause
