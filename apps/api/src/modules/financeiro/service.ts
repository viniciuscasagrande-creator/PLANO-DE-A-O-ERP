import { getDb, withTransaction, recordAudit, DbClient } from "../../db/index.ts";

export interface PartidaInput {
  conta_id: number;
  debito_centavos: number;
  credito_centavos: number;
}

export interface PostJournalInput {
  data?: string;
  descricao: string;
  evento_id?: number | null;
  estorna_id?: number | null;
  criado_por?: number | null;
  partidas: PartidaInput[];
  tx?: DbClient;
}

export function calculateSaleMath(params: {
  bruto_centavos: number;
  taxa_bps: number;
  comissao_bps: number;
  taxa_paga_por: "disk" | "produtor";
}) {
  const bruto = Math.round(Number(params.bruto_centavos));
  if (!Number.isInteger(bruto) || bruto <= 0) {
    throw new Error("Valor bruto em centavos deve ser inteiro positivo");
  }
  const taxa_gateway_centavos = Math.round((bruto * Number(params.taxa_bps)) / 10000);
  const comissao_centavos = Math.round((bruto * Number(params.comissao_bps)) / 10000);
  const liquido_gateway_centavos = bruto - taxa_gateway_centavos;

  const repasse_centavos =
    params.taxa_paga_por === "disk"
      ? bruto - comissao_centavos
      : bruto - comissao_centavos - taxa_gateway_centavos;

  if (repasse_centavos < 0) {
    throw new Error("Comissão + taxa excedem o valor bruto da venda");
  }

  return {
    bruto_centavos: bruto,
    taxa_gateway_centavos,
    comissao_centavos,
    liquido_gateway_centavos,
    repasse_centavos,
    taxa_paga_por: params.taxa_paga_por
  };
}

export async function postJournalEntry(input: PostJournalInput) {
  if (!input.partidas || input.partidas.length < 2) {
    throw new Error("Um lançamento contábil exige pelo menos 2 partidas.");
  }

  let totalDebito = 0;
  let totalCredito = 0;
  for (const p of input.partidas) {
    const d = Number(p.debito_centavos || 0);
    const c = Number(p.credito_centavos || 0);
    if (!Number.isInteger(d) || !Number.isInteger(c) || d < 0 || c < 0) {
      throw new Error("Partidas devem usar valores inteiros não-negativos em centavos.");
    }
    if ((d > 0) === (c > 0)) {
      throw new Error("Cada partida deve preencher exclusivamente débito ou crédito.");
    }
    totalDebito += d;
    totalCredito += c;
  }

  if (totalDebito <= 0 || totalDebito !== totalCredito) {
    throw new Error(`Lançamento desbalanceado: débitos (${totalDebito}) != créditos (${totalCredito}).`);
  }

  const runInTx = async (tx: DbClient) => {
    // Check analytical accounts
    const contaIds = input.partidas.map(p => p.conta_id);
    const contasRes = await tx.query<{ id: number; codigo: string; nome: string; aceita_lancamento: boolean }>(
      `SELECT id, codigo, nome, aceita_lancamento FROM contas WHERE id = ANY($1::int[])`,
      [contaIds]
    );
    const contaMap = new Map(contasRes.rows.map(c => [c.id, c]));
    for (const p of input.partidas) {
      const conta = contaMap.get(p.conta_id);
      if (!conta) throw new Error(`Conta contábil #${p.conta_id} não encontrada.`);
      if (!conta.aceita_lancamento) {
        throw new Error(`A conta sintética "${conta.codigo} ${conta.nome}" é um grupo e não aceita lançamentos diretos.`);
      }
    }

    const lancRes = await tx.query<{ id: string; data: string; descricao: string; estorna_id: string | null }>(
      `INSERT INTO lancamentos (data, descricao, estorna_id, evento_id, criado_por)
       VALUES (COALESCE($1::date, current_date), $2, $3, $4, $5)
       RETURNING id, data::text, descricao, estorna_id`,
      [
        input.data || null,
        input.descricao,
        input.estorna_id || null,
        input.evento_id || null,
        input.criado_por || null
      ]
    );
    const lanc = lancRes.rows[0];
    const lancId = Number(lanc.id);

    for (const p of input.partidas) {
      await tx.query(
        `INSERT INTO partidas (lancamento_id, conta_id, debito_centavos, credito_centavos)
         VALUES ($1, $2, $3, $4)`,
        [lancId, p.conta_id, p.debito_centavos, p.credito_centavos]
      );
    }

    await recordAudit({
      pessoa_id: input.criado_por,
      acao: input.estorna_id ? "ESTORNO_LANCAMENTO" : "CRIAR_LANCAMENTO",
      entidade: "lancamentos",
      entidade_id: lancId,
      depois: {
        id: lancId,
        descricao: input.descricao,
        total_centavos: totalDebito,
        estorna_id: input.estorna_id || null,
        partidas: input.partidas
      },
      tx
    });

    return {
      id: lancId,
      data: lanc.data,
      descricao: lanc.descricao,
      estorna_id: lanc.estorna_id ? Number(lanc.estorna_id) : null,
      total_centavos: totalDebito
    };
  };

  if (input.tx) {
    return runInTx(input.tx);
  }
  return withTransaction(runInTx);
}

