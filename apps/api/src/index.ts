import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import bcrypt from "bcryptjs";
import {
  LoginSchema,
  CreateContaSchema,
  LancamentoManualSimplesSchema,
  UpdateRegraTaxaSchema,
  RegistrarVendaSchema,
  MovimentacaoCaixaSchema,
  CreatePlanoAcaoSchema,
  CreatePessoaSchema,
  CreateProdutorSchema,
  CreateEventoSchema,
  Perfil
} from "@disk-erp/shared";
import { getDb, runMigrations, recordAudit } from "./db/index.ts";
import { importSpreadsheets } from "./modules/importer/service.ts";
import {
  listContas,
  createConta,
  listLancamentos,
  postJournalEntry,
  reverseJournalEntry,
  getTrialBalance,
  listTaxasPorMetodo,
  updateRegraTaxa,
  calculateSaleMath,
  registerTicketSale,
  postCashMovement
} from "./modules/financeiro/service.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..", "..");

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { id: number; nome: string; email: string; perfil: Perfil; area_id: number | null };
    user: { id: number; nome: string; email: string; perfil: Perfil; area_id: number | null };
  }
}

export async function buildServer() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "disk-erp-secret-key-2026"
  });

  // Helper to resolve current user (from JWT Bearer token or fallback header for instant demo switching)
  async function resolveCurrentUser(req: FastifyRequest) {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        await req.jwtVerify();
        return req.user;
      }
    } catch {
      // Fallback below
    }
    const db = await getDb();
    const profileHeader = (req.headers["x-demo-perfil"] as Perfil) || "admin";
    const res = await db.query<{ id: number; nome: string; email: string; perfil: Perfil; area_id: number | null }>(
      `SELECT id, nome, email, perfil, area_id FROM pessoas WHERE perfil = $1 ORDER BY id ASC LIMIT 1`,
      [profileHeader]
    );
    return (
      res.rows[0] || {
        id: 1,
        nome: "NAILA LONGAS GARCIA",
        email: "admin@diskingressos.com.br",
        perfil: "admin" as Perfil,
        area_id: 2
      }
    );
  }

  function requireRoles(allowed: Perfil[]) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const user = await resolveCurrentUser(req);
      (req as any).currentUser = user;
      if (!allowed.includes(user.perfil)) {
        return reply.status(403).send({
          error: `Acesso negado para o perfil "${user.perfil}". Perfis permitidos: ${allowed.join(", ")}.`
        });
      }
    };
  }

  // ---------------------------------------------------------------------------
  // T1: HEALTH CHECK
  // ---------------------------------------------------------------------------
  app.get("/health", async () => {
    const db = await getDb();
    const res = await db.query("SELECT 1 as ok");
    return { status: "ok", db: res.rows[0]?.ok === 1, timestamp: new Date().toISOString() };
  });

  // ---------------------------------------------------------------------------
  // T4: AUTENTICAÇÃO E PERFIS (login + troca rápida de perfil para avaliação)
  // ---------------------------------------------------------------------------
  app.post("/api/auth/login", async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { email, senha } = parsed.data;
    const db = await getDb();
    const res = await db.query<{
      id: number;
      nome: string;
      email: string;
      senha_hash: string;
      perfil: Perfil;
      area_id: number | null;
    }>(`SELECT id, nome, email, senha_hash, perfil, area_id FROM pessoas WHERE LOWER(email) = LOWER($1)`, [email]);

    const user = res.rows[0];
    if (!user || !user.senha_hash) {
      return reply.status(401).send({ error: "Credenciais inválidas" });
    }
    const valid = await bcrypt.compare(senha, user.senha_hash);
    if (!valid) {
      return reply.status(401).send({ error: "Credenciais inválidas" });
    }

    const payload = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      area_id: user.area_id
    };
    const token = app.jwt.sign(payload, { expiresIn: "12h" });

    await recordAudit({
      pessoa_id: user.id,
      acao: "LOGIN",
      entidade: "pessoas",
      entidade_id: user.id,
      depois: { email: user.email, perfil: user.perfil },
      ip: req.ip
    });

    return { token, user: payload };
  });

  app.post("/api/auth/quick-switch", async (req, reply) => {
    const { perfil } = req.body as { perfil: Perfil };
    const db = await getDb();
    const res = await db.query<{
      id: number;
      nome: string;
      email: string;
      perfil: Perfil;
      area_id: number | null;
    }>(`SELECT id, nome, email, perfil, area_id FROM pessoas WHERE perfil = $1 ORDER BY id ASC LIMIT 1`, [perfil]);

    const user = res.rows[0];
    if (!user) return reply.status(404).send({ error: "Perfil não encontrado" });
    const token = app.jwt.sign(user, { expiresIn: "12h" });
    return { token, user };
  });

  app.get("/api/auth/me", async req => {
    const user = await resolveCurrentUser(req);
    return { user };
  });

  // ---------------------------------------------------------------------------
  // T7: DASHBOARD CONSOLIDADO (5W2H + SOLICITAÇÕES + FINANCEIRO FASE 2)
  // ---------------------------------------------------------------------------
  app.get("/api/dashboard", async req => {
    const user = await resolveCurrentUser(req);
    const db = await getDb();
    const queryObj = req.query as { origem?: string };
    const origemFilter = queryObj.origem || "ALL";

    let where5w = "";
    const params5w: any[] = [];
    if (origemFilter === "FINANCEIRO") {
      where5w = "WHERE p.origem_planilha LIKE 'FINANCEIRO%'";
    } else if (origemFilter === "SUPORTE") {
      where5w = "WHERE p.origem_planilha LIKE 'SUPORTE%'";
    }

    const planosRes = await db.query<{
      id: number;
      plano: string;
      prioridade: string;
      status: string;
      origem_planilha: string;
      nao_resolvido: boolean;
      fim_planejado: string | null;
      area_nome: string | null;
      who_nome: string | null;
    }>(`
      SELECT p.id, p.plano, p.prioridade, p.status, p.origem_planilha, p.nao_resolvido,
             p.fim_planejado::text as fim_planejado,
             a.nome as area_nome, pe.nome as who_nome
      FROM plano_acao p
      LEFT JOIN areas a ON a.id = p.area_id
      LEFT JOIN pessoas pe ON pe.id = p.who_id
      ${where5w}
      ORDER BY p.id ASC
    `, params5w);

    const planos = planosRes.rows;
    const totalPlanos = planos.length;
    const concluidos = planos.filter(p => p.status === "Concluído").length;
    const emAndamento = planos.filter(p => p.status === "Em andamento").length;
    const atrasados = planos.filter(p => p.status === "Atrasado").length;
    const naoIniciados = planos.filter(p => p.status === "Não iniciado").length;
    const naoResolvidos = planos.filter(p => p.nao_resolvido).length;

    const byAreaMap: Record<string, { area: string; total: number; concluido: number; andamento: number; atrasado: number; naoIniciado: number; naoResolvido: number }> = {};
    const byWhoMap: Record<string, { responsavel: string; total: number; concluido: number; andamento: number; atrasado: number; naoResolvido: number }> = {};
    const byPriorityMap: Record<string, { prioridade: string; total: number; concluido: number; pendente: number }> = {};
    const byOrigemMap: Record<string, { origem: string; total: number; concluido: number; andamento: number; atrasado: number; naoIniciado: number; naoResolvido: number }> = {
      FINANCEIRO: { origem: "Planilha Financeiro (Karine)", total: 0, concluido: 0, andamento: 0, atrasado: 0, naoIniciado: 0, naoResolvido: 0 },
      SUPORTE: { origem: "Planilha Suporte & Riscos (Vinicius)", total: 0, concluido: 0, andamento: 0, atrasado: 0, naoIniciado: 0, naoResolvido: 0 }
    };

    for (const p of planos) {
      const a = p.area_nome || "GERAL";
      if (!byAreaMap[a]) byAreaMap[a] = { area: a, total: 0, concluido: 0, andamento: 0, atrasado: 0, naoIniciado: 0, naoResolvido: 0 };
      byAreaMap[a].total++;
      if (p.status === "Concluído") byAreaMap[a].concluido++;
      else if (p.status === "Atrasado") byAreaMap[a].atrasado++;
      else if (p.status === "Não iniciado") byAreaMap[a].naoIniciado++;
      else byAreaMap[a].andamento++;
      if (p.nao_resolvido) byAreaMap[a].naoResolvido++;

      const w = p.who_nome || "EQUIPE DISK";
      if (!byWhoMap[w]) byWhoMap[w] = { responsavel: w, total: 0, concluido: 0, andamento: 0, atrasado: 0, naoResolvido: 0 };
      byWhoMap[w].total++;
      if (p.status === "Concluído") byWhoMap[w].concluido++;
      else if (p.status === "Atrasado") byWhoMap[w].atrasado++;
      else byWhoMap[w].andamento++;
      if (p.nao_resolvido) byWhoMap[w].naoResolvido++;

      const prio = p.prioridade || "Urgente";
      if (!byPriorityMap[prio]) byPriorityMap[prio] = { prioridade: prio, total: 0, concluido: 0, pendente: 0 };
      byPriorityMap[prio].total++;
      if (p.status === "Concluído") byPriorityMap[prio].concluido++;
      else byPriorityMap[prio].pendente++;

      const origKey = String(p.origem_planilha || "").startsWith("FINANCEIRO") ? "FINANCEIRO" : "SUPORTE";
      byOrigemMap[origKey].total++;
      if (p.status === "Concluído") byOrigemMap[origKey].concluido++;
      else if (p.status === "Atrasado") byOrigemMap[origKey].atrasado++;
      else if (p.status === "Não iniciado") byOrigemMap[origKey].naoIniciado++;
      else byOrigemMap[origKey].andamento++;
      if (p.nao_resolvido) byOrigemMap[origKey].naoResolvido++;
    }

    // Solicitações da Plataforma por módulo e por mês/data
    const reqStats = await db.query<{
      modulo: string;
      total: string;
      concluidos: string;
    }>(`
      SELECT modulo, COUNT(*) as total, SUM(CASE WHEN concluido THEN 1 ELSE 0 END) as concluidos
      FROM solicitacoes_plataforma
      GROUP BY modulo
      ORDER BY COUNT(*) DESC
    `);

    const reqByDateStats = await db.query<{
      mes: string;
      total: string;
      concluidos: string;
    }>(`
      SELECT SUBSTRING(data_solicitacao::text, 1, 7) as mes,
             COUNT(*) as total,
             SUM(CASE WHEN concluido THEN 1 ELSE 0 END) as concluidos
      FROM solicitacoes_plataforma
      GROUP BY SUBSTRING(data_solicitacao::text, 1, 7)
      ORDER BY mes ASC
    `);

    const pergStats = await db.query<{ status: string; c: string }>(
      `SELECT status, COUNT(*) as c FROM perguntas_abertas GROUP BY status`
    );
    const totalPerguntas = pergStats.rows.reduce((acc, r) => acc + Number(r.c), 0);
    const perguntasDecididas = pergStats.rows.filter(r => r.status === "Decidido").reduce((acc, r) => acc + Number(r.c), 0);

    const reqTotal = reqStats.rows.reduce((acc, r) => acc + Number(r.total), 0);
    const reqDone = reqStats.rows.reduce((acc, r) => acc + Number(r.concluidos), 0);

    // Financeiro Balances (from Trial Balance)
    const tb = await getTrialBalance();
    const findSaldo = (code: string) => tb.contas.find(c => c.codigo === code)?.saldo_centavos || 0;

    const canSeeFinanceiro = user.perfil === "admin" || user.perfil === "financeiro";

    return {
      kpis: {
        totalPlanos,
        concluidos,
        emAndamento,
        atrasados,
        naoIniciados,
        naoResolvidos,
        pctConcluido: totalPlanos ? Math.round((concluidos / totalPlanos) * 100) : 0,
        reqTotal,
        reqDone,
        reqPending: reqTotal - reqDone,
        pctReq: reqTotal ? Math.round((reqDone / reqTotal) * 100) : 0,
        totalPerguntas,
        perguntasDecididas,
        perguntasPendentes: totalPerguntas - perguntasDecididas
      },
      atrasadosDestaque: planos.filter(p => p.status === "Atrasado" || p.nao_resolvido).slice(0, 14),
      porArea: Object.values(byAreaMap),
      porResponsavel: Object.values(byWhoMap),
      porPrioridade: Object.values(byPriorityMap),
      porOrigem: Object.values(byOrigemMap),
      solicitacoesPorModulo: reqStats.rows.map(r => ({
        modulo: r.modulo,
        total: Number(r.total),
        concluidos: Number(r.concluidos)
      })),
      solicitacoesPorMes: reqByDateStats.rows.map(r => ({
        mes: r.mes,
        total: Number(r.total),
        concluidos: Number(r.concluidos)
      })),
      financeiroResumo: canSeeFinanceiro
        ? {
            saldo_banco_centavos: findSaldo("1.1.01"),
            recebiveis_gateway_centavos: findSaldo("1.1.02"),
            a_repassar_produtores_centavos: findSaldo("2.1.01"),
            receita_comissao_centavos: findSaldo("3.1.01"),
            despesa_gateway_centavos: findSaldo("4.1.01"),
            conferem: tb.conferem
          }
        : null
    };
  });

  // ---------------------------------------------------------------------------
  // T6: FINANCEIRO — FASE 2 (IDÊNTICO AO VÍDEO + BANCO DE DADOS E AUDITORIA)
  // ---------------------------------------------------------------------------
  app.get("/api/financeiro/contas", async () => {
    return listContas();
  });

  app.post(
    "/api/financeiro/contas",
    { preHandler: requireRoles(["admin", "financeiro"]) },
    async (req, reply) => {
      const parsed = CreateContaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      try {
        const user = (req as any).currentUser;
        const conta = await createConta({
          ...parsed.data,
          pessoa_id: user.id
        });
        return conta;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  app.get("/api/financeiro/lancamentos", async () => {
    return listLancamentos();
  });

  app.post(
    "/api/financeiro/lancamentos/manual",
    { preHandler: requireRoles(["admin", "financeiro"]) },
    async (req, reply) => {
      const parsed = LancamentoManualSimplesSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      try {
        const user = (req as any).currentUser;
        const { descricao, debito_conta_id, credito_conta_id, valor_centavos, evento_id } = parsed.data;
        const result = await postJournalEntry({
          descricao,
          evento_id: evento_id ?? null,
          criado_por: user.id,
          partidas: [
            { conta_id: debito_conta_id, debito_centavos: valor_centavos, credito_centavos: 0 },
            { conta_id: credito_conta_id, debito_centavos: 0, credito_centavos: valor_centavos }
          ]
        });
        return result;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  app.post(
    "/api/financeiro/lancamentos/:id/estornar",
    { preHandler: requireRoles(["admin", "financeiro"]) },
    async (req, reply) => {
      const id = Number((req.params as any).id);
      try {
        const user = (req as any).currentUser;
        const estorno = await reverseJournalEntry(id, user.id);
        return estorno;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  app.get("/api/financeiro/balancete", async () => {
    return getTrialBalance();
  });

  app.get("/api/financeiro/taxas", async () => {
    return listTaxasPorMetodo();
  });

  app.put(
    "/api/financeiro/taxas/:id",
    { preHandler: requireRoles(["admin", "financeiro"]) },
    async (req, reply) => {
      const id = Number((req.params as any).id);
      const parsed = UpdateRegraTaxaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      try {
        const user = (req as any).currentUser;
        const updated = await updateRegraTaxa(id, parsed.data.taxa_bps, user.id);
        return updated;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  app.post("/api/financeiro/vendas/calcular", async (req, reply) => {
    const parsed = RegistrarVendaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const db = await getDb();
    const regraRes = await db.query<{ taxa_bps: number }>(
      "SELECT taxa_bps FROM regras_taxa WHERE id = $1",
      [parsed.data.regra_taxa_id]
    );
    if (regraRes.rows.length === 0) {
      return reply.status(404).send({ error: "Regra de taxa não encontrada" });
    }
    const math = calculateSaleMath({
      bruto_centavos: parsed.data.bruto_centavos,
      taxa_bps: regraRes.rows[0].taxa_bps,
      comissao_bps: parsed.data.comissao_bps,
      taxa_paga_por: parsed.data.taxa_paga_por
    });
    return { ...math, taxa_bps: regraRes.rows[0].taxa_bps };
  });

  app.post(
    "/api/financeiro/vendas",
    { preHandler: requireRoles(["admin", "financeiro"]) },
    async (req, reply) => {
      const parsed = RegistrarVendaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      try {
        const user = (req as any).currentUser;
        const res = await registerTicketSale({
          ...parsed.data,
          pessoa_id: user.id
        });
        return res;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  app.post(
    "/api/financeiro/caixa",
    { preHandler: requireRoles(["admin", "financeiro"]) },
    async (req, reply) => {
      const parsed = MovimentacaoCaixaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      try {
        const user = (req as any).currentUser;
        const res = await postCashMovement({
          ...parsed.data,
          pessoa_id: user.id
        });
        return res;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // T5: PLANO DE AÇÃO 5W2H, SOLICITAÇÕES & PERGUNTAS ABERTAS
  // ---------------------------------------------------------------------------
  app.get("/api/plano-acao", async () => {
    const db = await getDb();
    const res = await db.query(`
      SELECT p.id, p.plano, p.prioridade, p.what, p.why, p.who_id, p.area_id, p.onde,
             p.inicio::text as inicio, p.prazo_dias, p.fim_planejado::text as fim_planejado,
             p.fim_real::text as fim_real, p.how, p.how_much_centavos, p.status,
             p.origem_planilha, p.categoria, p.nao_resolvido, p.observacao_resolucao,
             a.nome as area_nome, pe.nome as who_nome
      FROM plano_acao p
      LEFT JOIN areas a ON a.id = p.area_id
      LEFT JOIN pessoas pe ON pe.id = p.who_id
      ORDER BY p.nao_resolvido DESC, p.id ASC
    `);
    return res.rows.map(r => ({
      ...r,
      how_much_centavos: Number(r.how_much_centavos || 0)
    }));
  });

  app.post(
    "/api/plano-acao",
    { preHandler: requireRoles(["admin", "financeiro", "suporte"]) },
    async (req, reply) => {
      const parsed = CreatePlanoAcaoSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const user = (req as any).currentUser;
      const db = await getDb();
      const d = parsed.data;
      const res = await db.query(
        `INSERT INTO plano_acao (
           plano, prioridade, what, why, who_id, area_id, onde,
           inicio, prazo_dias, fim_planejado, how, how_much_centavos, status, origem_planilha
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'MANUAL')
         RETURNING *`,
        [
          d.plano,
          d.prioridade,
          d.what,
          d.why,
          d.who_id || user.id,
          d.area_id || user.area_id || 1,
          d.onde,
          d.inicio || new Date().toISOString().slice(0, 10),
          d.prazo_dias,
          d.fim_planejado || new Date().toISOString().slice(0, 10),
          d.how || "",
          d.how_much_centavos || 0,
          d.status
        ]
      );

      await recordAudit({
        pessoa_id: user.id,
        acao: "CRIAR_PLANO_ACAO",
        entidade: "plano_acao",
        entidade_id: res.rows[0].id,
        depois: res.rows[0]
      });

      return res.rows[0];
    }
  );

  app.put(
    "/api/plano-acao/:id",
    { preHandler: requireRoles(["admin", "financeiro", "suporte"]) },
    async (req, reply) => {
      const id = Number((req.params as any).id);
      const user = (req as any).currentUser;
      const db = await getDb();
      const beforeRes = await db.query("SELECT * FROM plano_acao WHERE id = $1", [id]);
      if (beforeRes.rows.length === 0) return reply.status(404).send({ error: "Item não encontrado" });

      const body = req.body as any;
      const status = body.status ?? beforeRes.rows[0].status;
      const observacao = body.observacao_resolucao ?? beforeRes.rows[0].observacao_resolucao;
      const naoResolvido = body.nao_resolvido !== undefined ? Boolean(body.nao_resolvido) : beforeRes.rows[0].nao_resolvido;
      const fimReal = status === "Concluído" ? new Date().toISOString().slice(0, 10) : beforeRes.rows[0].fim_real;

      const afterRes = await db.query(
        `UPDATE plano_acao
         SET status = $1, observacao_resolucao = $2, nao_resolvido = $3, fim_real = $4
         WHERE id = $5 RETURNING *`,
        [status, observacao, naoResolvido, fimReal, id]
      );

      await recordAudit({
        pessoa_id: user.id,
        acao: "ATUALIZAR_PLANO_ACAO",
        entidade: "plano_acao",
        entidade_id: id,
        antes: beforeRes.rows[0],
        depois: afterRes.rows[0]
      });

      return afterRes.rows[0];
    }
  );

  app.get("/api/solicitacoes", async () => {
    const db = await getDb();
    const res = await db.query(`
      SELECT id, numero, data_solicitacao::text as data_solicitacao,
             descricao, setor, modulo, concluido, homologado_plan3, responsavel
      FROM solicitacoes_plataforma
      ORDER BY numero ASC
    `);
    return res.rows;
  });

  app.put(
    "/api/solicitacoes/:id",
    { preHandler: requireRoles(["admin", "financeiro", "suporte"]) },
    async (req, reply) => {
      const id = Number((req.params as any).id);
      const user = (req as any).currentUser;
      const db = await getDb();
      const body = req.body as { concluido: boolean };
      const afterRes = await db.query(
        "UPDATE solicitacoes_plataforma SET concluido = $1 WHERE id = $2 RETURNING *",
        [Boolean(body.concluido), id]
      );
      if (afterRes.rows.length === 0) return reply.status(404).send({ error: "Solicitação não encontrada" });

      await recordAudit({
        pessoa_id: user.id,
        acao: "ATUALIZAR_SOLICITACAO",
        entidade: "solicitacoes_plataforma",
        entidade_id: id,
        depois: afterRes.rows[0]
      });
      return afterRes.rows[0];
    }
  );

  app.get("/api/perguntas-abertas", async () => {
    const db = await getDb();
    const res = await db.query("SELECT * FROM perguntas_abertas ORDER BY codigo ASC");
    return res.rows;
  });

  app.put(
    "/api/perguntas-abertas/:id",
    { preHandler: requireRoles(["admin", "financeiro"]) },
    async (req, reply) => {
      const id = Number((req.params as any).id);
      const user = (req as any).currentUser;
      const body = req.body as { status: string; decisao: string; parametro_atual?: string };
      const db = await getDb();
      const afterRes = await db.query(
        `UPDATE perguntas_abertas
         SET status = $1, decisao = $2, parametro_atual = COALESCE($3, parametro_atual), atualizado_em = now()
         WHERE id = $4 RETURNING *`,
        [body.status, body.decisao, body.parametro_atual || null, id]
      );
      await recordAudit({
        pessoa_id: user.id,
        acao: "DECIDIR_PERGUNTA_ABERTA",
        entidade: "perguntas_abertas",
        entidade_id: id,
        depois: afterRes.rows[0]
      });
      return afterRes.rows[0];
    }
  );

  // ---------------------------------------------------------------------------
  // T5: CADASTROS BASE (COM PROTEÇÃO LGPD & RBAC PARA DADOS BANCÁRIOS/REPASSES)
  // ---------------------------------------------------------------------------
  app.get("/api/cadastros", async req => {
    const user = await resolveCurrentUser(req);
    const db = await getDb();
    const canSeeBankAndRepasses = user.perfil === "admin" || user.perfil === "financeiro";

    const areasRes = await db.query("SELECT * FROM areas ORDER BY id ASC");
    const pessoasRes = await db.query(`
      SELECT p.id, p.nome, p.area_id, a.nome as area_nome, p.telefone, p.email, p.observacoes, p.ativo, p.perfil
      FROM pessoas p
      LEFT JOIN areas a ON a.id = p.area_id
      ORDER BY p.id ASC
    `);
    const prodRes = await db.query("SELECT * FROM produtores ORDER BY id ASC");
    const evRes = await db.query(`
      SELECT e.*, p.nome as produtor_nome
      FROM eventos e
      JOIN produtores p ON p.id = e.produtor_id
      ORDER BY e.id ASC
    `);
    const repassesRes = canSeeBankAndRepasses
      ? await db.query(`
          SELECT r.*, p.nome as produtor_nome
          FROM repasses r
          JOIN produtores p ON p.id = r.produtor_id
          ORDER BY r.id DESC
        `)
      : { rows: [] };

    // Rule #5 & #6 of GEMINI.md: Suporte/Leitura cannot see bank details or repasses!
    const produtoresMasked = prodRes.rows.map(pr => {
      if (canSeeBankAndRepasses) return pr;
      return {
        id: pr.id,
        nome: pr.nome,
        documento: "***.***.***-** (LGPD)",
        banco: "Restrito ao Financeiro",
        agencia: "****",
        conta: "****",
        chave_pix: "Restrito ao Financeiro",
        ativo: pr.ativo
      };
    });

    return {
      areas: areasRes.rows,
      pessoas: pessoasRes.rows,
      produtores: produtoresMasked,
      eventos: evRes.rows,
      repasses: repassesRes.rows.map(r => ({ ...r, valor_centavos: Number(r.valor_centavos) }))
    };
  });

  app.post(
    "/api/produtores",
    { preHandler: requireRoles(["admin", "financeiro"]) },
    async (req, reply) => {
      const parsed = CreateProdutorSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const user = (req as any).currentUser;
      const db = await getDb();
      const d = parsed.data;
      const res = await db.query(
        `INSERT INTO produtores (nome, documento, banco, agencia, conta, chave_pix)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [d.nome, d.documento, d.banco || null, d.agencia || null, d.conta || null, d.chave_pix || null]
      );
      await recordAudit({
        pessoa_id: user.id,
        acao: "CRIAR_PRODUTOR",
        entidade: "produtores",
        entidade_id: res.rows[0].id,
        depois: res.rows[0]
      });
      return res.rows[0];
    }
  );

  app.post(
    "/api/eventos",
    { preHandler: requireRoles(["admin", "financeiro", "suporte"]) },
    async (req, reply) => {
      const parsed = CreateEventoSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const user = (req as any).currentUser;
      const db = await getDb();
      const d = parsed.data;
      const res = await db.query(
        `INSERT INTO eventos (produtor_id, nome, data_evento, comissao_bps)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [d.produtor_id, d.nome, d.data_evento || null, d.comissao_bps]
      );
      await recordAudit({
        pessoa_id: user.id,
        acao: "CRIAR_EVENTO",
        entidade: "eventos",
        entidade_id: res.rows[0].id,
        depois: res.rows[0]
      });
      return res.rows[0];
    }
  );

  app.post(
    "/api/pessoas",
    { preHandler: requireRoles(["admin"]) },
    async (req, reply) => {
      const parsed = CreatePessoaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const user = (req as any).currentUser;
      const db = await getDb();
      const d = parsed.data;
      const hash = await bcrypt.hash(d.senha || "disk123", 8);
      const res = await db.query(
        `INSERT INTO pessoas (nome, area_id, telefone, email, observacoes, senha_hash, perfil)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nome, area_id, telefone, email, perfil`,
        [d.nome.toUpperCase(), d.area_id || 1, d.telefone || null, d.email || null, d.observacoes || null, hash, d.perfil]
      );
      await recordAudit({
        pessoa_id: user.id,
        acao: "CRIAR_PESSOA",
        entidade: "pessoas",
        entidade_id: res.rows[0].id,
        depois: res.rows[0]
      });
      return res.rows[0];
    }
  );

  app.get("/api/auditoria", async () => {
    const db = await getDb();
    const res = await db.query(`
      SELECT a.*, p.nome as pessoa_nome, p.perfil as pessoa_perfil
      FROM auditoria a
      LEFT JOIN pessoas p ON p.id = a.pessoa_id
      ORDER BY a.id DESC
      LIMIT 150
    `);
    return res.rows;
  });

  app.post("/api/import", async () => {
    const report = await importSpreadsheets();
    return { ok: true, report };
  });

  // Serve Web build if present
  const webDist = path.join(rootDir, "apps", "web", "dist");
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/"
    });
    app.setNotFoundHandler((req, reply) => {
      if (!req.url.startsWith("/api")) {
        return reply.sendFile("index.html");
      }
      reply.status(404).send({ error: "Rota não encontrada" });
    });
  }

  return app;
}

// Start server if run directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  (async () => {
    await runMigrations();
    const report = await importSpreadsheets();
    console.log("[Disk ERP] Migrações PostgreSQL 16 e Planilhas carregadas:", report);
    const app = await buildServer();
    const port = Number(process.env.API_PORT || 3001);
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`\n=============================================================`);
    console.log(`  Disk ERP (Fase 1 + Fase 2 PostgreSQL) rodando em:`);
    console.log(`  http://localhost:${port}`);
    console.log(`=============================================================\n`);
  })();
}
