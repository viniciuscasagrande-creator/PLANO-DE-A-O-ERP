import { describe, it, expect, beforeAll } from "vitest";
import { getDb, runMigrations } from "../../db/index.ts";
import {
  calculateSaleMath,
  postJournalEntry,
  reverseJournalEntry,
  getTrialBalance,
  registerTicketSale,
  listContas
} from "./service.ts";

describe("Financeiro Fase 2 (PostgreSQL 16 + Razão Imutável em Centavos)", () => {
  beforeAll(async () => {
    process.env.PGLITE_DATA_DIR = "memory://";
    await runMigrations();
  });

  it("calcula comissão, taxa de gateway e repasse em centavos sem erro de ponto flutuante", () => {
    // R$ 1.000,00 (100000 centavos), Crédito à vista 2,99% (299 bps), Comissão 20% (2000 bps)
    const diskPays = calculateSaleMath({
      bruto_centavos: 100000,
      taxa_bps: 299,
      comissao_bps: 2000,
      taxa_paga_por: "disk"
    });
    expect(diskPays.taxa_gateway_centavos).toBe(2990); // R$ 29,90
    expect(diskPays.comissao_centavos).toBe(20000); // R$ 200,00
    expect(diskPays.liquido_gateway_centavos).toBe(97010); // R$ 970,10
    expect(diskPays.repasse_centavos).toBe(80000); // R$ 800,00

    // Quando o produtor arca com a taxa do gateway:
    const prodPays = calculateSaleMath({
      bruto_centavos: 100000,
      taxa_bps: 299,
      comissao_bps: 2000,
      taxa_paga_por: "produtor"
    });
    expect(prodPays.repasse_centavos).toBe(77010); // R$ 770,10

    // Teste de arredondamento com centavos quebrados (R$ 33,33 = 3333 centavos, taxa 2,99% = 299 bps)
    const odd = calculateSaleMath({
      bruto_centavos: 3333,
      taxa_bps: 299,
      comissao_bps: 2000,
      taxa_paga_por: "disk"
    });
    expect(Number.isInteger(odd.taxa_gateway_centavos)).toBe(true);
    expect(odd.taxa_gateway_centavos).toBe(100); // Math.round(3333 * 299 / 10000) = 100 centavos
    expect(odd.liquido_gateway_centavos + odd.taxa_gateway_centavos).toBe(3333);
  });

  it("registra venda de ingressos, fecha o balancete e bloqueia UPDATE/DELETE direto no razão", async () => {
    const venda = await registerTicketSale({
      evento_nome: "Evento exemplo",
      regra_taxa_id: 1, // Crédito à vista (299 bps)
      bruto_centavos: 100000,
      comissao_bps: 2000,
      taxa_paga_por: "disk"
    });

    expect(venda.lancamento_id).toBeGreaterThan(0);

    const tb1 = await getTrialBalance();
    expect(tb1.conferem).toBe(true);
    expect(tb1.total_debitos_centavos).toBe(100000);
    expect(tb1.total_creditos_centavos).toBe(100000);

    // Verifica que o trigger PostgreSQL bloqueia UPDATE ou DELETE em lancamentos/partidas
    const db = await getDb();
    await expect(
      db.query("DELETE FROM lancamentos WHERE id = $1", [venda.lancamento_id])
    ).rejects.toThrow(/imutável/i);

    await expect(
      db.query("UPDATE partidas SET debito_centavos = 500 WHERE lancamento_id = $1", [venda.lancamento_id])
    ).rejects.toThrow(/imutável/i);
  });

  it("realiza o estorno imutável zerando o saldo líquido da conta e mantendo histórico", async () => {
    const contas = await listContas();
    const cDespesa = contas.find(c => c.codigo === "4.1.02")!;
    const cBanco = contas.find(c => c.codigo === "1.1.01")!;

    const lanc = await postJournalEntry({
      descricao: "Pagamento fornecedor de som",
      partidas: [
        { conta_id: cDespesa.id, debito_centavos: 50000, credito_centavos: 0 },
        { conta_id: cBanco.id, debito_centavos: 0, credito_centavos: 50000 }
      ]
    });

    const estorno = await reverseJournalEntry(lanc.id);
    expect(estorno.estorna_id).toBe(lanc.id);

    // Tentar estornar novamente o mesmo lançamento deve falhar
    await expect(reverseJournalEntry(lanc.id)).rejects.toThrow(/já foi estornado/i);

    const tb = await getTrialBalance();
    expect(tb.conferem).toBe(true);
    const despesaRow = tb.contas.find(c => c.codigo === "4.1.02")!;
    expect(despesaRow.saldo_centavos).toBe(0);
  });
});
