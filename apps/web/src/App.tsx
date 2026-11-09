import React, { useState, useEffect, useMemo } from "react";
import {
  Landmark,
  LayoutDashboard,
  ClipboardList,
  Wrench,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  UserCheck,
  HelpCircle,
  LogIn,
  TrendingUp,
  PieChart,
  BarChart3,
  Activity,
  Info,
  ArrowRight
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

// SVG Multi-Segment Donut Chart Component
function DonutChartSVG({
  segments,
  centerTop,
  centerBottom
}: {
  segments: { label: string; value: number; color: string }[];
  centerTop: string;
  centerBottom: string;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: 164, height: 164, flexShrink: 0 }}>
        <svg width="164" height="164" viewBox="0 0 164 164">
          <circle
            cx="82"
            cy="82"
            r={radius}
            fill="transparent"
            stroke="#13261e"
            strokeWidth="20"
          />
          {segments.map((seg, i) => {
            if (seg.value <= 0) return null;
            const pct = seg.value / total;
            const strokeDasharray = `${pct * circumference} ${circumference}`;
            const strokeDashoffset = -cumulativePercent * circumference;
            cumulativePercent += pct;
            return (
              <circle
                key={i}
                cx="82"
                cy="82"
                r={radius}
                fill="transparent"
                stroke={seg.color}
                strokeWidth="20"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 82 82)"
              />
            );
          })}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center"
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 800, color: "#ecfdf5", lineHeight: 1.1 }}>
            {centerTop}
          </span>
          <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{centerBottom}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 180 }}>
        {segments.map((seg, i) => {
          const pct = Math.round((seg.value / total) * 100);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12.5,
                padding: "5px 10px",
                background: "rgba(0,0,0,0.2)",
                borderRadius: 6,
                border: "1px solid #162a21"
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: seg.color,
                    display: "inline-block"
                  }}
                />
                {seg.label}
              </span>
              <strong>
                {seg.value} ({pct}%)
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  // Starts on "dashboard" as requested by the user!
  const [activeModule, setActiveModule] = useState<
    "dashboard" | "financeiro" | "plano5w2h" | "solicitacoes" | "perguntas" | "cadastros" | "auditoria"
  >("dashboard");

  const [dashOrigemFilter, setDashOrigemFilter] = useState<"ALL" | "FINANCEIRO" | "SUPORTE">("ALL");

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

  async function fetchAll(origemScope = dashOrigemFilter) {
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
      fetch(`/api/dashboard?origem=${origemScope}`, { headers }).then(r => r.json()),
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

    const cDespesa = contasRes.find((c: any) => c.codigo === "4.1.02");
    const cBanco = contasRes.find((c: any) => c.codigo === "1.1.01");
    if (cDespesa) setLancDebitoId(cDespesa.id);
    if (cBanco) setLancCreditoId(cBanco.id);
  }

  useEffect(() => {
    fetchAll(dashOrigemFilter);
  }, [currentUser.perfil, token, dashOrigemFilter]);

  const contasAnaliticas = useMemo(() => {
    return contas.filter(c => c.aceita_lancamento);
  }, [contas]);

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
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Gestão 5W2H, Razão Contábil & Compliance</div>
          </div>
        </div>

        <nav className="module-nav">
          <button
            className={`module-btn ${activeModule === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveModule("dashboard")}
          >
            <LayoutDashboard size={15} /> Dashboard Inicial
          </button>
          <button
            className={`module-btn ${activeModule === "financeiro" ? "active" : ""}`}
            onClick={() => setActiveModule("financeiro")}
          >
            <Landmark size={15} /> Financeiro (Fase 2)
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
          MODULE 0 (DEFAULT): DASHBOARD INICIAL COMPLETO COM GRÁFICOS E DADOS EXPLICATIVOS AO LADO
         ===================================================================== */}
      {activeModule === "dashboard" && dashboard && (
        <main className="page-container-wide">
          {/* Header + Scope Filter */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 20,
              flexWrap: "wrap"
            }}
          >
            <div>
              <h1 className="page-title" style={{ fontSize: 24 }}>
                Painel Executivo & Diagnóstico Operacional — Disk Ingressos
              </h1>
              <p className="page-subtitle" style={{ marginBottom: 0 }}>
                Consolidação das Planilhas 5W2H (Financeiro e Suporte), Homologação de Ajustes da Plataforma (Guilherme) e Razão Contábil (Fase 2).
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className={dashOrigemFilter === "ALL" ? "btn-emerald" : "btn-secondary"}
                onClick={() => setDashOrigemFilter("ALL")}
              >
                Consolidado (225 Itens 5W2H)
              </button>
              <button
                className={dashOrigemFilter === "FINANCEIRO" ? "btn-emerald" : "btn-secondary"}
                onClick={() => setDashOrigemFilter("FINANCEIRO")}
              >
                Planilha Financeiro (Karine)
              </button>
              <button
                className={dashOrigemFilter === "SUPORTE" ? "btn-emerald" : "btn-secondary"}
                onClick={() => setDashOrigemFilter("SUPORTE")}
              >
                Planilha Suporte & Riscos (Vinicius)
              </button>
            </div>
          </div>

          {/* -----------------------------------------------------------------
              6 STATUS CARDS EXECUTIVOS
             ----------------------------------------------------------------- */}
          <div className="status-cards-grid">
            {/* CARD 1 */}
            <div className="status-card">
              <div className="status-card-top">
                <span className="status-card-title">Execução Geral 5W2H</span>
                <div className="status-card-icon" style={{ background: "rgba(16,185,129,0.16)", color: "#34d399" }}>
                  <ClipboardList size={17} />
                </div>
              </div>
              <div className="status-card-value">
                {dashboard.kpis.concluidos} / {dashboard.kpis.totalPlanos}
              </div>
              <div className="progress-bar-dark">
                <div className="progress-fill-dark" style={{ width: `${dashboard.kpis.pctConcluido}%` }} />
              </div>
              <div className="status-card-meta">
                <span className="tag tag-emerald">{dashboard.kpis.pctConcluido}% Concluído</span>
                <span>{dashboard.kpis.emAndamento} em andamento</span>
              </div>
            </div>

            {/* CARD 2 */}
            <div className="status-card">
              <div className="status-card-top">
                <span className="status-card-title">Atrasados & Não Resolvidos</span>
                <div className="status-card-icon" style={{ background: "rgba(239,68,68,0.18)", color: "#f87171" }}>
                  <AlertTriangle size={17} />
                </div>
              </div>
              <div className="status-card-value" style={{ color: "#f87171" }}>
                {dashboard.kpis.atrasados + dashboard.kpis.naoResolvidos} alertas
              </div>
              <div className="progress-bar-dark">
                <div
                  className="progress-fill-dark"
                  style={{
                    width: `${Math.min(100, Math.round(((dashboard.kpis.atrasados + dashboard.kpis.naoResolvidos) / (dashboard.kpis.totalPlanos || 1)) * 100))}%`,
                    background: "#ef4444"
                  }}
                />
              </div>
              <div className="status-card-meta">
                <span className="tag tag-red">{dashboard.kpis.atrasados} Atrasados (5W)</span>
                <span className="tag tag-amber">{dashboard.kpis.naoResolvidos} Não Resolvidos (2H)</span>
              </div>
            </div>

            {/* CARD 3 */}
            <div className="status-card">
              <div className="status-card-top">
                <span className="status-card-title">Ajustes Plataforma (Guilherme)</span>
                <div className="status-card-icon" style={{ background: "rgba(59,130,246,0.18)", color: "#60a5fa" }}>
                  <Wrench size={17} />
                </div>
              </div>
              <div className="status-card-value">
                {dashboard.kpis.reqDone} / {dashboard.kpis.reqTotal}
              </div>
              <div className="progress-bar-dark">
                <div
                  className="progress-fill-dark"
                  style={{ width: `${dashboard.kpis.pctReq}%`, background: "#3b82f6" }}
                />
              </div>
              <div className="status-card-meta">
                <span className="tag tag-slate">{dashboard.kpis.pctReq}% Testados ☑️</span>
                <span>{dashboard.kpis.reqPending} na fila de testes</span>
              </div>
            </div>

            {/* CARD 4 */}
            <div className="status-card">
              <div className="status-card-top">
                <span className="status-card-title">Perguntas Abertas (Financeiro)</span>
                <div className="status-card-icon" style={{ background: "rgba(245,158,11,0.18)", color: "#fbbf24" }}>
                  <HelpCircle size={17} />
                </div>
              </div>
              <div className="status-card-value" style={{ color: "#fbbf24" }}>
                {dashboard.kpis.perguntasPendentes} pendentes
              </div>
              <div className="progress-bar-dark">
                <div
                  className="progress-fill-dark"
                  style={{
                    width: `${dashboard.kpis.totalPerguntas ? Math.round((dashboard.kpis.perguntasDecididas / dashboard.kpis.totalPerguntas) * 100) : 0}%`,
                    background: "#f59e0b"
                  }}
                />
              </div>
              <div className="status-card-meta">
                <span>De {dashboard.kpis.totalPerguntas} dúvidas da aba 2H</span>
                <button
                  className="btn-secondary"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={() => setActiveModule("perguntas")}
                >
                  Decidir
                </button>
              </div>
            </div>

            {/* CARD 5 */}
            <div className="status-card">
              <div className="status-card-top">
                <span className="status-card-title">Caixa & Recebíveis Gateway</span>
                <div className="status-card-icon" style={{ background: "rgba(16,185,129,0.16)", color: "#34d399" }}>
                  <Landmark size={17} />
                </div>
              </div>
              {dashboard.financeiroResumo ? (
                <>
                  <div className="status-card-value" style={{ fontSize: 21, color: "#34d399" }}>
                    {formatBRL(
                      dashboard.financeiroResumo.saldo_banco_centavos +
                        dashboard.financeiroResumo.recebiveis_gateway_centavos
                    )}
                  </div>
                  <div className="status-card-meta">
                    <span>Banco: {formatBRL(dashboard.financeiroResumo.saldo_banco_centavos)}</span>
                    <span>Gateway: {formatBRL(dashboard.financeiroResumo.recebiveis_gateway_centavos)}</span>
                  </div>
                </>
              ) : (
                <div className="status-card-meta" style={{ marginTop: 12, color: "#fbbf24" }}>
                  <Lock size={14} /> Restrito ao Financeiro/Diretoria
                </div>
              )}
            </div>

            {/* CARD 6 */}
            <div className="status-card">
              <div className="status-card-top">
                <span className="status-card-title">A Repassar & Receita Disk</span>
                <div className="status-card-icon" style={{ background: "rgba(168,85,247,0.18)", color: "#c084fc" }}>
                  <TrendingUp size={17} />
                </div>
              </div>
              {dashboard.financeiroResumo ? (
                <>
                  <div className="status-card-value" style={{ fontSize: 21, color: "#fbbf24" }}>
                    {formatBRL(dashboard.financeiroResumo.a_repassar_produtores_centavos)}
                  </div>
                  <div className="status-card-meta">
                    <span className="tag tag-emerald">
                      Comissão Disk: {formatBRL(dashboard.financeiroResumo.receita_comissao_centavos)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="status-card-meta" style={{ marginTop: 12, color: "#fbbf24" }}>
                  <Lock size={14} /> Oculto por LGPD/RBAC
                </div>
              )}
            </div>
          </div>

          {/* =================================================================
              ROW 1: GRÁFICO DE ROSCA STATUS 5W2H + COMPARATIVO POR PLANILHA (ESQUERDA)
                     + DADOS EXPLICATIVOS (DIREITA)
             ================================================================= */}
          <div className="chart-explainer-row">
            <div className="chart-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div className="panel-title" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                    <PieChart size={17} color="#10b981" />
                    1. Distribuição Geral de Status do Plano de Ação 5W2H
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    Proporção entre ações Concluídas, Em Andamento, Não Iniciadas (2H) e Atrasadas
                  </div>
                </div>
                <span className="tag tag-emerald">{dashboard.kpis.totalPlanos} itens analisados</span>
              </div>

              <DonutChartSVG
                centerTop={`${dashboard.kpis.pctConcluido}%`}
                centerBottom="Concluídos"
                segments={[
                  { label: "Concluído / Realizado", value: dashboard.kpis.concluidos, color: "#10b981" },
                  { label: "Em andamento", value: dashboard.kpis.emAndamento, color: "#3b82f6" },
                  { label: "Não iniciado (Desdobramentos 2H)", value: dashboard.kpis.naoIniciados, color: "#f59e0b" },
                  { label: "Atrasado (Crítico)", value: dashboard.kpis.atrasados, color: "#ef4444" }
                ]}
              />

              <div style={{ borderTop: "1px solid #162a21", paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1", marginBottom: 10 }}>
                  Comparativo Direto entre as Planilhas Originais (5W + 2H):
                </div>
                {(dashboard.porOrigem || []).map((orig: any) => {
                  const pct = orig.total ? Math.round((orig.concluido / orig.total) * 100) : 0;
                  const pctAnd = orig.total ? Math.round((orig.andamento / orig.total) * 100) : 0;
                  const pctNao = orig.total ? Math.round((orig.naoIniciado / orig.total) * 100) : 0;
                  const pctAtr = orig.total ? Math.round((orig.atrasado / orig.total) * 100) : 0;
                  return (
                    <div key={orig.origem} className="stacked-bar-row">
                      <div className="stacked-bar-header">
                        <strong>{orig.origem}</strong>
                        <span style={{ color: "#94a3b8" }}>
                          {orig.concluido}/{orig.total} concluídos ({pct}%) •{" "}
                          <span style={{ color: "#f87171", fontWeight: 600 }}>
                            {orig.naoResolvido} não resolvidos
                          </span>
                        </span>
                      </div>
                      <div className="stacked-bar-track">
                        <div className="stacked-segment" style={{ width: `${pct}%`, background: "#10b981" }} title={`Concluído: ${orig.concluido}`} />
                        <div className="stacked-segment" style={{ width: `${pctAnd}%`, background: "#3b82f6" }} title={`Em andamento: ${orig.andamento}`} />
                        <div className="stacked-segment" style={{ width: `${pctNao}%`, background: "#f59e0b" }} title={`Não iniciado: ${orig.naoIniciado}`} />
                        <div className="stacked-segment" style={{ width: `${pctAtr}%`, background: "#ef4444" }} title={`Atrasado: ${orig.atrasado}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* EXPLICATIVO AO LADO DO GRÁFICO 1 */}
            <div className="explainer-card">
              <span className="explainer-badge">
                <Info size={13} /> Dados Explicativos — Leitura Executiva 5W2H
              </span>
              <div className="explainer-title">
                O que os dados das duas planilhas revelam sobre o momento do projeto?
              </div>
              <ul className="explainer-list">
                <li>
                  <strong>Fase de Estruturação Concluída ({dashboard.kpis.pctConcluido}%):</strong> Nas duas planilhas, a etapa macro de planejamento, mapeamento de processos, política de gestão de riscos e o item <em>&ldquo;Implementar Sistema&rdquo;</em> já constam como <strong>Concluídos</strong>, confirmando que a plataforma de vendas já está em operação.
                </li>
                <li className="warn">
                  <strong>Gargalo na Planilha Financeiro (Karine — 45 itens):</strong> Há <strong>11 planos em andamento</strong> e <strong>4 atrasados</strong> concentrados na camada contábil e de segurança: <em>Aba contabilidade – sistema de dupla entrada</em>, <em>Raiz da conta bancária</em>, <em>Ativo e passivo no plano de contas</em> e <em>Aba segurança (3DS 2.0 e Softdescriptor)</em>.
                </li>
                <li className="danger">
                  <strong>15 Itens Marcados como &ldquo;NÃO RESOLVIDO&rdquo; na Aba 2H:</strong> São decisões de negócio e travas técnicas entre a <strong>Disk (Karine / Vinicius)</strong> e o <strong>Guilherme</strong> — como a regra exata de <em>Dividir a taxa (80/20)</em>, cálculo de <em>SPREAD</em>, múltiplas bandeiras (<em>REDE / PAG</em>) e se pode ser liberado até 100% do valor no caixa da Disk.
                </li>
              </ul>

              <div className="explainer-kpi-strip">
                <div className="explainer-mini-stat">
                  <span>Planilha Financeiro</span>
                  <strong>22 / 45 (49%)</strong>
                </div>
                <div className="explainer-mini-stat">
                  <span>Planilha Suporte</span>
                  <strong>164 / 180 (91%)</strong>
                </div>
                <div className="explainer-mini-stat">
                  <span>Pendências 2H</span>
                  <strong style={{ color: "#f87171" }}>15 Não Resolvidos</strong>
                </div>
              </div>
            </div>
          </div>

          {/* =================================================================
              ROW 2: GRÁFICO DE BARRAS POR ÁREA E RESPONSÁVEL (ESQUERDA)
                     + DADOS EXPLICATIVOS DE ALOCAÇÃO DE EQUIPE (DIREITA)
             ================================================================= */}
          <div className="chart-explainer-row">
            <div className="chart-card">
              <div>
                <div className="panel-title" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  <BarChart3 size={17} color="#10b981" />
                  2. Execução por Área (CAD_a) e Carga por Responsável (CAD_f)
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Volume de tarefas atribuídas, taxa de entrega e concentração de atrasos por líder
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>
                  Por Departamento (Aba CAD_a):
                </div>
                {dashboard.porArea.map((a: any) => {
                  const pctDone = a.total ? Math.round((a.concluido / a.total) * 100) : 0;
                  const pctOpen = 100 - pctDone;
                  return (
                    <div key={a.area} className="stacked-bar-row">
                      <div className="stacked-bar-header">
                        <span>
                          <strong>{a.area}</strong> ({a.total} itens)
                        </span>
                        <span>
                          <span style={{ color: "#34d399", fontWeight: 600 }}>{a.concluido} concluídos ({pctDone}%)</span>
                          {a.atrasado > 0 && (
                            <span style={{ color: "#f87171", marginLeft: 8, fontWeight: 600 }}>
                              • {a.atrasado} atrasados
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="stacked-bar-track">
                        <div className="stacked-segment" style={{ width: `${pctDone}%`, background: "#10b981" }} />
                        <div className="stacked-segment" style={{ width: `${pctOpen}%`, background: "#f59e0b" }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ borderTop: "1px solid #162a21", paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>
                  Por Responsável Direto (Aba CAD_f + 2H):
                </div>
                {dashboard.porResponsavel.map((r: any) => {
                  const pctDone = r.total ? Math.round((r.concluido / r.total) * 100) : 0;
                  return (
                    <div key={r.responsavel} className="stacked-bar-row" style={{ marginBottom: 10 }}>
                      <div className="stacked-bar-header">
                        <strong>{r.responsavel}</strong>
                        <span style={{ fontSize: 12 }}>
                          {r.concluido}/{r.total} ({pctDone}%)
                          {r.naoResolvido > 0 && (
                            <span className="tag tag-red" style={{ marginLeft: 6 }}>
                              {r.naoResolvido} Não Resolvido
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="stacked-bar-track" style={{ height: 9 }}>
                        <div className="stacked-segment" style={{ width: `${pctDone}%`, background: "#3b82f6" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* EXPLICATIVO AO LADO DO GRÁFICO 2 */}
            <div className="explainer-card">
              <span className="explainer-badge">
                <Users size={13} /> Dados Explicativos — Responsabilidades por Área
              </span>
              <div className="explainer-title">
                Como o trabalho está distribuído entre Suporte, Financeiro, Diretoria e Guilherme?
              </div>
              <ul className="explainer-list">
                <li>
                  <strong>Guilherme (Plataforma & Desenvolvimento):</strong> É o ponto focal técnico citado tanto na coluna <em>Onde</em> da aba <code>5W</code> quanto na coluna <em>How (Como será feito)</em> da aba <code>2H</code>. Concentra as entregas de código, regras de checkout, borderô e mapa de assentos.
                </li>
                <li>
                  <strong>Vinicius Casagrande (Suporte & Operações):</strong> Conduz a implantação do sistema, controles internos de gestão de riscos e a bateria de homologação marcada nas planilhas como <code>TESTAR DISK</code> e <code>TESTE OK</code>. Possui 1 item atrasado na aba 5W: <em>&ldquo;Definição e adoção de ferramenta de Monitoramento&rdquo;</em>.
                </li>
                <li className="warn">
                  <strong>Karine Santos (Financeiro):</strong> Concentra todas as 38 ações da planilha Financeiro. Já concluiu 22 itens (políticas e manuais de risco/compliance), mas possui 16 itens abertos ligados à parametrização contábil, taxas por bandeira, split 80/20 e repasse a produtores.
                </li>
                <li>
                  <strong>Naila, Eder e Jackson (Diretoria):</strong> Já concluíram as aprovações formais da <em>Política de Gestão de Riscos</em>, <em>Metodologia de Riscos</em> e <em>Integração do Programa de Integridade</em>, atuando agora na alçada decisória sobre limites de antecipação de caixa.
                </li>
              </ul>

              <div style={{ marginTop: "auto", display: "flex", gap: 10 }}>
                <button
                  className="btn-emerald"
                  onClick={() => {
                    setFiltro5wStatus("Atrasado");
                    setActiveModule("plano5w2h");
                  }}
                >
                  Ver Itens Atrasados no 5W2H <ArrowRight size={14} />
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setApenasNaoResolvidos(true);
                    setActiveModule("plano5w2h");
                  }}
                >
                  Filtrar 15 Não Resolvidos
                </button>
              </div>
            </div>
          </div>

          {/* =================================================================
              ROW 3: GRÁFICO DE SOLICITAÇÕES & AJUSTES DA PLATAFORMA POR MÓDULO E MÊS (ESQUERDA)
                     + DADOS EXPLICATIVOS DO BACKLOG DE 445 AJUSTES (DIREITA)
             ================================================================= */}
          <div className="chart-explainer-row">
            <div className="chart-card">
              <div>
                <div className="panel-title" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  <Activity size={17} color="#10b981" />
                  3. Solicitações & Ajustes da Plataforma por Módulo e Safra Mensal
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Origem: Planilha &ldquo;datas das solicitaçoes e ajustes.xlsx&rdquo; ({dashboard.kpis.reqTotal} solicitações técnicas mapeadas)
                </div>
              </div>

              <div>
                {dashboard.solicitacoesPorModulo.map((m: any) => {
                  const pct = m.total ? Math.round((m.concluidos / m.total) * 100) : 0;
                  return (
                    <div key={m.modulo} className="stacked-bar-row" style={{ marginBottom: 10 }}>
                      <div className="stacked-bar-header">
                        <strong>{m.modulo}</strong>
                        <span>
                          <span style={{ color: "#34d399", fontWeight: 600 }}>{m.concluidos} testados ☑️</span> de {m.total} ({pct}%)
                        </span>
                      </div>
                      <div className="stacked-bar-track" style={{ height: 10 }}>
                        <div className="stacked-segment" style={{ width: `${pct}%`, background: "#10b981" }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Vertical Column Chart by Month */}
              {dashboard.solicitacoesPorMes && dashboard.solicitacoesPorMes.length > 0 && (
                <div style={{ borderTop: "1px solid #162a21", paddingTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>
                    Volume de Solicitações de Ajustes por Mês (Jan/2025 – Abr/2026):
                  </div>
                  <div className="vbar-chart">
                    {dashboard.solicitacoesPorMes.map((item: any) => {
                      const maxVal = Math.max(...dashboard.solicitacoesPorMes.map((x: any) => x.total), 1);
                      const heightPct = Math.max(10, Math.round((item.total / maxVal) * 100));
                      const donePct = item.total ? Math.round((item.concluidos / item.total) * 100) : 0;
                      return (
                        <div key={item.mes} className="vbar-col" title={`${item.mes}: ${item.total} solicitações (${item.concluidos} testadas)`}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#ecfdf5" }}>{item.total}</span>
                          <div className="vbar-pillar-wrap" style={{ height: `${heightPct}%` }}>
                            <div style={{ height: `${100 - donePct}%`, background: "#1e3a8a", width: "100%" }} />
                            <div style={{ height: `${donePct}%`, background: "#10b981", width: "100%" }} />
                          </div>
                          <span className="vbar-label">{item.mes.slice(5)}/{item.mes.slice(2, 4)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* EXPLICATIVO AO LADO DO GRÁFICO 3 */}
            <div className="explainer-card">
              <span className="explainer-badge">
                <Wrench size={13} /> Dados Explicativos — Radiografia dos Ajustes de Sistema
              </span>
              <div className="explainer-title">
                O que compõe o backlog de {dashboard.kpis.reqTotal} solicitações da plataforma?
              </div>
              <ul className="explainer-list">
                <li>
                  <strong>Concentração em Eventos, Pedidos e Mapa de Assentos:</strong> Mais de 60% das demandas tratam da operação diária de venda de ingressos — bloqueio de quantidade para poltronas numeradas, preservação de curvatura de fileiras ao copiar setores, limite de ingressos por CPF no carrinho e ordenação de tickets por pedido.
                </li>
                <li className="warn">
                  <strong>Demandas Críticas do Financeiro & Borderô:</strong> Incluem ajustes essenciais para a Fase 2: <em>&ldquo;Borderô: Adições → Créditos&rdquo;</em>, <em>&ldquo;Preview do Borderô: Exibir os dados de transferência bancária&rdquo;</em>, <em>&ldquo;Checkout: calcular tarifas quando a bandeira é Master&rdquo;</em> e <em>&ldquo;Tabela de Cálculo de Taxas visível apenas para o financeiro&rdquo;</em>.
                </li>
                <li>
                  <strong>Reconhecimento Facial & App de Validação:</strong> O módulo de biometria facial (<code>disksite.karbonbox.com</code> / <code>beta.diskingressos.com.br</code>) teve o fluxo de cadastro documentado e ajustes de espelhamento de câmera e ocultação de campos redundantes no checkout.
                </li>
                <li>
                  <strong>Taxa de Homologação (Plan3 vs. Plan1):</strong> Há <strong>{dashboard.kpis.reqDone} itens já homologados/concluídos</strong> (incluindo os 79 da aba <em>Plan3</em>), restando <strong>{dashboard.kpis.reqPending} itens</strong> para bateria de testes da equipe de Suporte.
                </li>
              </ul>

              <div className="explainer-kpi-strip">
                <div className="explainer-mini-stat">
                  <span>Setor Suporte (Plan2)</span>
                  <strong>55,5% das demandas</strong>
                </div>
                <div className="explainer-mini-stat">
                  <span>Setor Financeiro</span>
                  <strong>5,6% (Borderô/Taxas)</strong>
                </div>
                <div className="explainer-mini-stat">
                  <span>Homologados ☑️</span>
                  <strong style={{ color: "#34d399" }}>{dashboard.kpis.reqDone} concluídos</strong>
                </div>
              </div>
            </div>
          </div>

          {/* =================================================================
              ROW 4: GRÁFICO DE COMPOSIÇÃO FINANCEIRA & RAZÃO CONTÁBIL (ESQUERDA)
                     + DADOS EXPLICATIVOS DA FASE 2 & PERGUNTAS ABERTAS (DIREITA)
             ================================================================= */}
          <div className="chart-explainer-row">
            <div className="chart-card">
              <div>
                <div className="panel-title" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  <Landmark size={17} color="#10b981" />
                  4. Estrutura Financeira (Fase 2) — Fluxo de Venda, Taxas e Balancete
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Modelo de dupla entrada em centavos para cada R$ 1.000,00 vendidos (Comissão 20% / Gateway 2,99%)
                </div>
              </div>

              {/* Visual Breakdown Bar of a Ticket Sale */}
              <div style={{ background: "#091410", padding: 14, borderRadius: 8, border: "1px solid #162a21" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#ecfdf5" }}>
                  Anatomia Contábil de uma Venda de Ingresso (Exemplo: R$ 1.000,00 no Crédito à vista):
                </div>
                <div className="stacked-bar-track" style={{ height: 22, marginBottom: 10 }}>
                  <div
                    className="stacked-segment"
                    style={{ width: "80%", background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#000" }}
                  >
                    80% Repasse Produtor (R$ 800,00)
                  </div>
                  <div
                    className="stacked-segment"
                    style={{ width: "17.01%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, color: "#000" }}
                  >
                    17,01% Líquido Disk
                  </div>
                  <div
                    className="stacked-segment"
                    style={{ width: "2.99%", background: "#ef4444" }}
                    title="Taxa Gateway: 2,99% (R$ 29,90)"
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#94a3b8", flexWrap: "wrap", gap: 8 }}>
                  <span>• <strong>D 1.1.02 Recebíveis Gateway:</strong> R$ 970,10</span>
                  <span>• <strong>D 4.1.01 Taxa Gateway (2,99%):</strong> R$ 29,90</span>
                  <span>• <strong>C 3.1.01 Comissão Disk (20%):</strong> R$ 200,00</span>
                  <span>• <strong>C 2.1.01 Repasse Produtor (80%):</strong> R$ 800,00</span>
                </div>
              </div>

              {/* Current Trial Balance Bars */}
              <div style={{ borderTop: "1px solid #162a21", paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>
                  Saldos Atuais das Contas Analíticas no PostgreSQL 16:
                </div>
                {balancete.contas.map(c => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      borderBottom: "1px solid #13261e",
                      fontSize: 12.5
                    }}
                  >
                    <span>
                      <strong>{c.codigo}</strong> {c.nome}
                    </span>
                    <span>
                      <span style={{ color: "#94a3b8", marginRight: 12 }}>
                        D: {formatBRL(c.debitos_centavos)} | C: {formatBRL(c.creditos_centavos)}
                      </span>
                      <strong style={{ color: c.saldo_centavos >= 0 ? "#34d399" : "#f87171" }}>
                        Saldo: {formatBRL(c.saldo_centavos)}
                      </strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* EXPLICATIVO AO LADO DO GRÁFICO 4 */}
            <div className="explainer-card">
              <span className="explainer-badge">
                <ShieldCheck size={13} /> Dados Explicativos — Regras Inegociáveis do Financeiro
              </span>
              <div className="explainer-title">
                Por que o núcleo financeiro foi construído com Dupla Entrada e Centavos?
              </div>
              <ul className="explainer-list">
                <li>
                  <strong>Zero Erro de Arredondamento (Inteiros em Centavos & Basis Points):</strong> Todo valor monetário no banco (`partidas`, `vendas`, `repasses`) é salvo como `bigint` em centavos (`R$ 1.000,00 = 100000`) e as taxas em <em>basis points</em> (`2,99% = 299 bps`), eliminando diferenças de centavos nos borderôs dos produtores.
                </li>
                <li>
                  <strong>Razão Contábil Imutável por Trigger no Banco:</strong> As tabelas `lancamentos` e `partidas` possuem triggers PostgreSQL (`trg_balanceamento` e `bloqueia_alteracao`) que impedem qualquer `UPDATE` ou `DELETE` e garantem que nenhum lançamento exista se a soma dos débitos for diferente da soma dos créditos.
                </li>
                <li className="warn">
                  <strong>Parâmetros Configuráveis para as Dúvidas da Aba 2H:</strong> Enquanto o Financeiro valida as 7 perguntas abertas (como quem absorve a taxa do gateway em cada evento e o limite de antecipação), o módulo <strong>Financeiro (Fase 2)</strong> permite parametrizar a comissão e quem paga a taxa em cada venda.
                </li>
              </ul>

              <div style={{ marginTop: "auto", display: "flex", gap: 10 }}>
                <button
                  className="btn-emerald"
                  onClick={() => {
                    setFinTab("pagamentos");
                    setActiveModule("financeiro");
                  }}
                >
                  Simular e Registrar Venda (Fase 2) <ArrowRight size={14} />
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setFinTab("balancete");
                    setActiveModule("financeiro");
                  }}
                >
                  Abrir Balancete Contábil
                </button>
              </div>
            </div>
          </div>

          {/* =================================================================
              TABELA DE DESTAQUE: ITENS ATRASADOS E "NÃO RESOLVIDO"
             ================================================================= */}
          <div className="panel-no-pad">
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #1e382d",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div style={{ fontWeight: 700, color: "#f87171", display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} />
                Lista de Atenção Imediata: Itens Atrasados (5W) ou Marcados como &ldquo;NÃO RESOLVIDO&rdquo; (2H)
              </div>
              <button
                className="btn-secondary"
                style={{ padding: "5px 12px", fontSize: 12 }}
                onClick={() => setActiveModule("plano5w2h")}
              >
                Abrir Plano 5W2H Completo
              </button>
            </div>
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Plano de Ação / Questão Pendente</th>
                  <th>Responsável</th>
                  <th>Área</th>
                  <th>Como / Ponto Focal (2H)</th>
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
                    <td style={{ color: "#94a3b8" }}>{p.fim_planejado || "Verificar com Guilherme / Disk"}</td>
                    <td>
                      {p.nao_resolvido && (
                        <span className="tag tag-red" style={{ marginRight: 6 }}>
                          NÃO RESOLVIDO
                        </span>
                      )}
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
          MODULE 1: FINANCEIRO – RAZÃO CONTÁBIL E PAGAMENTOS (EXACT VIDEO UI)
         ===================================================================== */}
      {activeModule === "financeiro" && (
        <main className="page-container">
          <h1 className="page-title">Financeiro – razão contábil e pagamentos</h1>
          <p className="page-subtitle">
            Fase 2: plano de contas, lançamentos de dupla entrada e métodos de pagamento com taxas.
          </p>

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
