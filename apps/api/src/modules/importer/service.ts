import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { getDb, withTransaction, recordAudit } from "../../db/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..", "..", "..", "..");

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

function cleanCell(val: any): string {
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
  if (s.includes("não realizado") || s.includes("nao realizado") || s.includes("não iniciado")) return "Não iniciado";
  return "Em andamento";
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
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: "buffer", cellDates: false });
}

export interface ImportReport {
  areasImportadas: number;
  pessoasImportadas: number;
  planosImportados: number;
  planosRejeitados: number;
  solicitacoesImportadas: number;
  arquivosLidos: string[];
}

export async function importSpreadsheets(customDataDir?: string): Promise<ImportReport> {
  const dataDir = customDataDir || path.join(rootDir, "data");
  const fallbackVinaDir = "d:\\backupwindows\\VINA";

  const resolveFile = (names: string[]): string | null => {
    for (const n of names) {
      const p1 = path.join(dataDir, n);
      if (fs.existsSync(p1)) return p1;
      const p2 = path.join(fallbackVinaDir, n);
      if (fs.existsSync(p2)) return p2;
    }
    return null;
  };

  const finPath = resolveFile([
    "Planilha_de_Plano_de_Ação_5W2H_financeiro.xlsx",
    "Planilha de Plano de Ação 5W2H financeiro.xlsx"
  ]);
  const supPath = resolveFile([
    "Planilha de Plano de Ação 5W2H SUPORTE2.xlsx",
    "Planilha de Plano de Ação 5W2H SUPORTE.xlsx",
    "Planilha de Plano de Ação 5W2H.xlsx"
  ]);
  const reqPath = resolveFile(["datas das solicitaçoes e ajustes.xlsx"]);

  const report: ImportReport = {
    areasImportadas: 0,
    pessoasImportadas: 0,
    planosImportados: 0,
    planosRejeitados: 0,
    solicitacoesImportadas: 0,
    arquivosLidos: []
  };

  const defaultHash = await bcrypt.hash("disk123", 8);

  await withTransaction(async tx => {
    // 1. Ensure base areas
    const baseAreas = ["SUPORTE", "DIRETORIA", "FINANCEIRO", "SAC", "ESTORNO", "COMERCIAL", "MKT"];
    for (const nome of baseAreas) {
      await tx.query(
        "INSERT INTO areas (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING",
        [nome]
      );
    }

    const wbFin = finPath ? readWorkbookSafe(finPath) : null;
    const wbSup = supPath ? readWorkbookSafe(supPath) : null;
    const wbReq = reqPath ? readWorkbookSafe(reqPath) : null;

    if (wbFin && finPath) {
      report.arquivosLidos.push(path.basename(finPath));
      const cadA = sheetToRowObjects(wbFin, "CAD_a");
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

    // 2. Ensure People (CAD_f + default profiles for RBAC login)
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
           area_id = EXCLUDED.area_id,
           perfil = EXCLUDED.perfil`,
        [p.nome, areaId, p.telefone || null, p.email, p.obs, defaultHash, p.perfil]
      );
      report.pessoasImportadas++;
    }

    if (wbFin) {
      const cadF = sheetToRowObjects(wbFin, "CAD_f");
      for (const r of cadF) {
        if (r._r <= 4) continue;
        const nome = cleanCell(r.C).toUpperCase();
        if (!nome || nome === "NOME") continue;
        const existing = await tx.query("SELECT id FROM pessoas WHERE UPPER(nome) = $1", [nome]);
        if (existing.rows.length === 0) {
          const areaName = cleanCell(r.D).toUpperCase();
          const areaId = areaMap.get(areaName) || areaMap.get("SUPORTE") || null;
          const email = cleanCell(r.F) || `${nome.toLowerCase().replace(/[^a-z0-9]/g, ".")}@diskingressos.com.br`;
          const perfil = areaName === "DIRETORIA" ? "admin" : areaName === "FINANCEIRO" ? "financeiro" : "suporte";
          await tx.query(
            `INSERT INTO pessoas (nome, area_id, telefone, email, observacoes, senha_hash, perfil)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (email) DO NOTHING`,
            [nome, areaId, cleanCell(r.E) || null, email, cleanCell(r.G) || null, defaultHash, perfil]
          );
          report.pessoasImportadas++;
        }
      }
    }

    const peopleRes = await tx.query<{ id: number; nome: string }>("SELECT id, nome FROM pessoas");
    const personMap = new Map<string, number>();
    for (const p of peopleRes.rows) personMap.set(p.nome.toUpperCase(), p.id);

    // 3. Ensure Default Producer & "Evento exemplo" (for Phase 2 Video compatibility)
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

    // 4. Import Plano de Ação (5W + 2H) if empty
    const existingPlans = await tx.query<{ c: string }>("SELECT COUNT(*) as c FROM plano_acao");
    if (Number(existingPlans.rows[0].c) === 0) {
      const importWorkbook5W2H = async (wb: XLSX.WorkBook | null, origem: string) => {
        if (!wb) return;
        const rows5W = sheetToRowObjects(wb, "5W");
        const rows2H = sheetToRowObjects(wb, "2H");

        // Map 2H by normalized plan title
        const map2H = new Map<string, { how: string; howMuchCentavos: number; naoResolvido: boolean; status2H: string; fimMax: string | null }>();
        for (const r2 of rows2H) {
          if (r2._r <= 5) continue;
          const pTitle = cleanCell(r2.C);
          if (!pTitle) {
            report.planosRejeitados++;
            continue;
          }
          const how = cleanCell(r2.D);
          const rawHowMuch = cleanCell(r2.E);
          const naoResolvido = rawHowMuch.toUpperCase().includes("NÃO RESOLVIDO");
          const numVal = Number(rawHowMuch);
          const howMuchCentavos = !Number.isNaN(numVal) && numVal > 0 ? Math.round(numVal * 100) : 0;
          const fimMax = excelSerialToISO(r2.F);
          const status2H = cleanCell(r2.G);
          map2H.set(pTitle.toLowerCase(), { how, howMuchCentavos, naoResolvido, status2H, fimMax });
        }

        const matched2HKeys = new Set<string>();

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
          const whoId = personMap.get(whoName) || personMap.get(origem === "FINANCEIRO" ? "KARINE SANTOS" : "VINICIUS CASAGRANDE") || null;
          const areaId = areaMap.get(areaName) || null;
          const inicio = excelSerialToISO(r.I) || "2026-02-01";
          const prazoDias = Number(r.J) || 30;
          const fimPlanejado = excelSerialToISO(r.K) || "2026-03-03";
          const fimReal = excelSerialToISO(r.L);
          const onde = cleanCell(r.M) || "DISK";
          const status = normalizeStatus(r.P);

          const m2 = map2H.get(title.toLowerCase());
          if (m2) matched2HKeys.add(title.toLowerCase());

          await tx.query(
            `INSERT INTO plano_acao (
               plano, prioridade, what, why, who_id, area_id, onde,
               inicio, prazo_dias, fim_planejado, fim_real,
               how, how_much_centavos, status, origem_planilha, categoria, nao_resolvido
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
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
              m2?.how || (onde === "Guilherme" ? "Guilherme" : "Equipe Disk"),
              m2?.howMuchCentavos || 0,
              status,
              origem,
              origem === "FINANCEIRO" ? "Financeiro & Taxas" : "Suporte, Riscos & Compliance",
              m2?.naoResolvido || false
            ]
          );
          report.planosImportados++;
        }

        // Also import standalone 2H tasks that were not in 5W (e.g. technical tasks in Suporte 2H)
        for (const r2 of rows2H) {
          if (r2._r <= 5) continue;
          const pTitle = cleanCell(r2.C);
          if (!pTitle) continue;
          if (matched2HKeys.has(pTitle.toLowerCase())) continue;

          const how = cleanCell(r2.D) || "Guilherme";
          const rawHowMuch = cleanCell(r2.E);
          const naoResolvido = rawHowMuch.toUpperCase().includes("NÃO RESOLVIDO");
          const numVal = Number(rawHowMuch);
          const howMuchCentavos = !Number.isNaN(numVal) && numVal > 0 ? Math.round(numVal * 100) : 0;
          const fimPlanejado = excelSerialToISO(r2.F) || "2026-02-15";
          const status = normalizeStatus(r2.G);
          const areaName = cleanCell(r2.H).toUpperCase() || (origem === "FINANCEIRO" ? "FINANCEIRO" : "SUPORTE");
          const areaId = areaMap.get(areaName) || areaMap.get("SUPORTE") || null;
          const whoId = personMap.get(how.toUpperCase().includes("GUILHERME") || how.toUpperCase().includes("GULHERME") ? "GUILHERME" : (origem === "FINANCEIRO" ? "KARINE SANTOS" : "VINICIUS CASAGRANDE")) || null;

          await tx.query(
            `INSERT INTO plano_acao (
               plano, prioridade, what, why, who_id, area_id, onde,
               inicio, prazo_dias, fim_planejado, how, how_much_centavos,
               status, origem_planilha, categoria, nao_resolvido
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [
              pTitle,
              naoResolvido ? "Muito Urgente" : "Urgente",
              pTitle,
              `Desdobramento 2H (${origem})`,
              whoId,
              areaId,
              how,
              "2026-01-15",
              15,
              fimPlanejado,
              how,
              howMuchCentavos,
              status,
              `${origem}_2H`,
              "Desdobramento Técnico 2H",
              naoResolvido
            ]
          );
          report.planosImportados++;
        }
      };

      await importWorkbook5W2H(wbFin, "FINANCEIRO");
      if (wbSup && supPath) {
        report.arquivosLidos.push(path.basename(supPath));
        await importWorkbook5W2H(wbSup, "SUPORTE");
      }

      // Check for any CSV file in dataDir (latin1, semicolon separated) per T3 spec
      if (fs.existsSync(dataDir)) {
        const csvFiles = fs.readdirSync(dataDir).filter(f => f.toLowerCase().endsWith(".csv"));
        for (const csvFile of csvFiles) {
          report.arquivosLidos.push(csvFile);
          const rawLatin1 = fs.readFileSync(path.join(dataDir, csvFile), "latin1");
          const lines = rawLatin1.split(/\r?\n/).filter(l => l.trim().length > 0);
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(";").map(c => cleanCell(c));
            if (!cols[0]) {
              report.planosRejeitados++;
              continue;
            }
            await tx.query(
              `INSERT INTO plano_acao (plano, prioridade, what, status, origem_planilha, categoria)
               VALUES ($1, $2, $3, $4, 'CSV_SUPORTE', 'Importação CSV')`,
              [cols[0], cols[1] || "Normal", cols[2] || cols[0], normalizeStatus(cols[3] || "Em andamento")]
            );
            report.planosImportados++;
          }
        }
      }
    }

    // 5. Import Solicitações da Plataforma ('datas das solicitaçoes e ajustes.xlsx')
    const existingReq = await tx.query<{ c: string }>("SELECT COUNT(*) as c FROM solicitacoes_plataforma");
    if (Number(existingReq.rows[0].c) === 0 && wbReq && reqPath) {
      report.arquivosLidos.push(path.basename(reqPath));
      const plan3Rows = sheetToRowObjects(wbReq, "Plan3");
      const plan3Set = new Set<string>();
      for (const r of plan3Rows) {
        if (r.A) plan3Set.add(cleanCell(r.A).toLowerCase());
      }

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
        const modulo = dLower.includes("facial") || dLower.includes("rosto")
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

        const setor = modulo === "Financeiro & Borderô" ? "FINANCEIRO" : "SUPORTE";

        await tx.query(
          `INSERT INTO solicitacoes_plataforma (numero, data_solicitacao, descricao, setor, modulo, concluido, homologado_plan3)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [num, currentDate, desc, setor, modulo, hasCheck || inPlan3, inPlan3]
        );
        report.solicitacoesImportadas++;
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
      acao: "IMPORTACAO_PLANILHAS",
      entidade: "plano_acao",
      entidade_id: "ALL",
      depois: report,
      tx
    });
  });

  return report;
}
