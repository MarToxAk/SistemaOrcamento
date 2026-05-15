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
    cliente?: {
      nome?: string | null;
      telefone?: string | null;
    };
    vendedorNome?: string | null;
    totais?: {
      valor?: number;
    };
  };
};

const PRODUCTION_STATUSES = ["APROVADO", "EM_PRODUCAO", "PRONTO_PARA_ENTREGA"];
const LS_LAST_PAYMENT = "bomcusto_last_caixa_payment";
const LS_DISMISSED = "bomcusto_last_caixa_dismissed";

function getQuoteIdentifier(quote: QuoteRow): string {
  if (quote.body.idorcamento && Number.isFinite(quote.body.idorcamento)) {
    return String(Math.trunc(quote.body.idorcamento));
  }
  if (quote.internalNumber && Number.isFinite(quote.internalNumber)) {
    return String(Math.trunc(quote.internalNumber));
  }
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
  wrapper.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
    </div>
  `;
  container.appendChild(wrapper);
  const toast = new bs.Toast(wrapper, { delay: 4000 });
  toast.show();
  wrapper.addEventListener("hidden.bs.toast", () => wrapper.remove());
}

export default function StatusPage() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("TODOS");
  const [selectedBadgeFilter, setSelectedBadgeFilter] = useState<string>("TODOS");
  const [onlyWithBadge, setOnlyWithBadge] = useState<boolean>(false);
  const [efiStatus, setEfiStatus] = useState<{ enabled: boolean; message?: string } | null>(null);
  const [lastPayment, setLastPayment] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<string>("APROVADO");
  const fetchRef = useRef<(() => Promise<void>) | null>(null);

  function getBadgeType(quote: QuoteRow): string {
    const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);
    const paidInCashier = quote.paidInCashier ?? Boolean(orderNumber);
    if (paidInCashier) return "PAGO_CAIXA";
    if (quote.paymentConfirmedAt) return "PIX_CONFIRMADO";
    return "AGUARDANDO";
  }

  function hasBadge(quote: QuoteRow): boolean {
    const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);
    const paidInCashier = quote.paidInCashier ?? Boolean(orderNumber);
    return paidInCashier || Boolean(quote.paymentConfirmedAt);
  }

  // Banner persistente do localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_LAST_PAYMENT);
      const dismissed = localStorage.getItem(LS_DISMISSED);
      if (stored) {
        setLastPayment(stored);
        if (dismissed === stored) setBannerDismissed(true);
      }
    } catch { /* noop */ }
  }, []);

  // Carga inicial
  useEffect(() => {
    void fetchQuotes();
    void fetch("/api/efi/status")
      .then((r) => r.json())
      .then((d) => setEfiStatus(d as { enabled: boolean; message?: string }))
      .catch(() => setEfiStatus({ enabled: false, message: "Falha ao verificar EFI" }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE — pagamentos em tempo real
  useEffect(() => {
    const es = new EventSource("/api/events/pagamentos");
    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { numeroordem?: string };
        const ordem = data?.numeroordem ?? "—";
        const label = `Pedido #${ordem} — ${new Date().toLocaleTimeString("pt-BR")}`;
        showToast(`✅ Pagamento do Pedido #${ordem} confirmado no caixa!`, "success");
        try {
          localStorage.setItem(LS_LAST_PAYMENT, label);
          localStorage.removeItem(LS_DISMISSED);
        } catch { /* noop */ }
        setLastPayment(label);
        setBannerDismissed(false);
        void fetchRef.current?.();
      } catch { /* noop */ }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  async function fetchQuotes() {
    setLoading(true);
    setErro("");
    try {
      const query = new URLSearchParams({ status: PRODUCTION_STATUSES.join(",") });
      const response = await fetch(`/api/quotes?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any)?.error || "Erro ao buscar produção.");
      }
      const data = (await response.json()) as unknown;
      const newQuotes = Array.isArray(data)
        ? (data as QuoteRow[])
        : Array.isArray((data as any)?.data)
          ? ((data as any).data as QuoteRow[])
          : [];
      setQuotes((prev) => {
        const changedId = newQuotes.find((nq) => prev.some((oq) => oq.id === nq.id && oq.statusKey !== nq.statusKey))?.id ?? null;
        if (changedId) {
          window.setTimeout(() => {
            setHighlightedId(changedId);
            window.setTimeout(() => setHighlightedId(null), 3000);
          }, 0);
        }
        return newQuotes;
      });
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar a produção.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRef.current = fetchQuotes; });

  const visibleQuotes = quotes;


  async function handlePdf(quote: QuoteRow) {
    setPdfLoadingId(quote.id);
    setErro("");
    try {
      const identifier = getQuoteIdentifier(quote);
      const response = await fetch(`/api/quotes/${encodeURIComponent(identifier)}/pdf`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { publicUrl?: string; error?: string };
      if (!response.ok) throw new Error(data?.error || "Falha ao gerar PDF.");
      if (data.publicUrl) {
        setQuotes((current) =>
          current.map((q) => q.id === quote.id ? { ...q, latestPdfUrl: data.publicUrl ?? q.latestPdfUrl } : q)
        );
        window.open(data.publicUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao gerar PDF.");
    } finally {
      setPdfLoadingId(null);
    }
  }

  function dismissBanner() {
    try { if (lastPayment) localStorage.setItem(LS_DISMISSED, lastPayment); } catch { /* noop */ }
    setBannerDismissed(true);
  }

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />

      {/* Banner persistente */}
      {lastPayment && !bannerDismissed && (
        <div className="alert alert-success alert-dismissible d-flex align-items-center gap-2 mb-0 rounded-0 py-2 px-3" role="alert">
          <i className="bi bi-cash-coin fs-5" />
          <span><strong>Último pagamento no caixa:</strong> {lastPayment}</span>
          <button type="button" className="btn-close ms-auto" aria-label="Fechar" onClick={dismissBanner} />
        </div>
      )}

      <div className="container my-4">
        <div className="orcamento-header d-flex align-items-center justify-content-between flex-wrap gap-3 p-3 rounded-top">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <img src="/media/logo_new.svg" alt="Logo Bom Custo" className="logo-img" />
            <div>
              <h3 className="mb-1">Produção de Orçamentos</h3>
              <div className="small d-flex align-items-center gap-2">
                <span className="badge bg-success-subtle text-success-emphasis">
                  <i className="bi bi-broadcast me-1" />Tempo real
                </span>
                <span>Aprovados, em produção e prontos para entrega.</span>
              </div>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void fetchQuotes()} title="Atualizar lista">
              <i className="bi bi-arrow-clockwise me-1" />Atualizar
            </button>
            <a href="/orcamento/novo#condPagamento" className="btn btn-sm btn-success">
              <i className="bi bi-plus-circle me-1" />Novo Orçamento
            </a>
            <div className="text-end">
              <div className="small">{visibleQuotes.length}/{quotes.length} orçamento(s)</div>
              {efiStatus !== null && (
                <span className={`badge ${efiStatus.enabled ? "bg-success" : "bg-danger"}`} title={efiStatus.message ?? ""}>
                  EFI: {efiStatus.enabled ? "✓" : "✗"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
          {erro ? <div className="alert alert-danger mb-4">{erro}</div> : null}

          {loading ? (
            <div className="text-center py-5 text-muted">
              <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Carregando produção...
            </div>
          ) : visibleQuotes.length === 0 ? (
            <div className="alert alert-info mb-0">
              <i className="bi bi-info-circle me-2" />
              {"Nenhum orçamento no fluxo de produção no momento."}
            </div>
          ) : (
            <>
            <div className="kanban-mobile d-md-none">
              <ul className="nav nav-tabs nav-fill mb-3" role="tablist">
                {PRODUCTION_STATUSES.map((statusKey) => {
                  const count = visibleQuotes.filter((q) => q.statusKey === statusKey).length;
                  const label =
                    statusKey === "APROVADO" ? "APROVADO" :
                    statusKey === "EM_PRODUCAO" ? "EM PRODUÇÃO" :
                    "PRONTO";
                  return (
                    <li className="nav-item" key={statusKey} role="presentation">
                      <button
                        type="button"
                        className={`nav-link ${activeMobileTab === statusKey ? "active" : ""}`}
                        onClick={() => setActiveMobileTab(statusKey)}
                        role="tab"
                        aria-selected={activeMobileTab === statusKey}
                      >
                        {label} <span className="badge bg-secondary ms-1">{count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className={`kanban-column kanban-column-${activeMobileTab.toLowerCase()}`}>
                <div className="kanban-column-body">
                  {visibleQuotes.filter((q) => q.statusKey === activeMobileTab).length === 0 ? (
                    <div className="kanban-column-empty text-muted small">Sem orçamentos</div>
                  ) : (
                    visibleQuotes
                      .filter((q) => q.statusKey === activeMobileTab)
                      .map((quote) => (
                        <div
                          key={quote.id}
                          className={`kanban-card-placeholder ${highlightedId === quote.id ? "card-highlighted" : ""}`}
                        >
                          #{quote.body.idorcamento ?? quote.internalNumber}
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
            <div className="kanban-board d-none d-md-flex gap-3">
              {PRODUCTION_STATUSES.map((statusKey) => {
                const columnQuotes = visibleQuotes.filter((q) => q.statusKey === statusKey);
                const columnLabel =
                  statusKey === "APROVADO" ? "APROVADO" :
                  statusKey === "EM_PRODUCAO" ? "EM PRODUÇÃO" :
                  "PRONTO PARA ENTREGA";
                return (
                  <div key={statusKey} className={`kanban-column kanban-column-${statusKey.toLowerCase()}`}>
                    <div className={`kanban-column-header status-${statusKey.toLowerCase()}`}>
                      <span className="kanban-column-title">{columnLabel}</span>
                      <span className="kanban-column-count">{columnQuotes.length}</span>
                    </div>
                    <div className="kanban-column-body">
                      {columnQuotes.length === 0 ? (
                        <div className="kanban-column-empty text-muted small">Sem orçamentos</div>
                      ) : (
                        columnQuotes.map((quote) => (
                          <div
                            key={quote.id}
                            className={`kanban-card-placeholder ${highlightedId === quote.id ? "card-highlighted" : ""}`}
                          >
                            #{quote.body.idorcamento ?? quote.internalNumber}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      </div>

      <div id="toast-container" className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1100 }} />

      <style>{`
        body { background: #f7f1e3; font-size: 1.02rem; }
        .orcamento-header {
          background: linear-gradient(135deg, #c5f2e8 0%, #cbe1f9 25%, #e7d8f9 50%, #f9e7f5 75%, #f0cacb 100%);
          color: #222;
          border-radius: 8px 8px 0 0;
        }
        .orcamento-section { border-radius: 0 0 8px 8px; }
        .logo-img { max-width: 140px; max-height: 88px; background: #fff; border-radius: 8px; padding: 6px; }
        .status-pill {
          display: inline-flex; width: fit-content;
          border-radius: 999px; padding: 0.3rem 0.75rem;
          font-weight: 600; font-size: 0.88rem;
        }
        .status-aprovado { background: #e9f8ef; color: #1f7a44; }
        .status-em_producao { background: #eef4ff; color: #2457a6; }
        .status-pronto_para_entrega { background: #fff5e8; color: #a65b12; }
        .status-entregue { background: #ececec; color: #444; }
        .status-cancelado { background: #fdecec; color: #b42318; }
        .action-list { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
        .kanban-board { align-items: flex-start; }
        .kanban-column {
          flex: 1 1 0;
          min-width: 0;
          background: #f8f9fa;
          border-radius: 8px;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .kanban-column-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          font-weight: 700;
          font-size: 0.95rem;
        }
        .kanban-column-title { letter-spacing: 0.02em; }
        .kanban-column-count {
          background: rgba(0,0,0,0.08);
          border-radius: 999px;
          padding: 0.1rem 0.6rem;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .kanban-column-body { display: flex; flex-direction: column; gap: 0.5rem; }
        .kanban-column-empty { padding: 1rem 0.5rem; text-align: center; font-style: italic; }
        .kanban-card-placeholder {
          background: #fff;
          border-radius: 6px;
          padding: 0.75rem;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          font-weight: 600;
        }
        .card-highlighted { animation: highlight-pulse 3s ease-out; }
        @keyframes highlight-pulse {
          0%   { box-shadow: 0 0 0 4px #34d399, 0 1px 4px rgba(0,0,0,0.08); background: #d1fae5; }
          60%  { box-shadow: 0 0 0 4px #34d399, 0 1px 4px rgba(0,0,0,0.08); background: #d1fae5; }
          100% { box-shadow: 0 1px 4px rgba(0,0,0,0.08); background: #fff; }
        }
        @media (max-width: 768px) {
          .container { padding-inline: 1rem; }
          .kanban-column { padding: 0.5rem; }
        }
      `}</style>
    </>
  );
}
