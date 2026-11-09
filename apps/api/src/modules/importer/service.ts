import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { getDb, withTransaction, recordAudit } from "../../db/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..", "..", "..", "..");

const DATA_DIR = path.join(rootDir, "data");
const VINA_DIR = "d:\\backupwindows\\VINA";

let lastKnownMtimeMs = 0;
let lastWriteByErpMs = 0;
let lastSyncTimestamp: string = new Date().toISOString();
let pendingExcelWrite = false;

function excelSerialToISO(val: any): string | null {
  if (val === undefined || val === null || val === "") return null;
  const num = Number(val);
  if (!Number.isNaN(num) && num > 40000 && num < 55000) {
    const utcDays = Math.floor(num - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return null;
}

export function cleanCell(val: any): string {
  if (val === undefined || val === null) return "";
  const s = String(val)
    .replace(/^[\uF0B7•\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s === "#N/A" || s === "#REF!" || s === "#VALUE!") return "";
  return s;
}

export function normalizeStatus(raw: any): "Não iniciado" | "Em andamento" | "Concluído" | "Atrasado" {
  const s = cleanCell(raw).toLowerCase();
  if (s.includes("conclu") || s === "realizado" || s.includes("feito")) return "Concluído";
  if (s.includes("atrasad")) return "Atrasado";
  if (s.includes("andamento")) return "Em andamento";
  if (
    s.includes("não realizado") ||
    s.includes("nao realizado") ||
    s.includes("não iniciado") ||
    s.includes("nao iniciado")
  ) {
    return "Não iniciado";
  }
  return "Em andamento";
}

export function classifyEtapaTeste(howRaw: string, ondeRaw?: string): "TESTE OK" | "TESTAR DISK" | "GUILHERME" | "ESTRATEGICO" {
  const h = `${cleanCell(howRaw)} ${cleanCell(ondeRaw || "")}`.toUpperCase();
  if (h.includes("TESTE OK")) return "TESTE OK";
  if (h.includes("TESTAR DISK")) return "TESTAR DISK";
  if (h.includes("GUILHERME") || h.includes("GULHERME")) return "GUILHERME";
  return "ESTRATEGICO";
}

function sheetToRowObjects(wb: XLSX.WorkBook, sheetName: string): Record<string, any>[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:Z1");
  const rows: Record<string, any>[] = [];
  for (let R = range.s.r; R <= range.e.r; ++R) {
    const rowObj: Record<string, any> = { _r: R + 1 };
    let hasVal = false;
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
      const colLetter = XLSX.utils.encode_col(C);
      const cell = ws[cellRef];
      if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== "") {
        rowObj[colLetter] = cell.v;
        hasVal = true;
      }
    }
    if (hasVal) rows.push(rowObj);
  }
  return rows;
}

function readWorkbookSafe(filePath: string): XLSX.WorkBook | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    return XLSX.read(buf, { type: "buffer", cellDates: false, cellFormula: true, cellStyles: true });
  } catch {
    return null;
  }
}

function resolveSpreadsheetCandidates(names: string[], customDataDir?: string): {
  newestPath: string | null;
  allExistingPaths: string[];
  mtimeMs: number;
} {
  const dataDir = customDataDir || DATA_DIR;
  const dirs = [dataDir, VINA_DIR];
  const existing: { path: string; mtimeMs: number }[] = [];

  for (const dir of dirs) {
    for (const name of names) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) {
        try {
          const stat = fs.statSync(full);
          if (!existing.some(e => path.resolve(e.path).toLowerCase() === path.resolve(full).toLowerCase())) {
            existing.push({ path: full, mtimeMs: stat.mtimeMs });
          }
        } catch {
          // ignore
        }
      }
    }
  }

  existing.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return {
    newestPath: existing[0]?.path || null,
    allExistingPaths: existing.map(e => e.path),
    mtimeMs: existing[0]?.mtimeMs || 0
  };
}

export interface ImportReport {
  areasImportadas: number;
  pessoasImportadas: number;
  planosImportados: number;
  planosAtualizados: number;
  planosRejeitados: number;
  solicitacoesImportadas: number;
  solicitacoesAtualizadas: number;
  arquivosLidos: string[];
  sincronizadoEm: string;
}

export function getSyncState() {
  return {
    lastSyncTimestamp,
    pendingExcelWrite
  };
}

/**
 * Row-accurate Spreadsheet -> PostgreSQL Sync:
 * Imports/updates every single row from `5W` (38 Financeiro + 25 Suporte = 63 rows)
 * and every single row from `2H` (34 Financeiro + 168 Suporte = 202 rows),
 * plus `EXE` task counters and the 445 requests from `datas das solicitaçoes e ajustes.xlsx`.
 */
