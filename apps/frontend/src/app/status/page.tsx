"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

type StatusOption = {
  value: string;
  label: string;
};

type QuoteRow = {
  id: string;
  internalNumber: number;
  updatedAt: string;
  statusKey: string;
  statusLabel: string;
  orderNumber?: string | null;
  paidInCashier?: boolean;
  saleExternalId?: number | string | null;
  paymentConfirmedAt?: string | null;
  latestPdfUrl: string | null;
  chatwootConversationUrl: string | null;
  availableNextStatuses: StatusOption[];
  body: {
    idorcamento?: number;
    cliente?: { nome?: string | null; telefone?: string | null };
    vendedorNome?: string | null;
    totais?: { valor?: number };
  };
};

const PRODUCTION_STATUSES = ["APROVADO", "EM_PRODUCAO", "PRONTO_PARA_ENTREGA"];
const LS_LAST_PAYMENT = "bomcusto_last_caixa_payment";
const LS_DISMISSED    = "bomcusto_last_caixa_dismissed";

const COLUMN_CONFIG: Array<{ key: string; label: string; shortLabel: string; icon: string; tone: string }> = [
  { key: "APROVADO",            label: "Aprovado",          shortLabel: "Aprovado",  icon: "bi-check2-circle", tone: "success" },
  { key: "EM_PRODUCAO",         label: "Em Produção",       shortLabel: "Em Prod.",  icon: "bi-gear-fill",     tone: "info"    },
  { key: "PRONTO_PARA_ENTREGA", label: "Pronto p/ Entrega", shortLabel: "Pronto",    icon: "bi-box-seam",      tone: "amber"   },
];

