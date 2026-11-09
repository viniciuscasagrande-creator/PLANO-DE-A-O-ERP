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
  ArrowRight,
  RefreshCw,
  Plus
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
    "dashboard" | "homologacao" | "plano5w2h" | "solicitacoes" | "perguntas" | "cadastros" | "auditoria" | "financeiro"
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

  // Filters for 5W2H, Homologação & Solicitações
  const [filtro5wOrigem, setFiltro5wOrigem] = useState("FINANCEIRO");
  const [filtro5wAba, setFiltro5wAba] = useState<"ALL" | "5W" | "2H" | "EXE">("5W");
  const [filtro5wStatus, setFiltro5wStatus] = useState("ALL");
  const [apenasNaoResolvidos, setApenasNaoResolvidos] = useState(false);
  const [busca5w, setBusca5w] = useState("");

  // Filters for Homologação & QA (Aba 2H)
  const [filtroQaEtapa, setFiltroQaEtapa] = useState<"ALL" | "TESTAR DISK" | "GUILHERME" | "NAO_RESOLVIDO" | "TESTE OK">("TESTAR DISK");
  const [filtroQaOrigem, setFiltroQaOrigem] = useState<"ALL" | "FINANCEIRO" | "SUPORTE">("ALL");
  const [buscaQa, setBuscaQa] = useState("");

  // Filters & Creation for Solicitações (Guilherme)
  const [buscaSolicitacao, setBuscaSolicitacao] = useState("");
  const [filtroModuloSol, setFiltroModuloSol] = useState("ALL");
  const [filtroDataSol, setFiltroDataSol] = useState("ALL");
  const [filtroStatusSol, setFiltroStatusSol] = useState<"ALL" | "PENDENTE" | "TESTADO" | "PLAN3">("ALL");
  const [showNewSolModal, setShowNewSolModal] = useState(false);
  const [novaSolDesc, setNovaSolDesc] = useState("");
  const [novaSolModulo, setNovaSolModulo] = useState("Eventos & Pedidos");
  const [novaSolSetor, setNovaSolSetor] = useState("SUPORTE");

  // Bidirectional Sync & New 5W2H Task State
  const [lastSyncIso, setLastSyncIso] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [showNew5wModal, setShowNew5wModal] = useState(false);
  const [novo5wPlano, setNovo5wPlano] = useState("");
  const [novo5wWhat, setNovo5wWhat] = useState("");
  const [novo5wHow, setNovo5wHow] = useState("");
  const [novo5wPrioridade, setNovo5wPrioridade] = useState("Muito Urgente");
  const [novo5wOrigem, setNovo5wOrigem] = useState("FINANCEIRO");
  const [novo5wStatus, setNovo5wStatus] = useState("Em andamento");

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

  // Poll /api/sync/status every 4s to auto-refresh UI when Excel spreadsheets are saved externally
  useEffect(() => {
    let currentStamp = lastSyncIso;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/sync/status");
        if (!res.ok) return;
        const data = await res.json();
        if (data.lastSyncTimestamp && currentStamp && data.lastSyncTimestamp !== currentStamp) {
          currentStamp = data.lastSyncTimestamp;
          setLastSyncIso(data.lastSyncTimestamp);
          await fetchAll(dashOrigemFilter);
        } else if (data.lastSyncTimestamp && !currentStamp) {
          currentStamp = data.lastSyncTimestamp;
          setLastSyncIso(data.lastSyncTimestamp);
        }
      } catch {
        // ignore network hiccups
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [dashOrigemFilter, lastSyncIso]);

  async function handleManualSyncPlanilhas() {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync/planilhas", {
        method: "POST",
        headers: apiHeaders()
      });
      const data = await res.json();
      if (res.ok && data.report) {
        if (data.syncState?.lastSyncTimestamp) {
          setLastSyncIso(data.syncState.lastSyncTimestamp);
        }
        await fetchAll(dashOrigemFilter);
        showNotification(
          `Sincronizado! Planilhas lidas: ${data.report.planosAtualizados} itens conferidos/atualizados, ${data.report.planosImportados} novos.`
        );
      }
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleCriarNovoPlano5W2H(e: React.FormEvent) {
    e.preventDefault();
    if (!novo5wPlano.trim()) return;
    const res = await fetch("/api/plano-acao", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        plano: novo5wPlano.trim(),
        prioridade: novo5wPrioridade,
        what: novo5wWhat.trim() || novo5wPlano.trim(),
        why: "Ação registrada via ERP",
        how: novo5wHow.trim() || "Equipe Disk",
        onde: "DISK",
        prazo_dias: 15,
        status: novo5wStatus,
        origem_planilha: novo5wOrigem
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Erro ao criar ação 5W2H");
      return;
    }
    setNovo5wPlano("");
    setNovo5wWhat("");
    setNovo5wHow("");
    setShowNew5wModal(false);
    showNotification(`Nova ação 5W2H criada no ERP e gravada na planilha (${novo5wOrigem})!`);
    fetchAll(dashOrigemFilter);
  }

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
      if (filtro5wAba === "5W" && p.aba_origem !== "5W") return false;
      if (filtro5wAba === "2H" && p.aba_origem !== "2H") return false;
      if (filtro5wAba === "EXE" && p.aba_origem !== "EXE") return false;
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
  }, [planos, filtro5wOrigem, filtro5wAba, filtro5wStatus, apenasNaoResolvidos, busca5w]);

  const itensHomologacao2H = useMemo(() => {
    return planos.filter(p => {
      if (p.aba_origem !== "2H") return false;
      if (filtroQaOrigem !== "ALL" && !String(p.origem_planilha).startsWith(filtroQaOrigem)) return false;
      if (filtroQaEtapa === "NAO_RESOLVIDO" && !p.nao_resolvido) return false;
      if (filtroQaEtapa !== "ALL" && filtroQaEtapa !== "NAO_RESOLVIDO" && p.etapa_teste !== filtroQaEtapa) return false;
      if (buscaQa) {
        const q = buscaQa.toLowerCase();
        const match =
          (p.plano || "").toLowerCase().includes(q) ||
          (p.how || "").toLowerCase().includes(q) ||
          (p.who_nome || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [planos, filtroQaOrigem, filtroQaEtapa, buscaQa]);

  const contadoresQa = useMemo(() => {
    const only2H = planos.filter(p => p.aba_origem === "2H");
    return {
      total2H: only2H.length,
      testarDisk: only2H.filter(p => p.etapa_teste === "TESTAR DISK").length,
      guilherme: only2H.filter(p => p.etapa_teste === "GUILHERME").length,
      testeOk: only2H.filter(p => p.etapa_teste === "TESTE OK").length,
      naoResolvido: only2H.filter(p => p.nao_resolvido).length
    };
  }, [planos]);

  const solicitacoesFiltradas = useMemo(() => {
    return solicitacoes.filter(s => {
      if (filtroModuloSol !== "ALL" && s.modulo !== filtroModuloSol) return false;
      if (filtroDataSol !== "ALL" && s.data_solicitacao !== filtroDataSol) return false;
      if (filtroStatusSol === "PENDENTE" && s.concluido) return false;
      if (filtroStatusSol === "TESTADO" && !s.concluido) return false;
      if (filtroStatusSol === "PLAN3" && !s.homologado_plan3) return false;
      if (buscaSolicitacao && !s.descricao.toLowerCase().includes(buscaSolicitacao.toLowerCase())) return false;
      return true;
    });
  }, [solicitacoes, filtroModuloSol, filtroDataSol, filtroStatusSol, buscaSolicitacao]);

  const modulosSolicitacao = useMemo(() => {
    return Array.from(new Set(solicitacoes.map(s => s.modulo))).sort();
  }, [solicitacoes]);

  const datasSolicitacao = useMemo(() => {
    return Array.from(new Set(solicitacoes.map(s => s.data_solicitacao))).sort().reverse();
  }, [solicitacoes]);

  async function handleCriarSolicitacao(e: React.FormEvent) {
    e.preventDefault();
    if (!novaSolDesc.trim()) return;
    const res = await fetch("/api/solicitacoes", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        descricao: novaSolDesc.trim(),
        modulo: novaSolModulo,
        setor: novaSolSetor
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Erro ao registrar solicitação");
      return;
    }
    setNovaSolDesc("");
    setShowNewSolModal(false);
    showNotification(`Solicitação #${data.numero} registrada para o Guilherme!`);
    fetchAll(dashOrigemFilter);
  }

  return (
    <div>
      {/* TOP HEADER BAR */}
      <header className="top-header">
        <div className="brand-group">
          <div className="brand-mark">DI</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#ecfdf5" }}>Disk Ingressos ERP</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              Controle de Ajustes de Sistemas, Homologação QA & Gestão 5W2H
            </div>
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
            className={`module-btn ${activeModule === "homologacao" ? "active" : ""}`}
            onClick={() => setActiveModule("homologacao")}
          >
            <CheckCircle2 size={15} /> Homologação & QA ({contadoresQa.testarDisk} Testar / {contadoresQa.testeOk} OK)
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
            <Wrench size={15} /> Solicitações Guilherme ({solicitacoes.length})
          </button>
          <button
            className={`module-btn ${activeModule === "perguntas" ? "active" : ""}`}
            onClick={() => setActiveModule("perguntas")}
          >
            <HelpCircle size={15} /> Regras & Dúvidas 2H ({perguntas.length})
          </button>
          <button
            className={`module-btn ${activeModule === "cadastros" ? "active" : ""}`}
            onClick={() => setActiveModule("cadastros")}
          >
            <Users size={15} /> Cadastros
          </button>
          <button
            className={`module-btn ${activeModule === "auditoria" ? "active" : ""}`}
            onClick={() => setActiveModule("auditoria")}
          >
            <ShieldCheck size={15} /> Auditoria ({auditoria.length})
          </button>
        </nav>

        <div className="auth-controls">
          <button
            className="btn-secondary"
            onClick={handleManualSyncPlanilhas}
            disabled={isSyncing}
            title="Lê imediatamente qualquer alteração salva nas planilhas Excel e atualiza o ERP"
            style={{ borderColor: "#10b981", color: "#34d399" }}
          >
            <RefreshCw size={14} /> {isSyncing ? "Sincronizando..." : "Planilha ⇄ ERP"}
          </button>
          <div className="profile-pill" title="Alternar Perfil de Acesso (T4 RBAC)">
            <UserCheck size={14} color="#10b981" />
            <span style={{ color: "#94a3b8" }}>{currentUser.nome.split(" ")[0]}:</span>
            <select
              value={currentUser.perfil}
              onChange={e => handleQuickSwitchProfile(e.target.value as Perfil)}
            >
              <option value="financeiro">financeiro (Karine)</option>
              <option value="admin">admin (Diretoria)</option>
              <option value="suporte">suporte (Vinicius)</option>
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
          MODULE 0 (DEFAULT): DASHBOARD INICIAL DE CONTROLE DE AJUSTES DE SISTEMAS
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
                Painel de Controle de Ajustes de Sistemas & Homologação — Disk Ingressos
              </h1>
              <p className="page-subtitle" style={{ marginBottom: 0 }}>
                Sincronizado em mão dupla com as 3 Planilhas Oficiais: 5W2H Financeiro, 5W2H Suporte (Abas 5W, 2H, EXE, DASH) e Datas das Solicitações e Ajustes (Plan1, Plan2, Plan3).
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className={dashOrigemFilter === "ALL" ? "btn-emerald" : "btn-secondary"}
                onClick={() => setDashOrigemFilter("ALL")}
              >
                Consolidado ({dashboard.kpis.totalPlanos} Itens: 63 5W + 202 2H)
              </button>
              <button
                className={dashOrigemFilter === "FINANCEIRO" ? "btn-emerald" : "btn-secondary"}
                onClick={() => setDashOrigemFilter("FINANCEIRO")}
              >
                Planilha Financeiro (Karine — 38 5W + 34 2H)
              </button>
              <button
                className={dashOrigemFilter === "SUPORTE" ? "btn-emerald" : "btn-secondary"}
                onClick={() => setDashOrigemFilter("SUPORTE")}
              >
                Planilha Suporte (Vinicius — 25 5W + 168 2H)
              </button>
            </div>
          </div>

          {/* -----------------------------------------------------------------
              4 STATUS CARDS CENTRAIS DE CONTROLE DE AJUSTE DE SISTEMAS
             ----------------------------------------------------------------- */}
          <div className="status-cards-grid">
            {/* CARD 1: PLANOS MACRO ABA 5W */}
            <div className="status-card">
              <div className="status-card-top">
                <span className="status-card-title">Planos Macro (Aba 5W + DASH)</span>
                <div className="status-card-icon" style={{ background: "rgba(16,185,129,0.16)", color: "#34d399" }}>
                  <ClipboardList size={17} />
                </div>
              </div>
              <div className="status-card-value">
                {dashboard.kpis.concluidos5W ?? dashboard.kpis.concluidos} / {dashboard.kpis.total5W ?? dashboard.kpis.totalPlanos}
              </div>
              <div className="progress-bar-dark">
                <div
                  className="progress-fill-dark"
                  style={{ width: `${dashboard.kpis.pct5W ?? dashboard.kpis.pctConcluido}%` }}
                />
              </div>
              <div className="status-card-meta">
                <span className="tag tag-emerald">{dashboard.kpis.pct5W ?? dashboard.kpis.pctConcluido}% Concluído (5W)</span>
                <span>Suporte: 21/25 (84%) • Fin: 26/38 (68%)</span>
              </div>
            </div>

            {/* CARD 2: HOMOLOGAÇÃO & QA ABA 2H */}
            <div
              className="status-card"
              style={{ cursor: "pointer" }}
              onClick={() => setActiveModule("homologacao")}
            >
              <div className="status-card-top">
                <span className="status-card-title">Homologação & QA (Aba 2H — 202 Ajustes)</span>
                <div className="status-card-icon" style={{ background: "rgba(59,130,246,0.18)", color: "#60a5fa" }}>
                  <CheckCircle2 size={17} />
                </div>
              </div>
              <div className="status-card-value">
                {dashboard.kpis.testeOkCount ?? 97} TESTE OK
              </div>
              <div className="progress-bar-dark">
                <div
                  className="progress-fill-dark"
                  style={{ width: `${dashboard.kpis.pct2H ?? 84}%`, background: "#3b82f6" }}
                />
              </div>
              <div className="status-card-meta">
                <span className="tag tag-amber">{dashboard.kpis.testarDiskCount ?? 44} TESTAR DISK</span>
                <span className="tag tag-slate">{dashboard.kpis.guilherme2HCount ?? 35} c/ Guilherme</span>
              </div>
            </div>

            {/* CARD 3: BACKLOG DE SOLICITAÇÕES GUILHERME (PLAN1 / PLAN2 / PLAN3) */}
            <div
              className="status-card"
              style={{ cursor: "pointer" }}
              onClick={() => setActiveModule("solicitacoes")}
            >
              <div className="status-card-top">
                <span className="status-card-title">Solicitações Plataforma (Plan1 / Plan3)</span>
                <div className="status-card-icon" style={{ background: "rgba(16,185,129,0.18)", color: "#34d399" }}>
                  <Wrench size={17} />
                </div>
              </div>
              <div className="status-card-value">
                {dashboard.kpis.reqDone} / {dashboard.kpis.reqTotal}
              </div>
              <div className="progress-bar-dark">
                <div
                  className="progress-fill-dark"
                  style={{ width: `${dashboard.kpis.pctReq}%`, background: "#10b981" }}
                />
              </div>
              <div className="status-card-meta">
                <span className="tag tag-emerald">{dashboard.kpis.pctReq}% Testados ☑️ (Plan3)</span>
                <span>{dashboard.kpis.reqPending} pendentes de teste</span>
              </div>
            </div>

            {/* CARD 4: BLOQUEIOS, ATRASADOS & NÃO RESOLVIDOS */}
            <div className="status-card">
              <div className="status-card-top">
                <span className="status-card-title">Bloqueios & Não Resolvidos (5W + 2H)</span>
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
                <span className="tag tag-amber">{dashboard.kpis.naoResolvidos} NÃO RESOLVIDO (2H)</span>
              </div>
            </div>
          </div>

          {/* =================================================================
              ROW 1: FUNIL DE HOMOLOGAÇÃO DA ABA 2H (TESTE OK / TESTAR DISK / GUILHERME)
                     + DADOS EXPLICATIVOS DE CONTROLE DE AJUSTES (DIREITA)
             ================================================================= */}
          <div className="chart-explainer-row">
            <div className="chart-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div className="panel-title" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                    <PieChart size={17} color="#10b981" />
                    1. Funil de Homologação de Ajustes (Aba 2H) & Execução 5W2H
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    Estágio real de teste de cada tarefa técnica na coluna &ldquo;How&rdquo; da aba 2H (TESTE OK, TESTAR DISK, Guilherme e Não Resolvido)
                  </div>
                </div>
                <span className="tag tag-emerald">{dashboard.kpis.total2H ?? 202} ajustes na aba 2H</span>
              </div>

              <DonutChartSVG
                centerTop={`${dashboard.kpis.testeOkCount ?? 97}`}
                centerBottom="TESTE OK (2H)"
                segments={[
                  { label: "TESTE OK (Homologado pelo Suporte)", value: dashboard.kpis.testeOkCount ?? 97, color: "#10b981" },
                  { label: "TESTAR DISK (Aguardando QA da equipe Disk)", value: dashboard.kpis.testarDiskCount ?? 44, color: "#f59e0b" },
                  { label: "Com Guilherme (Em desenvolvimento / ajuste)", value: dashboard.kpis.guilherme2HCount ?? 35, color: "#3b82f6" },
                  { label: "NÃO RESOLVIDO (Trava técnica / regra pendente)", value: dashboard.kpis.naoResolvidos ?? 7, color: "#ef4444" }
                ]}
              />

              <div style={{ borderTop: "1px solid #162a21", paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1", marginBottom: 10 }}>
                  Comparativo Direto entre as Planilhas Originais (Abas 5W + 2H):
                </div>
                {(dashboard.porOrigem || []).map((orig: any) => {
                  const pct = orig.total ? Math.round((orig.concluido / orig.total) * 100) : 0;
                  const pctAnd = orig.total ? Math.round((orig.andamento / orig.total) * 100) : 0;
                  const pctNao = orig.total ? Math.round((orig.naoIniciado / orig.total) * 100) : 0;
                  const pctAtr = orig.total ? Math.round((orig.atrasado / orig.total) * 100) : 0;
                  return (
                    <div key={orig.origem} className="stacked-bar-row">
                      <div className="stacked-bar-header">
                        <strong>
                          {orig.origem} ({orig.total5W ?? 0} planos 5W + {orig.total2H ?? 0} tarefas 2H)
                        </strong>
                        <span style={{ color: "#94a3b8" }}>
                          {orig.concluido}/{orig.total} concluídos ({pct}%) •{" "}
                          <span style={{ color: "#34d399", fontWeight: 600 }}>
                            {orig.testeOk ?? 0} TESTE OK
                          </span>{" "}
                          •{" "}
                          <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                            {orig.testarDisk ?? 0} TESTAR DISK
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
                <Info size={13} /> Dados Explicativos — Controle de Ajustes (5W, 2H e DASH)
              </span>
              <div className="explainer-title">
                Como funcionam os estágios de homologação nas planilhas de Suporte e Financeiro?
              </div>
              <ul className="explainer-list">
                <li>
                  <strong>97 Itens com &ldquo;TESTE OK&rdquo; (Aba 2H Suporte):</strong> Tarefas do sistema que já foram desenvolvidas pelo Guilherme, testadas pela equipe de Suporte (Vinicius) e validadas em produção (ex.: <em>Bloquear campo quantidade para assento numerado</em>, <em>Ordenar ingressos por pedido</em>, <em>Corrigir exibição de lotes</em>).
                </li>
                <li className="warn">
                  <strong>44 Itens na Fila &ldquo;TESTAR DISK&rdquo; (41 Suporte + 3 Financeiro):</strong> Ajustes entregues que estão aguardando bateria de testes da equipe Disk antes de receberem o selo <code>TESTE OK</code> (ex.: <em>Relatório de Títulos</em>, <em>Cadastrar Cartões</em>, <em>Preview do Borderô</em>, <em>Curvatura das fileiras ao copiar setor</em>).
                </li>
                <li>
                  <strong>35 Itens com &ldquo;Guilherme&rdquo; (18 Financeiro + 17 Suporte):</strong> Demandas técnicas na fila direta de desenvolvimento (ex.: <em>Dupla entrada</em>, <em>Raiz da conta bancária</em>, <em>3DS 2.0</em>, <em>Softdescriptor</em>, <em>Webview do aplicativo</em>).
                </li>
                <li className="danger">
                  <strong>7 Itens Marcados como &ldquo;NÃO RESOLVIDO&rdquo; na Aba 2H Financeiro:</strong> Pendências críticas de regra ou código (ex.: <em>Dividir a taxa 80/20</em>, <em>SPREAD</em>, <em>REDE / PAG</em>, <em>Liberar até 100% do caixa</em>).
                </li>
              </ul>

              <div className="explainer-kpi-strip">
                <div className="explainer-mini-stat">
                  <span>DASH Suporte (5W / 2H)</span>
                  <strong>84% (5W) • 88,1% (2H)</strong>
                </div>
                <div className="explainer-mini-stat">
                  <span>DASH Financeiro (5W)</span>
                  <strong>26 / 38 (68,4%)</strong>
                </div>
                <div className="explainer-mini-stat">
                  <span>Fila QA Imediata</span>
                  <strong style={{ color: "#fbbf24" }}>{dashboard.kpis.testarDiskCount ?? 44} TESTAR DISK</strong>
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
                  <strong>Guilherme (Desenvolvimento & Ajustes de Sistema):</strong> Ponto focal técnico nas abas <code>5W</code>, <code>2H</code> e na planilha de <code>445 solicitações</code>. Concentra as entregas de código, regras de checkout, borderô, reconhecimento facial e mapa de assentos.
                </li>
                <li>
                  <strong>Vinicius Casagrande (Suporte & Homologação QA):</strong> Lidera a implantação operacional e a homologação dos <code>168</code> ajustes da aba 2H de Suporte (dos quais <code>97</code> já estão com <code>TESTE OK</code> e <code>41</code> na fila <code>TESTAR DISK</code>).
                </li>
                <li className="warn">
                  <strong>Karine Santos (Financeiro):</strong> Responsável pelos <code>38</code> planos macro da aba 5W e acompanhamento dos <code>34</code> desdobramentos técnicos da aba 2H do Financeiro (com <code>4</code> itens atrasados na camada contábil/segurança e <code>7</code> marcados como <code>NÃO RESOLVIDO</code>).
                </li>
                <li>
                  <strong>Naila, Eder e Jackson (Diretoria):</strong> Aprovaram as políticas de risco e integridade e definem as alçadas de liberação de caixa, repasses e taxas.
                </li>
              </ul>

              <div style={{ marginTop: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn-emerald"
                  onClick={() => {
                    setFiltroQaEtapa("TESTAR DISK");
                    setActiveModule("homologacao");
                  }}
                >
                  Abrir Fila TESTAR DISK ({contadoresQa.testarDisk}) <ArrowRight size={14} />
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setFiltroQaEtapa("NAO_RESOLVIDO");
                    setActiveModule("homologacao");
                  }}
                >
                  Ver Não Resolvidos ({contadoresQa.naoResolvido})
                </button>
              </div>
            </div>
          </div>

          {/* =================================================================
              ROW 3: GRÁFICO DE SOLICITAÇÕES & AJUSTES DA PLATAFORMA POR MÓDULO, SETOR (PLAN2) E MÊS
                     + DADOS EXPLICATIVOS DO BACKLOG DE 445 AJUSTES (DIREITA)
             ================================================================= */}
          <div className="chart-explainer-row">
            <div className="chart-card">
              <div>
                <div className="panel-title" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  <Activity size={17} color="#10b981" />
                  3. Solicitações & Ajustes da Plataforma por Módulo, Setor (Plan2) e Safra Mensal
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Origem: Planilha &ldquo;datas das solicitaçoes e ajustes.xlsx&rdquo; ({dashboard.kpis.reqTotal} solicitações em 22 datas de reunião)
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
                <Wrench size={13} /> Dados Explicativos — Quadro Oficial Plan2 & Plan3
              </span>
              <div className="explainer-title">
                Radiografia das {dashboard.kpis.reqTotal} solicitações da planilha de ajustes
              </div>
              <ul className="explainer-list">
                <li>
                  <strong>Divisão Oficial por Setor (Aba Plan2 da Planilha):</strong> O quadro consolidado na aba <code>Plan2</code> aponta <strong>55,5% das demandas do Setor de Suporte (288)</strong>, <strong>5,6% do Setor Financeiro (29)</strong> e <strong>38,9% de Outros Setores / Geral (202)</strong>.
                </li>
                <li>
                  <strong>Eventos, Pedidos e Mapa de Assentos:</strong> Mais de 60% das solicitações na aba <code>Plan1</code> tratam de usabilidade operacional — bloqueio de quantidade para assentos numerados, curvatura de fileiras ao copiar setor, limite de ingressos por CPF e ordenação de ingressos.
                </li>
                <li className="warn">
                  <strong>Ajustes do Financeiro & Borderô:</strong> Incluem <em>&ldquo;Borderô: Adições → Créditos&rdquo;</em>, <em>&ldquo;Preview do Borderô: Exibir dados de transferência bancária&rdquo;</em>, <em>&ldquo;Checkout: calcular tarifas quando a bandeira é Master&rdquo;</em> e <em>&ldquo;Tabela de Cálculo de Taxas visível apenas para o financeiro&rdquo;</em>.
                </li>
                <li>
                  <strong>Aba Plan3 (79 Itens Homologados ☑️):</strong> A aba <code>Plan3</code> lista os 79 ajustes já testados e validados pela equipe. Quando você marca um ajuste como <code>Testado ☑️</code> aqui no ERP, a célula correspondente na planilha Excel também recebe o check automaticamente.
                </li>
              </ul>

              <div className="explainer-kpi-strip">
                <div className="explainer-mini-stat">
                  <span>Setor Suporte (Plan2)</span>
                  <strong>288 (55,5%)</strong>
                </div>
                <div className="explainer-mini-stat">
                  <span>Setor Financeiro (Plan2)</span>
                  <strong>29 (5,6%)</strong>
                </div>
                <div className="explainer-mini-stat">
                  <span>Homologados ☑️</span>
                  <strong style={{ color: "#34d399" }}>{dashboard.kpis.reqDone} concluídos</strong>
                </div>
              </div>
            </div>
          </div>

          {/* =================================================================
              ROW 4: GRÁFICO DE PERGUNTAS ABERTAS E REGRAS DA ABA 2H (ESQUERDA)
                     + DADOS EXPLICATIVOS DAS DECISÕES PENDENTES NAS PLANILHAS (DIREITA)
             ================================================================= */}
          <div className="chart-explainer-row">
            <div className="chart-card">
              <div>
                <div className="panel-title" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  <HelpCircle size={17} color="#10b981" />
                  4. Mapeamento das Dúvidas e Regras de Negócio da Aba 2H ({perguntas.length} itens nas planilhas)
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Itens levantados na aba 2H da Planilha Financeiro que dependem de definição entre Financeiro (Karine), Diretoria e Guilherme
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {perguntas.map(q => {
                  const isDecided = q.status === "Decidido";
                  return (
                    <div
                      key={q.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "9px 12px",
                        borderRadius: 7,
                        background: "#091410",
                        border: "1px solid #162a21",
                        gap: 12
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#ecfdf5" }}>
                          <span style={{ color: "#34d399", marginRight: 6 }}>{q.codigo}</span>
                          {q.topico}
                        </div>
                        <div style={{ fontSize: 11.5, color: "#94a3b8" }}>{q.pergunta}</div>
                      </div>
                      <span className={`tag ${isDecided ? "tag-emerald" : "tag-amber"}`} style={{ flexShrink: 0 }}>
                        {q.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* EXPLICATIVO AO LADO DO GRÁFICO 4 */}
            <div className="explainer-card">
              <span className="explainer-badge">
                <HelpCircle size={13} /> Dados Explicativos — Regras de Sistema Pendentes (Aba 2H)
              </span>
              <div className="explainer-title">
                Por que esses itens da aba 2H impactam os ajustes do sistema?
              </div>
              <ul className="explainer-list">
                <li>
                  <strong>Divisão de Taxa (80/20) e Descontos (Linha 19 da aba 2H):</strong> Define como o sistema deve calcular o repasse quando há descontos concedidos ao produtor e quem absorve a taxa do gateway.
                </li>
                <li className="warn">
                  <strong>Múltiplas Bandeiras (REDE / PAG) e SPREAD (Linhas 15 a 18 da aba 2H):</strong> A aba 2H aponta a necessidade de parametrizar taxas diferentes por método (Cartão, PIX, POS, Site, PDV) e calcular o spread sobre o parcelamento.
                </li>
                <li>
                  <strong>Antecipação de Eventos e Liberação de Caixa (Linhas 10 e 20 da aba 2H):</strong> Define a regra no sistema sobre liberar até 100% do valor em caixa e o formato do comprovante/recibo de antecipação.
                </li>
              </ul>

              <div style={{ marginTop: "auto", display: "flex", gap: 10 }}>
                <button
                  className="btn-emerald"
                  onClick={() => setActiveModule("perguntas")}
                >
                  Registrar Decisões da Aba 2H <ArrowRight size={14} />
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setFiltro5wOrigem("FINANCEIRO");
                    setFiltro5wAba("2H");
                    setActiveModule("plano5w2h");
                  }}
                >
                  Ver Aba 2H Financeiro
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
                onClick={() => setActiveModule("homologacao")}
              >
                Abrir Central de Homologação & QA
              </button>
            </div>
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Planilha / Aba</th>
                  <th>Plano de Ação / Ajuste de Sistema</th>
                  <th>Responsável</th>
                  <th>Área</th>
                  <th>Ponto Focal / Etapa (Coluna D)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.atrasadosDestaque.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <span className="tag tag-slate">{p.origem_planilha}</span>{" "}
                      <span className="tag tag-emerald">{p.aba_origem || "5W"}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.plano}</td>
                    <td>{p.who_nome}</td>
                    <td>{p.area_nome}</td>
                    <td style={{ color: "#94a3b8" }}>{p.how || p.fim_planejado || "Verificar com Guilherme / Disk"}</td>
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
          MODULE 1 (NEW): CENTRAL DE HOMOLOGAÇÃO & QA DE AJUSTES (ABA 2H: TESTAR DISK / TESTE OK / GUILHERME)
         ===================================================================== */}
      {activeModule === "homologacao" && (
        <main className="page-container-wide">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <h1 className="page-title">
                Central de Homologação & QA de Ajustes do Sistema (Aba 2H — 202 Itens)
              </h1>
              <p className="page-subtitle" style={{ marginBottom: 0 }}>
                Controle operacional da coluna <strong>How (D)</strong> e <strong>Status (G)</strong> das abas 2H das planilhas Suporte (168 itens) e Financeiro (34 itens). Qualquer aprovação grava direto na linha exata da planilha Excel.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" onClick={handleManualSyncPlanilhas} disabled={isSyncing}>
                <RefreshCw size={14} /> Sincronizar Planilhas Agora
              </button>
              <button
                className="btn-emerald"
                onClick={() => {
                  setNovo5wOrigem("SUPORTE");
                  setShowNew5wModal(true);
                  setActiveModule("plano5w2h");
                }}
              >
                <Plus size={14} /> Novo Item 5W2H
              </button>
            </div>
          </div>

          {/* 4 INTERACTIVE QA STAGE CARDS */}
          <div className="status-cards-grid" style={{ marginBottom: 18 }}>
            <div
              className="status-card"
              style={{
                cursor: "pointer",
                borderColor: filtroQaEtapa === "TESTAR DISK" ? "#f59e0b" : undefined
              }}
              onClick={() => setFiltroQaEtapa(filtroQaEtapa === "TESTAR DISK" ? "ALL" : "TESTAR DISK")}
            >
              <div className="status-card-top">
                <span className="status-card-title">1. Fila TESTAR DISK (Aguardando QA)</span>
                <span className="tag tag-amber">Prioridade QA</span>
              </div>
              <div className="status-card-value" style={{ color: "#fbbf24" }}>
                {contadoresQa.testarDisk} ajustes
              </div>
              <div className="status-card-meta">
                <span>41 Suporte + 3 Financeiro</span>
                <span style={{ color: "#fbbf24", fontWeight: 700 }}>Clique para filtrar</span>
              </div>
            </div>

            <div
              className="status-card"
              style={{
                cursor: "pointer",
                borderColor: filtroQaEtapa === "GUILHERME" ? "#3b82f6" : undefined
              }}
              onClick={() => setFiltroQaEtapa(filtroQaEtapa === "GUILHERME" ? "ALL" : "GUILHERME")}
            >
              <div className="status-card-top">
                <span className="status-card-title">2. Fila Guilherme (Desenvolvimento)</span>
                <span className="tag tag-slate">Dev / Código</span>
              </div>
              <div className="status-card-value" style={{ color: "#60a5fa" }}>
                {contadoresQa.guilherme} ajustes
              </div>
              <div className="status-card-meta">
                <span>18 Financeiro + 17 Suporte</span>
                <span style={{ color: "#60a5fa", fontWeight: 700 }}>Clique para filtrar</span>
              </div>
            </div>

            <div
              className="status-card"
              style={{
                cursor: "pointer",
                borderColor: filtroQaEtapa === "NAO_RESOLVIDO" ? "#ef4444" : undefined
              }}
              onClick={() => setFiltroQaEtapa(filtroQaEtapa === "NAO_RESOLVIDO" ? "ALL" : "NAO_RESOLVIDO")}
            >
              <div className="status-card-top">
                <span className="status-card-title">3. Marcados &ldquo;NÃO RESOLVIDO&rdquo;</span>
                <span className="tag tag-red">Bloqueio</span>
              </div>
              <div className="status-card-value" style={{ color: "#f87171" }}>
                {contadoresQa.naoResolvido} travas
              </div>
              <div className="status-card-meta">
                <span>Coluna E da aba 2H Financeiro</span>
                <span style={{ color: "#f87171", fontWeight: 700 }}>Clique para filtrar</span>
              </div>
            </div>

            <div
              className="status-card"
              style={{
                cursor: "pointer",
                borderColor: filtroQaEtapa === "TESTE OK" ? "#10b981" : undefined
              }}
              onClick={() => setFiltroQaEtapa(filtroQaEtapa === "TESTE OK" ? "ALL" : "TESTE OK")}
            >
              <div className="status-card-top">
                <span className="status-card-title">4. Homologados (TESTE OK)</span>
                <span className="tag tag-emerald">Validado ☑️</span>
              </div>
              <div className="status-card-value" style={{ color: "#34d399" }}>
                {contadoresQa.testeOk} aprovados
              </div>
              <div className="status-card-meta">
                <span>Validados em produção pela Disk</span>
                <span style={{ color: "#34d399", fontWeight: 700 }}>Clique para filtrar</span>
              </div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input-dark"
              style={{ flex: 1, minWidth: 260 }}
              placeholder="Buscar ajuste na aba 2H (ex: Borderô, Assento, Lote, 3DS, Dupla entrada, Cartões)..."
              value={buscaQa}
              onChange={e => setBuscaQa(e.target.value)}
            />
            <select
              className="select-dark"
              value={filtroQaEtapa}
              onChange={e => setFiltroQaEtapa(e.target.value as any)}
            >
              <option value="ALL">Todas as Etapas 2H ({contadoresQa.total})</option>
              <option value="TESTAR DISK">🧪 TESTAR DISK ({contadoresQa.testarDisk})</option>
              <option value="GUILHERME">🛠️ Com Guilherme ({contadoresQa.guilherme})</option>
              <option value="NAO_RESOLVIDO">🚨 NÃO RESOLVIDO ({contadoresQa.naoResolvido})</option>
              <option value="TESTE OK">☑️ TESTE OK ({contadoresQa.testeOk})</option>
            </select>
            <select
              className="select-dark"
              value={filtroQaOrigem}
              onChange={e => setFiltroQaOrigem(e.target.value)}
            >
              <option value="ALL">Ambas as Planilhas (Suporte + Financeiro)</option>
              <option value="SUPORTE">Planilha Suporte (168 itens 2H)</option>
              <option value="FINANCEIRO">Planilha Financeiro (34 itens 2H)</option>
            </select>
          </div>

          {/* HOMOLOGATION TABLE */}
          <div className="panel-no-pad">
            <table className="fin-table">
              <thead>
                <tr>
                  <th style={{ width: "11%" }}>Planilha / Linha</th>
                  <th style={{ width: "36%" }}>Ajuste / Tarefa Técnica (Coluna C da Aba 2H)</th>
                  <th style={{ width: "16%" }}>Etapa Atual (Coluna D - How)</th>
                  <th style={{ width: "14%" }}>Status na Planilha (Coluna G)</th>
                  <th style={{ width: "23%" }}>Ação Rápida de Homologação (ERP ⇄ Excel)</th>
                </tr>
              </thead>
              <tbody>
                {itensHomologacao2H.map(item => {
                  const etapa = item.etapa_teste || "ESTRATEGICO";
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="tag tag-slate">{item.origem_planilha}</span>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                          Aba <strong>{item.aba_origem || "2H"}</strong> • Linha <strong>{item.linha_planilha || "—"}</strong>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: "#ecfdf5" }}>{item.plano}</div>
                        {item.nao_resolvido && (
                          <span className="tag tag-red" style={{ marginTop: 4, display: "inline-block" }}>
                            Coluna E: NÃO RESOLVIDO
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`tag ${
                            etapa === "TESTE OK"
                              ? "tag-emerald"
                              : etapa === "TESTAR DISK"
                              ? "tag-amber"
                              : etapa === "GUILHERME"
                              ? "tag-slate"
                              : "tag-slate"
                          }`}
                        >
                          {item.how || etapa}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`tag ${
                            item.status === "Concluído"
                              ? "tag-emerald"
                              : item.status === "Atrasado"
                              ? "tag-red"
                              : "tag-amber"
                          }`}
                        >
                          {item.status_original || item.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {etapa !== "TESTE OK" && (
                            <button
                              className="btn-emerald"
                              style={{ padding: "4px 9px", fontSize: 11.5 }}
                              title="Grava 'TESTE OK' na Coluna D e 'Realizado' na Coluna G da planilha Excel"
                              onClick={async () => {
                                const res = await fetch(`/api/plano-acao/${item.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({
                                    how: "TESTE OK",
                                    etapa_teste: "TESTE OK",
                                    status: "Concluído",
                                    nao_resolvido: false
                                  })
                                });
                                const data = await res.json();
                                const synced = data.excelSync?.syncedFiles?.length
                                  ? ` (${data.excelSync.syncedFiles[0]} linha ${item.linha_planilha})`
                                  : "";
                                showNotification(`Homologado! TESTE OK gravado no ERP e no Excel${synced}`);
                                fetchAll(dashOrigemFilter);
                              }}
                            >
                              ☑️ Aprovar TESTE OK
                            </button>
                          )}

                          {etapa !== "TESTAR DISK" && (
                            <button
                              className="btn-secondary"
                              style={{ padding: "4px 9px", fontSize: 11.5 }}
                              title="Move para a fila 'TESTAR DISK' na Coluna D da aba 2H"
                              onClick={async () => {
                                const res = await fetch(`/api/plano-acao/${item.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({
                                    how: "TESTAR DISK",
                                    etapa_teste: "TESTAR DISK"
                                  })
                                });
                                await res.json();
                                showNotification(`Item movido para a fila TESTAR DISK (Linha ${item.linha_planilha})!`);
                                fetchAll(dashOrigemFilter);
                              }}
                            >
                              🧪 Fila TESTAR DISK
                            </button>
                          )}

                          {item.nao_resolvido ? (
                            <button
                              className="btn-secondary"
                              style={{ padding: "4px 9px", fontSize: 11.5, borderColor: "#10b981", color: "#34d399" }}
                              onClick={async () => {
                                await fetch(`/api/plano-acao/${item.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({ nao_resolvido: false, status: "Concluído" })
                                });
                                showNotification(`Trava 'NÃO RESOLVIDO' removida na linha ${item.linha_planilha}!`);
                                fetchAll(dashOrigemFilter);
                              }}
                            >
                              Destravar / Resolver
                            </button>
                          ) : (
                            <button
                              className="btn-danger-outline"
                              style={{ padding: "4px 9px", fontSize: 11.5 }}
                              onClick={async () => {
                                await fetch(`/api/plano-acao/${item.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({ nao_resolvido: true, status: "Não iniciado" })
                                });
                                showNotification(`Marcado como NÃO RESOLVIDO na linha ${item.linha_planilha}!`);
                                fetchAll(dashOrigemFilter);
                              }}
                            >
                              Não Resolvido
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* =====================================================================
          MODULE 2: FINANCEIRO – RAZÃO CONTÁBIL E PAGAMENTOS (SIMULADOR DE REGRAS FASE 2)
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
          MODULE 3: PLANOS DE AÇÃO — ABAS 5W, 2H E ACOMPANHAMENTO DE EXECUÇÃO (IDÊNTICO À PLANILHA)
         ===================================================================== */}
      {activeModule === "plano5w2h" && (
        <main className="page-container-wide">
          {/* BARRA LARANJA E AZUL IDÊNTICA AO TOPO DA PLANILHA */}
          <div
            style={{
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid #1e382d",
              marginBottom: 16
            }}
          >
            {/* Faixa Superior Laranja (Estilo DiskIngressos Planilha) */}
            <div
              style={{
                background: "#ea580c",
                padding: "10px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 900, fontSize: 18, color: "#1e3a8a", fontStyle: "italic" }}>
                  DiskIngressos
                </span>
                <button
                  onClick={() => setActiveModule("cadastros")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: "pointer"
                  }}
                >
                  CADASTRO
                </button>
                <span
                  style={{
                    background: "#5b9bd5",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 12.5,
                    padding: "6px 14px",
                    borderRadius: 4
                  }}
                >
                  PLANOS DE AÇÃO
                </span>
                <button
                  onClick={() => setFiltro5wAba("EXE")}
                  style={{
                    background: filtro5wAba === "EXE" ? "#5b9bd5" : "transparent",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12.5,
                    padding: "6px 12px",
                    borderRadius: 4,
                    cursor: "pointer"
                  }}
                >
                  ACOMPANHAMENTO DE EXECUÇÃO
                </button>
                <button
                  onClick={() => setActiveModule("dashboard")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: "pointer"
                  }}
                >
                  DASHBOARD
                </button>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn-secondary"
                  style={{ background: "#0f221b", color: "#ecfdf5", borderColor: "#0f221b" }}
                  onClick={handleManualSyncPlanilhas}
                  disabled={isSyncing}
                >
                  <RefreshCw size={14} /> Puxar das Planilhas
                </button>
                <button
                  className="btn-emerald"
                  style={{ background: "#065f46", color: "#fff" }}
                  onClick={() => setShowNew5wModal(!showNew5wModal)}
                >
                  <Plus size={14} /> Nova Linha 5W2H
                </button>
              </div>
            </div>

            {/* Faixa Azul com as Abas "5 W" e "2 H" idênticas à captura de tela */}
            <div
              style={{
                background: "#5b9bd5",
                padding: "8px 18px 0 18px",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12
              }}
            >
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setFiltro5wAba("5W")}
                  style={{
                    background: filtro5wAba === "5W" ? "#ffffff" : "rgba(255,255,255,0.18)",
                    color: filtro5wAba === "5W" ? "#0f172a" : "#ffffff",
                    border: "none",
                    padding: "8px 28px",
                    fontWeight: 800,
                    fontSize: 13.5,
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    cursor: "pointer"
                  }}
                >
                  5 W ({planos.filter(p => p.aba_origem === "5W" && (filtro5wOrigem === "ALL" || String(p.origem_planilha).startsWith(filtro5wOrigem))).length})
                </button>
                <button
                  onClick={() => setFiltro5wAba("2H")}
                  style={{
                    background: filtro5wAba === "2H" ? "#ffffff" : "rgba(255,255,255,0.18)",
                    color: filtro5wAba === "2H" ? "#0f172a" : "#ffffff",
                    border: "none",
                    padding: "8px 28px",
                    fontWeight: 800,
                    fontSize: 13.5,
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    cursor: "pointer"
                  }}
                >
                  2 H ({planos.filter(p => p.aba_origem === "2H" && (filtro5wOrigem === "ALL" || String(p.origem_planilha).startsWith(filtro5wOrigem))).length})
                </button>
                <button
                  onClick={() => setFiltro5wAba("EXE")}
                  style={{
                    background: filtro5wAba === "EXE" ? "#ffffff" : "rgba(255,255,255,0.18)",
                    color: filtro5wAba === "EXE" ? "#0f172a" : "#ffffff",
                    border: "none",
                    padding: "8px 22px",
                    fontWeight: 800,
                    fontSize: 13,
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    cursor: "pointer"
                  }}
                >
                  ACOMPANHAMENTO DE EXECUÇÃO — EXE ({planos.filter(p => p.aba_origem === "EXE" && (filtro5wOrigem === "ALL" || String(p.origem_planilha).startsWith(filtro5wOrigem))).length})
                </button>
              </div>

              {/* Seletor rápido da Planilha (Financeiro Karine vs Suporte Vinicius) */}
              <div style={{ display: "flex", gap: 6, paddingBottom: 6, flexWrap: "wrap" }}>
                <button
                  onClick={() => setFiltro5wOrigem("FINANCEIRO")}
                  style={{
                    background: filtro5wOrigem === "FINANCEIRO" ? "#0f172a" : "rgba(15,23,42,0.35)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: 5,
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Planilha Financeiro (Karine)
                </button>
                <button
                  onClick={() => setFiltro5wOrigem("SUPORTE")}
                  style={{
                    background: filtro5wOrigem === "SUPORTE" ? "#0f172a" : "rgba(15,23,42,0.35)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: 5,
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Planilha Suporte (Vinicius)
                </button>
                <button
                  onClick={() => setFiltro5wOrigem("ALL")}
                  style={{
                    background: filtro5wOrigem === "ALL" ? "#0f172a" : "rgba(15,23,42,0.35)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: 5,
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Ambas as Planilhas
                </button>
              </div>
            </div>
          </div>

          {showNew5wModal && (
            <div className="panel" style={{ borderColor: "#10b981" }}>
              <div className="panel-title">Adicionar Nova Ação 5W2H (Salva no ERP e na Planilha)</div>
              <form className="form-row" onSubmit={handleCriarNovoPlano5W2H}>
                <div className="field" style={{ width: 170 }}>
                  <label>Planilha Destino</label>
                  <select className="select-dark" value={novo5wOrigem} onChange={e => setNovo5wOrigem(e.target.value)}>
                    <option value="FINANCEIRO">Financeiro (Karine)</option>
                    <option value="SUPORTE">Suporte (Vinicius)</option>
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 220 }}>
                  <label>Plano de Ação (Coluna C)</label>
                  <input
                    className="input-dark"
                    placeholder="Ex: Aba contabilidade – sistema de dupla entrada..."
                    value={novo5wPlano}
                    onChange={e => setNovo5wPlano(e.target.value)}
                    required
                  />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 200 }}>
                  <label>What — O que será feito (Coluna E)</label>
                  <input
                    className="input-dark"
                    placeholder="Descrição do que será feito..."
                    value={novo5wWhat}
                    onChange={e => setNovo5wWhat(e.target.value)}
                  />
                </div>
                <div className="field" style={{ width: 150 }}>
                  <label>Priorização (Coluna D)</label>
                  <select className="select-dark" value={novo5wPrioridade} onChange={e => setNovo5wPrioridade(e.target.value)}>
                    <option value="Muito Urgente">Muito Urgente</option>
                    <option value="Urgente">Urgente</option>
                    <option value="Normal">Normal</option>
                    <option value="Pouco Urgente">Pouco Urgente</option>
                  </select>
                </div>
                <div className="field" style={{ width: 150 }}>
                  <label>Status Inicial</label>
                  <select className="select-dark" value={novo5wStatus} onChange={e => setNovo5wStatus(e.target.value)}>
                    <option value="Em andamento">Em andamento</option>
                    <option value="Não iniciado">Não iniciado</option>
                    <option value="Concluído">Concluído</option>
                    <option value="Atrasado">Atrasado</option>
                  </select>
                </div>
                <button type="submit" className="btn-emerald">Salvar no ERP & Excel</button>
              </form>
            </div>
          )}

          {/* BARRA DE BUSCA E ATALHO DIRETO PARA AS LINHAS DO PRINT */}
          <div className="panel" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <input
              className="input-dark"
              style={{ flex: 1, minWidth: 240 }}
              placeholder="Buscar em Plano de Ação, What, Why, Por quem, Onde..."
              value={busca5w}
              onChange={e => setBusca5w(e.target.value)}
            />
            <select
              className="select-dark"
              value={filtro5wStatus}
              onChange={e => setFiltro5wStatus(e.target.value)}
            >
              <option value="ALL">Todos os Status</option>
              <option value="Atrasado">Atrasados (ex.: Dupla Entrada, Raiz, 3DS)</option>
              <option value="Em andamento">Em andamento</option>
              <option value="Concluído">Concluído / Realizado</option>
              <option value="Não iniciado">Não iniciado / Não Realizado</option>
            </select>
            <button
              type="button"
              className="btn-secondary"
              style={{ borderColor: "#ea580c", color: "#fb923c" }}
              onClick={() => {
                setFiltro5wAba("5W");
                setFiltro5wOrigem("FINANCEIRO");
                setFiltro5wStatus("ALL");
                setBusca5w("");
                const el = document.getElementById("row-5w-FINANCEIRO-36");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              📌 Ir para Linhas 36–43 (Aba contabilidade, Raiz bancária, Ativo/Passivo, 3DS)
            </button>
          </div>

          {/* =================================================================
              TABELA ABA 5W — IDÊNTICA À CAPTURA DE TELA DO EXCEL (CABEÇALHO DUPLO)
             ================================================================= */}
          {filtro5wAba === "5W" && (
            <div className="panel-no-pad" style={{ overflowX: "auto" }}>
              <table className="fin-table" style={{ minWidth: 1220, borderCollapse: "collapse" }}>
                <thead>
                  {/* Linha 1 do Cabeçalho Agrupado (What, Why, Who, When, Where) */}
                  <tr style={{ background: "#334155" }}>
                    <th rowSpan={2} style={{ borderRight: "1px solid #475569", width: 64, textAlign: "center", color: "#e2e8f0" }}>
                      Linha
                    </th>
                    <th rowSpan={2} style={{ borderRight: "1px solid #475569", minWidth: 270, color: "#ffffff", fontSize: 12.5 }}>
                      Plano de Ação
                    </th>
                    <th rowSpan={2} style={{ borderRight: "1px solid #475569", width: 138, textAlign: "center", color: "#ffffff", fontSize: 12.5 }}>
                      Priorização
                    </th>
                    <th style={{ borderRight: "1px solid #475569", borderBottom: "1px solid #475569", color: "#e2e8f0", minWidth: 190 }}>
                      What
                    </th>
                    <th style={{ borderRight: "1px solid #475569", borderBottom: "1px solid #475569", color: "#e2e8f0", minWidth: 150 }}>
                      Why
                    </th>
                    <th colSpan={2} style={{ borderRight: "1px solid #475569", borderBottom: "1px solid #475569", color: "#e2e8f0", textAlign: "center" }}>
                      Who
                    </th>
                    <th colSpan={4} style={{ borderRight: "1px solid #475569", borderBottom: "1px solid #475569", color: "#e2e8f0", textAlign: "center" }}>
                      When
                    </th>
                    <th style={{ borderRight: "1px solid #475569", borderBottom: "1px solid #475569", color: "#e2e8f0", width: 110 }}>
                      Where
                    </th>
                    <th rowSpan={2} style={{ width: 145, textAlign: "center", color: "#ffffff" }}>
                      Status
                    </th>
                  </tr>
                  {/* Linha 2 do Cabeçalho Agrupado */}
                  <tr style={{ background: "#475569" }}>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5 }}>O que será feito</th>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5 }}>Justificativa</th>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5, width: 135 }}>Por quem</th>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5, width: 95 }}>Área</th>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5, width: 92, textAlign: "center" }}>Início</th>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5, width: 65, textAlign: "center" }}>Prazo (dias)</th>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5, width: 95, textAlign: "center" }}>Fim Planejado</th>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5, width: 90, textAlign: "center" }}>Fim Real</th>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5 }}>Onde</th>
                  </tr>
                </thead>
                <tbody>
                  {planosFiltrados.map(p => {
                    const prio = p.prioridade || "Muito Urgente";
                    const prioBg =
                      prio === "Muito Urgente"
                        ? "#dc2626"
                        : prio === "Urgente"
                        ? "#ea580c"
                        : prio === "Normal"
                        ? "#16a34a"
                        : "#2563eb";
                    const formatBrDate = (iso: string | null) => {
                      if (!iso) return "";
                      const parts = String(iso).slice(0, 10).split("-");
                      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
                    };

                    return (
                      <tr
                        key={p.id}
                        id={`row-5w-${p.origem_planilha}-${p.linha_planilha}`}
                        style={{ borderBottom: "1px solid #1e382d" }}
                      >
                        {/* Linha da Planilha */}
                        <td style={{ textAlign: "center", fontSize: 11.5, color: "#94a3b8", borderRight: "1px solid #162a21" }}>
                          <div style={{ fontWeight: 700, color: "#cbd5e1" }}>#{p.linha_planilha}</div>
                          <div style={{ fontSize: 10 }}>{p.origem_planilha === "FINANCEIRO" ? "FIN" : "SUP"}</div>
                        </td>

                        {/* Coluna C: Plano de Ação */}
                        <td style={{ fontWeight: 600, color: "#f8fafc", borderRight: "1px solid #162a21" }}>
                          {p.plano}
                        </td>

                        {/* Coluna D: Priorização (Exatamente com as cores Laranja/Vermelho da planilha) */}
                        <td style={{ padding: 4, borderRight: "1px solid #162a21", textAlign: "center" }}>
                          <select
                            value={prio}
                            style={{
                              background: prioBg,
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: 12,
                              border: "none",
                              borderRadius: 4,
                              padding: "6px 8px",
                              width: "100%",
                              cursor: "pointer",
                              textAlign: "center"
                            }}
                            onChange={async e => {
                              const novaPrio = e.target.value;
                              const res = await fetch(`/api/plano-acao/${p.id}`, {
                                method: "PUT",
                                headers: apiHeaders(),
                                body: JSON.stringify({ prioridade: novaPrio })
                              });
                              const data = await res.json();
                              const synced = data.excelSync?.syncedFiles?.length
                                ? ` (${data.excelSync.syncedFiles[0]} linha ${p.linha_planilha})`
                                : "";
                              showNotification(`Priorização atualizada para "${novaPrio}"${synced}`);
                              fetchAll(dashOrigemFilter);
                            }}
                          >
                            <option value="Muito Urgente">Muito Urgente</option>
                            <option value="Urgente">Urgente</option>
                            <option value="Normal">Normal</option>
                            <option value="Pouco Urgente">Pouco Urgente</option>
                          </select>
                        </td>

                        {/* Coluna E: What (O que será feito) — editável */}
                        <td style={{ borderRight: "1px solid #162a21", padding: "4px 8px" }}>
                          <input
                            className="input-dark"
                            style={{ width: "100%", background: "transparent", border: "1px solid transparent", padding: "4px 6px", fontSize: 12 }}
                            defaultValue={p.what || ""}
                            placeholder="—"
                            onBlur={async e => {
                              if (e.target.value !== (p.what || "")) {
                                await fetch(`/api/plano-acao/${p.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({ what: e.target.value })
                                });
                                showNotification(`Coluna What (Linha ${p.linha_planilha}) salva no ERP e Excel!`);
                                fetchAll(dashOrigemFilter);
                              }
                            }}
                          />
                        </td>

                        {/* Coluna F: Why (Justificativa) — editável */}
                        <td style={{ borderRight: "1px solid #162a21", padding: "4px 8px" }}>
                          <input
                            className="input-dark"
                            style={{ width: "100%", background: "transparent", border: "1px solid transparent", padding: "4px 6px", fontSize: 12 }}
                            defaultValue={p.why || ""}
                            placeholder="—"
                            onBlur={async e => {
                              if (e.target.value !== (p.why || "")) {
                                await fetch(`/api/plano-acao/${p.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({ why: e.target.value })
                                });
                                showNotification(`Coluna Why (Linha ${p.linha_planilha}) salva no ERP e Excel!`);
                                fetchAll(dashOrigemFilter);
                              }
                            }}
                          />
                        </td>

                        {/* Coluna G: Who (Por quem) */}
                        <td style={{ borderRight: "1px solid #162a21", fontSize: 12, fontWeight: 600 }}>
                          {p.who_nome || "—"}
                        </td>

                        {/* Coluna H: Área */}
                        <td style={{ borderRight: "1px solid #162a21", fontSize: 12 }}>
                          {p.area_nome || "—"}
                        </td>

                        {/* Coluna I: Início */}
                        <td style={{ borderRight: "1px solid #162a21", textAlign: "center", fontSize: 12, whiteSpace: "nowrap" }}>
                          {formatBrDate(p.inicio)}
                        </td>

                        {/* Coluna J: Prazo (dias) */}
                        <td style={{ borderRight: "1px solid #162a21", textAlign: "center", fontSize: 12 }}>
                          {p.prazo_dias ?? 30}
                        </td>

                        {/* Coluna K: Fim Planejado */}
                        <td style={{ borderRight: "1px solid #162a21", textAlign: "center", fontSize: 12, whiteSpace: "nowrap" }}>
                          {formatBrDate(p.fim_planejado)}
                        </td>

                        {/* Coluna L: Fim Real */}
                        <td style={{ borderRight: "1px solid #162a21", textAlign: "center", fontSize: 12, whiteSpace: "nowrap", color: "#34d399" }}>
                          {formatBrDate(p.fim_real)}
                        </td>

                        {/* Coluna M: Where (Onde) — editável */}
                        <td style={{ borderRight: "1px solid #162a21", padding: "4px 8px" }}>
                          <input
                            className="input-dark"
                            style={{ width: "100%", background: "transparent", border: "1px solid transparent", padding: "4px 6px", fontSize: 12 }}
                            defaultValue={p.onde || ""}
                            placeholder="—"
                            onBlur={async e => {
                              if (e.target.value !== (p.onde || "")) {
                                await fetch(`/api/plano-acao/${p.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({ onde: e.target.value })
                                });
                                showNotification(`Coluna Where/Onde (Linha ${p.linha_planilha}) salva no ERP e Excel!`);
                                fetchAll(dashOrigemFilter);
                              }
                            }}
                          />
                        </td>

                        {/* Coluna P: Status (ERP ⇄ Planilha) */}
                        <td style={{ padding: 4 }}>
                          <select
                            className="select-dark"
                            style={{ padding: "5px 8px", fontSize: 12, width: "100%" }}
                            value={p.status}
                            onChange={async e => {
                              const novoStatus = e.target.value;
                              const res = await fetch(`/api/plano-acao/${p.id}`, {
                                method: "PUT",
                                headers: apiHeaders(),
                                body: JSON.stringify({ status: novoStatus })
                              });
                              const data = await res.json();
                              const syncedMsg = data.excelSync?.syncedFiles?.length
                                ? ` + gravado em ${data.excelSync.syncedFiles[0]} (linha ${p.linha_planilha})`
                                : "";
                              showNotification(`Linha #${p.linha_planilha} → ${novoStatus}${syncedMsg}`);
                              fetchAll(dashOrigemFilter);
                            }}
                          >
                            <option value="Concluído">Concluído</option>
                            <option value="Em andamento">Em andamento</option>
                            <option value="Atrasado">Atrasado</option>
                            <option value="Não iniciado">Não iniciado</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* =================================================================
              TABELA ABA 2H — IDÊNTICA À ABA 2H DA PLANILHA (CABEÇALHO DUPLO: PLANO DE AÇÃO | HOW | HOW MUCH | DATA MÁXIMA | STATUS)
             ================================================================= */}
          {(filtro5wAba === "2H" || filtro5wAba === "ALL") && (
            <div className="panel-no-pad" style={{ overflowX: "auto" }}>
              <table className="fin-table" style={{ minWidth: 1050, borderCollapse: "collapse" }}>
                <thead>
                  {/* Linha 1 do Cabeçalho Agrupado da Aba 2H */}
                  <tr style={{ background: "#334155" }}>
                    <th rowSpan={2} style={{ borderRight: "1px solid #475569", width: 70, textAlign: "center", color: "#e2e8f0" }}>
                      Linha
                    </th>
                    <th rowSpan={2} style={{ borderRight: "1px solid #475569", minWidth: 340, color: "#ffffff", fontSize: 12.5 }}>
                      Plano de Ação
                    </th>
                    <th style={{ borderRight: "1px solid #475569", borderBottom: "1px solid #475569", color: "#e2e8f0", minWidth: 240 }}>
                      How
                    </th>
                    <th style={{ borderRight: "1px solid #475569", borderBottom: "1px solid #475569", color: "#e2e8f0", width: 170, textAlign: "center" }}>
                      How much
                    </th>
                    <th rowSpan={2} style={{ borderRight: "1px solid #475569", width: 170, textAlign: "center", color: "#ffffff", fontSize: 12 }}>
                      Data máxima para conclusão
                    </th>
                    <th rowSpan={2} style={{ width: 155, textAlign: "center", color: "#ffffff", fontSize: 12.5 }}>
                      Status
                    </th>
                  </tr>
                  {/* Linha 2 do Cabeçalho Agrupado da Aba 2H */}
                  <tr style={{ background: "#475569" }}>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5 }}>
                      Como será feito
                    </th>
                    <th style={{ borderRight: "1px solid #64748b", color: "#f8fafc", fontSize: 11.5, textAlign: "center" }}>
                      Quanto custa
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {planosFiltrados.map(p => {
                    const formatBrDate = (iso: string | null) => {
                      if (!iso) return "";
                      const parts = String(iso).slice(0, 10).split("-");
                      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
                    };
                    const isRealizado = p.status === "Concluído";

                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid #1e382d" }}>
                        {/* Linha da Planilha */}
                        <td style={{ textAlign: "center", fontSize: 11.5, color: "#94a3b8", borderRight: "1px solid #162a21" }}>
                          <div style={{ fontWeight: 700, color: "#cbd5e1" }}>#{p.linha_planilha}</div>
                          <div style={{ fontSize: 10 }}>{p.origem_planilha === "FINANCEIRO" ? "FIN" : "SUP"}</div>
                        </td>

                        {/* Coluna C: Plano de Ação */}
                        <td style={{ fontWeight: 600, color: "#f8fafc", borderRight: "1px solid #162a21" }}>
                          {p.plano}
                        </td>

                        {/* Coluna D: How (Como será feito) — editável */}
                        <td style={{ borderRight: "1px solid #162a21", padding: "4px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              className="input-dark"
                              style={{
                                flex: 1,
                                background: "rgba(0,0,0,0.2)",
                                border: "1px solid #1e382d",
                                padding: "5px 8px",
                                fontSize: 12,
                                color:
                                  p.etapa_teste === "TESTE OK"
                                    ? "#34d399"
                                    : p.etapa_teste === "TESTAR DISK"
                                    ? "#fbbf24"
                                    : "#f8fafc",
                                fontWeight: p.etapa_teste === "TESTAR DISK" || p.etapa_teste === "TESTE OK" ? 700 : 500
                              }}
                              defaultValue={p.how || ""}
                              onBlur={async e => {
                                const val = e.target.value;
                                if (val !== (p.how || "")) {
                                  await fetch(`/api/plano-acao/${p.id}`, {
                                    method: "PUT",
                                    headers: apiHeaders(),
                                    body: JSON.stringify({
                                      how: val,
                                      etapa_teste:
                                        val.toUpperCase().includes("TESTE OK")
                                          ? "TESTE OK"
                                          : val.toUpperCase().includes("TESTAR DISK")
                                          ? "TESTAR DISK"
                                          : val.toUpperCase().includes("GUILHERME") || val.toUpperCase().includes("GULHERME")
                                          ? "GUILHERME"
                                          : "ESTRATEGICO"
                                    })
                                  });
                                  showNotification(`Coluna How (Linha #${p.linha_planilha}) atualizada no ERP e Excel!`);
                                  fetchAll(dashOrigemFilter);
                                }
                              }}
                            />
                          </div>
                        </td>

                        {/* Coluna E: How much (Quanto custa / NÃO RESOLVIDO) */}
                        <td style={{ borderRight: "1px solid #162a21", textAlign: "center", padding: "4px 8px" }}>
                          {p.nao_resolvido ? (
                            <span
                              className="tag tag-red"
                              style={{ cursor: "pointer", fontWeight: 800, padding: "4px 10px" }}
                              title="Clique para remover NÃO RESOLVIDO no ERP e na Planilha"
                              onClick={async () => {
                                await fetch(`/api/plano-acao/${p.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({ nao_resolvido: false })
                                });
                                showNotification(`Linha #${p.linha_planilha}: NÃO RESOLVIDO removido!`);
                                fetchAll(dashOrigemFilter);
                              }}
                            >
                              NÃO RESOLVIDO
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`/api/plano-acao/${p.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({ nao_resolvido: true })
                                });
                                showNotification(`Linha #${p.linha_planilha} marcada como NÃO RESOLVIDO!`);
                                fetchAll(dashOrigemFilter);
                              }}
                              style={{
                                background: "transparent",
                                border: "1px dashed #334155",
                                color: "#64748b",
                                borderRadius: 4,
                                padding: "3px 8px",
                                fontSize: 11,
                                cursor: "pointer"
                              }}
                              title="Clique caso queira marcar NÃO RESOLVIDO nesta linha"
                            >
                              {p.how_much_centavos > 0 ? formatBRL(p.how_much_centavos) : "—"}
                            </button>
                          )}
                        </td>

                        {/* Coluna F: Data máxima para conclusão */}
                        <td style={{ borderRight: "1px solid #162a21", textAlign: "center", fontSize: 12.5, whiteSpace: "nowrap" }}>
                          {formatBrDate(p.fim_planejado)}
                        </td>

                        {/* Coluna G: Status (Realizado / Não Realizado idêntico à planilha) */}
                        <td style={{ padding: 4, textAlign: "center" }}>
                          <select
                            value={isRealizado ? "Concluído" : "Não iniciado"}
                            style={{
                              background: isRealizado ? "#16a34a" : "#dc2626",
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: 12,
                              border: "none",
                              borderRadius: 4,
                              padding: "6px 10px",
                              width: "100%",
                              cursor: "pointer",
                              textAlign: "center"
                            }}
                            onChange={async e => {
                              const novoStatus = e.target.value;
                              const res = await fetch(`/api/plano-acao/${p.id}`, {
                                method: "PUT",
                                headers: apiHeaders(),
                                body: JSON.stringify({
                                  status: novoStatus,
                                  status_original: novoStatus === "Concluído" ? "Realizado" : "Não Realizado"
                                })
                              });
                              const data = await res.json();
                              const synced = data.excelSync?.syncedFiles?.length
                                ? ` (${data.excelSync.syncedFiles[0]} linha ${p.linha_planilha})`
                                : "";
                              showNotification(
                                `Linha #${p.linha_planilha} → ${novoStatus === "Concluído" ? "Realizado" : "Não Realizado"}${synced}!`
                              );
                              fetchAll(dashOrigemFilter);
                            }}
                          >
                            <option value="Concluído">Realizado</option>
                            <option value="Não iniciado">Não Realizado</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* =================================================================
              TABELA ABA EXE — ACOMPANHAMENTO DE EXECUÇÃO (IDÊNTICA À ABA EXE DA PLANILHA)
             ================================================================= */}
          {filtro5wAba === "EXE" && (
            <div className="panel-no-pad" style={{ overflowX: "auto" }}>
              <table className="fin-table" style={{ minWidth: 980, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#334155" }}>
                    <th style={{ borderRight: "1px solid #475569", width: 70, textAlign: "center", color: "#e2e8f0" }}>
                      Linha
                    </th>
                    <th style={{ borderRight: "1px solid #475569", minWidth: 360, color: "#ffffff", fontSize: 12.5 }}>
                      Planos de Ação
                    </th>
                    <th style={{ borderRight: "1px solid #475569", width: 170, textAlign: "center", color: "#ffffff", fontSize: 12 }}>
                      Quantidade de Tarefas Programadas
                    </th>
                    <th style={{ borderRight: "1px solid #475569", width: 170, textAlign: "center", color: "#ffffff", fontSize: 12 }}>
                      Quantidade de Tarefas Realizadas
                    </th>
                    <th style={{ borderRight: "1px solid #475569", width: 180, textAlign: "center", color: "#ffffff", fontSize: 12 }}>
                      % de Conclusão do Plano de Ação
                    </th>
                    <th style={{ width: 150, textAlign: "center", color: "#ffffff", fontSize: 12.5 }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {planosFiltrados.map(p => {
                    const prog = Number(p.tarefas_programadas || 1);
                    const real = Number(p.tarefas_realizadas ?? 0);
                    const pctNum = prog > 0 ? (real / prog) * 100 : 0;
                    const pctFormatted = `${pctNum.toFixed(2).replace(".", ",")}%`;
                    const statusLabel = p.status_original || p.status;
                    const statusBg =
                      p.status === "Concluído"
                        ? "#16a34a"
                        : p.status === "Atrasado"
                        ? "#dc2626"
                        : "#ea580c";

                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid #1e382d" }}>
                        <td style={{ textAlign: "center", fontSize: 11.5, color: "#94a3b8", borderRight: "1px solid #162a21" }}>
                          <div style={{ fontWeight: 700, color: "#cbd5e1" }}>#{p.linha_planilha}</div>
                          <div style={{ fontSize: 10 }}>{p.origem_planilha === "FINANCEIRO" ? "FIN" : "SUP"}</div>
                        </td>
                        <td style={{ fontWeight: 600, color: "#f8fafc", borderRight: "1px solid #162a21" }}>
                          {p.plano}
                        </td>
                        <td style={{ textAlign: "center", borderRight: "1px solid #162a21", padding: 4 }}>
                          <input
                            type="number"
                            min={0}
                            className="input-dark"
                            style={{ width: 72, textAlign: "center", fontWeight: 700, padding: "4px 6px" }}
                            defaultValue={prog}
                            onBlur={async e => {
                              const newProg = Math.max(1, Number(e.target.value) || 1);
                              if (newProg !== prog) {
                                const newStatus = real >= newProg ? "Concluído" : real > 0 ? "Em andamento" : "Atrasado";
                                await fetch(`/api/plano-acao/${p.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({
                                    tarefas_programadas: newProg,
                                    status: newStatus,
                                    status_original: newStatus
                                  })
                                });
                                showNotification(`Linha #${p.linha_planilha} EXE: Tarefas Programadas → ${newProg}!`);
                                fetchAll(dashOrigemFilter);
                              }
                            }}
                          />
                        </td>
                        <td style={{ textAlign: "center", borderRight: "1px solid #162a21", padding: 4 }}>
                          <input
                            type="number"
                            min={0}
                            className="input-dark"
                            style={{ width: 72, textAlign: "center", fontWeight: 700, color: "#34d399", padding: "4px 6px" }}
                            defaultValue={real}
                            onBlur={async e => {
                              const newReal = Math.max(0, Number(e.target.value) || 0);
                              if (newReal !== real) {
                                const newStatus = newReal >= prog ? "Concluído" : newReal > 0 ? "Em andamento" : "Atrasado";
                                await fetch(`/api/plano-acao/${p.id}`, {
                                  method: "PUT",
                                  headers: apiHeaders(),
                                  body: JSON.stringify({
                                    tarefas_realizadas: newReal,
                                    status: newStatus,
                                    status_original: newStatus
                                  })
                                });
                                showNotification(`Linha #${p.linha_planilha} EXE: Tarefas Realizadas → ${newReal}!`);
                                fetchAll(dashOrigemFilter);
                              }
                            }}
                          />
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, borderRight: "1px solid #162a21", fontSize: 12.5 }}>
                          {pctFormatted}
                        </td>
                        <td style={{ padding: 4, textAlign: "center" }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: "100%",
                              background: statusBg,
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: 12,
                              borderRadius: 4,
                              padding: "6px 8px"
                            }}
                          >
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      )}

      {/* =====================================================================
          MODULE 4: SOLICITAÇÕES & AJUSTES DA PLATAFORMA (GUILHERME — PLAN1, PLAN2 E PLAN3)
         ===================================================================== */}
      {activeModule === "solicitacoes" && (
        <main className="page-container-wide">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h1 className="page-title">Solicitações e Ajustes da Plataforma (Guilherme — Plan1, Plan2 & Plan3)</h1>
              <p className="page-subtitle" style={{ marginBottom: 0 }}>
                {solicitacoes.length} solicitações sincronizadas em mão dupla com &ldquo;datas das solicitaçoes e ajustes.xlsx&rdquo; ({datasSolicitacao.length} datas de reunião).
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" onClick={handleManualSyncPlanilhas} disabled={isSyncing}>
                <RefreshCw size={14} /> Puxar da Planilha
              </button>
              <button className="btn-emerald" onClick={() => setShowNewSolModal(!showNewSolModal)}>
                <Plus size={14} /> Nova Solicitação p/ Guilherme
              </button>
            </div>
          </div>

          {/* QUADRO OFICIAL PLAN2 DA PLANILHA */}
          <div className="status-cards-grid" style={{ marginBottom: 16 }}>
            <div
              className="status-card"
              style={{ cursor: "pointer" }}
              onClick={() => setFiltroStatusSol("ALL")}
            >
              <div className="status-card-top">
                <span className="status-card-title">Setor de Suporte (Aba Plan2)</span>
                <span className="tag tag-emerald">55,5%</span>
              </div>
              <div className="status-card-value">288 demandas</div>
              <div className="status-card-meta">
                <span>Eventos, Pedidos, Mapa de Assentos, Facial</span>
              </div>
            </div>

            <div
              className="status-card"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setFiltroModuloSol("Financeiro & Borderô");
                setFiltroStatusSol("ALL");
              }}
            >
              <div className="status-card-top">
                <span className="status-card-title">Setor Financeiro (Aba Plan2)</span>
                <span className="tag tag-amber">5,6%</span>
              </div>
              <div className="status-card-value">29 demandas</div>
              <div className="status-card-meta">
                <span>Borderô, Taxas Master, Cartões, Contabilidade</span>
              </div>
            </div>

            <div
              className="status-card"
              style={{ cursor: "pointer" }}
              onClick={() => setFiltroStatusSol("CONCLUIDOS")}
            >
              <div className="status-card-top">
                <span className="status-card-title">Testados & Homologados ☑️ (Plan3)</span>
                <span className="tag tag-emerald">Plan3</span>
              </div>
              <div className="status-card-value" style={{ color: "#34d399" }}>
                {solicitacoes.filter(s => s.concluido).length} testados
              </div>
              <div className="status-card-meta">
                <span>Clique para filtrar os homologados</span>
              </div>
            </div>

            <div
              className="status-card"
              style={{ cursor: "pointer" }}
              onClick={() => setFiltroStatusSol("PENDENTES")}
            >
              <div className="status-card-top">
                <span className="status-card-title">Pendentes de Teste / Entrega</span>
                <span className="tag tag-amber">Backlog</span>
              </div>
              <div className="status-card-value" style={{ color: "#fbbf24" }}>
                {solicitacoes.filter(s => !s.concluido).length} pendentes
              </div>
              <div className="status-card-meta">
                <span>Clique para ver fila pendente</span>
              </div>
            </div>
          </div>

          {showNewSolModal && (
            <div className="panel" style={{ borderColor: "#10b981", marginBottom: 16 }}>
              <div className="panel-title">Registrar Nova Solicitação de Ajuste para o Guilherme</div>
              <form className="form-row" onSubmit={handleCriarSolicitacao}>
                <div className="field" style={{ width: 160 }}>
                  <label>Data da Reunião</label>
                  <input
                    type="date"
                    className="input-dark"
                    value={novaSolData}
                    onChange={e => setNovaSolData(e.target.value)}
                    required
                  />
                </div>
                <div className="field" style={{ width: 220 }}>
                  <label>Módulo do Sistema</label>
                  <select className="select-dark" value={novaSolModulo} onChange={e => setNovaSolModulo(e.target.value)}>
                    <option value="Eventos & Ingressos">Eventos & Ingressos</option>
                    <option value="Pedidos & Checkout">Pedidos & Checkout</option>
                    <option value="Mapa de Assentos">Mapa de Assentos</option>
                    <option value="Financeiro & Borderô">Financeiro & Borderô</option>
                    <option value="Reconhecimento Facial">Reconhecimento Facial</option>
                    <option value="PDV & Impressão">PDV & Impressão</option>
                    <option value="Usuários & Permissões">Usuários & Permissões</option>
                    <option value="Marketing & Analytics">Marketing & Analytics</option>
                    <option value="Geral / Plataforma">Geral / Plataforma</option>
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 280 }}>
                  <label>Descrição Técnica do Ajuste Solicitado</label>
                  <input
                    className="input-dark"
                    placeholder="Ex: Borderô: exibir discriminação de taxas por bandeira..."
                    value={novaSolDesc}
                    onChange={e => setNovaSolDesc(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-emerald">Registrar Solicitação</button>
              </form>
            </div>
          )}

          <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input-dark"
              style={{ flex: 1, minWidth: 240 }}
              placeholder="Buscar ajuste (ex: Borderô, Master, Mapa, Facial, Cupom, Assento)..."
              value={buscaSolicitacao}
              onChange={e => setBuscaSolicitacao(e.target.value)}
            />
            <select
              className="select-dark"
              value={filtroModuloSol}
              onChange={e => setFiltroModuloSol(e.target.value)}
            >
              <option value="ALL">Todos os Módulos ({solicitacoes.length})</option>
              {modulosSolicitacao.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              className="select-dark"
              value={filtroDataSol}
              onChange={e => setFiltroDataSol(e.target.value)}
            >
              <option value="ALL">Todas as 22 Datas de Reunião</option>
              {datasSolicitacao.map(d => (
                <option key={d} value={d}>Reunião {d}</option>
              ))}
            </select>
            <select
              className="select-dark"
              value={filtroStatusSol}
              onChange={e => setFiltroStatusSol(e.target.value as any)}
            >
              <option value="ALL">Todos os Status ({solicitacoesFiltradas.length})</option>
              <option value="PENDENTES">Pendentes de Teste</option>
              <option value="CONCLUIDOS">Testados ☑️ (Plan1 + Plan3)</option>
              <option value="PLAN3">Aba Plan3 (79 Homologados)</option>
            </select>
          </div>

          <div className="panel-no-pad">
            <table className="fin-table">
              <thead>
                <tr>
                  <th style={{ width: "8%" }}>Nº</th>
                  <th style={{ width: "12%" }}>Data Reunião</th>
                  <th style={{ width: "47%" }}>Descrição da Solicitação / Ajuste de Sistema</th>
                  <th style={{ width: "17%" }}>Módulo</th>
                  <th style={{ width: "16%" }}>Homologação (ERP ⇄ Excel)</th>
                </tr>
              </thead>
              <tbody>
                {solicitacoesFiltradas.map(s => (
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
                          const res = await fetch(`/api/solicitacoes/${s.id}`, {
                            method: "PUT",
                            headers: apiHeaders(),
                            body: JSON.stringify({ concluido: !s.concluido })
                          });
                          const data = await res.json();
                          const syncedMsg = data.excelSync?.syncedFiles?.length
                            ? ` + gravado em ${data.excelSync.syncedFiles[0]}`
                            : "";
                          showNotification(
                            `Ajuste #${s.numero} marcado como ${!s.concluido ? "Testado ☑️" : "Pendente"}${syncedMsg}!`
                          );
                          fetchAll(dashOrigemFilter);
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
          MODULE 5: REGRAS DE NEGÓCIO & DÚVIDAS DA ABA 2H (docs/PERGUNTAS_ABERTAS.md)
         ===================================================================== */}
      {activeModule === "perguntas" && (
        <main className="page-container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h1 className="page-title">Regras de Sistema & Dúvidas da Aba 2H (Financeiro / Guilherme)</h1>
              <p className="page-subtitle" style={{ marginBottom: 0 }}>
                Definições pendentes na aba 2H da Planilha Financeiro que parametrizam o cálculo de taxas, borderô, split 80/20 e dupla entrada.
              </p>
            </div>
            <button
              className="btn-emerald"
              onClick={() => setActiveModule("financeiro")}
            >
              <Landmark size={14} /> Abrir Simulador Contábil & Taxas (Fase 2)
            </button>
          </div>

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
                Origem: {q.origem} • Parâmetro atual no sistema: <strong>{q.parametro_atual}</strong>
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
                      fetchAll(dashOrigemFilter);
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </main>
      )}

      {/* =====================================================================
          MODULE 6: CADASTROS BASE (TAREFA T5 — ABAS CAD_f E CAD_a)
         ===================================================================== */}
      {activeModule === "cadastros" && (
        <main className="page-container">
          <h1 className="page-title">Cadastros Base (Pessoas CAD_f & Áreas CAD_a)</h1>
          <p className="page-subtitle">
            Funcionários, responsáveis e departamentos importados das abas CAD_f e CAD_a das planilhas 5W2H.
          </p>

          <div className="panel-no-pad">
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e382d", fontWeight: 700 }}>
              Pessoas & Responsáveis (Aba CAD_f)
            </div>
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Área (CAD_a)</th>
                  <th>E-mail (Login)</th>
                  <th>Telefone</th>
                  <th>Perfil de Acesso</th>
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

          <div className="panel-no-pad">
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e382d", fontWeight: 700 }}>
              Áreas / Departamentos (Aba CAD_a)
            </div>
            <table className="fin-table">
              <thead>
                <tr>
                  <th style={{ width: "15%" }}>ID</th>
                  <th>Departamento / Área</th>
                </tr>
              </thead>
              <tbody>
                {cadastros.areas.map((ar: any) => (
                  <tr key={ar.id}>
                    <td style={{ color: "#94a3b8", fontWeight: 700 }}>#{ar.id}</td>
                    <td style={{ fontWeight: 700 }}>
                      <span className="tag tag-emerald">{ar.nome}</span>
                    </td>
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
          <h1 className="page-title">Trilha de Auditoria (Compliance)</h1>
          <p className="page-subtitle">
            Toda escrita relevante grava em &ldquo;auditoria&rdquo; quem, quando e o estado antes/depois.
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
