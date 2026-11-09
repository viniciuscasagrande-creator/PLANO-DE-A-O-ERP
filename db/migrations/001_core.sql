-- Cadastros base
CREATE TABLE areas (id serial PRIMARY KEY, nome text UNIQUE NOT NULL);
CREATE TABLE pessoas (
  id serial PRIMARY KEY, nome text NOT NULL, area_id int REFERENCES areas(id),
  telefone text, email text UNIQUE, observacoes text, ativo boolean NOT NULL DEFAULT true,
  senha_hash text, perfil text NOT NULL DEFAULT 'leitura' CHECK (perfil IN ('admin','financeiro','suporte','leitura'))
);
CREATE TABLE produtores (
  id serial PRIMARY KEY, nome text NOT NULL, documento text UNIQUE,
  banco text, agencia text, conta text, chave_pix text, ativo boolean NOT NULL DEFAULT true
);
CREATE TABLE eventos (
  id serial PRIMARY KEY, produtor_id int NOT NULL REFERENCES produtores(id),
  nome text NOT NULL, data_evento date, comissao_bps int NOT NULL DEFAULT 2000 CHECK (comissao_bps BETWEEN 0 AND 10000)
);

-- Plano de ação 5W2H (vem das planilhas)
CREATE TABLE plano_acao (
  id serial PRIMARY KEY, plano text NOT NULL, prioridade text, what text, why text,
  who_id int REFERENCES pessoas(id), area_id int REFERENCES areas(id), onde text,
  inicio date, prazo_dias int, fim_planejado date, fim_real date,
  how text, how_much_centavos bigint,
  status text NOT NULL DEFAULT 'Não iniciado' CHECK (status IN ('Não iniciado','Em andamento','Concluído','Atrasado')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Razão contábil
CREATE TABLE contas (
  id serial PRIMARY KEY, codigo text UNIQUE NOT NULL, nome text NOT NULL,
  natureza text NOT NULL CHECK (natureza IN ('ativo','passivo','receita','despesa')),
  pai_id int REFERENCES contas(id), aceita_lancamento boolean NOT NULL DEFAULT true
);
CREATE TABLE lancamentos (
  id bigserial PRIMARY KEY, data date NOT NULL DEFAULT current_date, descricao text NOT NULL,
  estorna_id bigint UNIQUE REFERENCES lancamentos(id), evento_id int REFERENCES eventos(id),
  criado_por int REFERENCES pessoas(id), criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE partidas (
  id bigserial PRIMARY KEY, lancamento_id bigint NOT NULL REFERENCES lancamentos(id),
  conta_id int NOT NULL REFERENCES contas(id),
  debito_centavos bigint NOT NULL DEFAULT 0 CHECK (debito_centavos >= 0),
  credito_centavos bigint NOT NULL DEFAULT 0 CHECK (credito_centavos >= 0),
  CHECK ((debito_centavos > 0) <> (credito_centavos > 0))
);
-- Cada lançamento precisa fechar: soma dos débitos = soma dos créditos.
CREATE FUNCTION checa_balanceamento() RETURNS trigger AS $$
DECLARE d bigint; c bigint;
BEGIN
  SELECT COALESCE(sum(debito_centavos),0), COALESCE(sum(credito_centavos),0) INTO d, c
    FROM partidas WHERE lancamento_id = NEW.lancamento_id;
  IF d <> c THEN RAISE EXCEPTION 'Lançamento % desbalanceado: débitos % x créditos %', NEW.lancamento_id, d, c; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trg_balanceamento AFTER INSERT ON partidas
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION checa_balanceamento();
-- Imutabilidade: nunca editar nem apagar. Correção = estorno.
CREATE FUNCTION bloqueia_alteracao() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Tabela % é imutável. Use estorno.', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;
CREATE TRIGGER imut_lanc BEFORE UPDATE OR DELETE ON lancamentos FOR EACH ROW EXECUTE FUNCTION bloqueia_alteracao();
CREATE TRIGGER imut_part BEFORE UPDATE OR DELETE ON partidas FOR EACH ROW EXECUTE FUNCTION bloqueia_alteracao();

-- Pagamentos e vendas
CREATE TABLE metodos_pagamento (id serial PRIMARY KEY, nome text NOT NULL, bandeira text, ativo boolean NOT NULL DEFAULT true);
CREATE TABLE regras_taxa (
  id serial PRIMARY KEY, metodo_id int NOT NULL REFERENCES metodos_pagamento(id),
  parcelas_min int NOT NULL DEFAULT 1, parcelas_max int NOT NULL DEFAULT 1,
  taxa_bps int NOT NULL CHECK (taxa_bps >= 0), vigente_desde date NOT NULL DEFAULT current_date
);
CREATE TABLE vendas (
  id bigserial PRIMARY KEY, evento_id int NOT NULL REFERENCES eventos(id), metodo_id int NOT NULL REFERENCES metodos_pagamento(id),
  parcelas int NOT NULL DEFAULT 1, bruto_centavos bigint NOT NULL CHECK (bruto_centavos > 0),
  taxa_gateway_centavos bigint NOT NULL, comissao_centavos bigint NOT NULL, repasse_centavos bigint NOT NULL,
  taxa_paga_por text NOT NULL DEFAULT 'disk' CHECK (taxa_paga_por IN ('disk','produtor')),
  lancamento_id bigint REFERENCES lancamentos(id), criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE repasses (
  id bigserial PRIMARY KEY, produtor_id int NOT NULL REFERENCES produtores(id), valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','pago','cancelado')),
  lancamento_id bigint REFERENCES lancamentos(id), criado_em timestamptz NOT NULL DEFAULT now()
);

-- Auditoria
CREATE TABLE auditoria (
  id bigserial PRIMARY KEY, pessoa_id int, acao text NOT NULL, entidade text NOT NULL, entidade_id text,
  antes jsonb, depois jsonb, ip text, criado_em timestamptz NOT NULL DEFAULT now()
);