export async function reverseJournalEntry(lancamentoId: number, pessoaId?: number | null) {
  return withTransaction(async tx => {
    const origRes = await tx.query<{ id: string; descricao: string; evento_id: number | null; estorna_id: string | null }>(
      `SELECT id, descricao, evento_id, estorna_id FROM lancamentos WHERE id = $1`,
      [lancamentoId]
    );
    if (origRes.rows.length === 0) {
      throw new Error(`Lançamento #${lancamentoId} não encontrado.`);
    }
    const orig = origRes.rows[0];

    const alreadyReversed = await tx.query<{ id: string }>(
      `SELECT id FROM lancamentos WHERE estorna_id = $1`,
      [lancamentoId]
    );
    if (alreadyReversed.rows.length > 0) {
      throw new Error(`O lançamento #${lancamentoId} já foi estornado pelo lançamento #${alreadyReversed.rows[0].id}.`);
    }

    const partidasRes = await tx.query<{ conta_id: number; debito_centavos: string; credito_centavos: string }>(
      `SELECT conta_id, debito_centavos, credito_centavos FROM partidas WHERE lancamento_id = $1 ORDER BY id ASC`,
      [lancamentoId]
    );

    const reversedPartidas: PartidaInput[] = partidasRes.rows.map(p => ({
      conta_id: Number(p.conta_id),
      debito_centavos: Number(p.credito_centavos),
      credito_centavos: Number(p.debito_centavos)
    }));

    return postJournalEntry({
      descricao: `Estorno do lançamento #${lancamentoId}: ${orig.descricao}`,
      estorna_id: lancamentoId,
      evento_id: orig.evento_id,
      criado_por: pessoaId || null,
      partidas: reversedPartidas,
      tx
    });
  });
}

export async function listContas() {
  const db = await getDb();
  const res = await db.query<{
    id: number;
    codigo: string;
    nome: string;
    natureza: string;
    pai_id: number | null;
    aceita_lancamento: boolean;
  }>(`SELECT id, codigo, nome, natureza, pai_id, aceita_lancamento FROM contas ORDER BY codigo ASC`);
  return res.rows;
}

export async function createConta(params: {
  codigo: string;
  nome: string;
  natureza: "ativo" | "passivo" | "receita" | "despesa";
  aceita_lancamento?: boolean;
  pessoa_id?: number | null;
}) {
  return withTransaction(async tx => {
    const rootDigit = params.codigo.split(".")[0];
    const parentRes = await tx.query<{ id: number }>("SELECT id FROM contas WHERE codigo = $1", [rootDigit]);
    const paiId = parentRes.rows[0]?.id ?? null;

    const ins = await tx.query<{ id: number; codigo: string; nome: string; natureza: string; aceita_lancamento: boolean }>(
      `INSERT INTO contas (codigo, nome, natureza, pai_id, aceita_lancamento)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, codigo, nome, natureza, aceita_lancamento`,
      [params.codigo, params.nome, params.natureza, paiId, params.aceita_lancamento ?? true]
    );

    await recordAudit({
      pessoa_id: params.pessoa_id,
      acao: "CRIAR_CONTA",
      entidade: "contas",
      entidade_id: ins.rows[0].id,
      depois: ins.rows[0],
      tx
    });

    return ins.rows[0];
  });
}

