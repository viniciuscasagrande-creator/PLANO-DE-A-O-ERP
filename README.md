# Disk ERP — Gestão 5W2H, Financeiro (Razão Contábil) & Compliance

Sistema ERP da **Disk Ingressos** estruturado conforme `GEMINI.md` (Tarefas **T0 a T8** concluídas), unificando a **Fase 1 (Cadastros, Plano de Ação 5W2H Financeiro + Suporte e Solicitações da Plataforma)** com a **Fase 2 (Razão Contábil Imutável em Centavos, Plano de Contas, Balancete e Pagamentos/Taxas)**.

## Como Iniciar Rapidamente (Windows)
1. Dê dois cliques em [`INICIAR_ERP.bat`](./INICIAR_ERP.bat), ou execute no terminal:
   ```powershell
   npx tsx apps/api/src/index.ts
   ```
2. Acesse **`http://localhost:3001`** no navegador.

## Comandos do Projeto (T0 a T8)
- `npm run db:migrate` — Aplica as migrações SQL (`001_core.sql`, `002_seed.sql`, `003_extras.sql`) no PostgreSQL 16.
- `npm run db:import` — Importa as planilhas da pasta `data/` (`Planilha_de_Plano_de_Ação_5W2H_financeiro.xlsx`, `Planilha de Plano de Ação 5W2H SUPORTE2.xlsx`, `datas das solicitaçoes e ajustes.xlsx`).
- `npm run dev:api` — Inicia a API Fastify + TypeScript em modo desenvolvimento (`http://localhost:3001`).
- `npm run dev:web` — Inicia o Vite + React em modo desenvolvimento (`http://localhost:5173`).
- `npm test` — Executa a suíte de testes automatizados (`vitest`) validando arredondamento em centavos, balanceamento de partidas, imutabilidade (triggers PostgreSQL) e estorno.

## Credenciais Padrão (Tarefa T4 — Login JWT & RBAC)
Senha padrão para todos os perfis em ambiente local: **`disk123`**
- **Financeiro:** `karine@diskingressos.com.br` (`perfil: financeiro`)
- **Admin / Diretoria:** `admin@diskingressos.com.br` (`perfil: admin`)
- **Suporte:** `vinicius.casagrande@diskingressos.com.br` (`perfil: suporte` — dados bancários e repasses ocultos por LGPD)
- **Leitura / SAC:** `leitura@diskingressos.com.br` (`perfil: leitura`)

## Backup e Restauração do Banco de Dados (Tarefa T8)
1. **PostgreSQL Embarcado (PGlite — Padrão sem Docker):**
   - Os dados ficam persistidos na pasta `data/pgdata/`.
   - Para fazer backup completo, pare o servidor e copie/compacte a pasta `data/pgdata/` para um local seguro:
     ```powershell
     Compress-Archive -Path "data\pgdata" -DestinationPath "data\backup_pgdata_$(Get-Date -Format 'yyyyMMdd_HHmm').zip"
     ```
2. **PostgreSQL via Docker (`docker-compose.yml` com `USE_EXTERNAL_PG=true` no `.env`):**
   - Backup lógico (`pg_dump`):
     ```powershell
     docker compose exec -T db pg_dump -U disk -d disk_erp > backup_disk_erp.sql
     ```
   - Restauração (`psql`):
     ```powershell
     Get-Content backup_disk_erp.sql | docker compose exec -T db psql -U disk -d disk_erp
     ```
