INSERT INTO areas(nome) VALUES ('SUPORTE'),('DIRETORIA'),('FINANCEIRO'),('SAC'),('ESTORNO'),('COMERCIAL'),('MKT');
INSERT INTO contas(codigo,nome,natureza,aceita_lancamento) VALUES
 ('1','ATIVO','ativo',false),('1.1.01','Banco – conta principal','ativo',true),('1.1.02','Recebíveis do gateway','ativo',true),
 ('2','PASSIVO','passivo',false),('2.1.01','Repasses a produtores','passivo',true),
 ('3','RECEITAS','receita',false),('3.1.01','Comissão sobre ingressos','receita',true),('3.1.02','Spread de taxas','receita',true),
 ('4','DESPESAS','despesa',false),('4.1.01','Taxas de gateway e adquirência','despesa',true),
 ('4.1.02','Despesas de eventos','despesa',true),('4.1.03','Estornos e chargebacks','despesa',true);
-- Taxas abaixo são EXEMPLOS. O Financeiro deve confirmar (docs/PERGUNTAS_ABERTAS.md).
INSERT INTO metodos_pagamento(nome,bandeira) VALUES ('Crédito','Visa/Master'),('Débito','Visa/Master'),('PIX','Todas');
INSERT INTO regras_taxa(metodo_id,parcelas_min,parcelas_max,taxa_bps) VALUES (1,1,1,299),(1,2,6,399),(1,7,12,499),(2,1,1,199),(3,1,1,99);
