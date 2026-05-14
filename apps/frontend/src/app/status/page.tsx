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
    conversationId?: number;
    chatwootContactId?: number;
  };
};

const PRODUCTION_STATUSES = ["APROVADO", "EM_PRODUCAO", "PRONTO_PARA_ENTREGA"];
const LS_LAST_PAYMENT = "bomcusto_last_caixa_payment";
const LS_DISMISSED = "bomcusto_last_caixa_dismissed";

function parseMaybeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function normalizeChatwootPayload(raw: Record<string, any>) {
  const dataObj = parseObjectMaybe(raw.data) ?? parseObjectMaybe(raw.payload) ?? raw;
  const nestedDataObj = parseObjectMaybe(dataObj?.data) ?? dataObj;
  const conversation =
    nestedDataObj?.conversation ??
    dataObj?.conversation ??
    nestedDataObj?.meta?.conversation ??
    raw?.conversation ??
    {};
  return { conversation };
}

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
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<"checking" | "valid" | "invalid">("checking");
  const [validationMessage, setValidationMessage] = useState("");
  const [efiStatus, setEfiStatus] = useState<{ enabled: boolean; message?: string } | null>(null);
  const [lastPayment, setLastPayment] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const fetchRef = useRef<(() => Promise<void>) | null>(null);

  // Carregar banner persistente do localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_LAST_PAYMENT);
      const dismissed = localStorage.getItem(LS_DISMISSED);
      if (stored) {
        setLastPayment(stored);
        if (dismissed === stored) setBannerDismissed(true);
      }
    } catch {
      // noop
    }
  }, []);

  // Validação Chatwoot
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

    const handleMessage = (event: MessageEvent) => {
      const payload = parseIncomingMessagePayload(event.data);
      if (!payload) return;
      const { conversation } = normalizeChatwootPayload(payload);
      if (parseMaybeNumber(conversation?.id) !== undefined) {
        validated = true;
        setValidationState("valid");
        setValidationMessage("");
      }
    };

    const requestChatwootInfo = () => {
      try {
        window.parent?.postMessage("chatwoot-dashboard-app:fetch-info", "*");
        window.parent?.postMessage({ event: "chatwoot-dashboard-app:fetch-info" }, "*");
      } catch {
        // noop
      }
    };

    window.addEventListener("message", handleMessage);
    requestChatwootInfo();
    const retryId = window.setTimeout(() => requestChatwootInfo(), 1200);
    const validationTimeout = window.setTimeout(() => {
      const isInIframe = window.parent !== window;
      if (!isInIframe) {
        setValidationMessage("Esta página deve ser acessada através do Chatwoot");
        setValidationState("invalid");
        return;
      }
      if (!validated) {
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

  // Carregar dados e status EFI
  useEffect(() => {
    if (validationState === "valid") {
      void fetchQuotes();
      void fetch("/api/efi/status")
        .then((r) => r.json())
        .then((d) => setEfiStatus(d as { enabled: boolean; message?: string }))
        .catch(() => setEfiStatus({ enabled: false, message: "Falha ao verificar EFI" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationState]);

  // SSE — pagamentos em tempo real
  useEffect(() => {
    if (validationState !== "valid") return;
    const es = new EventSource("/api/events/pagamentos");
    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { numeroordem?: string };
        const ordem = data?.numeroordem ?? "—";
        const label = `Pedido #${ordem} — ${new Date().toLocaleTimeString("pt-BR")}`;
        showToast(`✅ Pagamento do Pedido #${ordem} confirmado no caixa!`, "success");
        // Persiste banner
        try {
          localStorage.setItem(LS_LAST_PAYMENT, label);
          localStorage.removeItem(LS_DISMISSED);
        } catch { /* noop */ }
        setLastPayment(label);
        setBannerDismissed(false);
        // Atualiza lista
        void fetchRef.current?.();
      } catch {
        // noop
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [validationState]);

  async function fetchQuotes() {
    setLoading(true);
    setErro("");
    try {
      // Dashboard global — sem filtro por conversa/contato
      const query = new URLSearchParams({ status: PRODUCTION_STATUSES.join(",") });
      const response = await fetch(`/api/quotes?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Erro ao buscar produção.");
      }
      const data = (await response.json()) as unknown;
      const newQuotes = Array.isArray(data) ? (data as QuoteRow[]) : [];
      // Detecta mudança de status para highlight (fora do updater para evitar side-effect)
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

  // Mantém ref sempre atualizada para o SSE usar
  useEffect(() => {
    fetchRef.current = fetchQuotes;
  });

  async function handleStatusChange(quote: QuoteRow, nextStatus: string) {
    setStatusSavingId(quote.id);
    setErro("");
    try {
      const identifier = getQuoteIdentifier(quote);
      const response = await fetch(`/api/quotes/${encodeURIComponent(identifier)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus: nextStatus, changedBy: "Painel de producao" }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<QuoteRow> & { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Não foi possível atualizar o status.");
      }
      const updated = data as QuoteRow;
      setQuotes((current) => {
        if (!PRODUCTION_STATUSES.includes(updated.statusKey)) {
          return current.filter((q) => q.id !== quote.id);
        }
        return current.map((q) => (q.id === quote.id ? updated : q));
      });
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao atualizar status.");
    } finally {
      setStatusSavingId(null);
    }
  }

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
          current.map((q) =>
            q.id === quote.id ? { ...q, latestPdfUrl: data.publicUrl ?? q.latestPdfUrl } : q
          )
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
    try {
      if (lastPayment) localStorage.setItem(LS_DISMISSED, lastPayment);
    } catch { /* noop */ }
    setBannerDismissed(true);
  }

  const newQuoteHref = (() => {
    if (typeof window === "undefined") return "/orcamento/novo#condPagamento";
    const q = window.location.search.replace(/^\?/, "");
    return q ? `/orcamento/novo?${q}#condPagamento` : "/orcamento/novo#condPagamento";
  })();

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />

      {/* Banner persistente de último pagamento no caixa */}
      {lastPayment && !bannerDismissed && (
        <div className="alert alert-success alert-dismissible d-flex align-items-center gap-2 mb-0 rounded-0 py-2 px-3" role="alert" style={{ borderRadius: 0 }}>
          <i className="bi bi-cash-coin fs-5" />
          <span><strong>Último pagamento no caixa:</strong> {lastPayment}</span>
          <button type="button" className="btn-close ms-auto" aria-label="Fechar" onClick={dismissBanner} />
        </div>
      )}

      {validationState === "checking" && (
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
      )}

      {validationState === "invalid" && (
        <div className="container my-5">
          <div className="row justify-content-center">
            <div className="col-md-6">
              <div className="alert alert-danger d-flex gap-2 align-items-start" role="alert">
                <i className="bi bi-exclamation-triangle-fill mt-1" style={{fontSize: "1.25rem"}}></i>
                <div>
                  <h5 className="alert-heading mb-2">Acesso Restrito</h5>
                  <p className="mb-0">Esta página só pode ser acessada através do <strong>Chatwoot Dashboard</strong>.</p>
                  <hr className="my-2" />
                  <p className="mb-0 small text-muted">{validationMessage || "Por favor, volte ao Chatwoot e clique na opção de produção novamente."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {validationState === "valid" && (
        <div className="container my-5">
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
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => void fetchQuotes()}
                title="Atualizar lista"
              >
                <i className="bi bi-arrow-clockwise me-1" />Atualizar
              </button>
              <a href={newQuoteHref} className="btn btn-sm btn-success">
                <i className="bi bi-plus-circle me-1" />Novo Orçamento
              </a>
              <div className="text-end">
                <div className="small">{quotes.length} orçamento(s)</div>
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
            ) : quotes.length === 0 ? (
              <div className="alert alert-info mb-0">Nenhum orçamento no fluxo de produção.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle production-table">
                  <thead>
                    <tr>
                      <th>Orçamento</th>
                      <th>Cliente</th>
                      <th>Vendedor</th>
                      <th>Total</th>
                      <th>Atualizado</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((quote) => {
                      const customerName = quote.body.cliente?.nome || "Cliente não informado";
                      const total = quote.body.totais?.valor ?? 0;
                      const quoteNumber = quote.body.idorcamento ?? quote.internalNumber;
                      const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);
                      const paidInCashier = quote.paidInCashier ?? Boolean(orderNumber);
                      const canOpenPdf = Boolean(quote.latestPdfUrl);
                      const statusBusy = statusSavingId === quote.id;
                      const pdfBusy = pdfLoadingId === quote.id;
                      const isHighlighted = highlightedId === quote.id;

                      return (
                        <tr key={quote.id} className={isHighlighted ? "row-highlighted" : ""}>
                          <td>
                            <div className="fw-semibold">#{quoteNumber}</div>
                            {paidInCashier ? (
                              <div className="mt-1">
                                <span className="badge bg-success">
                                  <i className="bi bi-cash-coin me-1" />Pago no Caixa {orderNumber ? `#${orderNumber}` : ""}
                                </span>
                              </div>
                            ) : (
                              <div className="mt-1">
                                <span className={`badge ${quote.paymentConfirmedAt ? "bg-primary" : "bg-warning text-dark"}`}>
                                  {quote.paymentConfirmedAt ? "PIX Confirmado" : "Aguardando pagamento"}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="fw-semibold">{customerName}</div>
                            <div className="text-muted small">{quote.body.cliente?.telefone || "Sem telefone"}</div>
                          </td>
                          <td>{quote.body.vendedorNome || "—"}</td>
                          <td>{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td><span className="small">{new Date(quote.updatedAt).toLocaleString("pt-BR")}</span></td>
                          <td>
                            <div className="d-flex flex-column gap-2">
                              <span className={`status-pill status-${quote.statusKey.toLowerCase()}`}>{quote.statusLabel}</span>
                              {quote.availableNextStatuses.length > 0 && (
                                <select
                                  className="form-select form-select-sm"
                                  value=""
                                  disabled={statusBusy}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    e.target.value = "";
                                    if (v) void handleStatusChange(quote, v);
                                  }}
                                >
                                  <option value="">{statusBusy ? "Salvando..." : "Alterar status"}</option>
                                  {quote.availableNextStatuses.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="action-list">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => void handlePdf(quote)}
                                disabled={pdfBusy}
                              >
                                {pdfBusy ? "Gerando..." : canOpenPdf ? "Atualizar PDF" : "Gerar PDF"}
                              </button>
                              {quote.latestPdfUrl && (
                                <a className="btn btn-sm btn-outline-dark" href={quote.latestPdfUrl} target="_blank" rel="noreferrer">
                                  Abrir PDF
                                </a>
                              )}
                              {quote.chatwootConversationUrl ? (
                                <a className="btn btn-sm btn-success" href={quote.chatwootConversationUrl} target="_blank" rel="noreferrer">
                                  <i className="bi bi-chat me-1" />Chatwoot
                                </a>
                              ) : (
                                <span className="text-muted small">Sem conversa</span>
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
          </div>
        </div>
      )}

      {/* Toast container */}
      <div id="toast-container" className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1100 }} />

      <style>{`
        body { background: #f7f1e3; font-size: 1.02rem; }
        .orcamento-header {
          background: linear-gradient(135deg, #c5f2e8 0%, #cbe1f9 25%, #e7d8f9 50%, #f9e7f5 75%, #f0cacb 100%);
          color: #222;
          border-radius: 8px 8px 0 0;
        }
        .orcamento-section { box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-radius: 0 0 8px 8px; }
        .logo-img { max-width: 140px; max-height: 88px; background: #fff; border-radius: 8px; padding: 6px; }
        .production-table th { background: #f9e7f5; color: #222; white-space: nowrap; }
        .status-pill {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          padding: 0.3rem 0.75rem;
          font-weight: 600;
          font-size: 0.88rem;
        }
        .status-aprovado { background: #e9f8ef; color: #1f7a44; }
        .status-em_producao { background: #eef4ff; color: #2457a6; }
        .status-pronto_para_entrega { background: #fff5e8; color: #a65b12; }
        .status-entregue { background: #ececec; color: #444; }
        .status-cancelado { background: #fdecec; color: #b42318; }
        .action-list { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
        .row-highlighted { animation: highlight-pulse 3s ease-out; }
        @keyframes highlight-pulse {
          0%   { background-color: #d1fae5; }
          60%  { background-color: #d1fae5; }
          100% { background-color: transparent; }
        }
        @media (max-width: 768px) {
          .container { padding-inline: 1rem; }
          .production-table th, .production-table td { font-size: 0.92rem; }
        }
      `}</style>
    </>
  );
}
