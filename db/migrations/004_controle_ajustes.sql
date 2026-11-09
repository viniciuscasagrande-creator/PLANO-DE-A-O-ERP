-- Migração 004: Campos para fidelidade 100% às abas 5W, 2H, EXE e Controle de Testes (TESTAR DISK / TESTE OK / Guilherme)

ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS aba_origem text NOT NULL DEFAULT '5W';
ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS linha_planilha int;
ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS etapa_teste text NOT NULL DEFAULT 'ESTRATEGICO';
ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS status_original text;
ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS tarefas_programadas int NOT NULL DEFAULT 1;
ALTER TABLE plano_acao ADD COLUMN IF NOT EXISTS tarefas_realizadas int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_plano_acao_origem_aba ON plano_acao (origem_planilha, aba_origem, linha_planilha);
CREATE INDEX IF NOT EXISTS idx_plano_acao_etapa_teste ON plano_acao (etapa_teste);