function getQuoteIdentifier(quote: QuoteRow): string {
  if (quote.body.idorcamento && Number.isFinite(quote.body.idorcamento)) return String(Math.trunc(quote.body.idorcamento));
  if (quote.internalNumber && Number.isFinite(quote.internalNumber)) return String(Math.trunc(quote.internalNumber));
  return quote.id;
}

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
  wrapper.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button></div>`;
  container.appendChild(wrapper);
  const toast = new bs.Toast(wrapper, { delay: 4000 });
  toast.show();
  wrapper.addEventListener("hidden.bs.toast", () => wrapper.remove());
}

export default function StatusPage() {
  const [quotes, setQuotes]               = useState<QuoteRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [erro, setErro]                   = useState("");
  const [pdfLoadingId, setPdfLoadingId]   = useState<string | null>(null);
  const [badgeFilter, setBadgeFilter]     = useState<"TODOS" | "PAGO_CAIXA" | "PIX" | "AGUARDANDO">("TODOS");
  const [efiStatus, setEfiStatus]         = useState<{ enabled: boolean; message?: string } | null>(null);
  const [lastPayment, setLastPayment]     = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<string>("APROVADO");
  const fetchRef = useRef<(() => Promise<void>) | null>(null);

  // ─── Payment badge helpers ────────────────────────────────────────────────
  function getBadgeType(quote: QuoteRow): string {
    const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);
    const paidInCashier = quote.paidInCashier ?? Boolean(orderNumber);
    if (paidInCashier) return "PAGO_CAIXA";
    if (quote.paymentConfirmedAt) return "PIX_CONFIRMADO";
    return "AGUARDANDO";
  }

  // ─── Persistent payment banner ────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored   = localStorage.getItem(LS_LAST_PAYMENT);
      const dismissed = localStorage.getItem(LS_DISMISSED);
      if (stored) { setLastPayment(stored); if (dismissed === stored) setBannerDismissed(true); }
    } catch { /* noop */ }
  }, []);

  // ─── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    void fetchQuotes();
    void fetch("/api/efi/status")
      .then((r) => r.json())
      .then((d) => setEfiStatus(d as { enabled: boolean; message?: string }))
      .catch(() => setEfiStatus({ enabled: false, message: "Falha ao verificar EFI" }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── SSE — pagamentos em tempo real ──────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/events/pagamentos");
    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { numeroordem?: string };
        const ordem = data?.numeroordem ?? "—";
        const label = `Pedido #${ordem} — ${new Date().toLocaleTimeString("pt-BR")}`;
        showToast(`✅ Pagamento do Pedido #${ordem} confirmado no caixa!`, "success");
        try { localStorage.setItem(LS_LAST_PAYMENT, label); localStorage.removeItem(LS_DISMISSED); } catch { /* noop */ }
        setLastPayment(label);
        setBannerDismissed(false);
        void fetchRef.current?.();
      } catch { /* noop */ }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  async function fetchQuotes() {
    setLoading(true); setErro("");
    try {
      const query = new URLSearchParams({ status: PRODUCTION_STATUSES.join(",") });
      const response = await fetch(`/api/quotes?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any)?.error || "Erro ao buscar produção.");
      }
      const data = (await response.json()) as unknown;
      const newQuotes = Array.isArray(data) ? (data as QuoteRow[]) : Array.isArray((data as any)?.data) ? ((data as any).data as QuoteRow[]) : [];
      setQuotes((prev) => {
        const changedId = newQuotes.find((nq) => prev.some((oq) => oq.id === nq.id && oq.statusKey !== nq.statusKey))?.id ?? null;
        if (changedId) {
          window.setTimeout(() => { setHighlightedId(changedId); window.setTimeout(() => setHighlightedId(null), 3000); }, 0);
        }
        return newQuotes;
      });
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar a produção.");
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchRef.current = fetchQuotes; });

  async function handlePdf(quote: QuoteRow) {
    setPdfLoadingId(quote.id); setErro("");
    try {
      const identifier = getQuoteIdentifier(quote);
      const response = await fetch(`/api/quotes/${encodeURIComponent(identifier)}/pdf`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { publicUrl?: string; error?: string };
      if (!response.ok) throw new Error(data?.error || "Falha ao gerar PDF.");
      if (data.publicUrl) {
        setQuotes((current) => current.map((q) => q.id === quote.id ? { ...q, latestPdfUrl: data.publicUrl ?? q.latestPdfUrl } : q));
        window.open(data.publicUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao gerar PDF.");
    } finally { setPdfLoadingId(null); }
  }

  function dismissBanner() {
    try { if (lastPayment) localStorage.setItem(LS_DISMISSED, lastPayment); } catch { /* noop */ }
    setBannerDismissed(true);
  }

  // ─── Derived ─────────────────────────────────────────────────────────────
  const visibleQuotes = badgeFilter === "TODOS" ? quotes : quotes.filter((q) => {
    const type = getBadgeType(q);
    if (badgeFilter === "PAGO_CAIXA") return type === "PAGO_CAIXA";
    if (badgeFilter === "PIX")        return type === "PIX_CONFIRMADO";
    if (badgeFilter === "AGUARDANDO") return type === "AGUARDANDO";
    return true;
  });

  const badgeCount = (val: "TODOS" | "PAGO_CAIXA" | "PIX" | "AGUARDANDO") =>
    val === "TODOS" ? quotes.length : quotes.filter((q) => {
      const type = getBadgeType(q);
      if (val === "PAGO_CAIXA") return type === "PAGO_CAIXA";
      if (val === "PIX")        return type === "PIX_CONFIRMADO";
      return type === "AGUARDANDO";
    }).length;

  // ─── Render a single kanban card ─────────────────────────────────────────
  function renderKcard(quote: QuoteRow) {
    const customerName = quote.body.cliente?.nome || "Cliente não informado";
    const phone        = quote.body.cliente?.telefone;
    const vendedor     = quote.body.vendedorNome;
    const total        = quote.body.totais?.valor ?? 0;
    const totalBRL     = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const quoteNumber  = quote.body.idorcamento ?? quote.internalNumber;
    const badgeType    = getBadgeType(quote);
    const orderNumber  = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);
    const canOpenPdf   = Boolean(quote.latestPdfUrl);
    const pdfBusy      = pdfLoadingId === quote.id;
    const isHighlighted = highlightedId === quote.id;
    const detailsHref  = `/orcamento/${getQuoteIdentifier(quote)}`;
    const isPaid       = badgeType === "PAGO_CAIXA" || badgeType === "PIX_CONFIRMADO";

    const pillTone  = badgeType === "PAGO_CAIXA" ? "success" : badgeType === "PIX_CONFIRMADO" ? "info" : "warn";
    const pillLabel = badgeType === "PAGO_CAIXA"
      ? `Pago${orderNumber ? ` #${orderNumber}` : ""}`
      : badgeType === "PIX_CONFIRMADO" ? "PIX" : "Aguardando";
    const pillIcon  = badgeType === "PAGO_CAIXA" ? "bi-cash-coin" : badgeType === "PIX_CONFIRMADO" ? "bi-check-circle" : "bi-hourglass-split";

    return (
      <li key={quote.id} className={`bc2-kcard${isPaid ? " is-paid" : ""}${isHighlighted ? " bc2-kcard--hl" : ""}`}>
        <div className="bc2-kcard__top">
          <span className="bc2-kcard__num">#{quoteNumber}</span>
          <span className={`bc2-pill bc2-pill--${pillTone} is-compact`}>
            <i className={`bi ${pillIcon}`} style={{ marginRight: 3 }} />{pillLabel}
          </span>
        </div>

        <div className="bc2-kcard__client">{customerName}</div>

        {(phone || vendedor) && (
          <div className="bc2-kcard__meta">
            {phone   && <span><i className="bi bi-telephone" /> {phone}</span>}
            {vendedor && <span><i className="bi bi-person" /> {vendedor}</span>}
          </div>
        )}

        <div className="bc2-kcard__foot">
          <span className="bc2-kcard__total">{totalBRL}</span>
          <span className="bc2-kcard__date">
            {new Date(quote.updatedAt).toLocaleDateString("pt-BR")}
          </span>
        </div>

        <div className="bc2-kcard__actions">
          {!canOpenPdf ? (
            <button type="button" className="bc2-btn bc2-btn--ghost bc2-btn--sm" onClick={() => void handlePdf(quote)} disabled={pdfBusy}>
              {pdfBusy
                ? <span className="bc2-spin" style={{ width: 12, height: 12, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block" }} />
                : <i className="bi bi-file-earmark-pdf" />}
              {pdfBusy ? " Gerando…" : " PDF"}
            </button>
          ) : (
            <a className="bc2-btn bc2-btn--ghost bc2-btn--sm" href={quote.latestPdfUrl!} target="_blank" rel="noreferrer">
              <i className="bi bi-file-earmark-pdf" /> PDF
            </a>
          )}
          {quote.chatwootConversationUrl && (
            <a className="bc2-btn bc2-btn--sm" style={{ background: "var(--success)", color: "#fff", borderColor: "var(--success)" }} href={quote.chatwootConversationUrl} target="_blank" rel="noreferrer">
              <i className="bi bi-chat" /> Chat
            </a>
          )}
          <a className="bc2-btn bc2-btn--ghost bc2-btn--sm" href={detailsHref}>
            <i className="bi bi-box-arrow-up-right" /> Detalhes
          </a>
        </div>
      </li>
    );
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <div className="bc2-status theme-painel density-compact">
      {/* Bootstrap Icons + JS (for toast API) */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />

      {/* ── Payment banner ── */}
      {lastPayment && !bannerDismissed && (
        <div className="bc2-payment-banner">
          <i className="bi bi-cash-coin" style={{ fontSize: 18 }} />
          <span><strong>Último pagamento:</strong> {lastPayment}</span>
          <button type="button" className="bc2-payment-banner__close" aria-label="Fechar" onClick={dismissBanner}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
      )}

      {/* ── Page header ── */}
      <header className="bc2-status-header">
        <div className="bc2-status-header__inner">
          <div className="bc2-status-header__brand">
            <img src="/media/logo-primary.png" alt="Bom Custo" className="bc2-status-logo" />
            <div>
              <h1 className="bc2-status-title">Painel de Produção</h1>
              <div className="bc2-status-sub">
                <span className="bc2-sse-badge">
                  <i className="bi bi-broadcast" /> Tempo real
                </span>
                Aprovados, em produção e prontos para entrega
              </div>
            </div>
          </div>

          <div className="bc2-status-header__controls">
            {/* Filter pills */}
            <div className="bc2-filters" role="group" aria-label="Filtrar por pagamento">
              {([ ["TODOS","Todos","bi-funnel"], ["PAGO_CAIXA","Pago Caixa","bi-cash-coin"], ["PIX","PIX","bi-lightning-charge"], ["AGUARDANDO","Aguardando","bi-hourglass-split"] ] as const).map(([val, label, icon]) => (
                <button
                  key={val}
                  type="button"
                  className={`bc2-fbtn${badgeFilter === val ? " is-on" : ""}`}
                  onClick={() => setBadgeFilter(val)}
                  aria-pressed={badgeFilter === val}
                >
                  <i className={`bi ${icon}`} style={{ marginRight: 4 }} />{label}
                  <span className="bc2-fbtn__count">{badgeCount(val)}</span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" className="bc2-btn bc2-btn--ghost bc2-btn--sm" onClick={() => void fetchQuotes()} title="Atualizar">
                <i className={`bi bi-arrow-clockwise${loading ? " bc2-spin" : ""}`} />
                <span className="bc2-hide-sm"> Atualizar</span>
              </button>
              <a href="/orcamento/novo#condPagamento" className="bc2-btn bc2-btn--primary bc2-btn--sm">
                <i className="bi bi-plus-circle" /> Novo Orçamento
              </a>
              {efiStatus !== null && (
                <span
                  className={`bc2-pill bc2-pill--${efiStatus.enabled ? "success" : "danger"} is-compact`}
                  title={efiStatus.message ?? ""}
                >
                  EFI {efiStatus.enabled ? "✓" : "✗"}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="bc2-status-body">

        {erro && (
          <div className="bc2-banner bc2-banner--danger" style={{ marginBottom: 16 }}>
            <i className="bi bi-exclamation-triangle-fill" /> {erro}
          </div>
        )}

        {loading ? (
          <div className="bc2-empty" style={{ padding: "60px 0" }}>
            <span className="bc2-spin" style={{ width: 22, height: 22, border: "3px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block", marginBottom: 12 }} />
            <div>Carregando produção...</div>
          </div>
        ) : visibleQuotes.length === 0 ? (
          <div className="bc2-empty" style={{ padding: "60px 0" }}>
            <i className="bi bi-inbox" style={{ fontSize: 32, display: "block", marginBottom: 10, opacity: 0.35 }} />
            Nenhum orçamento no fluxo de produção no momento.
          </div>
        ) : (
          <>
            {/* Mobile: column tabs */}
            <div className="bc2-status-tabs">
              {COLUMN_CONFIG.map((col) => {
                const count = visibleQuotes.filter((q) => q.statusKey === col.key).length;
                return (
                  <button
                    key={col.key}
                    type="button"
                    className={`bc2-tab-btn${activeMobileTab === col.key ? " is-active" : ""}`}
                    onClick={() => setActiveMobileTab(col.key)}
                  >
                    <i className={`bi ${col.icon}`} /> {col.shortLabel}
                    <span className="bc2-tab-count">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Mobile: single active column */}
            <div className="bc2-status-mobile-col">
              <ul className="bc2-kcol__list">
                {visibleQuotes.filter((q) => q.statusKey === activeMobileTab).length === 0
                  ? <li className="bc2-kcol__empty">Sem orçamentos nesta coluna.</li>
                  : visibleQuotes.filter((q) => q.statusKey === activeMobileTab).map((q) => renderKcard(q))}
              </ul>
            </div>

            {/* Desktop: 3-column kanban */}
            <div className="bc2-kanban bc2-status-kanban">
              {COLUMN_CONFIG.map((col) => {
                const colQuotes = visibleQuotes.filter((q) => q.statusKey === col.key);
                return (
                  <div key={col.key} className="bc2-kcol">
                    <header className={`bc2-kcol__head bc2-kcol__head--${col.tone}`}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <i className={`bi ${col.icon}`} />{col.label}
                      </span>
                      <span className="bc2-kcol__count">{colQuotes.length}</span>
                    </header>
                    <ul className="bc2-kcol__list">
                      {colQuotes.length === 0
                        ? <li className="bc2-kcol__empty">Vazio.</li>
                        : colQuotes.map((q) => renderKcard(q))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Toast container (Bootstrap) */}
      <div id="toast-container" className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1100 }} />

      <style>{`
        /* ── bc2 Status Page / Painel theme ── */
        * { box-sizing: border-box; }

        :root {
          --font-body:    var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-display: var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-mono:    'JetBrains Mono', ui-monospace, monospace;
          --bg: #f5f7fa; --surface: #ffffff; --surface-2: #f8fafc; --surface-3: #eef2f7;
          --ink: #0b1220; --ink-soft: #5b6b80; --ink-faint: #9aa7b8;
          --line: #e4e9f0; --line-soft: #eef2f6;
          --accent: #0e6d73; --accent-fg: #ffffff; --accent-soft: #d6ebed;
          --success: #128a3a; --success-bg: #defce9;
          --warn: #a36500; --warn-bg: #fbecd0;
          --info: #0e6d73; --info-bg: #d8eef0;
          --danger: #c2362c; --danger-bg: #fbe3df;
          --amber: #9a5a1a; --amber-bg: #f8e7cf;
          --neutral: #475569; --neutral-bg: #e2e8f0;
          --radius: 10px; --radius-sm: 6px;
          --shadow-card: 0 1px 0 rgba(11,18,32,.02), 0 1px 3px rgba(11,18,32,.06);
          --gap-2: 8px; --gap-3: 12px; --gap-4: 16px;
        }
        .theme-painel {
          --font-body: var(--font-mulish,'Mulish',system-ui,sans-serif);
          --font-display: var(--font-mulish,'Mulish',system-ui,sans-serif);
        }

        /* Page shell */
        .bc2-status {
          min-height: 100vh;
          background: var(--bg);
          font-family: var(--font-body);
          font-size: 14px;
          color: var(--ink);
          -webkit-font-smoothing: antialiased;
        }
        .bc2-status button { font-family: inherit; }
        .bc2-status a { color: var(--accent); text-decoration: none; }
        .bc2-status a:hover { text-decoration: underline; text-underline-offset: 3px; }

        /* Payment banner */
        .bc2-payment-banner {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 20px;
          background: var(--success); color: #fff;
          font: 600 13px/1.3 var(--font-body);
        }
        .bc2-payment-banner__close {
          margin-left: auto; background: transparent; border: none;
          color: rgba(255,255,255,.75); cursor: pointer; padding: 2px 4px;
          font-size: 14px; line-height: 1;
        }
        .bc2-payment-banner__close:hover { color: #fff; }

        /* Header */
        .bc2-status-header {
          background: linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%);
          padding: 0 20px;
          border-bottom: 1px solid rgba(0,0,0,.06);
        }
        .bc2-status-header__inner {
          max-width: 1280px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px; padding: 14px 0; flex-wrap: wrap; row-gap: 10px;
        }
        .bc2-status-header__brand {
          display: flex; align-items: center; gap: 12px;
        }
        .bc2-status-logo {
          width: 52px; height: 52px; object-fit: contain;
          background: #fff; border-radius: 10px; padding: 5px;
          box-shadow: var(--shadow-card);
        }
        .bc2-status-title {
          margin: 0; font: 800 22px/1.1 var(--font-display); color: var(--ink); letter-spacing: -.02em;
        }
        .bc2-status-sub {
          margin: 4px 0 0; font: 500 12.5px/1.4 var(--font-body); color: var(--ink-soft);
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .bc2-sse-badge {
          display: inline-flex; align-items: center; gap: 5px;
          font: 700 10.5px/1 var(--font-body); color: var(--success);
          background: var(--success-bg); padding: 3px 8px; border-radius: 999px;
          animation: bc2-pulse 2.5s ease-in-out infinite;
        }
        @keyframes bc2-pulse { 0%,100%{opacity:1} 50%{opacity:.65} }

        .bc2-status-header__controls {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        }

        /* Filters */
        .bc2-filters { display: flex; flex-wrap: wrap; gap: 3px; }
        .bc2-fbtn {
          background: rgba(255,255,255,.6); border: 1px solid rgba(0,0,0,.08); color: var(--ink-soft);
          padding: 6px 11px; border-radius: 999px;
          font: 600 12px/1 var(--font-body); cursor: pointer;
          display: inline-flex; align-items: center; gap: 5px;
          transition: background .1s;
        }
        .bc2-fbtn:hover { background: rgba(255,255,255,.9); color: var(--ink); }
        .bc2-fbtn.is-on { background: var(--ink); color: #fff; border-color: var(--ink); }
        .bc2-fbtn__count { font: 700 10px/1 var(--font-body); background: rgba(0,0,0,.06); color: inherit; padding: 2px 6px; border-radius: 999px; }
        .bc2-fbtn.is-on .bc2-fbtn__count { background: rgba(255,255,255,.18); }

        /* Buttons */
        .bc2-btn { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 700 12.5px/1 var(--font-body); padding: 7px 11px; border-radius: 8px; cursor: pointer; text-decoration: none; white-space: nowrap; transition: background .1s; }
        .bc2-btn:hover { background: var(--surface-2); text-decoration: none; }
        .bc2-btn--primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
        .bc2-btn--primary:hover { background: #0a5358; color: #fff; border-color: #0a5358; }
        .bc2-btn--ghost { background: transparent; color: var(--ink-soft); border-color: var(--line); }
        .bc2-btn--ghost:hover { color: var(--ink); border-color: var(--ink-soft); }
        .bc2-btn--sm { font-size: 12px; padding: 5px 9px; }

        /* Body */
        .bc2-status-body {
          max-width: 1280px; margin: 0 auto; padding: 20px 20px 40px;
        }

        /* Mobile tabs */
        .bc2-status-tabs {
          display: none; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;
        }
        .bc2-tab-btn {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft);
          padding: 8px 14px; border-radius: 8px; font: 600 12.5px/1 var(--font-body); cursor: pointer;
          flex: 1 1 0;
          justify-content: center;
        }
        .bc2-tab-btn.is-active { background: var(--ink); color: #fff; border-color: var(--ink); }
        .bc2-tab-count { font: 700 10.5px/1 var(--font-body); background: rgba(0,0,0,.07); color: inherit; padding: 2px 7px; border-radius: 999px; }
        .bc2-tab-btn.is-active .bc2-tab-count { background: rgba(255,255,255,.18); }
        .bc2-status-mobile-col { display: none; }

        /* Kanban */
        .bc2-status-kanban { display: grid; gap: var(--gap-3); grid-template-columns: repeat(3, minmax(0,1fr)); align-items: start; }
        .bc2-kanban { }
        .bc2-kcol {
          background: var(--surface-2); border: 1px solid var(--line);
          border-radius: var(--radius); display: flex; flex-direction: column; min-height: 320px;
        }
        .bc2-kcol__head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 11px 14px; border-bottom: 1px solid var(--line);
          font: 700 11px/1 var(--font-body); text-transform: uppercase; letter-spacing: .06em;
          border-radius: var(--radius) var(--radius) 0 0;
        }
        .bc2-kcol__head--success { color: var(--success); background: var(--success-bg); border-bottom-color: rgba(18,138,58,.15); }
        .bc2-kcol__head--info    { color: var(--info);    background: var(--info-bg);    border-bottom-color: rgba(14,109,115,.15); }
        .bc2-kcol__head--amber   { color: var(--amber);   background: var(--amber-bg);   border-bottom-color: rgba(154,90,26,.15); }
        .bc2-kcol__count { background: var(--surface); color: var(--ink-soft); padding: 3px 8px; border-radius: 999px; font: 700 11px/1 var(--font-body); border: 1px solid var(--line); }
        .bc2-kcol__list { list-style: none; padding: 10px; margin: 0; display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .bc2-kcol__empty { color: var(--ink-faint); font: 500 12px/1.4 var(--font-body); padding: 20px; text-align: center; font-style: italic; }

        /* Kanban cards */
        .bc2-kcard {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: calc(var(--radius) - 2px);
          padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
          transition: border-color .1s, box-shadow .1s;
        }
        .bc2-kcard:hover { border-color: var(--ink-soft); box-shadow: 0 4px 12px rgba(11,18,32,.06); }
        .bc2-kcard.is-paid { border-left: 3px solid var(--success); background: linear-gradient(to right, #effaf3, var(--surface) 50%); }
        .bc2-kcard--hl { animation: bc2-hl 3s ease-out; }
        @keyframes bc2-hl {
          0%,60% { box-shadow: 0 0 0 3px #34d399; background: #d1fae5; }
          100%    { box-shadow: none; background: var(--surface); }
        }
        .bc2-kcard__top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
        .bc2-kcard__num { font: 700 11px/1 var(--font-mono); color: var(--ink-soft); }
        .bc2-kcard__client { font: 700 13.5px/1.2 var(--font-body); color: var(--ink); letter-spacing: -.005em; }
        .bc2-kcard__meta { display: flex; gap: 10px; font: 500 11px/1 var(--font-body); color: var(--ink-soft); flex-wrap: wrap; }
        .bc2-kcard__meta i { margin-right: 3px; }
        .bc2-kcard__foot { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px dashed var(--line-soft); padding-top: 6px; margin-top: 2px; }
        .bc2-kcard__total { font: 700 13px/1 var(--font-body); color: var(--ink); }
        .bc2-kcard__date  { font: 500 11px/1 var(--font-body); color: var(--ink-faint); }
        .bc2-kcard__actions { display: flex; gap: 5px; flex-wrap: wrap; }

        /* Pills */
        .bc2-pill { display: inline-flex; align-items: center; gap: 4px; font: 700 11px/1 var(--font-body); padding: 4px 8px; border-radius: 6px; border: 1px solid transparent; }
        .bc2-pill.is-compact { padding: 3px 7px; font-size: 10.5px; }
        .bc2-pill--success { color: #128a3a; background: #defce9; }
        .bc2-pill--warn    { color: #a36500; background: #fbecd0; }
        .bc2-pill--info    { color: #0e6d73; background: #d8eef0; }
        .bc2-pill--danger  { color: #c2362c; background: #fbe3df; }
        .bc2-pill--neutral { color: #475569; background: #e2e8f0; }

        /* Banner */
        .bc2-banner { display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; border-radius: var(--radius); font: 500 13px/1.4 var(--font-body); }
        .bc2-banner--danger  { background: var(--danger-bg);  color: var(--danger);  }
        .bc2-banner--success { background: var(--success-bg); color: var(--success); }

        /* Utilities */
        .bc2-empty { text-align: center; color: var(--ink-soft); padding: 40px 0; font: 500 13px/1.5 var(--font-body); }
        @keyframes bc2-spin { to { transform: rotate(360deg); } }
        .bc2-spin { animation: bc2-spin .7s linear infinite; display: inline-block; }

        /* Responsive */
        @media (max-width: 820px) {
          .bc2-status-kanban { display: none; }
          .bc2-status-tabs, .bc2-status-mobile-col { display: flex; }
          .bc2-status-mobile-col { flex-direction: column; }
          .bc2-status-header__inner { flex-direction: column; align-items: flex-start; }
          .bc2-status-header__controls { width: 100%; flex-wrap: wrap; }
          .bc2-filters { width: 100%; }
          .bc2-fbtn { flex: 1 1 calc(50% - 4px); justify-content: center; }
        }
        @media (max-width: 480px) {
          .bc2-status-body { padding: 14px 14px 32px; }
          .bc2-status-header { padding: 0 14px; }
          .bc2-hide-sm { display: none; }
        }
      `}</style>
    </div>
  );
}
