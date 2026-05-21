
"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

type QuoteRow = {
  id: string;
  internalNumber?: number;
  statusLabel?: string;
  statusKey?: string;
  updatedAt?: string;
  saleExternalId?: number | string | null;
  paymentConfirmedAt?: string | null;
  orderNumber?: string | null;
  approved?: boolean;
  approvedAt?: string | null;
  isAssociated?: boolean;
  availableNextStatuses?: Array<{ value: string; label: string }>;
  body?: {
    idorcamento?: number;
    cliente?: { nome?: string | null };
    vendedorNome?: string | null;
    totais?: { valor?: number };
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
  } catch {
    return null;
  }
}

function parseIncomingMessagePayload(data: unknown): Record<string, any> | null {
  if (!data) return null;
  if (typeof data === "object") return data as Record<string, any>;
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === "object" && parsed ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

function normalizeChatwootPayload(raw: Record<string, any>) {
  const dataObj = parseObjectMaybe(raw.data) ?? parseObjectMaybe(raw.payload) ?? raw;
  const nestedDataObj = parseObjectMaybe(dataObj?.data) ?? dataObj;
  const conversation =
    nestedDataObj?.conversation ??
    dataObj?.conversation ??
    nestedDataObj?.meta?.conversation ??
    raw?.conversation ??
    {};
  const contact =
    nestedDataObj?.contact ??
    dataObj?.contact ??
    nestedDataObj?.meta?.sender ??
    dataObj?.meta?.sender ??
    raw?.meta?.sender ??
    raw?.contact ??
    raw?.sender ??
    {};
  return { conversation, contact };
}

function getCreateQuoteHref() {
  if (typeof window === "undefined") return "/orcamento/novo#condPagamento";
  const query = window.location.search.replace(/^\?/, "");
  return query ? `/orcamento/novo?${query}#condPagamento` : "/orcamento/novo#condPagamento";
}

function getQuoteDetailHref(identifier: string) {
  if (typeof window === "undefined") return `/orcamento/${encodeURIComponent(identifier)}`;
  const query = window.location.search.replace(/^\?/, "");
  const basePath = `/orcamento/${encodeURIComponent(identifier)}`;
  return query ? `${basePath}?${query}` : basePath;
}

function getQuoteIdentifier(quote: QuoteRow): string {
  if (quote.body?.idorcamento && Number.isFinite(quote.body.idorcamento)) {
    return String(Math.trunc(quote.body.idorcamento));
  }
  if (quote.internalNumber && Number.isFinite(quote.internalNumber)) {
    return String(Math.trunc(quote.internalNumber));
  }
  return quote.id;
}

const STATUS_PILL: Record<string, { label: string; tone: string }> = {
  aprovado:              { label: "Aprovado",           tone: "success" },
  em_producao:           { label: "Em Produção",        tone: "info"    },
  pronto_para_entrega:   { label: "Pronto p/ Entrega",  tone: "amber"   },
  entregue:              { label: "Entregue",            tone: "neutral" },
  cancelado:             { label: "Cancelado",           tone: "danger"  },
  recusado:              { label: "Recusado",            tone: "danger"  },
  pendente:              { label: "Pendente",            tone: "warn"    },
  enviado:               { label: "Enviado",             tone: "info"    },
};

function showToast(message: string, type: "success" | "danger") {
  if (typeof window === "undefined") return;
  const bs = (window as any).bootstrap;
  if (!bs?.Toast) return;
  const container = document.getElementById("toast-container");
  if (!container) return;
  const wrapper = document.createElement("div");
  wrapper.className = `toast align-items-center text-bg-${type} border-0`;
  wrapper.setAttribute("role", "alert");
  wrapper.setAttribute("aria-live", "assertive");
  wrapper.setAttribute("aria-atomic", "true");
  wrapper.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
    </div>
  `;
  container.appendChild(wrapper);
  const toast = new bs.Toast(wrapper, { delay: 3500 });
  toast.show();
  wrapper.addEventListener("hidden.bs.toast", () => wrapper.remove());
}

const FILTER_OPTIONS = [
  { value: "",                  label: "Todos"            },
  { value: "PENDENTE",          label: "Pendente"         },
  { value: "ENVIADO",           label: "Enviado"          },
  { value: "APROVADO",          label: "Aprovado"         },
  { value: "EM_PRODUCAO",       label: "Em Produção"      },
  { value: "PRONTO_PARA_ENTREGA", label: "Pronto p/ Entrega" },
  { value: "ENTREGUE",          label: "Entregue"         },
  { value: "CANCELADO",         label: "Cancelado"        },
] as const;

export default function OrcamentoListaPage() {
  const [validationState, setValidationState] = useState<"checking" | "valid" | "invalid">("checking");
  const [validationMessage, setValidationMessage] = useState("");
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quotesError, setQuotesError] = useState("");
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);
  const [chatwootContactId, setChatwootContactId] = useState<number | undefined>(undefined);
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [linkSendingId, setLinkSendingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const createQuoteHref = getCreateQuoteHref();

  // ─── SSE: pagamentos em tempo real ──────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/events/pagamentos");
    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { numeroordem?: string };
        const ordem = data?.numeroordem ?? "—";
        showToast(`Pagamento do Pedido #${ordem} confirmado no caixa`, "success");
      } catch {
        // payload inesperado — ignora
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  // ─── Validação Chatwoot ──────────────────────────────────────────────────────
  useEffect(() => {
    const isDevBypass =
      (typeof process !== "undefined" && process.env.NODE_ENV === "development") ||
      (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          window.location.hostname === "0.0.0.0"));
    if (isDevBypass) {
      setValidationState("valid");
      setValidationMessage("");
      return;
    }

    let validated = false;

    const params = new URLSearchParams(window.location.search);
    const convParam =
      parseMaybeNumber(params.get("chatid")) ??
      parseMaybeNumber(params.get("conversationId")) ??
      parseMaybeNumber(params.get("conversation_id"));
    const contactParam =
      parseMaybeNumber(params.get("chatwootContactId")) ??
      parseMaybeNumber(params.get("chatwoot_contact_id")) ??
      parseMaybeNumber(params.get("contact_id"));

    if (convParam && convParam > 0) setConversationId(convParam);
    if (contactParam && contactParam > 0) setChatwootContactId(contactParam);

    const handleMessage = (event: MessageEvent) => {
      const payload = parseIncomingMessagePayload(event.data);
      if (!payload) return;
      const { conversation, contact } = normalizeChatwootPayload(payload);
      const convId = parseMaybeNumber(conversation?.id);
      const contactId = parseMaybeNumber(contact?.id);
      if (convId !== undefined && convId > 0) {
        validated = true;
        setConversationId(convId);
        setValidationState("valid");
        setValidationMessage("");
      }
      if (contactId !== undefined && contactId > 0) setChatwootContactId(contactId);
    };

    const requestChatwootInfo = () => {
      try {
        window.parent?.postMessage("chatwoot-dashboard-app:fetch-info", "*");
        window.parent?.postMessage({ event: "chatwoot-dashboard-app:fetch-info" }, "*");
      } catch { /* noop */ }
    };

    window.addEventListener("message", handleMessage);
    requestChatwootInfo();
    const retryId = window.setTimeout(() => requestChatwootInfo(), 1200);
    const validationTimeout = window.setTimeout(() => {
      const isInIframe = window.parent !== window;
      if (!isInIframe) {
        setValidationMessage("Esta página deve ser acessada através do Chatwoot");
        setValidationState("invalid");
      } else if (!validated) {
        setValidationMessage("Não foi possível validar o contexto da conversa no Chatwoot");
        setValidationState("invalid");
      }
    }, 3500);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(retryId);
      window.clearTimeout(validationTimeout);
    };
  }, []);

  // ─── Fetch quotes ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (validationState !== "valid") return;

    const fetchQuotes = async () => {
      setLoadingQuotes(true);
      setQuotesError("");
      try {
        const query = new URLSearchParams();
        if (chatwootContactId && chatwootContactId > 0) {
          query.set("chatwootContactId", String(chatwootContactId));
        } else if (conversationId && conversationId > 0) {
          query.set("conversationId", String(conversationId));
        }
        if (activeFilter) query.set("status", activeFilter);
        const response = await fetch(`/api/quotes?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error((data as any)?.error || "Erro ao buscar orçamentos do contato.");
        }
        const data = (await response.json()) as unknown;
        const parsed = Array.isArray(data)
          ? (data as QuoteRow[])
          : Array.isArray((data as any)?.data)
            ? ((data as any).data as QuoteRow[])
            : [];
        setQuotes(parsed);
      } catch (error) {
        setQuotesError(error instanceof Error ? error.message : "Falha ao carregar orçamentos.");
      } finally {
        setLoadingQuotes(false);
      }
    };

    void fetchQuotes();
  }, [validationState, chatwootContactId, conversationId, activeFilter]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  async function handleEnviarLink(quote: QuoteRow) {
    setLinkSendingId(quote.id);
    try {
      const identifier = getQuoteIdentifier(quote);
      const response = await fetch(`/api/quotes/${encodeURIComponent(identifier)}/enviar`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { message?: string; approvalLink?: string | null; error?: string };
      if (!response.ok) throw new Error(data?.error || "Falha ao enviar link de aprovação.");
      const linkMsg = data.approvalLink ? ` Link: ${data.approvalLink}` : " Mensagem enviada via Chatwoot.";
      showToast(`Link de aprovação enviado!${linkMsg}`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Falha ao enviar link.", "danger");
    } finally {
      setLinkSendingId(null);
    }
  }

  async function handleStatusChange(quote: QuoteRow, nextStatus: string) {
    setStatusSavingId(quote.id);
    setQuotesError("");
    try {
      const identifier = getQuoteIdentifier(quote);
      const response = await fetch(`/api/quotes/${encodeURIComponent(identifier)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus: nextStatus, changedBy: "Lista de orcamentos" }),
      });
      const data = (await response.json().catch(() => ({}))) as QuoteRow & { message?: string; error?: string };
      if (!response.ok) throw new Error(data?.message || data?.error || "Falha ao atualizar status.");
      setQuotes((current) => current.map((q) => (q.id === quote.id ? { ...q, ...data } : q)));
      showToast(`Status atualizado para ${(data as any).statusLabel ?? nextStatus}.`, "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Falha ao atualizar status.";
      setQuotesError(msg);
      showToast(msg, "danger");
    } finally {
      setStatusSavingId(null);
    }
  }

  // ─── Derived data ────────────────────────────────────────────────────────────
  const visibleQuotes = activeFilter
    ? quotes.filter((q) => (q.statusKey ?? "").toUpperCase() === activeFilter)
    : quotes;

  const filteredQuotes = searchQuery
    ? visibleQuotes.filter((q) => {
        const name = (q.body?.cliente?.nome ?? "").toLowerCase();
        const num = String(q.body?.idorcamento ?? q.internalNumber ?? "");
        const s = searchQuery.toLowerCase();
        return name.includes(s) || num.includes(s);
      })
    : visibleQuotes;

  const filterCount = (val: string) =>
    val === "" ? quotes.length : quotes.filter((q) => (q.statusKey ?? "").toUpperCase() === val).length;

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />

      {/* ── Checking ── */}
      {validationState === "checking" && (
        <>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
          <div className="container my-5">
            <div className="row justify-content-center">
              <div className="col-md-6 text-center">
                <div className="spinner-border text-primary mb-3" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
                <h5 className="text-muted">Autenticando com Chatwoot...</h5>
                <p className="text-secondary small">Por favor, aguarde...</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Invalid ── */}
      {validationState === "invalid" && (
        <>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
          <div className="container my-5">
            <div className="row justify-content-center">
              <div className="col-md-6">
                <div className="alert alert-danger d-flex gap-2 align-items-start" role="alert">
                  <i className="bi bi-exclamation-triangle-fill mt-1" style={{ fontSize: "1.25rem" }} />
                  <div>
                    <h5 className="alert-heading mb-2">Acesso Restrito</h5>
                    <p className="mb-0">Esta página só pode ser acessada através do <strong>Chatwoot Dashboard</strong>.</p>
                    <hr className="my-2" />
                    <p className="mb-0 small text-muted">{validationMessage || "Por favor, volte ao Chatwoot."}</p>
                    <a href="/status" className="btn btn-sm btn-outline-primary mt-3">Abrir painel público (/status)</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Valid — bc2 Layout v2 / Painel ── */}
      {validationState === "valid" && (
        <div className="bc2-app theme-painel density-compact">

          {/* ── Sidebar ── */}
          <aside className="bc2-sidebar">
            <div className="bc2-sidebar__brand">
              <img src="/media/logo-primary.png" alt="Bom Custo" />
              <div className="bc2-sidebar__brand-text">
                <div className="bc2-sidebar__brand-name">Bom Custo</div>
                <div className="bc2-sidebar__brand-sub">Papelaria &amp; Gráfica</div>
              </div>
            </div>

            <nav className="bc2-sidebar__nav">
              <button type="button" className="bc2-navitem is-active">
                <i className="bi bi-list-ul" />
                <span className="bc2-navitem__label">Orçamentos</span>
                {quotes.length > 0 && (
                  <span className="bc2-navitem__badge">{quotes.length}</span>
                )}
              </button>
              <a href={createQuoteHref} className="bc2-navitem">
                <i className="bi bi-plus-circle" />
                <span className="bc2-navitem__label">Novo Orçamento</span>
              </a>
              <a href="/status" className="bc2-navitem">
                <i className="bi bi-kanban" />
                <span className="bc2-navitem__label">Produção</span>
              </a>
            </nav>

            <div className="bc2-sidebar__foot">
              <button
                type="button"
                className="bc2-navitem"
                onClick={() => {
                  if (validationState !== "valid") return;
                  setLoadingQuotes(true);
                  setQuotesError("");
                  const query = new URLSearchParams();
                  if (chatwootContactId && chatwootContactId > 0) query.set("chatwootContactId", String(chatwootContactId));
                  else if (conversationId && conversationId > 0) query.set("conversationId", String(conversationId));
                  if (activeFilter) query.set("status", activeFilter);
                  fetch(`/api/quotes?${query.toString()}`, { cache: "no-store" })
                    .then((r) => r.json())
                    .then((data) => {
                      const parsed = Array.isArray(data) ? (data as QuoteRow[]) : Array.isArray((data as any)?.data) ? ((data as any).data as QuoteRow[]) : [];
                      setQuotes(parsed);
                    })
                    .catch((err) => setQuotesError(err instanceof Error ? err.message : "Falha ao atualizar."))
                    .finally(() => setLoadingQuotes(false));
                }}
              >
                <i className={`bi ${loadingQuotes ? "bi-arrow-clockwise bc2-spin" : "bi-arrow-clockwise"}`} />
                <span className="bc2-navitem__label">Atualizar</span>
              </button>
            </div>
          </aside>

          {/* ── Main ── */}
          <main className="bc2-main">

            {/* TopBar */}
            <header className="bc2-topbar">
              <div className="bc2-topbar__left">
                <h1 className="bc2-topbar__title">Orçamentos</h1>
                <p className="bc2-topbar__sub">Consulte, filtre e acompanhe seus orçamentos em tempo real.</p>
              </div>
              <div className="bc2-topbar__right">
                <label className="bc2-search">
                  <i className="bi bi-search" />
                  <input
                    type="text"
                    placeholder="Buscar por cliente ou número…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </label>
                <a href={createQuoteHref} className="bc2-btn bc2-btn--primary">
                  <i className="bi bi-plus-lg" /> Adicionar Orçamento
                </a>
              </div>
            </header>

            {/* Error banner */}
            {quotesError && (
              <div style={{ background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <i className="bi bi-exclamation-triangle-fill" />
                {quotesError}
              </div>
            )}

            {/* Stat cards */}
            <div className="bc2-stats">
              <div className="bc2-stat bc2-stat--warn">
                <div className="bc2-stat__icon"><i className="bi bi-hourglass-split" /></div>
                <div className="bc2-stat__body">
                  <div className="bc2-stat__label">Pendentes / Enviados</div>
                  <div className="bc2-stat__row">
                    <div className="bc2-stat__value">
                      {quotes.filter((q) => ["PENDENTE", "ENVIADO"].includes(q.statusKey ?? "")).length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bc2-stat bc2-stat--info">
                <div className="bc2-stat__icon"><i className="bi bi-gear-fill" /></div>
                <div className="bc2-stat__body">
                  <div className="bc2-stat__label">Em Produção</div>
                  <div className="bc2-stat__row">
                    <div className="bc2-stat__value">
                      {quotes.filter((q) => q.statusKey === "EM_PRODUCAO").length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bc2-stat bc2-stat--success">
                <div className="bc2-stat__icon"><i className="bi bi-cash-coin" /></div>
                <div className="bc2-stat__body">
                  <div className="bc2-stat__label">Pagos</div>
                  <div className="bc2-stat__row">
                    <div className="bc2-stat__value">
                      {quotes.filter((q) => !!(q.paymentConfirmedAt || q.orderNumber || q.saleExternalId)).length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bc2-stat bc2-stat--accent">
                <div className="bc2-stat__icon"><i className="bi bi-receipt" /></div>
                <div className="bc2-stat__body">
                  <div className="bc2-stat__label">Total de Orçamentos</div>
                  <div className="bc2-stat__row">
                    <div className="bc2-stat__value">{quotes.length}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Table card */}
            <div className="bc2-card">
              <div className="bc2-card__head">
                <h2 className="bc2-card__title">Lista de Orçamentos</h2>
                <div className="bc2-card__head-right">
                  <div className="bc2-filters">
                    {FILTER_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`bc2-fbtn ${activeFilter === value ? "is-on" : ""}`}
                        onClick={() => setActiveFilter(value)}
                      >
                        {label}
                        <span className="bc2-fbtn__count">{filterCount(value)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loadingQuotes ? (
                <div className="bc2-empty">
                  <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "bc2-spin .7s linear infinite", marginRight: 8, verticalAlign: "middle" }} />
                  Carregando orçamentos...
                </div>
              ) : filteredQuotes.length === 0 ? (
                <div className="bc2-empty">
                  <i className="bi bi-inbox" style={{ fontSize: 28, display: "block", marginBottom: 8, opacity: 0.4 }} />
                  {searchQuery
                    ? "Nenhum resultado para a busca."
                    : activeFilter
                      ? `Nenhum orçamento com o status selecionado.`
                      : "Nenhum orçamento encontrado para este contato."}
                </div>
              ) : (
                <div className="bc2-tablewrap">
                  <table className="bc2-table">
                    <thead>
                      <tr>
                        <th>Nº</th>
                        <th>Pedido / Pgto</th>
                        <th>Cliente</th>
                        <th>Data</th>
                        <th>Vendedor</th>
                        <th className="num">Total</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQuotes.map((quote) => {
                        const statusKey = (quote.statusKey ?? "").toLowerCase();
                        const pillDef = STATUS_PILL[statusKey] ?? { label: quote.statusLabel || quote.statusKey || "—", tone: "neutral" };
                        const quoteNumber = quote.body?.idorcamento ?? quote.internalNumber;
                        const quoteIdentifier = getQuoteIdentifier(quote);
                        const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);
                        const isPaid = Boolean(orderNumber || quote.paymentConfirmedAt);
                        const isAssociated = Boolean(quote.isAssociated);
                        const approved = Boolean(quote.approved);
                        const needsApproval = isAssociated && !approved;
                        const linkBusy = linkSendingId === quote.id;

                        return (
                          <tr key={quote.id} className={isPaid ? "is-paid" : ""}>
                            <td>
                              <span className="bc2-cell-strong bc2-num">#{quoteNumber ?? "—"}</span>
                            </td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                <span className={`bc2-pill is-compact bc2-pill--${orderNumber ? "success" : "neutral"}`}>
                                  <span className="bc2-pill__dot" />
                                  {orderNumber ? `Pedido #${orderNumber}` : "Sem pedido"}
                                </span>
                                <span className={`bc2-pill is-compact bc2-pill--${isPaid ? "success" : "warn"}`}>
                                  <span className="bc2-pill__dot" />
                                  {isPaid
                                    ? (quote.paymentConfirmedAt && !orderNumber ? "PIX Confirmado" : "Pago no Caixa")
                                    : "Aguardando pagamento"}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className="bc2-cell-strong">{quote.body?.cliente?.nome || "Não informado"}</span>
                            </td>
                            <td>
                              <span className="bc2-cell-soft">
                                {quote.updatedAt ? new Date(quote.updatedAt).toLocaleDateString("pt-BR") : "—"}
                              </span>
                            </td>
                            <td>
                              <span className="bc2-cell-soft">{quote.body?.vendedorNome || "—"}</span>
                            </td>
                            <td className="num">
                              <span className="bc2-num bc2-num--big">
                                {(quote.body?.totais?.valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                <span className={`bc2-pill is-compact bc2-pill--${pillDef.tone}`}>
                                  <span className="bc2-pill__dot" />
                                  {pillDef.label}
                                </span>
                                {isAssociated && (
                                  approved ? (
                                    <span
                                      className="bc2-pill is-compact bc2-pill--success"
                                      title={quote.approvedAt ? `Aprovado em ${new Date(quote.approvedAt).toLocaleString("pt-BR")}` : ""}
                                    >
                                      <i className="bi bi-check-circle me-1" />Cliente aprovou
                                    </span>
                                  ) : (
                                    <span className="bc2-pill is-compact bc2-pill--warn">
                                      <i className="bi bi-hourglass-split me-1" />Aguardando aprovação
                                    </span>
                                  )
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                                <a
                                  href={getQuoteDetailHref(quoteIdentifier)}
                                  className="bc2-btn bc2-btn--sm bc2-btn--ghost"
                                  title="Visualizar orçamento"
                                >
                                  <i className="bi bi-eye" />
                                </a>
                                {needsApproval && (
                                  <button
                                    type="button"
                                    className="bc2-btn bc2-btn--sm bc2-btn--ghost"
                                    onClick={() => void handleEnviarLink(quote)}
                                    disabled={linkBusy}
                                    title="Enviar link de aprovação"
                                  >
                                    <i className="bi bi-send" />
                                    {linkBusy ? " Enviando…" : " Link"}
                                  </button>
                                )}
                                {quote.availableNextStatuses && quote.availableNextStatuses.length > 0 && (
                                  <select
                                    className="bc2-select"
                                    value=""
                                    disabled={statusSavingId === quote.id}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      e.target.value = "";
                                      if (val) void handleStatusChange(quote, val);
                                    }}
                                  >
                                    <option value="">
                                      {statusSavingId === quote.id ? "Salvando…" : "Alterar status"}
                                    </option>
                                    {quote.availableNextStatuses.map((s) => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bc2-card__foot">
                <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                  {filteredQuotes.length} de {quotes.length} orçamento(s)
                  {searchQuery ? ` · filtro: "${searchQuery}"` : ""}
                </span>
              </div>
            </div>

          </main>
        </div>
      )}

      {/* Toast container (Bootstrap JS API) */}
      <div id="toast-container" className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1100 }} />

      <style>{`
        /* ── bc2 Layout v2 / Painel theme ── */
        * { box-sizing: border-box; }

        :root {
          --font-body:    var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-display: var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-mono:    'JetBrains Mono', ui-monospace, monospace;
          --bg:          #faf6ec; --surface: #ffffff; --surface-2: #fbf6ea; --surface-3: #f5edd9;
          --ink:         #2a1f17; --ink-soft: #6b5c4d; --ink-faint: #a59785;
          --line:        #e8dfcc; --line-soft: #f0e8d4;
          --accent:      #0e6d73; --accent-fg: #ffffff; --accent-soft: #d6ebed;
          --success:     #128a3a; --success-bg: #defce9;
          --warn:        #a36500; --warn-bg:   #fbecd0;
          --info:        #0e6d73; --info-bg:   #d8eef0;
          --danger:      #c2362c; --danger-bg: #fbe3df;
          --amber:       #9a5a1a; --amber-bg:  #f8e7cf;
          --neutral:     #475569; --neutral-bg:#e2e8f0;
          --radius:      10px; --radius-sm: 6px;
          --shadow-card: 0 1px 0 rgba(11,18,32,.02), 0 1px 3px rgba(11,18,32,.06);
          --row-pad-y: 7px; --row-pad-x: 12px; --card-pad: 14px;
          --gap-1: 4px; --gap-2: 8px; --gap-3: 12px; --gap-4: 16px;
        }

        .theme-painel {
          --font-display: var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-body:    var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --bg: #f5f7fa; --surface: #ffffff; --surface-2: #f8fafc; --surface-3: #eef2f7;
          --ink: #0b1220; --ink-soft: #5b6b80; --ink-faint: #9aa7b8;
          --line: #e4e9f0; --line-soft: #eef2f6;
          --accent: #0e6d73; --accent-soft: #d6ebed;
          --radius: 10px;
          --shadow-card: 0 1px 0 rgba(11,18,32,.02), 0 1px 3px rgba(11,18,32,.06);
        }

        .density-compact {
          --row-pad-y: 7px; --row-pad-x: 12px; --card-pad: 14px;
          --gap-1: 4px; --gap-2: 8px; --gap-3: 12px; --gap-4: 16px;
        }

        /* Shell */
        .bc2-app {
          display: grid;
          grid-template-columns: 240px 1fr;
          min-height: 100vh;
          background: var(--bg);
          font-family: var(--font-body);
          font-size: 14px;
          color: var(--ink);
          -webkit-font-smoothing: antialiased;
        }
        .bc2-app button { font-family: inherit; }
        .bc2-app a { color: var(--accent); text-decoration: none; }
        .bc2-app a:hover { text-decoration: underline; text-underline-offset: 3px; }

        /* Sidebar */
        .bc2-sidebar {
          position: sticky; top: 0;
          height: 100vh;
          background: #ffffff;
          border-right: 1px solid #eaeef4;
          display: flex; flex-direction: column;
          padding: 16px 12px;
        }
        .bc2-sidebar__brand {
          display: flex; align-items: center; gap: 10px;
          padding: 4px 6px 14px;
          border-bottom: 1px solid #eef2f6;
          margin-bottom: 8px;
        }
        .bc2-sidebar__brand img { width: 40px; height: 40px; object-fit: contain; background: #f8fafc; border-radius: 10px; padding: 4px; }
        .bc2-sidebar__brand-name { font: 700 14.5px/1.1 var(--font-body); color: var(--ink); letter-spacing: -0.012em; }
        .bc2-sidebar__brand-sub  { font: 500 10.5px/1.2 var(--font-body); color: var(--ink-faint); margin-top: 2px; text-transform: uppercase; letter-spacing: .02em; }
        .bc2-sidebar__nav { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; flex: 1; }
        .bc2-sidebar__foot { border-top: 1px solid #eef2f6; padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }

        .bc2-navitem {
          display: flex; align-items: center; gap: 11px;
          border: none; background: transparent;
          color: var(--ink-soft);
          padding: 7px 10px;
          border-radius: calc(var(--radius) - 2px);
          font: 600 12.5px/1 var(--font-body);
          cursor: pointer; text-align: left; text-decoration: none;
        }
        .bc2-navitem i { font-size: 15px; width: 20px; text-align: center; }
        .bc2-navitem__label { flex: 1; }
        .bc2-navitem__badge {
          background: var(--surface-3); color: var(--ink);
          font: 700 10.5px/1 var(--font-body);
          padding: 3px 7px; border-radius: 999px;
        }
        .bc2-navitem:hover { background: var(--surface-2); color: var(--ink); text-decoration: none; }
        .bc2-navitem.is-active { background: var(--ink); color: #ffffff; box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }
        .bc2-navitem.is-active .bc2-navitem__badge { background: rgba(255,255,255,.16); color: #ffffff; }

        /* Main */
        .bc2-main { display: flex; flex-direction: column; padding: 20px 24px 40px; min-width: 0; }

        /* TopBar */
        .bc2-topbar {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: var(--gap-3); margin-bottom: 22px; flex-wrap: wrap; row-gap: 12px;
        }
        .bc2-topbar__left { min-width: 0; flex: 1 1 280px; }
        .bc2-topbar__title { margin: 0; font: 800 28px/1.1 var(--font-display); color: var(--ink); letter-spacing: -0.028em; }
        .bc2-topbar__sub { margin: 6px 0 0; font: 500 13.5px/1.45 var(--font-body); color: var(--ink-soft); }
        .bc2-topbar__right { display: flex; align-items: center; gap: var(--gap-2); flex-wrap: wrap; }

        /* Search */
        .bc2-search {
          display: inline-flex; align-items: center; gap: 8px;
          background: #ffffff; border: 1px solid var(--line);
          border-radius: 8px; padding: 6px 10px; min-width: 260px; cursor: text;
        }
        .bc2-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(14,109,115,.12); }
        .bc2-search i { color: var(--ink-soft); font-size: 14px; }
        .bc2-search input { border: none; outline: none; background: transparent; color: var(--ink); font: 500 13px/1 var(--font-body); flex: 1; }
        .bc2-search input::placeholder { color: var(--ink-faint); }

        /* Buttons */
        .bc2-btn {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid var(--line); background: var(--surface); color: var(--ink);
          font: 700 13px/1 var(--font-body);
          padding: 8px 12px; border-radius: 8px;
          cursor: pointer; text-decoration: none; white-space: nowrap;
          transition: background .12s, border-color .12s, color .12s;
        }
        .bc2-btn:hover { background: var(--surface-2); text-decoration: none; }
        .bc2-btn--primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
        .bc2-btn--primary:hover { background: #0a5358; border-color: #0a5358; color: #fff; }
        .bc2-btn--ghost { background: transparent; color: var(--ink-soft); border-color: var(--line); }
        .bc2-btn--ghost:hover { color: var(--ink); border-color: var(--ink-soft); }
        .bc2-btn--sm { font-size: 12px; padding: 5px 9px; }

        /* Select */
        .bc2-select {
          font: 600 12px/1 var(--font-body); color: var(--ink);
          background: var(--surface); border: 1px solid var(--line);
          border-radius: 8px; padding: 5px 8px; cursor: pointer;
          min-width: 130px;
        }
        .bc2-select:hover { border-color: var(--ink-soft); }

        /* Stats */
        .bc2-stats {
          display: grid; gap: var(--gap-3);
          grid-template-columns: repeat(4, 1fr);
          margin-bottom: var(--gap-3);
        }
        .bc2-stat {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--radius); padding: 16px 18px;
          display: flex; gap: 14px; align-items: center;
          box-shadow: var(--shadow-card);
        }
        .bc2-stat__icon {
          width: 36px; height: 36px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center; font-size: 16px;
        }
        .bc2-stat--warn    .bc2-stat__icon { background: var(--warn-bg);    color: var(--warn);    }
        .bc2-stat--success .bc2-stat__icon { background: var(--success-bg); color: var(--success); }
        .bc2-stat--info    .bc2-stat__icon { background: var(--info-bg);    color: var(--info);    }
        .bc2-stat--accent  .bc2-stat__icon { background: var(--accent-soft);color: var(--accent);  }
        .bc2-stat__label { font: 600 10.5px/1 var(--font-body); color: var(--ink-faint); text-transform: uppercase; letter-spacing: .06em; }
        .bc2-stat__row { display: flex; align-items: baseline; gap: 8px; margin-top: 6px; }
        .bc2-stat__value { font: 800 24px/1.05 var(--font-display); color: var(--ink); letter-spacing: -0.02em; }

        /* Card */
        .bc2-card {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--radius); box-shadow: var(--shadow-card);
          overflow: hidden; margin-bottom: var(--gap-3);
        }
        .bc2-card__head {
          display: flex; align-items: center; justify-content: space-between;
          gap: var(--gap-2); padding: 14px 18px;
          border-bottom: 1px solid #eef2f6; flex-wrap: wrap;
        }
        .bc2-card__title {
          margin: 0; font: 800 11px/1 var(--font-body);
          text-transform: uppercase; letter-spacing: .045em; color: var(--ink);
        }
        .bc2-card__head-right { display: flex; align-items: center; gap: var(--gap-2); }
        .bc2-card__foot {
          padding: 10px 18px; border-top: 1px solid #eef2f6;
          display: flex; justify-content: flex-end;
          background: #fafbfd;
        }

        /* Filters */
        .bc2-filters { display: flex; flex-wrap: wrap; gap: 3px; }
        .bc2-fbtn {
          background: transparent; border: 1px solid transparent; color: var(--ink-soft);
          padding: 6px 12px; border-radius: 999px;
          font: 600 12px/1 var(--font-body); cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .bc2-fbtn:hover { background: #eef2f6; color: var(--ink); }
        .bc2-fbtn.is-on { background: var(--ink); color: #fff; }
        .bc2-fbtn__count { font: 700 10px/1 var(--font-body); background: var(--surface-3); color: var(--ink-soft); padding: 1.5px 6px; border-radius: 999px; }
        .bc2-fbtn.is-on .bc2-fbtn__count { background: rgba(255,255,255,.18); color: rgba(255,255,255,.85); }

        /* Table */
        .bc2-tablewrap { overflow-x: auto; }
        .bc2-table { width: 100%; border-collapse: collapse; font: 500 13px/1.3 var(--font-body); color: var(--ink); }
        .bc2-table th {
          text-align: left; font: 700 10.5px/1 var(--font-body);
          text-transform: uppercase; letter-spacing: .055em; color: var(--ink-faint);
          background: #fafbfd; padding: 8px var(--row-pad-x);
          border-bottom: 1px solid #eaeef4;
        }
        .bc2-table th.num { text-align: right; }
        .bc2-table td { padding: var(--row-pad-y) var(--row-pad-x); border-bottom: 1px solid #f1f4f8; vertical-align: middle; }
        .bc2-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .bc2-table tbody tr { transition: background .08s; }
        .bc2-table tbody tr:hover { background: #fafbfd; }
        .bc2-table tbody tr.is-paid { background: linear-gradient(to right, #effaf3, transparent 30%); }
        .bc2-table tbody tr.is-paid:hover { background: linear-gradient(to right, #effaf3, #fafbfd 50%); }
        .bc2-table tbody tr:last-child td { border-bottom: none; }
        .bc2-cell-strong { font-weight: 700; color: var(--ink); }
        .bc2-cell-soft   { color: var(--ink-soft); }
        .bc2-num { font-variant-numeric: tabular-nums; font-family: var(--font-mono); font-weight: 600; }
        .bc2-num--big { color: var(--accent); }
        .bc2-empty { text-align: center; color: var(--ink-soft); padding: 40px 0; font: 500 13px/1.4 var(--font-body); }

        /* Status pills */
        .bc2-pill {
          display: inline-flex; align-items: center; gap: 5px;
          font: 700 11px/1 var(--font-body);
          padding: 4px 8px; border-radius: 6px;
          border: 1px solid transparent;
        }
        .bc2-pill.is-compact { padding: 3px 7px; font-size: 10.5px; }
        .bc2-pill__dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .8; }
        .bc2-pill--success { color: #128a3a; background: #defce9 !important; }
        .bc2-pill--warn    { color: #a36500; background: #fbecd0 !important; }
        .bc2-pill--info    { color: #0e6d73; background: #d8eef0 !important; }
        .bc2-pill--danger  { color: #c2362c; background: #fbe3df !important; }
        .bc2-pill--amber   { color: #9a5a1a; background: #f8e7cf !important; }
        .bc2-pill--neutral { color: #475569; background: #e2e8f0 !important; }
        .theme-painel .bc2-pill__dot { display: none; }

        /* Spinner animation */
        @keyframes bc2-spin { to { transform: rotate(360deg); } }
        .bc2-spin { animation: bc2-spin .7s linear infinite; display: inline-block; }

        /* Responsive */
        @media (max-width: 880px) {
          .bc2-app { grid-template-columns: 64px 1fr; }
          .bc2-sidebar { padding: 12px 6px; }
          .bc2-sidebar__brand-text, .bc2-navitem__label, .bc2-navitem__badge { display: none; }
          .bc2-sidebar__brand { justify-content: center; padding: 0 0 12px; }
          .bc2-navitem { justify-content: center; padding: 8px; }
          .bc2-main { padding: 16px; }
          .bc2-stats { grid-template-columns: repeat(2, 1fr); }
          .bc2-search { min-width: 0; flex: 1; }
        }
        @media (max-width: 600px) {
          .bc2-stats { grid-template-columns: 1fr 1fr; }
          .bc2-topbar__right { width: 100%; }
          .bc2-card__head { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </>
  );
}
