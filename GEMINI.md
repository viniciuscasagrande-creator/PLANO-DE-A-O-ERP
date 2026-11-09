# Contexto do projeto (leia antes de qualquer tarefa)
ERP da Disk Ingressos (plataforma de venda de ingressos). Cobre cadastros, plano de ação 5W2H, financeiro (razão contábil,
pagamentos, taxas, repasses a produtores), riscos/compliance e dashboards. Origem: planilhas 5W2H (Financeiro e Suporte).
Interface e textos para o usuário: **português do Brasil**. Código e variáveis em inglês; colunas do banco em português (já definidas).

## Stack (não troque sem pedir)
Node 20+ / TypeScript, Fastify + zod (API), PostgreSQL 16 (docker compose), React + Vite + Tailwind (web), npm workspaces.
Acesso ao banco: pacote `pg` com SQL explícito (sem ORM). Migrações: arquivos SQL em `db/migrations`.

## Regras inegociáveis
1. **Dinheiro sempre em centavos, inteiro (bigint).** Nunca float. Taxas em basis points (299 = 2,99%).
2. **Razão imutável.** `lancamentos` e `partidas` nunca recebem UPDATE/DELETE (há trigger). Correção = lançamento de estorno.
3. Todo lançamento fecha: soma dos débitos = soma dos créditos, criado numa única transação.
4. Toda escrita relevante grava em `auditoria` (quem, quando, antes/depois).
5. Acesso por perfil: admin, financeiro, suporte, leitura. O suporte não vê repasses nem dados bancários.
6. Dados bancários de produtores e dados pessoais: LGPD. Nunca logar, nunca expor em listagens.
7. **Não invente regras de negócio.** Dúvidas estão em `docs/PERGUNTAS_ABERTAS.md`; torne-as parâmetros configuráveis.
8. Senhas com argon2 ou bcrypt. Segredos só em `.env` (nunca no git).

## Estrutura
- `db/migrations/` esquema e seed (já prontos: 001 e 002)
- `apps/api/src/modules/<modulo>/` rotas + serviço + testes (cadastros, plano-acao, contas, lancamentos, vendas, repasses, dashboard)
- `apps/web/src/` páginas e componentes
- `packages/shared/src/` tipos e schemas zod compartilhados
- `scripts/` setup e migração · `data/` planilhas originais (fora do git)

## Tarefas (execute em ordem; ao fim de cada uma, rode, teste e faça commit)
- **T0 Instalação:** confirmar Node 20+, Docker e Git; copiar `.env.example` para `.env`; `npm install`; `npm run db:up`.
- **T1 Scaffold:** criar `apps/api` (Fastify + TS, rota GET /health), `apps/web` (Vite + React + TS + Tailwind) e `packages/shared`, com scripts `dev`, `build`, `test` (vitest).
- **T2 Migrador:** implementar `scripts/migrate.mjs` (ver comentário no arquivo). Aplicar 001 e 002.
- **T3 Importador das planilhas:** ler `data/Planilha_de_Plano_de_Ação_5W2H_financeiro.xlsx` (abas CAD_f, CAD_a, 5W, 2H) e o CSV do Suporte (codificação latin-1, separador ponto e vírgula) e carregar `pessoas`, `areas` e `plano_acao`. Normalizar status ("Realizado" vira "Concluído"), ignorar linhas vazias e `#N/A`. Relatório final com linhas importadas e rejeitadas.
- **T4 Autenticação:** login por e-mail e senha, JWT, middleware de perfil.
- **T5 Cadastros e Plano de Ação:** CRUD de pessoas, áreas, produtores, eventos e plano_acao, com filtros e auditoria.
- **T6 Financeiro (Fase 2):** serviço `postJournalEntry` (transacional, valida balanceamento), estorno, balancete, métodos e regras de taxa, registro de venda (comissão, taxa, repasse e lançamentos), recebimento do gateway e repasse. Testes cobrindo arredondamento e estorno.
- **T7 Dashboard:** plano de ação por status, área e responsável (atrasados em destaque); financeiro (saldo, a repassar, receita do mês).
- **T8 Endurecimento:** rate limit, CORS, validação zod em todas as rotas, backup do banco documentado.

## Definição de pronto
Compila sem erros, testes passam, migrações rodam do zero, nenhum segredo no repositório, README atualizado.