export async function importSpreadsheets(customDataDir?: string): Promise<ImportReport> {
  const finCand = resolveSpreadsheetCandidates(
    ["Planilha de Plano de Ação 5W2H financeiro.xlsx", "Planilha_de_Plano_de_Ação_5W2H_financeiro.xlsx"],
    customDataDir
  );
  const supCand = resolveSpreadsheetCandidates(
    [
      "Planilha de Plano de Ação 5W2H SUPORTE2.xlsx",
      "Planilha de Plano de Ação 5W2H SUPORTE.xlsx",
      "Planilha de Plano de Ação 5W2H.xlsx"
    ],
    customDataDir
  );
  const reqCand = resolveSpreadsheetCandidates(["datas das solicitaçoes e ajustes.xlsx"], customDataDir);

  lastKnownMtimeMs = Math.max(finCand.mtimeMs, supCand.mtimeMs, reqCand.mtimeMs, lastKnownMtimeMs);
  lastSyncTimestamp = new Date().toISOString();

  const report: ImportReport = {
    areasImportadas: 0,
    pessoasImportadas: 0,
    planosImportados: 0,
    planosAtualizados: 0,
    planosRejeitados: 0,
    solicitacoesImportadas: 0,
    solicitacoesAtualizadas: 0,
    arquivosLidos: [],
    sincronizadoEm: lastSyncTimestamp
  };

  const defaultHash = await bcrypt.hash("disk123", 8);

  await withTransaction(async tx => {
    // 1. Base areas + CAD_a
    const baseAreas = ["SUPORTE", "DIRETORIA", "FINANCEIRO", "SAC", "ESTORNO", "COMERCIAL", "MKT"];
    for (const nome of baseAreas) {
      await tx.query("INSERT INTO areas (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING", [nome]);
    }

    const wbFin = finCand.newestPath ? readWorkbookSafe(finCand.newestPath) : null;
    const wbSup = supCand.newestPath ? readWorkbookSafe(supCand.newestPath) : null;
    const wbReq = reqCand.newestPath ? readWorkbookSafe(reqCand.newestPath) : null;

    for (const wb of [wbFin, wbSup]) {
      if (!wb) continue;
      const cadA = sheetToRowObjects(wb, "CAD_a");
      for (const r of cadA) {
        if (r._r <= 4) continue;
        const nome = cleanCell(r.C).toUpperCase();
        if (!nome || nome === "ÁREAS") continue;
        await tx.query("INSERT INTO areas (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING", [nome]);
        report.areasImportadas++;
      }
    }

    const areasRes = await tx.query<{ id: number; nome: string }>("SELECT id, nome FROM areas");
    const areaMap = new Map<string, number>();
    for (const a of areasRes.rows) areaMap.set(a.nome.toUpperCase(), a.id);

    // 2. Default People + CAD_f
    const defaultPeople = [
      {
        nome: "NAILA LONGAS GARCIA",
        area: "DIRETORIA",
        telefone: "",
        email: "admin@diskingressos.com.br",
        obs: "Diretoria / Perfil Admin",
        perfil: "admin"
      },
      {
        nome: "KARINE SANTOS",
        area: "FINANCEIRO",
        telefone: "",
        email: "karine@diskingressos.com.br",
        obs: "Gestora Financeira & Compliance",
        perfil: "financeiro"
      },
      {
        nome: "VINICIUS CASAGRANDE",
        area: "SUPORTE",
        telefone: "41-988565996",
        email: "vinicius.casagrande@diskingressos.com.br",
        obs: "Gestor de Suporte & Implantação",
        perfil: "suporte"
      },
      {
        nome: "EDER LONGAS GARCIA",
        area: "DIRETORIA",
        telefone: "",
        email: "eder@diskingressos.com.br",
        obs: "Diretoria",
        perfil: "admin"
      },
      {
        nome: "JACKSON",
        area: "DIRETORIA",
        telefone: "",
        email: "jackson@diskingressos.com.br",
        obs: "Diretoria",
        perfil: "admin"
      },
      {
        nome: "NAILA / JACKSON/ EDER",
        area: "DIRETORIA",
        telefone: "",
        email: "diretoria@diskingressos.com.br",
        obs: "Colegiado Diretoria",
        perfil: "admin"
      },
      {
        nome: "GUILHERME",
        area: "SUPORTE",
        telefone: "",
        email: "guilherme@diskingressos.com.br",
        obs: "Desenvolvedor Plataforma de Vendas",
        perfil: "suporte"
      },
      {
        nome: "ATENDIMENTO SAC",
        area: "SAC",
        telefone: "",
        email: "leitura@diskingressos.com.br",
        obs: "Perfil Somente Leitura / SAC",
        perfil: "leitura"
      }
    ];

    for (const p of defaultPeople) {
      const areaId = areaMap.get(p.area) || null;
      await tx.query(
        `INSERT INTO pessoas (nome, area_id, telefone, email, observacoes, senha_hash, perfil)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO UPDATE SET
           nome = EXCLUDED.nome,
           area_id = COALESCE(pessoas.area_id, EXCLUDED.area_id)`,
        [p.nome, areaId, p.telefone || null, p.email, p.obs, defaultHash, p.perfil]
      );
      report.pessoasImportadas++;
    }

    for (const wb of [wbFin, wbSup]) {
      if (!wb) continue;
      const cadF = sheetToRowObjects(wb, "CAD_f");
      for (const r of cadF) {
        if (r._r <= 4) continue;
        const nome = cleanCell(r.C).toUpperCase();
        if (!nome || nome === "NOME") continue;
        const areaName = cleanCell(r.D).toUpperCase();
        const areaId = areaMap.get(areaName) || areaMap.get("SUPORTE") || null;
        const telefone = cleanCell(r.E) || null;
        const email = cleanCell(r.F) || `${nome.toLowerCase().replace(/[^a-z0-9]/g, ".")}@diskingressos.com.br`;
        const obs = cleanCell(r.G) || null;
        const perfil = areaName === "DIRETORIA" ? "admin" : areaName === "FINANCEIRO" ? "financeiro" : "suporte";

        const existing = await tx.query<{ id: number }>("SELECT id FROM pessoas WHERE UPPER(nome) = $1", [nome]);
        if (existing.rows.length === 0) {
          await tx.query(
            `INSERT INTO pessoas (nome, area_id, telefone, email, observacoes, senha_hash, perfil)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (email) DO UPDATE SET
               telefone = COALESCE(EXCLUDED.telefone, pessoas.telefone),
               observacoes = COALESCE(EXCLUDED.observacoes, pessoas.observacoes)`,
            [nome, areaId, telefone, email, obs, defaultHash, perfil]
          );
          report.pessoasImportadas++;
        } else {
          await tx.query(
            `UPDATE pessoas
             SET area_id = COALESCE($1, area_id),
                 telefone = COALESCE($2, telefone),
                 observacoes = COALESCE($3, observacoes)
             WHERE id = $4`,
            [areaId, telefone, obs, existing.rows[0].id]
          );
        }
      }
    }

    const peopleRes = await tx.query<{ id: number; nome: string }>("SELECT id, nome FROM pessoas");
    const personMap = new Map<string, number>();
    for (const p of peopleRes.rows) personMap.set(p.nome.toUpperCase(), p.id);

    // 3. Default Producer & Evento (if empty)
    const prodCount = await tx.query<{ c: string }>("SELECT COUNT(*) as c FROM produtores");
    if (Number(prodCount.rows[0].c) === 0) {
      const p1 = await tx.query<{ id: number }>(
        `INSERT INTO produtores (nome, documento, banco, agencia, conta, chave_pix)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ["Prime Eventos & Produções Ltda", "12.345.678/0001-90", "341 - Itaú", "0341", "45892-1", "12.345.678/0001-90"]
      );
      const p2 = await tx.query<{ id: number }>(
        `INSERT INTO produtores (nome, documento, banco, agencia, conta, chave_pix)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ["Guaíra Cultural S.A.", "45.987.123/0001-11", "001 - Banco do Brasil", "1234-5", "99887-0", "financeiro@guairacultural.com.br"]
      );

      await tx.query(
        `INSERT INTO eventos (produtor_id, nome, data_evento, comissao_bps)
         VALUES ($1, 'Evento exemplo', '2026-11-30', 2000),
                ($1, 'Festival Curitiba Trap & Rock', '2026-12-12', 2000),
                ($2, 'Espetáculo Sinfônico - Mapa Poltronas', '2026-12-20', 2000)`,
        [p1.rows[0].id, p2.rows[0].id]
      );
    }

    // 4. Clean up legacy pre-004 rows where linha_planilha IS NULL (one-time transition to exact row-by-row sync)
    await tx.query("DELETE FROM plano_acao WHERE linha_planilha IS NULL AND origem_planilha != 'MANUAL'");

    const existingPlansRes = await tx.query<{
      id: number;
      origem_planilha: string;
      aba_origem: string;
      linha_planilha: number;
    }>("SELECT id, origem_planilha, aba_origem, linha_planilha FROM plano_acao WHERE linha_planilha IS NOT NULL");

    const rowLookup = new Map<string, number>();
    for (const ep of existingPlansRes.rows) {
      rowLookup.set(`${ep.origem_planilha}::${ep.aba_origem}::${ep.linha_planilha}`, ep.id);
    }

    const syncWorkbookExact = async (wb: XLSX.WorkBook | null, origem: "FINANCEIRO" | "SUPORTE", filePath: string | null) => {
      if (!wb) return;
      if (filePath) report.arquivosLidos.push(path.basename(filePath));

      const rows5W = sheetToRowObjects(wb, "5W");
      const rows2H = sheetToRowObjects(wb, "2H");
      const rowsEXE = sheetToRowObjects(wb, "EXE");

      // Map EXE by plan title to enrich 5W rows with Tarefas Programadas / Realizadas
      const exeMap = new Map<string, { prog: number; real: number; statusExe: string }>();
      for (const re of rowsEXE) {
        if (re._r <= 4) continue;
        const t = cleanCell(re.C).toLowerCase();
        if (!t || t === "planos de ação") continue;
        exeMap.set(t, {
          prog: Number(re.D) || 1,
          real: Number(re.E) || 0,
          statusExe: cleanCell(re.G)
        });
      }

      // 4A. Import/Update every row of 5W (38 Financeiro + 25 Suporte = 63 rows)
      for (const r of rows5W) {
        if (r._r <= 5) continue;
        const plano = cleanCell(r.C);
        const what = cleanCell(r.E);
        if (!plano && !what) {
          report.planosRejeitados++;
          continue;
        }
        const title = plano || what;
        const prioridade = cleanCell(r.D) || "Muito Urgente";
        const why = cleanCell(r.F);
        const whoName = cleanCell(r.G).toUpperCase();
        const areaName = cleanCell(r.H).toUpperCase() || (origem === "FINANCEIRO" ? "FINANCEIRO" : "SUPORTE");
        const whoId =
          personMap.get(whoName) ||
          personMap.get(origem === "FINANCEIRO" ? "KARINE SANTOS" : "VINICIUS CASAGRANDE") ||
          null;
        const areaId = areaMap.get(areaName) || null;
        const inicio = excelSerialToISO(r.I) || "2026-02-01";
        const prazoDias = Number(r.J) || 30;
        const fimPlanejado = excelSerialToISO(r.K) || "2026-03-03";
        const fimReal = excelSerialToISO(r.L);
        const onde = cleanCell(r.M) || "DISK";
        const statusRaw = cleanCell(r.P) || exeMap.get(title.toLowerCase())?.statusExe || "Em andamento";
        const status = normalizeStatus(statusRaw);
        const exeInfo = exeMap.get(title.toLowerCase());
        const tProg = exeInfo?.prog ?? 1;
        const tReal = exeInfo?.real ?? (status === "Concluído" ? 1 : 0);
        const etapaTeste = classifyEtapaTeste(onde, onde);

        const rowKey = `${origem}::5W::${r._r}`;
        const existingId = rowLookup.get(rowKey);

        if (existingId) {
          await tx.query(
            `UPDATE plano_acao
             SET plano = $1, prioridade = $2, what = $3, why = $4, who_id = $5, area_id = $6,
                 onde = $7, inicio = $8, prazo_dias = $9, fim_planejado = $10, fim_real = $11,
                 how = $12, status = $13, status_original = $14, etapa_teste = $15,
                 tarefas_programadas = $16, tarefas_realizadas = $17
             WHERE id = $18`,
            [
              title,
              prioridade,
              what || title,
              why,
              whoId,
              areaId,
              onde,
              inicio,
              prazoDias,
              fimPlanejado,
              fimReal,
              onde,
              status,
              statusRaw,
              etapaTeste,
              tProg,
              tReal,
              existingId
            ]
          );
          report.planosAtualizados++;
        } else {
          await tx.query(
            `INSERT INTO plano_acao (
               plano, prioridade, what, why, who_id, area_id, onde,
               inicio, prazo_dias, fim_planejado, fim_real, how, how_much_centavos,
               status, status_original, origem_planilha, aba_origem, linha_planilha,
               categoria, nao_resolvido, etapa_teste, tarefas_programadas, tarefas_realizadas
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,$15,'5W',$16,$17,false,$18,$19,$20)`,
            [
              title,
              prioridade,
              what || title,
              why,
              whoId,
              areaId,
              onde,
              inicio,
              prazoDias,
              fimPlanejado,
              fimReal,
              onde,
              status,
              statusRaw,
              origem,
              r._r,
              origem === "FINANCEIRO" ? "Plano 5W Financeiro" : "Plano 5W Suporte & Riscos",
              etapaTeste,
              tProg,
              tReal
            ]
          );
          report.planosImportados++;
        }
      }

      // 4B. Import/Update every row of 2H (34 Financeiro + 168 Suporte = 202 rows)
      for (const r2 of rows2H) {
        if (r2._r <= 5) continue;
        const pTitle = cleanCell(r2.C);
        if (!pTitle || pTitle === "Plano de Ação") {
          report.planosRejeitados++;
          continue;
        }
        const how = cleanCell(r2.D) || (origem === "FINANCEIRO" ? "Guilherme" : "TESTAR DISK");
        const rawHowMuch = cleanCell(r2.E);
        const naoResolvido = rawHowMuch.toUpperCase().includes("NÃO RESOLVIDO");
        const numVal = Number(rawHowMuch);
        const howMuchCentavos = !Number.isNaN(numVal) && numVal > 0 ? Math.round(numVal * 100) : 0;
        const fimPlanejado = excelSerialToISO(r2.F) || "2026-02-15";
        const statusRaw = cleanCell(r2.G) || "Não Realizado";
        const status = normalizeStatus(statusRaw);
        const areaName = cleanCell(r2.H).toUpperCase() || (origem === "FINANCEIRO" ? "FINANCEIRO" : "SUPORTE");
        const areaId = areaMap.get(areaName) || areaMap.get("SUPORTE") || null;
        const etapaTeste = classifyEtapaTeste(how);
        const whoId =
          personMap.get(
            etapaTeste === "GUILHERME"
              ? "GUILHERME"
              : origem === "FINANCEIRO"
              ? "KARINE SANTOS"
              : "VINICIUS CASAGRANDE"
          ) || null;

        const prioridade = naoResolvido
          ? "Muito Urgente"
          : etapaTeste === "TESTAR DISK"
          ? "Urgente"
          : "Normal";

        const rowKey = `${origem}_2H::2H::${r2._r}`;
        const existingId = rowLookup.get(rowKey);

        if (existingId) {
          await tx.query(
            `UPDATE plano_acao
             SET plano = $1, prioridade = $2, what = $3, who_id = $4, area_id = $5,
                 onde = $6, fim_planejado = $7, how = $8, how_much_centavos = $9,
                 status = $10, status_original = $11, nao_resolvido = $12, etapa_teste = $13,
                 tarefas_programadas = 1, tarefas_realizadas = $14
             WHERE id = $15`,
            [
              pTitle,
              prioridade,
              pTitle,
              whoId,
              areaId,
              how,
              fimPlanejado,
              how,
              howMuchCentavos,
              status,
              statusRaw,
              naoResolvido,
              etapaTeste,
              status === "Concluído" ? 1 : 0,
              existingId
            ]
          );
          report.planosAtualizados++;
        } else {
          await tx.query(
            `INSERT INTO plano_acao (
               plano, prioridade, what, why, who_id, area_id, onde,
               inicio, prazo_dias, fim_planejado, how, how_much_centavos,
               status, status_original, origem_planilha, aba_origem, linha_planilha,
               categoria, nao_resolvido, etapa_teste, tarefas_programadas, tarefas_realizadas
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-01-15',15,$8,$9,$10,$11,$12,$13,'2H',$14,$15,$16,$17,1,$18)`,
            [
              pTitle,
              prioridade,
              pTitle,
              `Tarefa / Ajuste Técnico 2H (${origem})`,
              whoId,
              areaId,
              how,
              fimPlanejado,
              how,
              howMuchCentavos,
              status,
              statusRaw,
              `${origem}_2H`,
              r2._r,
              "Execução & Testes (Aba 2H)",
              naoResolvido,
              etapaTeste,
              status === "Concluído" ? 1 : 0
            ]
          );
          report.planosImportados++;
        }
      }
    };

    await syncWorkbookExact(wbFin, "FINANCEIRO", finCand.newestPath);
    await syncWorkbookExact(wbSup, "SUPORTE", supCand.newestPath);

    // 5. Upsert Solicitações da Plataforma ('datas das solicitaçoes e ajustes.xlsx')
    if (wbReq && reqCand.newestPath) {
      report.arquivosLidos.push(path.basename(reqCand.newestPath));
      const plan3Rows = sheetToRowObjects(wbReq, "Plan3");
      const plan3Set = new Set<string>();
      for (const r of plan3Rows) {
        if (r.A) plan3Set.add(cleanCell(r.A).toLowerCase());
      }

      const existingReqsRes = await tx.query<{ id: number; numero: number }>(
        "SELECT id, numero FROM solicitacoes_plataforma"
      );
      const reqByNum = new Map<number, number>();
      for (const er of existingReqsRes.rows) reqByNum.set(er.numero, er.id);

      const plan1Rows = sheetToRowObjects(wbReq, "Plan1");
      let currentDate = "2025-01-31";
      let num = 0;

      for (const r of plan1Rows) {
        if (r._r <= 2) continue;
        const rawA = r.A !== undefined ? String(r.A).trim() : "";
        if (!rawA) continue;
        const maybeDate = excelSerialToISO(rawA);
        if (maybeDate) {
          currentDate = maybeDate;
          continue;
        }
        if (
          rawA.startsWith("Para garantir mais segurança") ||
          rawA.startsWith("🔹") ||
          rawA.startsWith("📌") ||
          rawA.startsWith("1️⃣") ||
          rawA.startsWith("2️⃣") ||
          rawA.startsWith("3️⃣") ||
          rawA.startsWith("4️⃣") ||
          rawA.startsWith("✅") ||
          rawA.startsWith("Após seguir") ||
          rawA.startsWith("Se tudo ocorrer") ||
          rawA.startsWith("🛠️") ||
          rawA.includes("Tecnologia a favor") ||
          rawA.startsWith("Enviei uma atualização")
        ) {
          continue;
        }

        num++;
        const hasCheck = rawA.includes("☑️") || /\(feito\)/i.test(rawA);
        const desc = rawA.replace(/☑️/g, "").replace(/^\d+\s*-\s*/, "").trim();
        const norm = desc.replace(/\s*-?\s*\(feito\)/i, "").trim().toLowerCase();
        const inPlan3 = plan3Set.has(norm) || Array.from(plan3Set).some(p => p.length > 10 && norm.includes(p));
        const dLower = desc.toLowerCase();
        const modulo =
          dLower.includes("facial") || dLower.includes("rosto")
            ? "Reconhecimento Facial"
            : dLower.includes("mapa") || dLower.includes("poltrona") || dLower.includes("fila")
            ? "Mapa de Assentos"
            : dLower.includes("borderô") || dLower.includes("taxa") || dLower.includes("tarifa") || dLower.includes("despesa")
            ? "Financeiro & Borderô"
            : dLower.includes("checkout") || dLower.includes("carrinho") || dLower.includes("parcelamento")
            ? "Checkout & Pagamento"
            : dLower.includes("cupom") || dLower.includes("clube")
            ? "Cupons & Promoções"
            : dLower.includes("traduzir") || dLower.includes("tradução")
            ? "Tradução & UI"
            : "Eventos & Pedidos";

        const setor =
          modulo === "Financeiro & Borderô"
            ? "FINANCEIRO"
            : modulo === "Cupons & Promoções" || dLower.includes("banner") || dLower.includes("clube")
            ? "COMERCIAL / MKT"
            : "SUPORTE";
        const concluido = hasCheck || inPlan3;

        const existingId = reqByNum.get(num);
        if (existingId) {
          await tx.query(
            `UPDATE solicitacoes_plataforma
             SET data_solicitacao = $1, descricao = $2, setor = $3, modulo = $4, concluido = $5, homologado_plan3 = $6
             WHERE id = $7`,
            [currentDate, desc, setor, modulo, concluido, inPlan3, existingId]
          );
          report.solicitacoesAtualizadas++;
        } else {
          await tx.query(
            `INSERT INTO solicitacoes_plataforma (numero, data_solicitacao, descricao, setor, modulo, concluido, homologado_plan3)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [num, currentDate, desc, setor, modulo, concluido, inPlan3]
          );
          report.solicitacoesImportadas++;
        }
      }
    }

    // 6. Seed Open Questions from docs/PERGUNTAS_ABERTAS.md
    const openQuestions = [
      {
        codigo: "PA-01",
        topico: "Divisão da taxa (80/20)",
        pergunta: "Como é a divisão da taxa (80/20)? Entre quem, e sobre qual base?",
        origem: "Aba 5W (Linha 24) / Aba 2H (Linha 20 - NÃO RESOLVIDO)",
        parametro_atual: "Comissão padrão configurável por venda/evento (default: 20% = 2000 bps)"
      },
      {
        codigo: "PA-02",
        topico: "Responsável pela taxa do gateway",
        pergunta: "Quem paga a taxa do gateway: a Disk ou o produtor? Varia por evento?",
        origem: "Aba 5W (Linha 28) / Protótipo Fase 2",
        parametro_atual: "Parâmetro 'taxa_paga_por' selecionável em cada venda ('disk' ou 'produtor')"
      },
      {
        codigo: "PA-03",
        topico: "Alçada de negociação de taxas",
        pergunta: "Quem decide taxas e negociações com os produtores?",
        origem: "Aba 5W (Linhas 26 e 43) / Aba 2H (Linha 39)",
        parametro_atual: "Edição restrita aos perfis 'financeiro' e 'admin'"
      },
      {
        codigo: "PA-04",
        topico: "Limite de antecipação com caixa da Disk",
        pergunta: "Pode-se liberar até 100% do valor no caixa da Disk antes do evento? Qual o limite de antecipação?",
        origem: "Aba 5W (Linha 42) / Aba 2H (Linha 38 - NÃO RESOLVIDO)",
        parametro_atual: "Repasse/Antecipação controlado no razão contábil (Conta 2.1.01)"
      },
      {
        codigo: "PA-05",
        topico: "Cadastro de parcelamento por evento",
        pergunta: "Quem cadastra as opções de parcelamento de cada evento?",
        origem: "Aba 5W (Linha 41) / Aba 2H (Linha 37)",
        parametro_atual: "Faixas de parcelas configuradas em 'regras_taxa' (1x, 2 a 6x, 7 a 12x)"
      },
      {
        codigo: "PA-06",
        topico: "Métodos de pagamento padrão no evento",
        pergunta: "Quais métodos de pagamento vêm ativos por padrão em cada evento?",
        origem: "Aba 5W (Linhas 19 e 40) / Aba 2H (Linha 36 - NÃO RESOLVIDO)",
        parametro_atual: "Crédito (Visa/Master), Débito (Visa/Master) e PIX ativos por padrão"
      },
      {
        codigo: "PA-07",
        topico: "Emissão de Nota Fiscal e Contabilidade Externa",
        pergunta: "Há emissão de nota fiscal? Se sim, será por sistema contábil externo?",
        origem: "docs/PERGUNTAS_ABERTAS.md #7",
        parametro_atual: "Balancete e Razão exportáveis para integração contábil fiscal"
      }
    ];

    for (const q of openQuestions) {
      await tx.query(
        `INSERT INTO perguntas_abertas (codigo, topico, pergunta, origem, parametro_atual)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (codigo) DO NOTHING`,
        [q.codigo, q.topico, q.pergunta, q.origem, q.parametro_atual]
      );
    }

    await recordAudit({
      acao: "SINCRONIZACAO_PLANILHAS",
      entidade: "plano_acao",
      entidade_id: "ALL",
      depois: report,
      tx
    });
  });

  return report;
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function patchExcelCellsNonDestructive(
  filePath: string,
  updatesBySheet: Record<string, { cellRef: string; value: string | number; keepFormula?: boolean }[]>
): void {
  const buf = fs.readFileSync(filePath);
  const cfb = XLSX.CFB.read(buf, { type: "buffer" });

  const wbEntry = XLSX.CFB.find(cfb, "/xl/workbook.xml");
  const relsEntry = XLSX.CFB.find(cfb, "/xl/_rels/workbook.xml.rels");
  if (!wbEntry || !relsEntry) return;

  const wbXml = Buffer.from(wbEntry.content as any).toString("utf8");
  const relsXml = Buffer.from(relsEntry.content as any).toString("utf8");

  const rIdToTarget = new Map<string, string>();
  const relRegex = /<Relationship\s+[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"[^>]*?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = relRegex.exec(relsXml)) !== null) {
    rIdToTarget.set(m[1], m[2]);
  }

  const sheetToXmlPath = new Map<string, string>();
  const sheetRegex = /<sheet\s+[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"[^>]*?\/>/g;
  while ((m = sheetRegex.exec(wbXml)) !== null) {
    const target = rIdToTarget.get(m[2]);
    if (target) {
      const fullTarget = target.startsWith("/") ? target : `/xl/${target.replace(/^xl\//, "")}`;
      sheetToXmlPath.set(m[1], fullTarget);
    }
  }

  for (const [sheetName, cellUpdates] of Object.entries(updatesBySheet)) {
    if (!cellUpdates || cellUpdates.length === 0) continue;
    const xmlPath = sheetToXmlPath.get(sheetName);
    if (!xmlPath) continue;
    const sheetEntry = XLSX.CFB.find(cfb, xmlPath);
    if (!sheetEntry) continue;

    let xml = Buffer.from(sheetEntry.content as any).toString("utf8");

    for (const upd of cellUpdates) {
      const ref = upd.cellRef;
      const cellPattern = new RegExp(`<c\\s+r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
      const match = xml.match(cellPattern);
      if (match) {
        const attrs = match[1] || "";
        const inner = match[2] || "";
        const styleMatch = attrs.match(/\bs="(\d+)"/);
        const styleAttr = styleMatch ? ` s="${styleMatch[1]}"` : "";
        const formulaMatch = inner.match(/<f(?:\s[^>]*)?>[\s\S]*?<\/f>/);

        if (typeof upd.value === "number") {
          if (upd.keepFormula && formulaMatch) {
            const newCell = `<c r="${ref}"${styleAttr}>${formulaMatch[0]}<v>${upd.value}</v></c>`;
            xml = xml.replace(cellPattern, () => newCell);
          } else {
            const newCell = `<c r="${ref}"${styleAttr} t="n"><v>${upd.value}</v></c>`;
            xml = xml.replace(cellPattern, () => newCell);
          }
        } else {
          const escaped = escapeXml(upd.value);
          if (upd.keepFormula && formulaMatch) {
            const newCell = `<c r="${ref}"${styleAttr} t="str">${formulaMatch[0]}<v>${escaped}</v></c>`;
            xml = xml.replace(cellPattern, () => newCell);
          } else {
            const newCell = `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${escaped}</t></is></c>`;
            xml = xml.replace(cellPattern, () => newCell);
          }
        }
      } else {
        const rowNum = ref.replace(/^[A-Z]+/, "");
        const rowPattern = new RegExp(`(<row\\s+r="${rowNum}"[^>]*?>)([\\s\\S]*?)(</row>)`);
        if (rowPattern.test(xml)) {
          const newCell =
            typeof upd.value === "number"
              ? `<c r="${ref}" t="n"><v>${upd.value}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(upd.value))}</t></is></c>`;
          xml = xml.replace(rowPattern, (_, open, body, close) => `${open}${body}${newCell}${close}`);
        }
      }
    }

    sheetEntry.content = Buffer.from(xml, "utf8");
  }

  const outZip = XLSX.CFB.write(cfb, { type: "buffer", fileType: "zip" });
  fs.writeFileSync(filePath, outZip);
}

/**
 * ERP -> Spreadsheet Sync:
 * Updates the exact row (`linha_planilha`) in `5W`, `EXE` or `2H` inside the Excel spreadsheet(s).
 */
export async function syncPlanoAcaoToExcel(planoId: number): Promise<{ syncedFiles: string[]; lockedFiles: string[] }> {
  const db = await getDb();
  const res = await db.query<{
    id: number;
    plano: string;
    prioridade: string;
    what: string;
    why: string;
    onde: string;
    how: string;
    how_much_centavos: string;
    status: string;
    origem_planilha: string;
    aba_origem: string;
    linha_planilha: number | null;
    nao_resolvido: boolean;
    etapa_teste: string;
    area_nome: string | null;
    who_nome: string | null;
  }>(
    `SELECT p.*, a.nome as area_nome, pe.nome as who_nome
     FROM plano_acao p
     LEFT JOIN areas a ON a.id = p.area_id
     LEFT JOIN pessoas pe ON pe.id = p.who_id
     WHERE p.id = $1`,
    [planoId]
  );

  if (res.rows.length === 0) return { syncedFiles: [], lockedFiles: [] };
  const item = res.rows[0];

  const isFin = String(item.origem_planilha || "").startsWith("FINANCEIRO");
  const cand = isFin
    ? resolveSpreadsheetCandidates([
        "Planilha de Plano de Ação 5W2H financeiro.xlsx",
        "Planilha_de_Plano_de_Ação_5W2H_financeiro.xlsx"
      ])
    : resolveSpreadsheetCandidates([
        "Planilha de Plano de Ação 5W2H SUPORTE2.xlsx",
        "Planilha de Plano de Ação 5W2H SUPORTE.xlsx",
        "Planilha de Plano de Ação 5W2H.xlsx"
      ]);

  const syncedFiles: string[] = [];
  const lockedFiles: string[] = [];

  for (const filePath of cand.allExistingPaths) {
    try {
      const wb = readWorkbookSafe(filePath);
      if (!wb) continue;

      const updatesBySheet: Record<string, { cellRef: string; value: string | number; keepFormula?: boolean }[]> = {
        "5W": [],
        EXE: [],
        "2H": []
      };

      const normTarget = cleanCell(item.plano).toLowerCase();

      if (item.aba_origem === "2H") {
        // Exact row in 2H
        const row1 = item.linha_planilha;
        if (row1 && row1 > 5) {
          updatesBySheet["2H"].push(
            { cellRef: `C${row1}`, value: item.plano },
            { cellRef: `D${row1}`, value: item.how || item.etapa_teste },
            { cellRef: `G${row1}`, value: item.status === "Concluído" ? "Realizado" : "Não Realizado" }
          );
          if (item.nao_resolvido) {
            updatesBySheet["2H"].push({ cellRef: `E${row1}`, value: "NÃO RESOLVIDO" });
          } else {
            const cents = Number(item.how_much_centavos || 0);
            updatesBySheet["2H"].push({ cellRef: `E${row1}`, value: cents / 100 });
          }
          if (item.area_nome) updatesBySheet["2H"].push({ cellRef: `H${row1}`, value: item.area_nome });
        }
      } else {
        // Exact row in 5W + matching row in EXE
        const row1 = item.linha_planilha;
        if (row1 && row1 > 5) {
          updatesBySheet["5W"].push(
            { cellRef: `C${row1}`, value: item.plano },
            { cellRef: `D${row1}`, value: item.prioridade },
            { cellRef: `E${row1}`, value: item.what || item.plano },
            { cellRef: `P${row1}`, value: item.status, keepFormula: true }
          );
          if (item.why) updatesBySheet["5W"].push({ cellRef: `F${row1}`, value: item.why });
          if (item.who_nome) updatesBySheet["5W"].push({ cellRef: `G${row1}`, value: item.who_nome });
          if (item.area_nome) updatesBySheet["5W"].push({ cellRef: `H${row1}`, value: item.area_nome });
          if (item.onde) updatesBySheet["5W"].push({ cellRef: `M${row1}`, value: item.onde });
        }

        const wsExe = wb.Sheets["EXE"];
        if (wsExe) {
          const range = XLSX.utils.decode_range(wsExe["!ref"] || "A1:H60");
          for (let R = 4; R <= range.e.r; ++R) {
            const exeRow = R + 1;
            const cellC = wsExe[XLSX.utils.encode_cell({ c: 2, r: R })];
            if (cleanCell(cellC?.v).toLowerCase() === normTarget) {
              const cellD = wsExe[XLSX.utils.encode_cell({ c: 3, r: R })];
              const prog = Number(cellD?.v) || 1;
              const doneTasks = item.status === "Concluído" ? prog : item.status === "Em andamento" ? Math.max(1, Math.floor(prog / 2)) : 0;
              const pct = prog > 0 ? doneTasks / prog : 0;
              updatesBySheet.EXE.push(
                { cellRef: `E${exeRow}`, value: doneTasks },
                { cellRef: `F${exeRow}`, value: pct, keepFormula: true },
                { cellRef: `G${exeRow}`, value: item.status, keepFormula: true }
              );
              break;
            }
          }
        }
      }

      patchExcelCellsNonDestructive(filePath, updatesBySheet);
      lastWriteByErpMs = Date.now();
      lastKnownMtimeMs = Math.max(lastKnownMtimeMs, fs.statSync(filePath).mtimeMs);
      syncedFiles.push(path.basename(filePath));
    } catch {
      lockedFiles.push(path.basename(filePath));
      pendingExcelWrite = true;
    }
  }

  if (lockedFiles.length === 0) pendingExcelWrite = false;
  lastSyncTimestamp = new Date().toISOString();
  return { syncedFiles, lockedFiles };
}

export async function syncSolicitacaoToExcel(solicitacaoId: number): Promise<{ syncedFiles: string[]; lockedFiles: string[] }> {
  const db = await getDb();
  const res = await db.query<{
    id: number;
    numero: number;
    descricao: string;
    concluido: boolean;
  }>("SELECT id, numero, descricao, concluido FROM solicitacoes_plataforma WHERE id = $1", [solicitacaoId]);

  if (res.rows.length === 0) return { syncedFiles: [], lockedFiles: [] };
  const item = res.rows[0];

  const reqCand = resolveSpreadsheetCandidates(["datas das solicitaçoes e ajustes.xlsx"]);
  const syncedFiles: string[] = [];
  const lockedFiles: string[] = [];

  for (const filePath of reqCand.allExistingPaths) {
    try {
      const wb = readWorkbookSafe(filePath);
      if (!wb) continue;
      const ws1 = wb.Sheets["Plan1"];
      const updates: { cellRef: string; value: string }[] = [];
      if (ws1) {
        const range = XLSX.utils.decode_range(ws1["!ref"] || "A1:C600");
        const normDesc = cleanCell(item.descricao).toLowerCase();
        for (let R = 2; R <= range.e.r; ++R) {
          const row1 = R + 1;
          const cellA = ws1[XLSX.utils.encode_cell({ c: 0, r: R })];
          if (!cellA || !cellA.v) continue;
          const rawStr = String(cellA.v);
          const cleaned = rawStr.replace(/☑️/g, "").replace(/^\d+\s*-\s*/, "").trim().toLowerCase();
          if (cleaned === normDesc) {
            const baseText = rawStr.replace(/☑️/g, "").trim();
            const newText = item.concluido ? `${baseText} ☑️` : baseText;
            updates.push({ cellRef: `A${row1}`, value: newText });
            break;
          }
        }
      }
      if (updates.length > 0) {
        patchExcelCellsNonDestructive(filePath, { Plan1: updates });
      }
      lastWriteByErpMs = Date.now();
      lastKnownMtimeMs = Math.max(lastKnownMtimeMs, fs.statSync(filePath).mtimeMs);
      syncedFiles.push(path.basename(filePath));
    } catch {
      lockedFiles.push(path.basename(filePath));
      pendingExcelWrite = true;
    }
  }

  lastSyncTimestamp = new Date().toISOString();
  return { syncedFiles, lockedFiles };
}

export function startSpreadsheetWatcher() {
  setInterval(async () => {
    try {
      if (Date.now() - lastWriteByErpMs < 2500) return;

      const finCand = resolveSpreadsheetCandidates([
        "Planilha de Plano de Ação 5W2H financeiro.xlsx",
        "Planilha_de_Plano_de_Ação_5W2H_financeiro.xlsx"
      ]);
      const supCand = resolveSpreadsheetCandidates([
        "Planilha de Plano de Ação 5W2H SUPORTE2.xlsx",
        "Planilha de Plano de Ação 5W2H SUPORTE.xlsx",
        "Planilha de Plano de Ação 5W2H.xlsx"
      ]);
      const reqCand = resolveSpreadsheetCandidates(["datas das solicitaçoes e ajustes.xlsx"]);

      const newestDiskMtime = Math.max(finCand.mtimeMs, supCand.mtimeMs, reqCand.mtimeMs);
      if (newestDiskMtime > lastKnownMtimeMs + 500) {
        lastKnownMtimeMs = newestDiskMtime;
        const rep = await importSpreadsheets();
        console.log(
          `[Auto-Sync Planilhas -> ERP] Alteração detectada no Excel! Planos atualizados: ${rep.planosAtualizados}, Novos: ${rep.planosImportados}`
        );
      }
    } catch {
      // Ignore transient read locks
    }
  }, 3000);
}
