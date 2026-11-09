import { runMigrations } from "../../db/index.ts";
import { importSpreadsheets } from "./service.ts";

async function run() {
  await runMigrations();
  const report = await importSpreadsheets();
  console.log("\n=============================================================");
  console.log("  RELATÓRIO DE IMPORTAÇÃO DE PLANILHAS (TAREFA T3)");
  console.log("=============================================================");
  console.table({
    "Áreas Importadas (CAD_a)": report.areasImportadas,
    "Pessoas Importadas (CAD_f)": report.pessoasImportadas,
    "Planos/Tarefas 5W2H Importados": report.planosImportados,
    "Linhas Vazias/#N/A Ignoradas": report.planosRejeitados,
    "Solicitações Plataforma Importadas": report.solicitacoesImportadas,
    "Arquivos Processados": report.arquivosLidos.join(", ")
  });
}

run().catch(err => {
  console.error("Erro na importação:", err);
  process.exit(1);
});
