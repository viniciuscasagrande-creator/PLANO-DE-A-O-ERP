#!/usr/bin/env bash
# Verifica pré-requisitos e prepara o ambiente. Linux/macOS/WSL.
set -e
need(){ command -v "$1" >/dev/null || { echo "Falta instalar: $1"; exit 1; }; }
need node; need npm; need docker; need git
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "Node 20+ necessário"; exit 1; }
[ -f .env ] || cp .env.example .env
npm install
npm run db:up
echo "Aguardando o banco..."; sleep 5
npm run db:migrate
echo "Pronto. Rode: npm run dev:api  e  npm run dev:web"