export async function listLancamentos() {
  const db = await getDb();
  const lancRes = await db.query<{
    id: string;
    data: string;
    descricao: string;
    estorna_id: string | null;
    evento_id: number | null;
    criado_em: string;
    estornado_por_id: string | null;
  }>(`
    SELECT l.id, l.data::text as data, l.descricao, l.estorna_id, l.evento_id, l.criado_em,
           rev.id as estornado_por_id
    FROM lancamentos l
    LEFT JOIN lancamentos rev ON rev.estorna_id = l.id
    ORDER BY l.id DESC
  `);

  const partRes = await db.query<{
    id: string;
    lancamento_id: string;
    conta_id: number;
    codigo: string;
    conta_nome: string;
    debito_centavos: string;
    credito_centavos: string;
  }>(`
    SELECT p.id, p.lancamento_id, p.conta_id, c.codigo, c.nome as conta_nome,
           p.debito_centavos, p.credito_centavos
    FROM partidas p
    JOIN contas c ON c.id = p.conta_id
    ORDER BY p.id ASC
  `);

  const byLanc = new Map<number, any[]>();
  for (const p of partRes.rows) {
    const lid = Number(p.lancamento_id);
    if (!byLanc.has(lid)) byLanc.set(lid, []);
    byLanc.get(lid)!.push({
      id: Number(p.id),
      conta_id: p.conta_id,
      codigo: p.codigo,
      conta_nome: p.conta_nome,
      debito_centavos: Number(p.debito_centavos),
      credito_centavos: Number(p.credito_centavos)
    });
  }

  return lancRes.rows.map(l => ({
    id: Number(l.id),
    data: l.data,
    descricao: l.descricao,
    estorna_id: l.estorna_id ? Number(l.estorna_id) : null,
    estornado_por_id: l.estornado_por_id ? Number(l.estornado_por_id) : null,
    evento_id: l.evento_id,
    partidas: byLanc.get(Number(l.id)) || []
  }));
}

export async function getTrialBalance() {
  const db = await getDb();
  const res = await db.query<{
    id: number;
    codigo: string;
    nome: string;
    natureza: string;
    debitos_centavos: string;
    creditos_centavos: string;
  }>(`
    SELECT c.id, c.codigo, c.nome, c.natureza,
           COALESCE(SUM(p.debito_centavos), 0) as debitos_centavos,
           COALESCE(SUM(p.credito_centavos), 0) as creditos_centavos
    FROM contas c
    LEFT JOIN partidas p ON p.conta_id = c.id
    WHERE c.aceita_lancamento = true
    GROUP BY c.id, c.codigo, c.nome, c.natureza
    ORDER BY c.codigo ASC
  `);

  let totalDebitos = 0;
  let totalCreditos = 0;

  const rows = res.rows.map(r => {
    const d = Number(r.debitos_centavos);
    const c = Number(r.creditos_centavos);
    totalDebitos += d;
    totalCreditos += c;
    const isDevedora = r.natureza === "ativo" || r.natureza === "despesa";
    const saldo = isDevedora ? d - c : c - d;
    return {
      id: r.id,
      codigo: r.codigo,
      nome: r.nome,
      natureza: r.natureza,
      debitos_centavos: d,
      creditos_centavos: c,
      saldo_centavos: saldo
    };
  });

  return {
    contas: rows,
    total_debitos_centavos: totalDebitos,
    total_creditos_centavos: totalCreditos,
    conferem: totalDebitos === totalCreditos
  };
}

export async function listTaxasPorMetodo() {
  const db = await getDb();
  const res = await db.query<{
    regra_id: number;
    metodo_id: number;
    metodo_nome: string;
    bandeira: string;
    parcelas_min: number;
    parcelas_max: number;
    taxa_bps: number;
  }>(`
    SELECT r.id as regra_id, m.id as metodo_id, m.nome as metodo_nome, m.bandeira,
           r.parcelas_min, r.parcelas_max, r.taxa_bps
    FROM regras_taxa r
    JOIN metodos_pagamento m ON m.id = r.metodo_id
    WHERE m.ativo = true
    ORDER BY r.id ASC
  `);

  return res.rows.map(r => {
    let label = r.metodo_nome;
    if (r.metodo_nome === "Crédito") {
      if (r.parcelas_min === 1 && r.parcelas_max === 1) label = "Crédito à vista";
      else label = `Crédito ${r.parcelas_min} a ${r.parcelas_max}x`;
    }
    return {
      ...r,
      label,
      display_select: `${label} (${r.bandeira})`
    };
  });
}

