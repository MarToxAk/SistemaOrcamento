"use client";

import Script from "next/script";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type QuoteItem = {
  sequenciaitem?: number;
  produto?: { descricaoproduto?: string; descricaocurta?: string };
  quantidadeitem?: number;
  valoritem?: number;
  valordesconto?: number;
  orcamentovalorfinalitem?: number;
};

type QuoteDetail = {
  id?: string;
  statusKey?: string;
  availableNextStatuses?: Array<{ value: string; label: string }>;
  nfseNumero?: string | null;
  nfseLink?: string | null;
  nfseEmitidaEm?: string | null;
  paymentConfirmedAt?: string | null;
  orderNumber?: string | null;
  saleExternalId?: number | null;
  approved?: boolean;
  approvedAt?: string | null;
  latestPdfUrl?: string | null;
  body?: {
    idorcamento_interno?: number;
    idorcamento?: number;
    dataorcamento?: string;
    status?: string;
    vendedorNome?: string;
    cliente?: { nome?: string; telefone?: string; email?: string };
    observacoes?: string;
    validade?: string;
    prazoEntrega?: string;
    condicaoPagamento?: string;
    itens?: QuoteItem[];
    carimbos?: {
      itens?: Array<{ numero?: number; carimbo?: string; dimensoes?: string; descricao?: string }>;
    };
    totais?: { valor?: number; desconto?: number; valoracrescimo?: number };
    documentoPdf?: Array<{ publicUrl?: string; generatedAt?: string }>;
  };
};

function parseMaybeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseObjectMaybe(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed ? (parsed as Record<string, any>) : null;
  } catch { return null; }
}

function parseIncomingMessagePayload(data: unknown): Record<string, any> | null {
  if (!data) return null;
  if (typeof data === "object") return data as Record<string, any>;
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === "object" && parsed ? (parsed as Record<string, any>) : null;
  } catch { return null; }
}

function normalizeChatwootPayload(raw: Record<string, any>) {
  const dataObj = parseObjectMaybe(raw.data) ?? parseObjectMaybe(raw.payload) ?? raw;
  const nestedDataObj = parseObjectMaybe(dataObj?.data) ?? dataObj;
  const conversation =
    nestedDataObj?.conversation ?? dataObj?.conversation ??
    nestedDataObj?.meta?.conversation ?? raw?.conversation ?? {};
  return { conversation };
}

