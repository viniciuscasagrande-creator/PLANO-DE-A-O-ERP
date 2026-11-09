-- Extensões de schema para rastrear a planilha de origem no 5W2H,
-- as solicitações de ajustes da plataforma (Guilherme) e as perguntas abertas do Financeiro.

ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS origem_planilha text DEFAULT 'FINANCEIRO';
ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'Geral';
ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS nao_resolvido boolean NOT NULL DEFAULT false;
ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS observacao_resolucao text;

CREATE TABLE IF NOT EXISTS solicitacoes_plataforma (
  id serial PRIMARY KEY,
  numero int NOT NULL,
  data_solicitacao date,
  descricao text NOT NULL,
  setor text NOT NULL DEFAULT 'SUPORTE',
  modulo text NOT NULL DEFAULT 'Plataforma Geral',
  concluido boolean NOT NULL DEFAULT false,
  homologado_plan3 boolean NOT NULL DEFAULT false,
  responsavel text NOT NULL DEFAULT 'Guilherme',
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS perguntas_abertas (
  id serial PRIMARY KEY,
  codigo text UNIQUE NOT NULL,
  topico text NOT NULL,
  pergunta text NOT NULL,
  origem text,
  parametro_atual text,
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Em Análise', 'Decidido')),
  decisao text,
  responsavel text DEFAULT 'KARINE SANTOS',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