export async function updateRegraTaxa(regraId: number, taxaBps: number, pessoaId?: number | null) {
  return withTransaction(async tx => {
    const beforeRes = await tx.query("SELECT * FROM regras_taxa WHERE id = $1", [regraId]);
    if (beforeRes.rows.length === 0) throw new Error("Regra de taxa não encontrada");

    const afterRes = await tx.query(
      "UPDATE regras_taxa SET taxa_bps = $1 WHERE id = $2 RETURNING *",
      [taxaBps, regraId]
    );

    await recordAudit({
      pessoa_id: pessoaId,
      acao: "ATUALIZAR_TAXA_GATEWAY",
      entidade: "regras_taxa",
      entidade_id: regraId,
      antes: beforeRes.rows[0],
      depois: afterRes.rows[0],
      tx
    });

    return afterRes.rows[0];
  });
}

export async function registerTicketSale(params: {
  evento_nome?: string;
  evento_id?: number;
  regra_taxa_id: number;
  bruto_centavos: number;
  comissao_bps: number;
  taxa_paga_por: "disk" | "produtor";
  pessoa_id?: number | null;
}) {
  return withTransaction(async tx => {
    const regraRes = await tx.query<{
      id: number;
      metodo_id: number;
      parcelas_min: number;
      taxa_bps: number;
      metodo_nome: string;
      bandeira: string;
    }>(
      `SELECT r.id, r.metodo_id, r.parcelas_min, r.taxa_bps, m.nome as metodo_nome, m.bandeira
       FROM regras_taxa r
       JOIN metodos_pagamento m ON m.id = r.metodo_id
       WHERE r.id = $1`,
      [params.regra_taxa_id]
    );
    if (regraRes.rows.length === 0) throw new Error("Método/regra de taxa não encontrado");
    const regra = regraRes.rows[0];

    let eventoId = params.evento_id;
    let eventoNome = params.evento_nome || "Evento exemplo";
    if (!eventoId) {
      const evRes = await tx.query<{ id: number; nome: string }>(
        `SELECT id, nome FROM eventos WHERE LOWER(nome) = LOWER($1) LIMIT 1`,
        [eventoNome]
      );
      if (evRes.rows.length > 0) {
        eventoId = evRes.rows[0].id;
        eventoNome = evRes.rows[0].nome;
      } else {
        let prodRes = await tx.query<{ id: number }>("SELECT id FROM produtores ORDER BY id ASC LIMIT 1");
        if (prodRes.rows.length === 0) {
          prodRes = await tx.query<{ id: number }>(
            "INSERT INTO produtores (nome, documento) VALUES ('Produtor Exemplo Disk', '00.000.000/0001-00') RETURNING id"
          );
        }
        const prodId = prodRes.rows[0].id;
        const newEv = await tx.query<{ id: number }>(
          `INSERT INTO eventos (produtor_id, nome, comissao_bps) VALUES ($1, $2, $3) RETURNING id`,
          [prodId, eventoNome, params.comissao_bps]
        );
        eventoId = newEv.rows[0].id;
      }
    }

    const math = calculateSaleMath({
      bruto_centavos: params.bruto_centavos,
      taxa_bps: regra.taxa_bps,
      comissao_bps: params.comissao_bps,
      taxa_paga_por: params.taxa_paga_por
    });

    // Lookup account IDs by codigo
    const contasRes = await tx.query<{ id: number; codigo: string }>(
      `SELECT id, codigo FROM contas WHERE codigo IN ('1.1.02', '2.1.01', '3.1.01', '4.1.01')`
    );
    const codeToId = new Map(contasRes.rows.map(c => [c.codigo, c.id]));

    const partidas: PartidaInput[] = [
      {
        conta_id: codeToId.get("1.1.02")!,
        debito_centavos: math.liquido_gateway_centavos,
        credito_centavos: 0
      }
    ];

    if (params.taxa_paga_por === "disk" && math.taxa_gateway_centavos > 0) {
      partidas.push({
        conta_id: codeToId.get("4.1.01")!,
        debito_centavos: math.taxa_gateway_centavos,
        credito_centavos: 0
      });
    }

    if (math.comissao_centavos > 0) {
      partidas.push({
        conta_id: codeToId.get("3.1.01")!,
        debito_centavos: 0,
        credito_centavos: math.comissao_centavos
      });
    }

    if (math.repasse_centavos > 0) {
      partidas.push({
        conta_id: codeToId.get("2.1.01")!,
        debito_centavos: 0,
        credito_centavos: math.repasse_centavos
      });
    }

    const metodoLabel =
      regra.metodo_nome === "Crédito"
        ? regra.parcelas_min === 1
          ? "Crédito à vista"
          : `Crédito ${regra.parcelas_min}x`
        : regra.metodo_nome;

    const lanc = await postJournalEntry({
      descricao: `Venda de ingressos – ${eventoNome} (${metodoLabel} / taxa: ${params.taxa_paga_por})`,
      evento_id: eventoId,
      criado_por: params.pessoa_id || null,
      partidas,
      tx
    });

    const vendaRes = await tx.query<{ id: string }>(
      `INSERT INTO vendas (
         evento_id, metodo_id, parcelas, bruto_centavos,
         taxa_gateway_centavos, comissao_centavos, repasse_centavos,
         taxa_paga_por, lancamento_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        eventoId,
        regra.metodo_id,
        regra.parcelas_min,
        math.bruto_centavos,
        math.taxa_gateway_centavos,
        math.comissao_centavos,
        math.repasse_centavos,
        params.taxa_paga_por,
        lanc.id
      ]
    );

    await recordAudit({
      pessoa_id: params.pessoa_id,
      acao: "REGISTRAR_VENDA_INGRESSO",
      entidade: "vendas",
      entidade_id: vendaRes.rows[0].id,
      depois: { venda_id: Number(vendaRes.rows[0].id), ...math, lancamento_id: lanc.id },
      tx
    });

    return {
      venda_id: Number(vendaRes.rows[0].id),
      lancamento_id: lanc.id,
      ...math
    };
  });
}

export async function postCashMovement(params: {
  tipo: "receber_gateway" | "repassar_produtor";
  valor_centavos: number;
  produtor_id?: number;
  pessoa_id?: number | null;
}) {
  return withTransaction(async tx => {
    const contasRes = await tx.query<{ id: number; codigo: string }>(
      `SELECT id, codigo FROM contas WHERE codigo IN ('1.1.01', '1.1.02', '2.1.01')`
    );
    const codeToId = new Map(contasRes.rows.map(c => [c.codigo, c.id]));

    if (params.tipo === "receber_gateway") {
      return postJournalEntry({
        descricao: "Recebimento de liquidação do gateway para conta bancária principal",
        criado_por: params.pessoa_id || null,
        partidas: [
          { conta_id: codeToId.get("1.1.01")!, debito_centavos: params.valor_centavos, credito_centavos: 0 },
          { conta_id: codeToId.get("1.1.02")!, debito_centavos: 0, credito_centavos: params.valor_centavos }
        ],
        tx
      });
    } else {
      const prodRes = await tx.query<{ id: number; nome: string }>(
        params.produtor_id
          ? "SELECT id, nome FROM produtores WHERE id = $1"
          : "SELECT id, nome FROM produtores ORDER BY id ASC LIMIT 1",
        params.produtor_id ? [params.produtor_id] : []
      );
      const prod = prodRes.rows[0];

      const lanc = await postJournalEntry({
        descricao: `Repasse ao produtor${prod ? " – " + prod.nome : ""}`,
        criado_por: params.pessoa_id || null,
        partidas: [
          { conta_id: codeToId.get("2.1.01")!, debito_centavos: params.valor_centavos, credito_centavos: 0 },
          { conta_id: codeToId.get("1.1.01")!, debito_centavos: 0, credito_centavos: params.valor_centavos }
        ],
        tx
      });

      if (prod) {
        await tx.query(
          `INSERT INTO repasses (produtor_id, valor_centavos, status, lancamento_id)
           VALUES ($1, $2, 'pago', $3)`,
          [prod.id, params.valor_centavos, lanc.id]
        );
      }

      return lanc;
    }
  });
}