const STATUS_PILL: Record<string, { label: string; tone: string }> = {
  aprovado:            { label: "Aprovado",          tone: "success" },
  em_producao:         { label: "Em Produção",       tone: "info"    },
  pronto_para_entrega: { label: "Pronto p/ Entrega", tone: "amber"   },
  entregue:            { label: "Entregue",           tone: "neutral" },
  cancelado:           { label: "Cancelado",          tone: "danger"  },
  recusado:            { label: "Recusado",           tone: "danger"  },
  pendente:            { label: "Pendente",           tone: "warn"    },
  enviado:             { label: "Enviado",            tone: "info"    },
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function OrcamentoDetailPage() {
  const params = useParams<{ id: string }>();
  const quoteId = typeof params?.id === "string" ? params.id : "";

  const [validationState, setValidationState] = useState<"checking" | "valid" | "invalid">("checking");
  const [validationMessage, setValidationMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [externalPdfUrl, setExternalPdfUrl] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [sendingState, setSendingState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [sendMessage, setSendMessage] = useState("");
  const [statusSavingState, setStatusSavingState] = useState<"idle" | "saving">("idle");
  const [statusError, setStatusError] = useState("");
  const [nfseState, setNfseState] = useState<"idle" | "emitindo" | "sucesso" | "erro">("idle");
  const [nfseMsg, setNfseMsg] = useState("");
  const [nfseNumero, setNfseNumero] = useState<string | null>(null);
  const [nfseLink, setNfseLink] = useState<string | null>(null);
  const [nfseModal, setNfseModal] = useState(false);
  const [nfseServico, setNfseServico] = useState("24.01");
  const [nfseTomadorDoc, setNfseTomadorDoc] = useState("");
  const [nfseTomadorNome, setNfseTomadorNome] = useState("");
  const [nfseTomadorTipo, setNfseTomadorTipo] = useState<"cpf" | "cnpj">("cpf");
  const [nfseTomadorEnderecoLogradouro, setNfseTomadorEnderecoLogradouro] = useState("");
  const [nfseTomadorEnderecoNumero, setNfseTomadorEnderecoNumero] = useState("");
  const [nfseTomadorEnderecoBairro, setNfseTomadorEnderecoBairro] = useState("");
  const [nfseTomadorEnderecoCep, setNfseTomadorEnderecoCep] = useState("");
  const [nfseTomadorEnderecoCodigoMunicipio, setNfseTomadorEnderecoCodigoMunicipio] = useState("");
  const [nfseTomadorEnderecoUf, setNfseTomadorEnderecoUf] = useState("");
  const [nfseServicos, setNfseServicos] = useState<Array<{ codigo: string; descricao: string }>>([]);
  const [nfseTomadorAutoDoc, setNfseTomadorAutoDoc] = useState<string | null>(null);
  const [nfseDescontoAtivo, setNfseDescontoAtivo] = useState(false);
  const [nfseDescontoPercent, setNfseDescontoPercent] = useState("");
  const [nfseDescontoValor, setNfseDescontoValor] = useState("");
  const [nfseValorTotal, setNfseValorTotal] = useState("");
  const [nfseAthosQuery, setNfseAthosQuery] = useState("");
  const [nfseAthosResults, setNfseAthosResults] = useState<Array<{
    idcliente: number;
    tipoPessoa: "fisico" | "juridico";
    nome: string;
    documento: string | null;
    endereco: { logradouro: string; numero: string; bairro: string; cep: string; codigoMunicipio: string; uf: string } | null;
  }>>([]);
  const [nfseAthosSearching, setNfseAthosSearching] = useState(false);
  const [nfseClienteAthosSelecionado, setNfseClienteAthosSelecionado] = useState<number | null>(null);
  const [nfseAthosError, setNfseAthosError] = useState("");

  // ─── Chatwoot validation ──────────────────────────────────────────────────
  useEffect(() => {
    const isDevBypass =
      (typeof process !== "undefined" && process.env.NODE_ENV === "development") ||
      (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "0.0.0.0"));
    if (isDevBypass) { setValidationState("valid"); setValidationMessage(""); return; }

    let validated = false;
    const handleMessage = (event: MessageEvent) => {
      const payload = parseIncomingMessagePayload(event.data);
      if (!payload) return;
      const { conversation } = normalizeChatwootPayload(payload);
      const convId = parseMaybeNumber(conversation?.id);
      if (convId !== undefined && convId > 0) { validated = true; setValidationState("valid"); setValidationMessage(""); }
    };
    const requestChatwootInfo = () => {
      try { window.parent?.postMessage("chatwoot-dashboard-app:fetch-info", "*"); window.parent?.postMessage({ event: "chatwoot-dashboard-app:fetch-info" }, "*"); } catch { /* noop */ }
    };
    window.addEventListener("message", handleMessage);
    requestChatwootInfo();
    const retryId = window.setTimeout(() => requestChatwootInfo(), 1200);
    const validationTimeout = window.setTimeout(() => {
      const isInIframe = window.parent !== window;
      if (!isInIframe) { setValidationMessage("Esta página deve ser acessada através do Chatwoot"); setValidationState("invalid"); }
      else if (!validated) { setValidationMessage("Não foi possível validar o contexto da conversa no Chatwoot"); setValidationState("invalid"); }
    }, 3500);
    return () => { window.removeEventListener("message", handleMessage); window.clearTimeout(retryId); window.clearTimeout(validationTimeout); };
  }, []);

  // ─── External PDF URL from query string ──────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const externalUrl = params.get("pdfUrl") ?? params.get("nfseUrl") ?? params.get("documentUrl");
    if (externalUrl) setExternalPdfUrl(externalUrl);
  }, []);

  // ─── Fetch quote detail ───────────────────────────────────────────────────
  useEffect(() => {
    if (validationState !== "valid" || !quoteId) return;
    const fetchDetail = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as QuoteDetail & { error?: string; message?: string };
        if (!response.ok) throw new Error(data?.message || data?.error || "Erro ao carregar orçamento.");
        setQuote(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar orçamento.");
      } finally { setLoading(false); }
    };
    void fetchDetail();
  }, [validationState, quoteId]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  async function handleStatusChange(nextStatus: string) {
    setStatusSavingState("saving"); setStatusError("");
    try {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus: nextStatus, changedBy: "Detalhe do orcamento" }),
      });
      const data = (await response.json().catch(() => ({}))) as QuoteDetail & { message?: string; error?: string };
      if (!response.ok) throw new Error(data?.message || data?.error || "Falha ao atualizar status.");
      setQuote(data as QuoteDetail);
    } catch (err) { setStatusError(err instanceof Error ? err.message : "Erro ao atualizar status."); }
    finally { setStatusSavingState("idle"); }
  }

  async function handleAbrirModalNfse() {
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/nfse`);
      const data = await res.json().catch(() => ({})) as any;
      setNfseServicos(data.servicosDisponiveis ?? [{ codigo: "24.01", descricao: "Confecção de carimbos, banners, placas" }]);
      setNfseServico(data.servicoSugerido ?? "24.01");
      const doc = data.tomador?.cpf ?? data.tomador?.cnpj ?? null;
      setNfseTomadorAutoDoc(doc);
      setNfseTomadorDoc(doc ?? "");
      setNfseTomadorNome(data.tomador?.nome ?? "");
      setNfseTomadorTipo(data.tomador?.cnpj ? "cnpj" : "cpf");
      setNfseTomadorEnderecoLogradouro(data.tomador?.endereco?.logradouro ?? "");
      setNfseTomadorEnderecoNumero(data.tomador?.endereco?.numero ?? "");
      setNfseTomadorEnderecoBairro(data.tomador?.endereco?.bairro ?? "");
      setNfseTomadorEnderecoCep(data.tomador?.endereco?.cep ?? "");
      setNfseTomadorEnderecoCodigoMunicipio(data.tomador?.endereco?.codigoMunicipio ?? "");
      setNfseTomadorEnderecoUf(data.tomador?.endereco?.uf ?? "");
    } catch {
      setNfseServicos([{ codigo: "24.01", descricao: "Confecção de carimbos, banners, placas" }]);
      setNfseTomadorEnderecoLogradouro(""); setNfseTomadorEnderecoNumero(""); setNfseTomadorEnderecoBairro("");
      setNfseTomadorEnderecoCep(""); setNfseTomadorEnderecoCodigoMunicipio(""); setNfseTomadorEnderecoUf("");
    }
    setNfseAthosQuery(""); setNfseAthosResults([]); setNfseAthosSearching(false);
    setNfseClienteAthosSelecionado(null); setNfseAthosError("");
    setNfseModal(true);
  }

  async function searchAthosClientes() {
    const q = nfseAthosQuery.trim();
    if (!q) return;
    setNfseAthosSearching(true); setNfseAthosError(""); setNfseAthosResults([]);
    try {
      const isDoc = /^\d{3,}$/.test(q.replace(/\D/g, "")) && q.replace(/\D/g, "").length >= 8;
      const param = isDoc ? `documento=${encodeURIComponent(q.replace(/\D/g, ""))}` : `nome=${encodeURIComponent(q)}`;
      const res = await fetch(`/api/athos/clientes?${param}&take=10`);
      const data = await res.json().catch(() => ({ error: "Resposta inválida." })) as { items?: typeof nfseAthosResults; error?: string };
      if (!res.ok || data.error) setNfseAthosError(data.error ?? "Erro ao buscar clientes.");
      else { setNfseAthosResults(data.items ?? []); if ((data.items ?? []).length === 0) setNfseAthosError("Nenhum cliente encontrado."); }
    } catch { setNfseAthosError("Falha ao conectar ao backend."); }
    finally { setNfseAthosSearching(false); }
  }

  function selecionarClienteAthos(item: typeof nfseAthosResults[0]) {
    setNfseClienteAthosSelecionado(item.idcliente);
    setNfseTomadorTipo(item.tipoPessoa === "juridico" ? "cnpj" : "cpf");
    setNfseTomadorDoc(item.documento ?? "");
    setNfseTomadorNome(item.nome);
    setNfseTomadorEnderecoLogradouro(item.endereco?.logradouro ?? "");
    setNfseTomadorEnderecoNumero(item.endereco?.numero ?? "");
    setNfseTomadorEnderecoBairro(item.endereco?.bairro ?? "");
    setNfseTomadorEnderecoCep(item.endereco?.cep ?? "");
    setNfseTomadorEnderecoCodigoMunicipio(item.endereco?.codigoMunicipio ?? "");
    setNfseTomadorEnderecoUf(item.endereco?.uf ?? "");
    setNfseAthosResults([]); setNfseAthosQuery("");
  }

  function syncDesconto(field: "percent" | "valor" | "total", raw: string) {
    const base = Number(quote?.body?.totais?.valor ?? 0);
    const n = parseFloat(raw.replace(",", "."));
    const valid = !isNaN(n) && n >= 0 && base > 0;
    if (field === "percent") {
      setNfseDescontoPercent(raw);
      if (valid) { const vDesc = (base * n) / 100; setNfseDescontoValor(vDesc.toFixed(2)); setNfseValorTotal((base - vDesc).toFixed(2)); }
      else { setNfseDescontoValor(""); setNfseValorTotal(""); }
    } else if (field === "valor") {
      setNfseDescontoValor(raw);
      if (valid) { const pct = (n / base) * 100; setNfseDescontoPercent(pct.toFixed(2)); setNfseValorTotal((base - n).toFixed(2)); }
      else { setNfseDescontoPercent(""); setNfseValorTotal(""); }
    } else {
      const clamped = valid && n > base ? base : n;
      setNfseValorTotal((valid && n > base) ? base.toFixed(2) : raw);
      if (!isNaN(clamped) && clamped >= 0 && base > 0) { const vDesc = base - clamped; setNfseDescontoValor(vDesc.toFixed(2)); setNfseDescontoPercent(vDesc >= 0 ? ((vDesc / base) * 100).toFixed(2) : "0"); }
      else { setNfseDescontoValor("0"); setNfseDescontoPercent("0"); }
    }
  }

  async function handleEmitirNfse() {
    setNfseModal(false); setNfseState("emitindo"); setNfseMsg("");
    try {
      const body: Record<string, string | number | boolean> = { servicoCodigo: nfseServico };
      const docLimpo = nfseTomadorDoc.replace(/\D/g, "");
      if (docLimpo) { if (nfseTomadorTipo === "cnpj") body.tomadorCnpj = docLimpo; else body.tomadorCpf = docLimpo; }
      if (nfseTomadorNome.trim()) body.tomadorNome = nfseTomadorNome.trim();
      if (nfseTomadorEnderecoLogradouro.trim()) body.tomadorEnderecoLogradouro = nfseTomadorEnderecoLogradouro.trim();
      if (nfseTomadorEnderecoNumero.trim()) body.tomadorEnderecoNumero = nfseTomadorEnderecoNumero.trim();
      if (nfseTomadorEnderecoBairro.trim()) body.tomadorEnderecoBairro = nfseTomadorEnderecoBairro.trim();
      if (nfseTomadorEnderecoCep.trim()) body.tomadorEnderecoCep = nfseTomadorEnderecoCep.trim();
      if (nfseTomadorEnderecoCodigoMunicipio.trim()) body.tomadorEnderecoCodigoMunicipio = nfseTomadorEnderecoCodigoMunicipio.trim();
      if (nfseTomadorEnderecoUf.trim()) body.tomadorEnderecoUf = nfseTomadorEnderecoUf.trim().toUpperCase();
      if (nfseDescontoAtivo && nfseDescontoValor) { body.descontoAtivo = true; body.descontoPorcentagem = Number(nfseDescontoPercent); body.descontoValor = Number(nfseDescontoValor); }
      if (nfseClienteAthosSelecionado != null) body.clienteAthosId = nfseClienteAthosSelecionado;
      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/nfse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({})) as { numero?: string; link?: string; jaEmitida?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data?.message || data?.error || "Falha ao emitir NFS-e.");
      const numero = data.numero ?? null;
      setNfseNumero(numero); setNfseLink(data.link ?? null); setNfseState("sucesso");
      setNfseMsg(data.jaEmitida ? `NFS-e já emitida: número ${numero}` : `NFS-e emitida com sucesso! Número: ${numero}`);
    } catch (err) { setNfseState("erro"); setNfseMsg(err instanceof Error ? err.message : "Erro ao emitir NFS-e."); }
  }

  async function handleEnviar() {
    setSendingState("sending"); setSendMessage("");
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/enviar`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data?.message || data?.error || "Falha ao enviar.");
      setSendingState("success"); setSendMessage("Mensagem enviada ao cliente com sucesso.");
      const updated = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}`, { cache: "no-store" });
      if (updated.ok) setQuote(await updated.json() as QuoteDetail);
    } catch (err) { setSendingState("error"); setSendMessage(err instanceof Error ? err.message : "Erro ao enviar."); }
    finally { window.setTimeout(() => setSendingState("idle"), 3000); }
  }

  // ─── Derived ─────────────────────────────────────────────────────────────
  const isDevEnv = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "0.0.0.0");
  const canEnviar = isDevEnv || Boolean(quote?.availableNextStatuses?.some((s) => s.value === "ENVIADO"));
  const body = quote?.body;
  const itens = body?.itens ?? [];
  const carimbos = body?.carimbos?.itens ?? [];
  const documentoPdf = Array.isArray(body?.documentoPdf) && body?.documentoPdf.length > 0 ? body.documentoPdf[0] : null;
  const pdfViewerUrl = externalPdfUrl ?? documentoPdf?.publicUrl ?? null;
  const quoteNumber = body?.idorcamento ?? body?.idorcamento_interno;

  const statusKey = (quote?.statusKey ?? "").toLowerCase();
  const pillDef = STATUS_PILL[statusKey] ?? { label: quote?.body?.status ?? quote?.statusKey ?? "—", tone: "neutral" };

  function getListHref() {
    if (typeof window === "undefined") return "/orcamento";
    const query = window.location.search.replace(/^\?/, "");
    return query ? `/orcamento?${query}` : "/orcamento";
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Bootstrap JS (for NFS-e modal forms) + Bootstrap Icons */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />

      {/* ── Checking ── */}
      {validationState === "checking" && (
        <div className="container my-5">
          <div className="row justify-content-center">
            <div className="col-md-6 text-center">
              <div className="spinner-border text-primary mb-3" role="status"><span className="visually-hidden">Carregando...</span></div>
              <h5 className="text-muted">Autenticando com Chatwoot...</h5>
              <p className="text-secondary small">Por favor, aguarde...</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Invalid ── */}
      {validationState === "invalid" && (
        <div className="container my-5">
          <div className="row justify-content-center">
            <div className="col-md-6">
              <div className="alert alert-danger d-flex gap-2 align-items-start" role="alert">
                <i className="bi bi-exclamation-triangle-fill mt-1" style={{ fontSize: "1.25rem" }} />
                <div>
                  <h5 className="alert-heading mb-2">Acesso Restrito</h5>
                  <p className="mb-0">Esta página só pode ser acessada através do <strong>Chatwoot Dashboard</strong>.</p>
                  <hr className="my-2" />
                  <p className="mb-0 small text-muted">{validationMessage || "Abra esta página pelo Chatwoot."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Valid — bc2 Layout v2 Detail ── */}
      {validationState === "valid" && (
        <div className="bc2-app theme-painel density-compact">

          {/* Sidebar */}
          <aside className="bc2-sidebar">
            <div className="bc2-sidebar__brand">
              <img src="/media/logo-primary.png" alt="Bom Custo" />
              <div className="bc2-sidebar__brand-text">
                <div className="bc2-sidebar__brand-name">Bom Custo</div>
                <div className="bc2-sidebar__brand-sub">Papelaria &amp; Gráfica</div>
              </div>
            </div>
            <nav className="bc2-sidebar__nav">
              <a href={getListHref()} className="bc2-navitem">
                <i className="bi bi-list-ul" />
                <span className="bc2-navitem__label">Orçamentos</span>
              </a>
              <button type="button" className="bc2-navitem is-active">
                <i className="bi bi-eye" />
                <span className="bc2-navitem__label">Detalhe</span>
                {quoteNumber && <span className="bc2-navitem__badge">#{quoteNumber}</span>}
              </button>
              <a href="/status" className="bc2-navitem">
                <i className="bi bi-kanban" />
                <span className="bc2-navitem__label">Produção</span>
              </a>
            </nav>
            <div className="bc2-sidebar__foot">
              <a href={getListHref()} className="bc2-navitem">
                <i className="bi bi-arrow-left" />
                <span className="bc2-navitem__label">Voltar à Lista</span>
              </a>
            </div>
          </aside>

          {/* Main */}
          <main className="bc2-main">

            {/* TopBar */}
            <header className="bc2-topbar">
              <div className="bc2-topbar__left">
                <h1 className="bc2-topbar__title">
                  Orçamento{" "}
                  <span className="bc2-num bc2-num--big">#{quoteNumber ?? quoteId}</span>
                </h1>
                {body && (
                  <p className="bc2-topbar__sub">
                    {body.cliente?.nome && <><strong>{body.cliente.nome}</strong> · </>}
                    {body.dataorcamento ? new Date(body.dataorcamento).toLocaleDateString("pt-BR") : ""}
                    {body.vendedorNome ? ` · ${body.vendedorNome}` : ""}
                  </p>
                )}
              </div>
              <div className="bc2-topbar__right">
                <a href={getListHref()} className="bc2-btn bc2-btn--ghost bc2-btn--sm">
                  <i className="bi bi-arrow-left" /> Lista
                </a>
                {quote && (
                  <span className={`bc2-pill bc2-pill--${pillDef.tone}`}>
                    <span className="bc2-pill__dot" />{pillDef.label}
                  </span>
                )}
              </div>
            </header>

            {/* Loading / Error */}
            {loading && (
              <div className="bc2-empty">
                <span className="bc2-spin" style={{ width: 20, height: 20, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block", marginBottom: 8 }} />
                <div>Carregando orçamento...</div>
              </div>
            )}
            {error && (
              <div className="bc2-banner bc2-banner--danger"><i className="bi bi-exclamation-triangle-fill" /> {error}</div>
            )}

            {/* Detail layout */}
            {!loading && !error && body && (
              <div className="bc2-detail">

                {/* ── Main column ── */}
                <div className="bc2-detail__main">

                  {/* Integration chips */}
                  {(quote?.latestPdfUrl || quote?.nfseNumero || quote?.paymentConfirmedAt || quote?.saleExternalId || quote?.orderNumber || quote?.approved) && (
                    <div className="bc2-detail__chips">
                      {quote?.latestPdfUrl && (
                        <span className="bc2-pill bc2-pill--neutral is-compact"><i className="bi bi-file-pdf me-1" />PDF Gerado</span>
                      )}
                      {quote?.nfseNumero && (
                        <a href={quote.nfseLink ?? "#"} target="_blank" rel="noreferrer" className="bc2-pill bc2-pill--success is-compact" style={{ textDecoration: "none" }}>
                          <i className="bi bi-file-check me-1" />NFS-e #{quote.nfseNumero}
                        </a>
                      )}
                      {(quote?.orderNumber || quote?.saleExternalId) && (
                        <span className="bc2-pill bc2-pill--success is-compact">
                          <i className="bi bi-cash-coin me-1" />Pago no Caixa · Pedido #{quote.orderNumber ?? String(quote.saleExternalId)}
                        </span>
                      )}
                      {!quote?.orderNumber && !quote?.saleExternalId && quote?.paymentConfirmedAt && (
                        <span className="bc2-pill bc2-pill--info is-compact"><i className="bi bi-check-circle me-1" />PIX Confirmado</span>
                      )}
                      {quote?.approved && (
                        <span className="bc2-pill bc2-pill--success is-compact">
                          <i className="bi bi-person-check me-1" />Aprovado pelo Cliente
                        </span>
                      )}
                    </div>
                  )}

                  {/* Feedback messages */}
                  {sendMessage && (
                    <div className={`bc2-banner bc2-banner--${sendingState === "success" ? "success" : "danger"}`}>
                      <i className={`bi bi-${sendingState === "success" ? "check-circle-fill" : "exclamation-triangle-fill"}`} /> {sendMessage}
                    </div>
                  )}
                  {nfseMsg && (
                    <div className={`bc2-banner bc2-banner--${nfseState === "sucesso" ? "success" : "danger"}`}>
                      <i className={`bi bi-${nfseState === "sucesso" ? "check-circle" : "exclamation-triangle"}`} /> {nfseMsg}
                    </div>
                  )}

                  {/* Itens table */}
                  <section className="bc2-card">
                    <header className="bc2-card__head">
                      <h3 className="bc2-card__title">Itens da Proposta</h3>
                      <div className="bc2-card__head-right">
                        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{itens.length} item(ns)</span>
                      </div>
                    </header>
                    {itens.length === 0 ? (
                      <div className="bc2-empty" style={{ padding: "24px 0" }}>Sem itens registrados.</div>
                    ) : (
                      <div className="bc2-tablewrap">
                        <table className="bc2-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Descrição</th>
                              <th className="num">Qtd</th>
                              <th className="num">Valor Unit.</th>
                              <th className="num">Desconto</th>
                              <th className="num">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {itens.map((item, idx) => (
                              <tr key={`${item.sequenciaitem ?? idx}-${idx}`}>
                                <td><span className="bc2-num bc2-cell-soft">{item.sequenciaitem ?? idx + 1}</span></td>
                                <td><span className="bc2-cell-strong">{item.produto?.descricaocurta || item.produto?.descricaoproduto || "—"}</span></td>
                                <td className="num">{Number(item.quantidadeitem ?? 0)}</td>
                                <td className="num">{fmtBRL(Number(item.valoritem ?? 0))}</td>
                                <td className="num bc2-cell-soft">{fmtBRL(Number(item.valordesconto ?? 0))}</td>
                                <td className="num bc2-cell-strong">{fmtBRL(Number(item.orcamentovalorfinalitem ?? 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={4} className="bc2-tfoot-label">Total da proposta</td>
                              <td className="num bc2-cell-soft" style={{ paddingTop: 14, fontSize: 11 }}>
                                {Number(body.totais?.desconto ?? 0) > 0 ? `− ${fmtBRL(Number(body.totais?.desconto))}` : ""}
                              </td>
                              <td className="num bc2-tfoot-value">{fmtBRL(Number(body.totais?.valor ?? 0))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* Carimbos */}
                  {carimbos.length > 0 && (
                    <section className="bc2-card">
                      <header className="bc2-card__head">
                        <h3 className="bc2-card__title"><i className="bi bi-stamp me-1" />Carimbos</h3>
                        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{carimbos.length} carimbo(s)</span>
                      </header>
                      <ul style={{ margin: 0, padding: "10px 18px", display: "flex", flexDirection: "column", gap: 6, listStyle: "none" }}>
                        {carimbos.map((carimbo, idx) => (
                          <li key={`${carimbo.numero ?? idx}-${idx}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", fontSize: 13 }}>
                            <span style={{ font: "700 10px/1 var(--font-mono)", background: "var(--accent)", color: "#fff", padding: "3px 7px", borderRadius: 5, flexShrink: 0, marginTop: 1 }}>
                              #{carimbo.numero ?? idx + 1}
                            </span>
                            <div style={{ color: "var(--ink)" }}>
                              <strong>{carimbo.carimbo ?? "—"}</strong>
                              {carimbo.dimensoes && <span style={{ color: "var(--ink-soft)" }}> · {carimbo.dimensoes}</span>}
                              {carimbo.descricao && <div style={{ color: "var(--ink-soft)", marginTop: 2, fontSize: 12 }}>{carimbo.descricao}</div>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Observações */}
                  {body.observacoes && (
                    <section className="bc2-card">
                      <header className="bc2-card__head">
                        <h3 className="bc2-card__title">Observações</h3>
                      </header>
                      <div style={{ padding: "12px 18px", font: "500 13px/1.6 var(--font-body)", color: "var(--ink-soft)" }}>
                        {body.observacoes}
                      </div>
                    </section>
                  )}

                  {/* No PDF warning */}
                  {!pdfViewerUrl && (
                    <div className="bc2-banner bc2-banner--warn" style={{ marginTop: 4 }}>
                      <i className="bi bi-file-earmark" />
                      Nenhum PDF disponível para visualização. Use o botão "Gerar PDF" no painel de ações.
                    </div>
                  )}
                </div>

                {/* ── Aside ── */}
                <aside className="bc2-detail__aside">

                  {/* Cliente / Condições KV */}
                  <section className="bc2-card bc2-card--sticky">
                    <header className="bc2-card__head">
                      <h3 className="bc2-card__title">Cliente &amp; Condições</h3>
                    </header>
                    <dl className="bc2-kv">
                      <div><dt>Nome</dt><dd>{body.cliente?.nome ?? "—"}</dd></div>
                      {body.cliente?.telefone && <div><dt>Telefone</dt><dd>{body.cliente.telefone}</dd></div>}
                      {body.cliente?.email && <div><dt>E-mail</dt><dd style={{ wordBreak: "break-all" }}>{body.cliente.email}</dd></div>}
                      <div><dt>Vendedor</dt><dd>{body.vendedorNome ?? "—"}</dd></div>
                      {body.validade && <div><dt>Validade</dt><dd>{body.validade}</dd></div>}
                      {body.prazoEntrega && <div><dt>Prazo entrega</dt><dd>{body.prazoEntrega}</dd></div>}
                      {body.condicaoPagamento && <div><dt>Pagamento</dt><dd>{body.condicaoPagamento}</dd></div>}
                      <div><dt>Total</dt><dd style={{ fontWeight: 700, color: "var(--accent)" }}>{fmtBRL(Number(body.totais?.valor ?? 0))}</dd></div>
                      {Number(body.totais?.desconto ?? 0) > 0 && <div><dt>Desconto</dt><dd>{fmtBRL(Number(body.totais?.desconto ?? 0))}</dd></div>}
                      {Number(body.totais?.valoracrescimo ?? 0) > 0 && <div><dt>Acréscimo</dt><dd>{fmtBRL(Number(body.totais?.valoracrescimo ?? 0))}</dd></div>}
                    </dl>
                  </section>

                  {/* Ações */}
                  <section className="bc2-card">
                    <header className="bc2-card__head">
                      <h3 className="bc2-card__title">Ações</h3>
                    </header>
                    <div className="bc2-actions">

                      {/* Status change */}
                      {quote?.availableNextStatuses && quote.availableNextStatuses.length > 0 && (
                        <div style={{ marginBottom: 2 }}>
                          <select
                            className="bc2-select"
                            style={{ width: "100%", padding: "8px 11px" }}
                            value=""
                            disabled={statusSavingState === "saving"}
                            onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) void handleStatusChange(v); }}
                          >
                            <option value="">{statusSavingState === "saving" ? "Salvando…" : "Alterar status…"}</option>
                            {quote.availableNextStatuses.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                          {statusError && <div style={{ font: "600 11px/1 var(--font-body)", color: "var(--danger)", marginTop: 4 }}>{statusError}</div>}
                        </div>
                      )}

                      {/* Enviar ao Cliente */}
                      {canEnviar && (
                        <button type="button" className="bc2-btn bc2-btn--primary" style={{ justifyContent: "flex-start" }} onClick={() => void handleEnviar()} disabled={sendingState === "sending"}>
                          {sendingState === "sending"
                            ? <><span className="bc2-spin" style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} /> Enviando…</>
                            : <><i className="bi bi-send" /> Enviar ao Cliente</>}
                        </button>
                      )}

                      {/* NFS-e */}
                      {quote?.statusKey && quote.statusKey !== "CANCELADO" && !nfseNumero ? (
                        <button type="button" className="bc2-btn" style={{ justifyContent: "flex-start", borderColor: "var(--warn)", color: "var(--warn)" }} onClick={() => void handleAbrirModalNfse()} disabled={nfseState === "emitindo"}>
                          {nfseState === "emitindo"
                            ? <><span className="bc2-spin" style={{ width: 13, height: 13, border: "2px solid rgba(0,0,0,.15)", borderTopColor: "var(--warn)", borderRadius: "50%", display: "inline-block" }} /> Emitindo NFS-e…</>
                            : <><i className="bi bi-receipt" /> Emitir Nota Fiscal</>}
                        </button>
                      ) : nfseNumero ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span className="bc2-pill bc2-pill--success" style={{ alignSelf: "flex-start" }}>
                            <i className="bi bi-check-circle me-1" />NFS-e #{nfseNumero}
                          </span>
                          {nfseLink && (
                            <a className="bc2-btn bc2-btn--ghost bc2-btn--sm" href={nfseLink} target="_blank" rel="noreferrer" style={{ justifyContent: "flex-start" }}>
                              <i className="bi bi-box-arrow-up-right" /> Abrir NFS-e
                            </a>
                          )}
                        </div>
                      ) : null}

                      {/* PDF */}
                      {pdfViewerUrl && (
                        <button type="button" className="bc2-btn bc2-btn--ghost" style={{ justifyContent: "flex-start" }} onClick={() => setPdfModalOpen(true)}>
                          <i className="bi bi-file-earmark-pdf" /> Visualizar PDF
                        </button>
                      )}
                      {documentoPdf?.publicUrl && (
                        <a className="bc2-btn bc2-btn--ghost" href={documentoPdf.publicUrl} target="_blank" rel="noreferrer" style={{ justifyContent: "flex-start" }}>
                          <i className="bi bi-box-arrow-up-right" /> Abrir PDF
                        </a>
                      )}

                      {/* Voltar */}
                      <a href={getListHref()} className="bc2-btn bc2-btn--ghost" style={{ justifyContent: "flex-start", color: "var(--ink-faint)" }}>
                        <i className="bi bi-arrow-left" /> Voltar para lista
                      </a>
                    </div>
                  </section>

                  {/* Aprovação */}
                  {(quote?.approved || quote?.approvedAt) && (
                    <section className="bc2-card">
                      <header className="bc2-card__head">
                        <h3 className="bc2-card__title">Aprovação</h3>
                      </header>
                      <div className="bc2-approval">
                        <div className="bc2-approval__row">
                          <i className="bi bi-check-circle-fill" style={{ color: "var(--success)", fontSize: 22 }} />
                          <div>
                            <strong style={{ font: "700 13px/1.2 var(--font-body)", color: "var(--ink)" }}>Cliente aprovou</strong>
                            {quote.approvedAt && (
                              <div style={{ font: "500 11px/1.3 var(--font-body)", color: "var(--ink-soft)", marginTop: 2 }}>
                                em {new Date(quote.approvedAt).toLocaleString("pt-BR")}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                </aside>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── PDF Modal ── */}
      {pdfModalOpen && pdfViewerUrl ? (
        <div className="pdf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Visualizador de PDF">
          <div className="pdf-modal-card">
            <div className="pdf-modal-header">
              <h5 className="mb-0">Visualização de PDF</h5>
              <button type="button" className="btn-close" aria-label="Fechar" onClick={() => setPdfModalOpen(false)} />
            </div>
            <div className="pdf-modal-actions">
              <a className="btn btn-sm btn-outline-dark" href={pdfViewerUrl} target="_blank" rel="noreferrer">Nova Aba</a>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPdfModalOpen(false)}>Fechar</button>
            </div>
            <div className="pdf-modal-body">
              <iframe id="iframe_show_document_modal" style={{ border: "none", width: "100%", height: "100%", position: "relative", zIndex: 4 }} allowFullScreen src={pdfViewerUrl} />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Modal NFS-e (Bootstrap) ── */}
      {nfseModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1060 }}>
          <div style={{ background: "#fff", borderRadius: 8, width: "100%", maxWidth: 480, padding: "1.5rem", boxShadow: "0 4px 24px #0003", maxHeight: "90vh", overflowY: "auto" }}>
            <h5 className="mb-3"><i className="bi bi-file-earmark-text me-2" />Emitir Nota Fiscal (NFS-e)</h5>

            <div className="mb-3">
              <label className="form-label fw-semibold">Buscar cliente Athos</label>
              {nfseClienteAthosSelecionado ? (
                <div className="alert alert-success py-2 d-flex justify-content-between align-items-center">
                  <span>
                    <i className="bi bi-person-check me-2" /><strong>{nfseTomadorNome}</strong>
                    {nfseTomadorDoc ? ` — ${nfseTomadorDoc}` : ""}
                    <small className="text-muted ms-2">(id {nfseClienteAthosSelecionado})</small>
                  </span>
                  <button type="button" className="btn-close btn-sm" aria-label="Remover seleção" onClick={() => { setNfseClienteAthosSelecionado(null); setNfseTomadorDoc(""); setNfseTomadorNome(""); setNfseAthosResults([]); setNfseAthosQuery(""); setNfseAthosError(""); }} />
                </div>
              ) : (
                <>
                  <div className="input-group mb-1">
                    <input className="form-control" placeholder="Nome ou CPF/CNPJ" value={nfseAthosQuery} onChange={e => setNfseAthosQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void searchAthosClientes(); } }} />
                    <button type="button" className="btn btn-outline-secondary" onClick={() => void searchAthosClientes()} disabled={nfseAthosSearching || !nfseAthosQuery.trim()}>
                      {nfseAthosSearching ? <span className="spinner-border spinner-border-sm" role="status" /> : <i className="bi bi-search" />}
                    </button>
                  </div>
                  {nfseAthosError && <div className="text-danger small">{nfseAthosError}</div>}
                  {nfseAthosResults.length > 0 && (
                    <ul className="list-group list-group-flush border rounded" style={{ maxHeight: 180, overflowY: "auto" }}>
                      {nfseAthosResults.map(item => (
                        <li key={item.idcliente} className="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center">
                          <span>
                            <span className={`badge me-2 ${item.tipoPessoa === "juridico" ? "bg-info text-dark" : "bg-secondary"}`}>{item.tipoPessoa === "juridico" ? "PJ" : "PF"}</span>
                            <strong>{item.nome}</strong>
                            {item.documento ? <small className="text-muted ms-2">{item.documento}</small> : null}
                          </span>
                          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => selecionarClienteAthos(item)}>Selecionar</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Serviço</label>
              <select className="form-select" value={nfseServico} onChange={e => setNfseServico(e.target.value)}>
                {nfseServicos.map(s => <option key={s.codigo} value={s.codigo}>{s.codigo} — {s.descricao}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Documento do tomador</label>
              <div className="d-flex gap-2 mb-2">
                <div className="form-check">
                  <input className="form-check-input" type="radio" id="tipoCpf" checked={nfseTomadorTipo === "cpf"} onChange={() => setNfseTomadorTipo("cpf")} />
                  <label className="form-check-label" htmlFor="tipoCpf">CPF</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="radio" id="tipoCnpj" checked={nfseTomadorTipo === "cnpj"} onChange={() => setNfseTomadorTipo("cnpj")} />
                  <label className="form-check-label" htmlFor="tipoCnpj">CNPJ</label>
                </div>
              </div>
              <input className="form-control" placeholder={nfseTomadorTipo === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"} value={nfseTomadorDoc} onChange={e => setNfseTomadorDoc(e.target.value)} />
              {nfseTomadorAutoDoc && <small className="text-success"><i className="bi bi-check-circle me-1" />Encontrado automaticamente</small>}
            </div>

            <div className="mb-4">
              <label className="form-label fw-semibold">Nome do tomador</label>
              <input className="form-control" placeholder="Nome completo ou razão social" value={nfseTomadorNome} onChange={e => setNfseTomadorNome(e.target.value)} />
            </div>

            <div className="mb-2">
              <label className="form-label fw-semibold">Endereço do tomador</label>
              <input className="form-control mb-2" placeholder="Logradouro" value={nfseTomadorEnderecoLogradouro} onChange={e => setNfseTomadorEnderecoLogradouro(e.target.value)} />
              <input className="form-control" placeholder="Número" value={nfseTomadorEnderecoNumero} onChange={e => setNfseTomadorEnderecoNumero(e.target.value)} />
            </div>
            <div className="mb-2">
              <input className="form-control" placeholder="Bairro" value={nfseTomadorEnderecoBairro} onChange={e => setNfseTomadorEnderecoBairro(e.target.value)} />
            </div>
            <div className="row g-2 mb-3">
              <div className="col-5"><input className="form-control" placeholder="CEP" value={nfseTomadorEnderecoCep} onChange={e => setNfseTomadorEnderecoCep(e.target.value)} /></div>
              <div className="col-5"><input className="form-control" placeholder="Município (IBGE)" value={nfseTomadorEnderecoCodigoMunicipio} onChange={e => setNfseTomadorEnderecoCodigoMunicipio(e.target.value)} /></div>
              <div className="col-2"><input className="form-control text-uppercase" placeholder="UF" maxLength={2} value={nfseTomadorEnderecoUf} onChange={e => setNfseTomadorEnderecoUf(e.target.value.toUpperCase())} /></div>
            </div>

            <div className="alert alert-light small mb-4">
              Use a busca acima para selecionar um cliente Athos. Se preferir, preencha documento e endereço manualmente.
            </div>

            <div className="mb-3">
              <div className="form-check form-switch mb-2">
                <input className="form-check-input" type="checkbox" id="nfseDescontoSwitch" checked={nfseDescontoAtivo}
                  onChange={e => { setNfseDescontoAtivo(e.target.checked); if (e.target.checked) { setNfseDescontoPercent("0"); setNfseDescontoValor("0"); setNfseValorTotal((quote?.body?.totais?.valor ?? 0).toFixed(2)); } else { setNfseDescontoPercent(""); setNfseDescontoValor(""); setNfseValorTotal(""); } }} />
                <label className="form-check-label fw-semibold" htmlFor="nfseDescontoSwitch">Aplicar desconto</label>
              </div>
              {nfseDescontoAtivo && (
                <div className="border rounded p-3 bg-light">
                  <div className="row g-2">
                    <div className="col-4">
                      <label className="form-label small mb-1">% desconto</label>
                      <div className="input-group input-group-sm">
                        <input className="form-control" type="number" min="0" max="100" step="0.01" placeholder="0.00" value={nfseDescontoPercent} onChange={e => syncDesconto("percent", e.target.value)} />
                        <span className="input-group-text">%</span>
                      </div>
                    </div>
                    <div className="col-4">
                      <label className="form-label small mb-1">R$ desconto</label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text">R$</span>
                        <input className="form-control" type="number" min="0" step="0.01" placeholder="0.00" value={nfseDescontoValor} onChange={e => syncDesconto("valor", e.target.value)} />
                      </div>
                    </div>
                    <div className="col-4">
                      <label className="form-label small mb-1">Valor total</label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text">R$</span>
                        <input className="form-control" type="number" min="0" max={(quote?.body?.totais?.valor ?? 0).toFixed(2)} step="0.01" placeholder={(quote?.body?.totais?.valor ?? 0).toFixed(2)} value={nfseValorTotal} onChange={e => syncDesconto("total", e.target.value)} />
                      </div>
                    </div>
                  </div>
                  {quote?.body?.totais?.valor != null && (
                    <small className="text-muted mt-1 d-block">Valor base: {Number(quote.body?.totais?.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small>
                  )}
                </div>
              )}
            </div>

            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-secondary" onClick={() => setNfseModal(false)}>Cancelar</button>
              <button className="btn btn-warning" onClick={() => void handleEmitirNfse()}>
                <i className="bi bi-file-earmark-check me-2" />Emitir NFS-e
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        /* ── bc2 Layout v2 / Painel theme ── */
        * { box-sizing: border-box; }

        :root {
          --font-body:    var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-display: var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-mono:    'JetBrains Mono', ui-monospace, monospace;
          --bg: #faf6ec; --surface: #ffffff; --surface-2: #fbf6ea; --surface-3: #f5edd9;
          --ink: #2a1f17; --ink-soft: #6b5c4d; --ink-faint: #a59785;
          --line: #e8dfcc; --line-soft: #f0e8d4;
          --accent: #0e6d73; --accent-fg: #ffffff; --accent-soft: #d6ebed;
          --success: #128a3a; --success-bg: #defce9;
          --warn: #a36500; --warn-bg: #fbecd0;
          --info: #0e6d73; --info-bg: #d8eef0;
          --danger: #c2362c; --danger-bg: #fbe3df;
          --amber: #9a5a1a; --amber-bg: #f8e7cf;
          --neutral: #475569; --neutral-bg: #e2e8f0;
          --radius: 10px; --radius-sm: 6px;
          --shadow-card: 0 1px 0 rgba(11,18,32,.02), 0 1px 3px rgba(11,18,32,.06);
          --row-pad-y: 7px; --row-pad-x: 12px; --card-pad: 14px;
          --gap-1: 4px; --gap-2: 8px; --gap-3: 12px; --gap-4: 16px;
        }
        .theme-painel {
          --font-body: var(--font-mulish,'Mulish',system-ui,sans-serif);
          --font-display: var(--font-mulish,'Mulish',system-ui,sans-serif);
          --bg: #f5f7fa; --surface: #fff; --surface-2: #f8fafc; --surface-3: #eef2f7;
          --ink: #0b1220; --ink-soft: #5b6b80; --ink-faint: #9aa7b8;
          --line: #e4e9f0; --line-soft: #eef2f6;
          --accent: #0e6d73; --accent-soft: #d6ebed; --radius: 10px;
          --shadow-card: 0 1px 0 rgba(11,18,32,.02),0 1px 3px rgba(11,18,32,.06);
        }
        .density-compact { --row-pad-y:7px;--row-pad-x:12px;--card-pad:14px;--gap-1:4px;--gap-2:8px;--gap-3:12px;--gap-4:16px; }

        .bc2-app { display:grid;grid-template-columns:240px 1fr;min-height:100vh;background:var(--bg);font-family:var(--font-body);font-size:14px;color:var(--ink);-webkit-font-smoothing:antialiased; }
        .bc2-app button { font-family:inherit; }
        .bc2-app a { color:var(--accent);text-decoration:none; }
        .bc2-app a:hover { text-decoration:underline;text-underline-offset:3px; }

        .bc2-sidebar { position:sticky;top:0;height:100vh;background:#fff;border-right:1px solid #eaeef4;display:flex;flex-direction:column;padding:16px 12px; }
        .bc2-sidebar__brand { display:flex;align-items:center;gap:10px;padding:4px 6px 14px;border-bottom:1px solid #eef2f6;margin-bottom:8px; }
        .bc2-sidebar__brand img { width:40px;height:40px;object-fit:contain;background:#f8fafc;border-radius:10px;padding:4px; }
        .bc2-sidebar__brand-name { font:700 14.5px/1.1 var(--font-body);color:var(--ink);letter-spacing:-.012em; }
        .bc2-sidebar__brand-sub  { font:500 10.5px/1.2 var(--font-body);color:var(--ink-faint);margin-top:2px;text-transform:uppercase;letter-spacing:.02em; }
        .bc2-sidebar__nav { display:flex;flex-direction:column;gap:2px;margin-top:4px;flex:1; }
        .bc2-sidebar__foot { border-top:1px solid #eef2f6;padding-top:10px;display:flex;flex-direction:column;gap:6px; }
        .bc2-navitem { display:flex;align-items:center;gap:11px;border:none;background:transparent;color:var(--ink-soft);padding:7px 10px;border-radius:calc(var(--radius) - 2px);font:600 12.5px/1 var(--font-body);cursor:pointer;text-align:left;text-decoration:none; }
        .bc2-navitem i { font-size:15px;width:20px;text-align:center; }
        .bc2-navitem__label { flex:1; }
        .bc2-navitem__badge { background:var(--surface-3);color:var(--ink);font:700 10.5px/1 var(--font-body);padding:3px 7px;border-radius:999px; }
        .bc2-navitem:hover { background:var(--surface-2);color:var(--ink);text-decoration:none; }
        .bc2-navitem.is-active { background:var(--ink);color:#fff; }
        .bc2-navitem.is-active .bc2-navitem__badge { background:rgba(255,255,255,.16);color:#fff; }

        .bc2-main { display:flex;flex-direction:column;padding:20px 24px 40px;min-width:0; }
        .bc2-topbar { display:flex;align-items:flex-start;justify-content:space-between;gap:var(--gap-3);margin-bottom:22px;flex-wrap:wrap;row-gap:12px; }
        .bc2-topbar__left { min-width:0;flex:1 1 280px; }
        .bc2-topbar__title { margin:0;font:800 28px/1.1 var(--font-display);color:var(--ink);letter-spacing:-.028em; }
        .bc2-topbar__sub { margin:6px 0 0;font:500 13.5px/1.45 var(--font-body);color:var(--ink-soft); }
        .bc2-topbar__right { display:flex;align-items:center;gap:var(--gap-2);flex-wrap:wrap; }

        .bc2-btn { display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:700 13px/1 var(--font-body);padding:8px 12px;border-radius:8px;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .12s; }
        .bc2-btn:hover { background:var(--surface-2);text-decoration:none; }
        .bc2-btn--primary { background:var(--accent);color:var(--accent-fg);border-color:var(--accent); }
        .bc2-btn--primary:hover { background:#0a5358;border-color:#0a5358;color:#fff; }
        .bc2-btn--primary:disabled { opacity:.6;cursor:not-allowed; }
        .bc2-btn--ghost { background:transparent;color:var(--ink-soft);border-color:var(--line); }
        .bc2-btn--ghost:hover { color:var(--ink);border-color:var(--ink-soft); }
        .bc2-btn--sm { font-size:12px;padding:5px 9px; }

        .bc2-select { font:600 13px/1 var(--font-body);color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 10px;cursor:pointer;font-family:var(--font-body); }

        .bc2-banner { display:flex;align-items:flex-start;gap:8px;padding:10px 14px;border-radius:var(--radius);font:500 13px/1.4 var(--font-body);margin-bottom:14px; }
        .bc2-banner--danger  { background:var(--danger-bg);color:var(--danger); }
        .bc2-banner--success { background:var(--success-bg);color:var(--success); }
        .bc2-banner--info    { background:var(--info-bg);color:var(--info); }
        .bc2-banner--warn    { background:var(--warn-bg);color:var(--warn); }

        .bc2-card { background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-card);overflow:hidden;margin-bottom:var(--gap-3); }
        .bc2-card__head { display:flex;align-items:center;justify-content:space-between;gap:var(--gap-2);padding:14px 18px;border-bottom:1px solid #eef2f6;flex-wrap:wrap; }
        .bc2-card__title { margin:0;font:800 11px/1 var(--font-body);text-transform:uppercase;letter-spacing:.045em;color:var(--ink); }
        .bc2-card__head-right { display:flex;align-items:center;gap:var(--gap-2); }
        .bc2-card--sticky { position:sticky;top:20px; }

        .bc2-detail { display:grid;grid-template-columns:1fr 300px;gap:var(--gap-3);align-items:start; }
        .bc2-detail__main { min-width:0; }
        .bc2-detail__aside { min-width:0; }
        .bc2-detail__chips { display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:var(--gap-3); }

        .bc2-kv { margin:0;padding:var(--card-pad);display:flex;flex-direction:column;gap:8px; }
        .bc2-kv > div { display:flex;justify-content:space-between;gap:12px;font:500 12px/1.3 var(--font-body); }
        .bc2-kv dt { color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em;font-size:10.5px;font-weight:700; }
        .bc2-kv dd { margin:0;color:var(--ink);text-align:right;font-weight:600; }

        .bc2-actions { display:flex;flex-direction:column;gap:6px;padding:var(--card-pad); }
        .bc2-approval { padding:var(--card-pad);display:flex;flex-direction:column;gap:12px; }
        .bc2-approval__row { display:flex;gap:10px;align-items:center; }

        .bc2-tablewrap { overflow-x:auto; }
        .bc2-table { width:100%;border-collapse:collapse;font:500 13px/1.3 var(--font-body);color:var(--ink); }
        .bc2-table th { text-align:left;font:700 10.5px/1 var(--font-body);text-transform:uppercase;letter-spacing:.055em;color:var(--ink-faint);background:#fafbfd;padding:8px var(--row-pad-x);border-bottom:1px solid #eaeef4; }
        .bc2-table th.num { text-align:right; }
        .bc2-table td { padding:var(--row-pad-y) var(--row-pad-x);border-bottom:1px solid #f1f4f8;vertical-align:middle; }
        .bc2-table td.num { text-align:right;font-variant-numeric:tabular-nums; }
        .bc2-table tbody tr:last-child td { border-bottom:none; }
        .bc2-tfoot-label { text-align:right;font:700 11px/1 var(--font-body);color:var(--ink-soft);text-transform:uppercase;letter-spacing:.07em;padding-top:14px; }
        .bc2-tfoot-value { font:700 15px/1 var(--font-body);color:var(--ink);padding-top:14px;text-align:right;font-variant-numeric:tabular-nums; }
        .bc2-cell-strong { font-weight:700;color:var(--ink); }
        .bc2-cell-soft { color:var(--ink-soft); }
        .bc2-num { font-variant-numeric:tabular-nums;font-family:var(--font-mono);font-weight:600; }
        .bc2-num--big { color:var(--accent); }
        .bc2-empty { text-align:center;color:var(--ink-soft);padding:40px 0;font:500 13px/1.4 var(--font-body); }

        .bc2-pill { display:inline-flex;align-items:center;gap:5px;font:700 11px/1 var(--font-body);padding:4px 8px;border-radius:6px;border:1px solid transparent; }
        .bc2-pill.is-compact { padding:3px 7px;font-size:10.5px; }
        .bc2-pill__dot { width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.8; }
        .bc2-pill--success { color:#128a3a;background:#defce9 !important; }
        .bc2-pill--warn    { color:#a36500;background:#fbecd0 !important; }
        .bc2-pill--info    { color:#0e6d73;background:#d8eef0 !important; }
        .bc2-pill--danger  { color:#c2362c;background:#fbe3df !important; }
        .bc2-pill--amber   { color:#9a5a1a;background:#f8e7cf !important; }
        .bc2-pill--neutral { color:#475569;background:#e2e8f0 !important; }
        .theme-painel .bc2-pill__dot { display:none; }

        @keyframes bc2-spin { to { transform:rotate(360deg); } }
        .bc2-spin { animation:bc2-spin .7s linear infinite;display:inline-block; }

        /* PDF modal */
        .pdf-modal-backdrop { position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1050;padding:1rem; }
        .pdf-modal-card { width:min(1200px,100%);height:min(860px,calc(100vh - 2rem));background:#fff;border-radius:10px;box-shadow:0 20px 45px rgba(0,0,0,.22);display:grid;grid-template-rows:auto auto 1fr;overflow:hidden; }
        .pdf-modal-header { display:flex;justify-content:space-between;align-items:center;padding:.85rem 1rem;border-bottom:1px solid #ececec;background:#f8fafb; }
        .pdf-modal-actions { display:flex;gap:.5rem;padding:.7rem 1rem;border-bottom:1px solid #f0f0f0;background:#fff; }
        .pdf-modal-body { min-height:0;height:100%;background:#2d3339; }

        @media (max-width:1000px) { .bc2-detail { grid-template-columns:1fr; } .bc2-card--sticky { position:static; } }
        @media (max-width:880px) {
          .bc2-app { grid-template-columns:64px 1fr; }
          .bc2-sidebar { padding:12px 6px; }
          .bc2-sidebar__brand-text,.bc2-navitem__label,.bc2-navitem__badge { display:none; }
          .bc2-sidebar__brand { justify-content:center;padding:0 0 12px; }
          .bc2-navitem { justify-content:center;padding:8px; }
          .bc2-main { padding:16px; }
          .pdf-modal-card { height:calc(100vh - 1.25rem); }
        }
      `}</style>
    </>
  );
}
