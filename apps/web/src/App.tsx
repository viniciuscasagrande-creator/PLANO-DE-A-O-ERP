import React, { useState, useEffect, useMemo } from "react";
import {
  Landmark,
  LayoutDashboard,
  ClipboardList,
  Wrench,
  Users,
  ShieldCheck,
  RotateCcw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Lock,
  UserCheck,
  HelpCircle,
  LogIn
} from "lucide-react";

type Perfil = "admin" | "financeiro" | "suporte" | "leitura";

function formatBRL(centavos: number): string {
  const val = (Number(centavos) || 0) / 100;
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseBRLInputToCentavos(raw: string): number {
  if (!raw) return 0;
  const normalized = String(raw).trim().replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

function formatBpsToPercentStr(bps: number): string {
  return (Number(bps || 0) / 100).toFixed(2).replace(".", ",");
}

function parsePercentStrToBps(raw: string): number {
  const num = parseFloat(String(raw).replace(",", "."));
  if (Number.isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function capitalizeNatureza(nat: string, aceitaLancamento: boolean): string {
  if (!aceitaLancamento) return "Grupo";
  if (!nat) return "";
  return nat.charAt(0).toUpperCase() + nat.slice(1);
}

export default function App() {
  // Active top-level module (defaults to 'financeiro' matching the Phase 2 video!)
  const [activeModule, setActiveModule] = useState<
    "financeiro" | "dashboard" | "plano5w2h" | "solicitacoes" | "perguntas" | "cadastros" | "auditoria"
  >("financeiro");

  // Active subtab inside 'Financeiro – razão contábil e pagamentos' (exact 4 tabs from video)
  const [finTab, setFinTab] = useState<"contas" | "lancamentos" | "balancete" | "pagamentos">("contas");

  // Auth / RBAC Profile state
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    id: number;
    nome: string;
    email: string;
    perfil: Perfil;
  }>({
    id: 2,
    nome: "KARINE SANTOS",
    email: "karine@diskingressos.com.br",
    perfil: "financeiro"
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("karine@diskingressos.com.br");
  const [loginSenha, setLoginSenha] = useState("disk123");
  const [loginError, setLoginError] = useState("");

  // Data state
  const [contas, setContas] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [balancete, setBalancete] = useState<{
    contas: any[];
    total_debitos_centavos: number;
    total_creditos_centavos: number;
    conferem: boolean;
  }>({ contas: [], total_debitos_centavos: 0, total_creditos_centavos: 0, conferem: true });
  const [taxas, setTaxas] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [planos, setPlanos] = useState<any[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [perguntas, setPerguntas] = useState<any[]>([]);
  const [cadastros, setCadastros] = useState<any>({ areas: [], pessoas: [], produtores: [], eventos: [], repasses: [] });
  const [auditoria, setAuditoria] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Tab 1: Nova conta form
  const [novaContaCodigo, setNovaContaCodigo] = useState("");
  const [novaContaNome, setNovaContaNome] = useState("");
  const [novaContaNatureza, setNovaContaNatureza] = useState<"ativo" | "passivo" | "receita" | "despesa">("ativo");

  // Tab 2: Lançamento manual form
  const [lancDesc, setLancDesc] = useState("");
  const [lancDebitoId, setLancDebitoId] = useState<number>(11);
  const [lancCreditoId, setLancCreditoId] = useState<number>(2);
  const [lancValorStr, setLancValorStr] = useState("");

  // Tab 4: Pagamentos e taxas — Registrar venda de ingressos & Movimentações de caixa
  const [vendaEvento, setVendaEvento] = useState("Evento exemplo");
  const [vendaBrutoStr, setVendaBrutoStr] = useState("1000,00");
  const [vendaRegraId, setVendaRegraId] = useState<number>(1);
  const [vendaComissaoPct, setVendaComissaoPct] = useState("20");
  const [vendaTaxaPagaPor, setVendaTaxaPagaPor] = useState<"disk" | "produtor">("disk");
  const [vendaCalculoPreview, setVendaCalculoPreview] = useState<any | null>(null);
  const [caixaValorStr, setCaixaValorStr] = useState("");

  // Filters for 5W2H & Solicitações
  const [filtro5wOrigem, setFiltro5wOrigem] = useState("ALL");
  const [filtro5wStatus, setFiltro5wStatus] = useState("ALL");
  const [apenasNaoResolvidos, setApenasNaoResolvidos] = useState(false);
  const [busca5w, setBusca5w] = useState("");
  const [buscaSolicitacao, setBuscaSolicitacao] = useState("");
  const [filtroModuloSol, setFiltroModuloSol] = useState("ALL");

  function showNotification(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function apiHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "x-demo-perfil": currentUser.perfil
    };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  async function fetchAll() {
    const headers = apiHeaders();
    const [
      contasRes,
      lancRes,
      balRes,
      taxasRes,
      dashRes,
      planosRes,
      solRes,
      pergRes,
      cadRes,
      audRes
    ] = await Promise.all([
      fetch("/api/financeiro/contas", { headers }).then(r => r.json()),
      fetch("/api/financeiro/lancamentos", { headers }).then(r => r.json()),
      fetch("/api/financeiro/balancete", { headers }).then(r => r.json()),
      fetch("/api/financeiro/taxas", { headers }).then(r => r.json()),
      fetch("/api/dashboard", { headers }).then(r => r.json()),
      fetch("/api/plano-acao", { headers }).then(r => r.json()),
      fetch("/api/solicitacoes", { headers }).then(r => r.json()),
      fetch("/api/perguntas-abertas", { headers }).then(r => r.json()),
      fetch("/api/cadastros", { headers }).then(r => r.json()),
      fetch("/api/auditoria", { headers }).then(r => r.json())
    ]);

    setContas(contasRes);
    setLancamentos(lancRes);
    setBalancete(balRes);
    setTaxas(taxasRes);
    setDashboard(dashRes);
    setPlanos(planosRes);
    setSolicitacoes(solRes);
    setPerguntas(pergRes);
    setCadastros(cadRes);
    setAuditoria(audRes);

    // Ensure default selections for Lançamento manual match video ("4.1.02 Despesas de eventos" & "1.1.01 Banco – conta principal")
    const cDespesa = contasRes.find((c: any) => c.codigo === "4.1.02");
    const cBanco = contasRes.find((c: any) => c.codigo === "1.1.01");
    if (cDespesa) setLancDebitoId(cDespesa.id);
    if (cBanco) setLancCreditoId(cBanco.id);
  }

  useEffect(() => {
    fetchAll();
  }, [currentUser.perfil, token]);

  const contasAnaliticas = useMemo(() => {
    return contas.filter(c => c.aceita_lancamento);
  }, [contas]);

  // Tab 1 handler: Criar conta
  async function handleCriarConta(e: React.FormEvent) {
    e.preventDefault();
    if (!novaContaCodigo.trim() || !novaContaNome.trim()) return;
    const res = await fetch("/api/financeiro/contas", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        codigo: novaContaCodigo.trim(),
        nome: novaContaNome.trim(),
        natureza: novaContaNatureza,
        aceita_lancamento: true
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Erro ao criar conta");
      return;
    }
    setNovaContaCodigo("");
    setNovaContaNome("");
    showNotification(`Conta ${data.codigo} – ${data.nome} criada com sucesso!`);
    fetchAll();
  }

  // Tab 2 handler: Lançamento manual
  async function handleLancamentoManual(e: React.FormEvent) {
    e.preventDefault();
    const valor_centavos = parseBRLInputToCentavos(lancValorStr);
    if (!lancDesc.trim() || valor_centavos <= 0) {
      alert("Informe a descrição e um valor válido em R$.");
      return;
    }
    const res = await fetch("/api/financeiro/lancamentos/manual", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        descricao: lancDesc.trim(),
        debito_conta_id: Number(lancDebitoId),
        credito_conta_id: Number(lancCreditoId),
        valor_centavos
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Erro ao registrar lançamento");
      return;
    }
    setLancDesc("");
    setLancValorStr("");
    showNotification(`Lançamento #${data.id} registrado no razão (${formatBRL(valor_centavos)})!`);
    fetchAll();
  }

  // Tab 2 handler: Estornar lançamento
  async function handleEstornar(lancId: number) {
    const res = await fetch(`/api/financeiro/lancamentos/${lancId}/estornar`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Não foi possível estornar");
      return;
    }
    showNotification(`Estorno criado no lançamento #${data.id} (referente ao #${lancId})!`);
    fetchAll();
  }

  // Tab 4 handler: Editar taxa por método
  async function handleChangeTaxaBps(regraId: number, rawPercentStr: string) {
    const taxa_bps = parsePercentStrToBps(rawPercentStr);
    const res = await fetch(`/api/financeiro/taxas/${regraId}`, {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify({ taxa_bps })
    });
    if (res.ok) {
      showNotification(`Taxa atualizada para ${formatBpsToPercentStr(taxa_bps)}% (${taxa_bps} bps)`);
      fetchAll();
    } else {
      const err = await res.json();
      alert(err.error || "Sem permissão para alterar taxas");
    }
  }

  // Tab 4 handler: Calcular e Registrar venda de ingressos
  async function handleCalcularVenda() {
    const bruto_centavos = parseBRLInputToCentavos(vendaBrutoStr);
    const comissao_bps = Math.round(parseFloat(vendaComissaoPct.replace(",", ".")) * 100) || 2000;
    const res = await fetch("/api/financeiro/vendas/calcular", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        evento_nome: vendaEvento,
        regra_taxa_id: Number(vendaRegraId),
        bruto_centavos,
        comissao_bps,
        taxa_paga_por: vendaTaxaPagaPor
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Erro ao calcular venda");
      return;
    }
    setVendaCalculoPreview(data);
  }

  async function handleRegistrarVenda() {
    const bruto_centavos = parseBRLInputToCentavos(vendaBrutoStr);
    const comissao_bps = Math.round(parseFloat(vendaComissaoPct.replace(",", ".")) * 100) || 2000;
    const res = await fetch("/api/financeiro/vendas", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        evento_nome: vendaEvento,
        regra_taxa_id: Number(vendaRegraId),
        bruto_centavos,
        comissao_bps,
        taxa_paga_por: vendaTaxaPagaPor
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Erro ao registrar venda");
      return;
    }
    setVendaCalculoPreview(data);
    showNotification(
      `Venda registrada! Lançamento #${data.lancamento_id} (Comissão: ${formatBRL(data.comissao_centavos)} | Repasse: ${formatBRL(data.repasse_centavos)})`
    );
    fetchAll();
  }

  // Tab 4 handler: Movimentações de caixa ("Receber do gateway" & "Repassar ao produtor")
  async function handleMovimentacaoCaixa(tipo: "receber_gateway" | "repassar_produtor") {
    const valor_centavos = parseBRLInputToCentavos(caixaValorStr);
    if (valor_centavos <= 0) {
      alert("Informe um valor em R$ para a movimentação de caixa.");
      return;
    }
    const res = await fetch("/api/financeiro/caixa", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ tipo, valor_centavos })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Erro na movimentação de caixa");
      return;
    }
    setCaixaValorStr("");
    showNotification(
      tipo === "receber_gateway"
        ? `Recebimento do gateway (${formatBRL(valor_centavos)}) lançado no banco (#${data.id})!`
        : `Repasse ao produtor (${formatBRL(valor_centavos)}) lançado no razão (#${data.id})!`
    );
    fetchAll();
  }

  async function handleQuickSwitchProfile(perfil: Perfil) {
    const res = await fetch("/api/auth/quick-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perfil })
    });
    if (res.ok) {
      const data = await res.json();
      setToken(data.token);
      setCurrentUser(data.user);
      showNotification(`Perfil alterado para: ${data.user.nome} (${data.user.perfil})`);
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, senha: loginSenha })
    });
    const data = await res.json();
    if (!res.ok) {
      setLoginError(data.error || "Falha no login");
      return;
    }
    setToken(data.token);
    setCurrentUser(data.user);
    setShowLoginModal(false);
    showNotification(`Autenticado via JWT como ${data.user.nome} (${data.user.perfil})`);
  }

  const planosFiltrados = useMemo(() => {
    return planos.filter(p => {
      if (filtro5wOrigem !== "ALL" && !String(p.origem_planilha).startsWith(filtro5wOrigem)) return false;
      if (filtro5wStatus !== "ALL" && p.status !== filtro5wStatus) return false;
      if (apenasNaoResolvidos && !p.nao_resolvido) return false;
      if (busca5w) {
        const q = busca5w.toLowerCase();
        const match =
          (p.plano || "").toLowerCase().includes(q) ||
          (p.what || "").toLowerCase().includes(q) ||
          (p.who_nome || "").toLowerCase().includes(q) ||
          (p.how || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [planos, filtro5wOrigem, filtro5wStatus, apenasNaoResolvidos, busca5w]);

  const solicitacoesFiltradas = useMemo(() => {
    return solicitacoes.filter(s => {
      if (filtroModuloSol !== "ALL" && s.modulo !== filtroModuloSol) return false;
      if (buscaSolicitacao && !s.descricao.toLowerCase().includes(buscaSolicitacao.toLowerCase())) return false;
      return true;
    });
  }, [solicitacoes, filtroModuloSol, buscaSolicitacao]);

  const modulosSolicitacao = useMemo(() => {
    return Array.from(new Set(solicitacoes.map(s => s.modulo))).sort();
  }, [solicitacoes]);

  return (
    <div>
      {/* TOP HEADER BAR */}
      <header className="top-header">
        <div className="brand-group">
          <div className="brand-mark">DI</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#ecfdf5" }}>Disk Ingressos ERP</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>PostgreSQL 16 • Centavos & Razão Imutável</div>
          </div>
        </div>

        <nav className="module-nav">
          <button
            className={`module-btn ${activeModule === "financeiro" ? "active" : ""}`}
            onClick={() => setActiveModule("financeiro")}
          >
            <Landmark size={15} /> Financeiro (Fase 2)
          </button>
          <button
            className={`module-btn ${activeModule === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveModule("dashboard")}
          >
            <LayoutDashboard size={15} /> Dashboard (T7)
          </button>
          <button
            className={`module-btn ${activeModule === "plano5w2h" ? "active" : ""}`}
            onClick={() => setActiveModule("plano5w2h")}
          >
            <ClipboardList size={15} /> Plano 5W2H ({planos.length})
          </button>
          <button
            className={`module-btn ${activeModule === "solicitacoes" ? "active" : ""}`}
            onClick={() => setActiveModule("solicitacoes")}
          >
            <Wrench size={15} /> Ajustes Plataforma ({solicitacoes.length})
          </button>
          <button
            className={`module-btn ${activeModule === "perguntas" ? "active" : ""}`}
            onClick={() => setActiveModule("perguntas")}
          >
            <HelpCircle size={15} /> Perguntas Abertas ({perguntas.length})
          </button>
          <button
            className={`module-btn ${activeModule === "cadastros" ? "active" : ""}`}
            onClick={() => setActiveModule("cadastros")}
          >
            <Users size={15} /> Cadastros & LGPD
          </button>
          <button
            className={`module-btn ${activeModule === "auditoria" ? "active" : ""}`}
            onClick={() => setActiveModule("auditoria")}
          >
            <ShieldCheck size={15} /> Auditoria ({auditoria.length})
          </button>
        </nav>

        <div className="auth-controls">
          <div className="profile-pill" title="Alternar Perfil de Acesso (T4 RBAC)">
            <UserCheck size={14} color="#10b981" />
            <span style={{ color: "#94a3b8" }}>{currentUser.nome.split(" ")[0]}:</span>
            <select
              value={currentUser.perfil}
              onChange={e => handleQuickSwitchProfile(e.target.value as Perfil)}
            >
              <option value="financeiro">financeiro (Karine)</option>
              <option value="admin">admin (Diretoria)</option>
              <option value="suporte">suporte (Vinicius - s/ banco)</option>
              <option value="leitura">leitura (SAC)</option>
            </select>
          </div>
          <button className="btn-secondary" onClick={() => setShowLoginModal(true)}>
            <LogIn size={14} /> Login JWT
          </button>
        </div>
      </header>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#065f46",
            border: "1px solid #10b981",
            color: "#ecfdf5",
            padding: "12px 18px",
            borderRadius: 8,
            boxShadow: "0 10px 25px rgba(0,0,0,0.45)",
            zIndex: 100,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <CheckCircle2 size={16} color="#34d399" /> {toast}
        </div>
      )}

      {/* =====================================================================
          MODULE 1: FINANCEIRO – RAZÃO CONTÁBIL E PAGAMENTOS (EXACT VIDEO UI)
         ===================================================================== */}
      {activeModule === "financeiro" && (
        <main className="page-container">
          <h1 className="page-title">Financeiro – razão contábil e pagamentos</h1>
          <p className="page-subtitle">
            Fase 2: plano de contas, lançamentos de dupla entrada e métodos de pagamento com taxas.
          </p>

          {/* 4 Sub-tabs identical to video */}
          <div className="subtabs-bar">
            <button
              className={`subtab-btn ${finTab === "contas" ? "active" : ""}`}
              onClick={() => setFinTab("contas")}
            >
              Plano de contas
            </button>
            <button
              className={`subtab-btn ${finTab === "lancamentos" ? "active" : ""}`}
              onClick={() => setFinTab("lancamentos")}
            >
              Lançamentos
            </button>
            <button
              className={`subtab-btn ${finTab === "balancete" ? "active" : ""}`}
              onClick={() => setFinTab("balancete")}
            >
              Balancete
            </button>
            <button
              className={`subtab-btn ${finTab === "pagamentos" ? "active" : ""}`}
              onClick={() => setFinTab("pagamentos")}
            >
              Pagamentos e taxas
            </button>
          </div>

          {/* -----------------------------------------------------------------
              SUBTAB 1: PLANO DE CONTAS (Video 00:00 - 00:05)
             ----------------------------------------------------------------- */}
          {finTab === "contas" && (
            <>
              <div className="panel-no-pad">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "18%" }}>Código</th>
                      <th style={{ width: "62%" }}>Conta</th>
                      <th style={{ width: "20%" }}>Natureza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contas.map(c => (
                      <tr key={c.id} className={!c.aceita_lancamento ? "group-row" : ""}>
                        <td>{c.codigo}</td>
                        <td>{c.nome}</td>
                        <td>{capitalizeNatureza(c.natureza, c.aceita_lancamento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="panel">
                <div className="panel-title">Nova conta</div>
                <form className="form-row" onSubmit={handleCriarConta}>
                  <div className="field" style={{ width: 160 }}>
                    <label>Código</label>
                    <input
                      className="input-dark"
                      placeholder="1.1.03"
                      value={novaContaCodigo}
                      onChange={e => setNovaContaCodigo(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: 220 }}>
                    <label>Nome</label>
                    <input
                      className="input-dark"
                      value={novaContaNome}
                      onChange={e => setNovaContaNome(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field" style={{ width: 150 }}>
                    <label>Natureza</label>
                    <select
                      className="select-dark"
                      value={novaContaNatureza}
                      onChange={e => setNovaContaNatureza(e.target.value as any)}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="passivo">Passivo</option>
                      <option value="receita">Receita</option>
                      <option value="despesa">Despesa</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-emerald">
                    Criar conta
                  </button>
                </form>
              </div>
            </>
          )}

          {/* -----------------------------------------------------------------
              SUBTAB 2: LANÇAMENTOS (Video 00:06 - 00:11)
             ----------------------------------------------------------------- */}
          {finTab === "lancamentos" && (
            <>
              <div className="amber-notice">
                Lançamentos não podem ser editados nem apagados. Para corrigir, use Estornar: o sistema cria um lançamento contrário e mantém o histórico.
              </div>

              <div className="panel">
                <div className="panel-title">Lançamento manual</div>
                <form className="form-row" onSubmit={handleLancamentoManual}>
                  <div className="field" style={{ flex: 1, minWidth: 200 }}>
                    <label>Descrição</label>
                    <input
                      className="input-dark"
                      value={lancDesc}
                      onChange={e => setLancDesc(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field" style={{ width: 250 }}>
                    <label>Débito</label>
                    <select
                      className="select-dark"
                      value={lancDebitoId}
                      onChange={e => setLancDebitoId(Number(e.target.value))}
                    >
                      {contasAnaliticas.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.codigo} {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ width: 250 }}>
                    <label>Crédito</label>
                    <select
                      className="select-dark"
                      value={lancCreditoId}
                      onChange={e => setLancCreditoId(Number(e.target.value))}
                    >
                      {contasAnaliticas.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.codigo} {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ width: 150 }}>
                    <label>Valor (R$)</label>
                    <input
                      className="input-dark"
                      placeholder="0,00"
                      value={lancValorStr}
                      onChange={e => setLancValorStr(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ width: "100%", marginTop: 4 }}>
                    <button type="submit" className="btn-emerald">
                      Lançar
                    </button>
                  </div>
                </form>
              </div>

              <div className="panel-no-pad">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "8%" }}>Nº</th>
                      <th style={{ width: "14%" }}>Data</th>
                      <th style={{ width: "32%" }}>Descrição</th>
                      <th style={{ width: "34%" }}>Partidas</th>
                      <th style={{ width: "12%" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentos.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ color: "#94a3b8", padding: "18px 16px" }}>
                          Nenhum lançamento. Registre uma venda na aba Pagamentos e taxas.
                        </td>
                      </tr>
                    ) : (
                      lancamentos.map(l => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 700 }}>#{l.id}</td>
                          <td>{l.data}</td>
                          <td>
                            {l.descricao}
                            {l.estorna_id && (
                              <span className="tag tag-amber" style={{ marginLeft: 8 }}>
                                Estorna #{l.estorna_id}
                              </span>
                            )}
                            {l.estornado_por_id && (
                              <span className="tag tag-red" style={{ marginLeft: 8 }}>
                                Estornado por #{l.estornado_por_id}
                              </span>
                            )}
                          </td>
                          <td>
                            {l.partidas.map((p: any) => (
                              <div key={p.id} style={{ fontSize: 12.5, marginBottom: 2 }}>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: p.debito_centavos > 0 ? "#34d399" : "#60a5fa",
                                    marginRight: 6
                                  }}
                                >
                                  {p.debito_centavos > 0 ? "D" : "C"}
                                </span>
                                {p.codigo} {p.conta_nome}:{" "}
                                <strong>
                                  {formatBRL(p.debito_centavos > 0 ? p.debito_centavos : p.credito_centavos)}
                                </strong>
                              </div>
                            ))}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {!l.estorna_id && !l.estornado_por_id && (
                              <button
                                className="btn-danger-outline"
                                onClick={() => handleEstornar(l.id)}
                              >
                                Estornar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* -----------------------------------------------------------------
              SUBTAB 3: BALANCETE (Video 00:11 - 00:13)
             ----------------------------------------------------------------- */}
          {finTab === "balancete" && (
            <>
              <div className="panel-no-pad">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "14%" }}>Código</th>
                      <th style={{ width: "41%" }}>Conta</th>
                      <th style={{ width: "15%", textAlign: "right" }}>Débitos</th>
                      <th style={{ width: "15%", textAlign: "right" }}>Créditos</th>
                      <th style={{ width: "15%", textAlign: "right" }}>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balancete.contas.map(c => (
                      <tr key={c.id}>
                        <td>{c.codigo}</td>
                        <td>{c.nome}</td>
                        <td style={{ textAlign: "right" }}>{formatBRL(c.debitos_centavos)}</td>
                        <td style={{ textAlign: "right" }}>{formatBRL(c.creditos_centavos)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{formatBRL(c.saldo_centavos)}</td>
                      </tr>
                    ))}
                    <tr className="totals-row">
                      <td colSpan={2}>Totais</td>
                      <td style={{ textAlign: "right" }}>{formatBRL(balancete.total_debitos_centavos)}</td>
                      <td style={{ textAlign: "right" }}>{formatBRL(balancete.total_creditos_centavos)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  color: balancete.conferem ? "#10b981" : "#f87171",
                  fontWeight: 500,
                  fontSize: 13.5
                }}
              >
                {balancete.conferem ? "Débitos e créditos conferem." : "Atenção: Débitos e créditos divergentes."}
              </div>
            </>
          )}

          {/* -----------------------------------------------------------------
              SUBTAB 4: PAGAMENTOS E TAXAS (Video 00:13 - 00:17)
             ----------------------------------------------------------------- */}
          {finTab === "pagamentos" && (
            <>
              <div className="panel">
                <div className="panel-title">Taxas por método</div>
                <table className="fin-table" style={{ marginBottom: 16 }}>
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>Método</th>
                      <th style={{ width: "35%" }}>Bandeira</th>
                      <th style={{ width: "25%", textAlign: "right" }}>Taxa do gateway</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxas.map(t => (
                      <tr key={t.regra_id}>
                        <td>{t.label}</td>
                        <td>{t.bandeira}</td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <input
                              className="input-dark"
                              style={{ width: 78, textAlign: "right", padding: "5px 8px" }}
                              defaultValue={formatBpsToPercentStr(t.taxa_bps)}
                              onBlur={e => {
                                const newBps = parsePercentStrToBps(e.target.value);
                                if (newBps !== t.taxa_bps) {
                                  handleChangeTaxaBps(t.regra_id, e.target.value);
                                }
                              }}
                            />
                            <span style={{ color: "#94a3b8" }}>%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="amber-notice" style={{ marginBottom: 0 }}>
                  Premissas a confirmar com o Financeiro: a taxa de exemplo de cada método, a comissão da Disk (20% por padrão) e quem arca com a taxa do gateway.
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">Registrar venda de ingressos</div>
                <div className="form-row">
                  <div className="field" style={{ flex: 1, minWidth: 180 }}>
                    <label>Evento</label>
                    <input
                      className="input-dark"
                      value={vendaEvento}
                      onChange={e => setVendaEvento(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ width: 150 }}>
                    <label>Valor bruto (R$)</label>
                    <input
                      className="input-dark"
                      value={vendaBrutoStr}
                      onChange={e => setVendaBrutoStr(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ width: 230 }}>
                    <label>Método</label>
                    <select
                      className="select-dark"
                      value={vendaRegraId}
                      onChange={e => setVendaRegraId(Number(e.target.value))}
                    >
                      {taxas.map(t => (
                        <option key={t.regra_id} value={t.regra_id}>
                          {t.display_select}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ width: 130 }}>
                    <label>Comissão Disk (%)</label>
                    <input
                      className="input-dark"
                      value={vendaComissaoPct}
                      onChange={e => setVendaComissaoPct(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ width: 170 }}>
                    <label>Taxa do gateway paga por</label>
                    <select
                      className="select-dark"
                      value={vendaTaxaPagaPor}
                      onChange={e => setVendaTaxaPagaPor(e.target.value as "disk" | "produtor")}
                    >
                      <option value="disk">Disk</option>
                      <option value="produtor">Produtor</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button type="button" className="btn-emerald" onClick={handleCalcularVenda}>
                    Calcular
                  </button>
                  <button type="button" className="btn-secondary" onClick={handleRegistrarVenda}>
                    Registrar venda e lançar no razão
                  </button>
                </div>

                {vendaCalculoPreview && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 14,
                      borderRadius: 7,
                      background: "#091410",
                      border: "1px solid #1e382d",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                      gap: 12
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Valor Bruto</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{formatBRL(vendaCalculoPreview.bruto_centavos)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Taxa do Gateway</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#f87171" }}>
                        {formatBRL(vendaCalculoPreview.taxa_gateway_centavos)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Líquido Recebível Gateway (1.1.02)</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#60a5fa" }}>
                        {formatBRL(vendaCalculoPreview.liquido_gateway_centavos)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Comissão Disk (3.1.01)</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>
                        {formatBRL(vendaCalculoPreview.comissao_centavos)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Repasse ao Produtor (2.1.01)</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24" }}>
                        {formatBRL(vendaCalculoPreview.repasse_centavos)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel-title">Movimentações de caixa</div>
                <div className="panel-desc">
                  Recebimento do gateway no banco e repasse ao produtor (valores em R$).
                </div>
                <div className="form-row">
                  <div className="field" style={{ width: 200 }}>
                    <label>Valor</label>
                    <input
                      className="input-dark"
                      placeholder="0,00"
                      value={caixaValorStr}
                      onChange={e => setCaixaValorStr(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleMovimentacaoCaixa("receber_gateway")}
                  >
                    Receber do gateway
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleMovimentacaoCaixa("repassar_produtor")}
                  >
                    Repassar ao produtor
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      )}

      {/* =====================================================================
          MODULE 2: DASHBOARD EXECUTIVO (TAREFA T7)
         ===================================================================== */}
      {activeModule === "dashboard" && dashboard && (
        <main className="page-container">
          <h1 className="page-title">Dashboard Executivo — 5W2H & Financeiro</h1>
          <p className="page-subtitle">
            Visão unificada das planilhas 5W2H (Financeiro e Suporte), solicitações de plataforma e saldos do razão contábil.
          </p>

          <div className="kpi-grid-dark">
            <div className="kpi-box">
              <div className="kpi-box-label">Planos & Tarefas 5W2H Concluídos</div>
              <div className="kpi-box-val">
                {dashboard.kpis.concluidos} / {dashboard.kpis.totalPlanos} ({dashboard.kpis.pctConcluido}%)
              </div>
              <div className="progress-bar-dark">
                <div className="progress-fill-dark" style={{ width: `${dashboard.kpis.pctConcluido}%` }} />
              </div>
            </div>

            <div className="kpi-box">
              <div className="kpi-box-label">Atrasados / Não Resolvidos na Aba 2H</div>
              <div className="kpi-box-val" style={{ color: "#f87171" }}>
                {dashboard.kpis.atrasados} atrasados • {dashboard.kpis.naoResolvidos} não resolvidos
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
                Clique em Plano 5W2H para filtrar pendências
              </div>
            </div>

            <div className="kpi-box">
              <div className="kpi-box-label">Ajustes da Plataforma (Guilherme)</div>
              <div className="kpi-box-val">
                {dashboard.kpis.reqDone} / {dashboard.kpis.reqTotal} ({dashboard.kpis.pctReq}%)
              </div>
              <div className="progress-bar-dark">
                <div className="progress-fill-dark" style={{ width: `${dashboard.kpis.pctReq}%` }} />
              </div>
            </div>

            {dashboard.financeiroResumo ? (
              <div className="kpi-box">
                <div className="kpi-box-label">Saldo Banco (1.1.01) / A Repassar (2.1.01)</div>
                <div className="kpi-box-val" style={{ fontSize: 18, color: "#34d399" }}>
                  Banco: {formatBRL(dashboard.financeiroResumo.saldo_banco_centavos)}
                </div>
                <div style={{ fontSize: 12.5, color: "#fbbf24", marginTop: 4 }}>
                  A Repassar: {formatBRL(dashboard.financeiroResumo.a_repassar_produtores_centavos)}
                </div>
              </div>
            ) : (
              <div className="kpi-box">
                <div className="kpi-box-label">Resumo Financeiro (RBAC)</div>
                <div style={{ fontSize: 12.5, color: "#fbbf24", marginTop: 6 }}>
                  <Lock size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  Oculto para o perfil &ldquo;{currentUser.perfil}&rdquo;
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div className="panel-no-pad">
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e382d", fontWeight: 700 }}>
                Execução por Área (CAD_a)
              </div>
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Área</th>
                    <th>Total</th>
                    <th>Concluídos</th>
                    <th>Atrasados</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.porArea.map((a: any) => (
                    <tr key={a.area}>
                      <td style={{ fontWeight: 600 }}>{a.area}</td>
                      <td>{a.total}</td>
                      <td><span className="tag tag-emerald">{a.concluido}</span></td>
                      <td>
                        {a.atrasado > 0 ? <span className="tag tag-red">{a.atrasado}</span> : "0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel-no-pad">
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e382d", fontWeight: 700 }}>
                Execução por Responsável (CAD_f)
              </div>
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Responsável</th>
                    <th>Total</th>
                    <th>Concluídos</th>
                    <th>Atrasados</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.porResponsavel.map((r: any) => (
                    <tr key={r.responsavel}>
                      <td style={{ fontWeight: 600 }}>{r.responsavel}</td>
                      <td>{r.total}</td>
                      <td><span className="tag tag-emerald">{r.concluido}</span></td>
                      <td>
                        {r.atrasado > 0 ? <span className="tag tag-red">{r.atrasado}</span> : "0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel-no-pad" style={{ marginTop: 18 }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e382d", fontWeight: 700, color: "#f87171" }}>
              <AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Itens Atrasados ou Marcados como &ldquo;NÃO RESOLVIDO&rdquo; em Destaque
            </div>
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Plano de Ação / Item</th>
                  <th>Responsável</th>
                  <th>Área</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.atrasadosDestaque.map((p: any) => (
                  <tr key={p.id}>
                    <td><span className="tag tag-slate">{p.origem_planilha}</span></td>
                    <td style={{ fontWeight: 600 }}>{p.plano}</td>
                    <td>{p.who_nome}</td>
                    <td>{p.area_nome}</td>
                    <td>
                      {p.nao_resolvido && <span className="tag tag-red" style={{ marginRight: 6 }}>NÃO RESOLVIDO</span>}
                      <span className="tag tag-amber">{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* =====================================================================
          MODULE 3: PLANO DE AÇÃO 5W2H (TAREFA T3 & T5)
         ===================================================================== */}
      {activeModule === "plano5w2h" && (
        <main className="page-container">
          <h1 className="page-title">Plano de Ação 5W2H Unificado (Financeiro & Suporte)</h1>
          <p className="page-subtitle">
            {planos.length} itens importados das abas 5W e 2H com normalização automática de status.
          </p>

          <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input-dark"
              style={{ minWidth: 260 }}
              placeholder="Buscar por plano, o que será feito, quem ou como..."
              value={busca5w}
              onChange={e => setBusca5w(e.target.value)}
            />
            <select
              className="select-dark"
              value={filtro5wOrigem}
              onChange={e => setFiltro5wOrigem(e.target.value)}
            >
              <option value="ALL">Todas as Planilhas</option>
              <option value="FINANCEIRO">Planilha Financeiro (Karine)</option>
              <option value="SUPORTE">Planilha Suporte (Vinicius)</option>
            </select>
            <select
              className="select-dark"
              value={filtro5wStatus}
              onChange={e => setFiltro5wStatus(e.target.value)}
            >
              <option value="ALL">Todos os Status</option>
              <option value="Concluído">Concluído</option>
              <option value="Em andamento">Em andamento</option>
              <option value="Atrasado">Atrasado</option>
              <option value="Não iniciado">Não iniciado</option>
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#f87171", fontWeight: 600, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={apenasNaoResolvidos}
                onChange={e => setApenasNaoResolvidos(e.target.checked)}
              />
              Apenas &ldquo;NÃO RESOLVIDO&rdquo; (Aba 2H)
            </label>
          </div>

          <div className="panel-no-pad">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Plano / O Que (5W)</th>
                  <th>Quem / Área</th>
                  <th>Como (2H)</th>
                  <th>Prazo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {planosFiltrados.map(p => (
                  <tr key={p.id}>
                    <td>
                      <span className="tag tag-slate">{p.origem_planilha}</span>
                      {p.nao_resolvido && (
                        <div style={{ marginTop: 4 }}>
                          <span className="tag tag-red">NÃO RESOLVIDO</span>
                        </div>
                      )}
                    </td>
                    <td style={{ maxWidth: 340 }}>
                      <div style={{ fontWeight: 700 }}>{p.plano}</div>
                      {p.what && p.what !== p.plano && (
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>{p.what}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.who_nome || "—"}</div>
                      <span className="tag tag-slate">{p.area_nome || "DISK"}</span>
                    </td>
                    <td>{p.how || p.onde || "—"}</td>
                    <td style={{ fontSize: 12 }}>{p.fim_planejado || "—"}</td>
                    <td>
                      <select
                        className="select-dark"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        value={p.status}
                        onChange={async e => {
                          const novoStatus = e.target.value;
                          await fetch(`/api/plano-acao/${p.id}`, {
                            method: "PUT",
                            headers: apiHeaders(),
                            body: JSON.stringify({
                              status: novoStatus,
                              nao_resolvido: novoStatus === "Concluído" ? false : p.nao_resolvido
                            })
                          });
                          showNotification(`Plano #${p.id} atualizado para ${novoStatus}`);
                          fetchAll();
                        }}
                      >
                        <option value="Concluído">Concluído</option>
                        <option value="Em andamento">Em andamento</option>
                        <option value="Atrasado">Atrasado</option>
                        <option value="Não iniciado">Não iniciado</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* =====================================================================
          MODULE 4: SOLICITAÇÕES & AJUSTES DA PLATAFORMA (GUILHERME)
         ===================================================================== */}
      {activeModule === "solicitacoes" && (
        <main className="page-container">
          <h1 className="page-title">Solicitações e Ajustes da Plataforma (Guilherme)</h1>
          <p className="page-subtitle">
            445 solicitações importadas de &ldquo;datas das solicitaçoes e ajustes.xlsx&rdquo; (Plan1 + Plan3).
          </p>

          <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input
              className="input-dark"
              style={{ flex: 1, minWidth: 240 }}
              placeholder="Buscar ajuste (ex: Borderô, Master, Mapa, Facial, Cupom)..."
              value={buscaSolicitacao}
              onChange={e => setBuscaSolicitacao(e.target.value)}
            />
            <select
              className="select-dark"
              value={filtroModuloSol}
              onChange={e => setFiltroModuloSol(e.target.value)}
            >
              <option value="ALL">Todos os Módulos</option>
              {modulosSolicitacao.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="panel-no-pad">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  <th>Descrição da Solicitação / Ajuste</th>
                  <th>Módulo</th>
                  <th>Homologação</th>
                </tr>
              </thead>
              <tbody>
                {solicitacoesFiltradas.slice(0, 120).map(s => (
                  <tr key={s.id}>
                    <td style={{ color: "#94a3b8", fontWeight: 700 }}>#{s.numero}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{s.data_solicitacao}</td>
                    <td>
                      {s.descricao}
                      {s.homologado_plan3 && (
                        <span className="tag tag-emerald" style={{ marginLeft: 8 }}>Plan3</span>
                      )}
                    </td>
                    <td><span className="tag tag-slate">{s.modulo}</span></td>
                    <td>
                      <button
                        className={s.concluido ? "btn-emerald" : "btn-secondary"}
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={async () => {
                          await fetch(`/api/solicitacoes/${s.id}`, {
                            method: "PUT",
                            headers: apiHeaders(),
                            body: JSON.stringify({ concluido: !s.concluido })
                          });
                          fetchAll();
                        }}
                      >
                        {s.concluido ? "☑️ Testado" : "Marcar Testado"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* =====================================================================
          MODULE 5: PERGUNTAS ABERTAS (docs/PERGUNTAS_ABERTAS.md)
         ===================================================================== */}
      {activeModule === "perguntas" && (
        <main className="page-container">
          <h1 className="page-title">Perguntas Abertas do Financeiro (docs/PERGUNTAS_ABERTAS.md)</h1>
          <p className="page-subtitle">
            Enquanto não houver resposta definitiva do Financeiro, cada item opera como parâmetro configurável no sistema.
          </p>

          {perguntas.map(q => (
            <div key={q.id} className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <span className="tag tag-emerald" style={{ marginRight: 8 }}>{q.codigo}</span>
                  <strong style={{ fontSize: 15 }}>{q.topico}</strong>
                </div>
                <span className={`tag ${q.status === "Decidido" ? "tag-emerald" : "tag-amber"}`}>
                  {q.status}
                </span>
              </div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{q.pergunta}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
                Origem: {q.origem} • Parâmetro atual no código: <strong>{q.parametro_atual}</strong>
              </div>
              <div className="form-row">
                <input
                  className="input-dark"
                  style={{ flex: 1 }}
                  placeholder="Registrar decisão oficial do Financeiro / Diretoria..."
                  defaultValue={q.decisao || ""}
                  onBlur={async e => {
                    if (e.target.value !== (q.decisao || "")) {
                      await fetch(`/api/perguntas-abertas/${q.id}`, {
                        method: "PUT",
                        headers: apiHeaders(),
                        body: JSON.stringify({ status: "Decidido", decisao: e.target.value })
                      });
                      showNotification(`Decisão ${q.codigo} salva e auditada!`);
                      fetchAll();
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </main>
      )}

      {/* =====================================================================
          MODULE 6: CADASTROS BASE & PROTEÇÃO LGPD (TAREFA T5)
         ===================================================================== */}
      {activeModule === "cadastros" && (
        <main className="page-container">
          <h1 className="page-title">Cadastros Base (Pessoas, Áreas, Produtores & Eventos)</h1>
          <p className="page-subtitle">
            Regras #5 e #6 do GEMINI.md ativas: o perfil &ldquo;suporte&rdquo; e &ldquo;leitura&rdquo; não visualizam dados bancários nem repasses (LGPD).
          </p>

          <div className="panel-no-pad">
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e382d", fontWeight: 700 }}>
              Produtores e Dados Bancários (Visão do perfil atual: {currentUser.perfil})
            </div>
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Produtor</th>
                  <th>Documento</th>
                  <th>Banco</th>
                  <th>Agência / Conta</th>
                  <th>Chave PIX</th>
                </tr>
              </thead>
              <tbody>
                {cadastros.produtores.map((pr: any) => (
                  <tr key={pr.id}>
                    <td style={{ fontWeight: 700 }}>{pr.nome}</td>
                    <td>{pr.documento}</td>
                    <td>{pr.banco}</td>
                    <td>{pr.agencia} / {pr.conta}</td>
                    <td>{pr.chave_pix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel-no-pad">
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e382d", fontWeight: 700 }}>
              Pessoas (CAD_f) & Perfis de Acesso
            </div>
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Área (CAD_a)</th>
                  <th>E-mail (Login)</th>
                  <th>Telefone</th>
                  <th>Perfil RBAC</th>
                </tr>
              </thead>
              <tbody>
                {cadastros.pessoas.map((pe: any) => (
                  <tr key={pe.id}>
                    <td style={{ fontWeight: 700 }}>{pe.nome}</td>
                    <td><span className="tag tag-slate">{pe.area_nome}</span></td>
                    <td>{pe.email}</td>
                    <td>{pe.telefone || "—"}</td>
                    <td><span className="tag tag-emerald">{pe.perfil}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* =====================================================================
          MODULE 7: AUDITORIA IMUTÁVEL (TAREFA T8)
         ===================================================================== */}
      {activeModule === "auditoria" && (
        <main className="page-container">
          <h1 className="page-title">Trilha de Auditoria (Compliance & LGPD)</h1>
          <p className="page-subtitle">
            Toda escrita relevante grava em &ldquo;auditoria&rdquo; quem, quando e o estado antes/depois (com dados bancários/senhas mascarados por LGPD).
          </p>

          <div className="panel-no-pad">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Data / Hora</th>
                  <th>Operador</th>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th>Resumo JSONB (Depois)</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.map((a: any) => (
                  <tr key={a.id}>
                    <td>#{a.id}</td>
                    <td style={{ fontSize: 12 }}>{new Date(a.criado_em).toLocaleString("pt-BR")}</td>
                    <td>
                      <strong>{a.pessoa_nome || "Sistema"}</strong>
                      {a.pessoa_perfil && (
                        <span className="tag tag-slate" style={{ marginLeft: 6 }}>{a.pessoa_perfil}</span>
                      )}
                    </td>
                    <td><span className="tag tag-emerald">{a.acao}</span></td>
                    <td>{a.entidade} #{a.entidade_id}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11.5, color: "#94a3b8", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {JSON.stringify(a.depois)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* LOGIN JWT MODAL (TAREFA T4) */}
      {showLoginModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 90
          }}
          onClick={() => setShowLoginModal(false)}
        >
          <div className="panel" style={{ width: 420, marginBottom: 0 }} onClick={e => e.stopPropagation()}>
            <div className="panel-title">Autenticação JWT (Tarefa T4)</div>
            <div className="panel-desc">
              Senha padrão de desenvolvimento para todos os usuários importados: <code>disk123</code>
            </div>
            {loginError && (
              <div className="amber-notice" style={{ color: "#f87171" }}>{loginError}</div>
            )}
            <form onSubmit={handleLoginSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label>E-mail do Usuário</label>
                <select
                  className="select-dark"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                >
                  <option value="karine@diskingressos.com.br">karine@diskingressos.com.br (financeiro)</option>
                  <option value="admin@diskingressos.com.br">admin@diskingressos.com.br (admin / diretoria)</option>
                  <option value="vinicius.casagrande@diskingressos.com.br">vinicius.casagrande@diskingressos.com.br (suporte)</option>
                  <option value="leitura@diskingressos.com.br">leitura@diskingressos.com.br (leitura / SAC)</option>
                </select>
              </div>
              <div className="field">
                <label>Senha</label>
                <input
                  type="password"
                  className="input-dark"
                  value={loginSenha}
                  onChange={e => setLoginSenha(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowLoginModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-emerald">
                  Entrar com JWT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
