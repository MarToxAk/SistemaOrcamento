"use client";

import { useEffect, useState } from "react";
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

function getOptionalNumberParam(params: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = params.get(key);
    if (!value) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

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

export default function StatusPage() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<"checking" | "valid" | "invalid">("checking");
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
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

  useEffect(() => {
    if (validationState === "valid") {
      void fetchQuotes();
    }
  }, [validationState]);

  async function fetchQuotes() {
    setLoading(true);
    setErro("");

    try {
      const params = new URLSearchParams(window.location.search);
      const query = new URLSearchParams({
        status: PRODUCTION_STATUSES.join(","),
      });

      const conversationId = getOptionalNumberParam(params, "chatid", "conversationId", "conversation_id");
      const chatwootContactId = getOptionalNumberParam(
        params,
        "chatwootContactId",
        "chatwoot_contact_id",
        "contact_id",
      );

      if (conversationId) {
        query.set("conversationId", String(conversationId));
      }
      if (chatwootContactId) {
        query.set("chatwootContactId", String(chatwootContactId));
      }

      const response = await fetch(`/api/quotes?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Erro ao buscar produção.");
      }

      const data = (await response.json()) as unknown;
      setQuotes(Array.isArray(data) ? (data as QuoteRow[]) : []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar a produção.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(quote: QuoteRow, nextStatus: string) {
    setStatusSavingId(quote.id);
    setErro("");

    try {
      const identifier = getQuoteIdentifier(quote);
      const response = await fetch(`/api/quotes/${encodeURIComponent(identifier)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus: nextStatus,
          changedBy: "Painel de producao",
        }),
      });

      const data = (await response.json().catch(() => ({}))) as Partial<QuoteRow> & { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Não foi possível atualizar o status.");
      }

      const updated = data as QuoteRow;
      setQuotes((current) => {
        if (!PRODUCTION_STATUSES.includes(updated.statusKey)) {
          return current.filter((currentQuote) => currentQuote.id !== quote.id);
        }

        return current.map((currentQuote) => (currentQuote.id === quote.id ? updated : currentQuote));
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
      if (!response.ok) {
        throw new Error(data?.error || "Falha ao gerar PDF.");
      }

      if (data.publicUrl) {
        setQuotes((current) =>
          current.map((currentQuote) =>
            currentQuote.id === quote.id
              ? {
                  ...currentQuote,
                  latestPdfUrl: data.publicUrl ?? currentQuote.latestPdfUrl,
                }
              : currentQuote,
          ),
        );
        window.open(data.publicUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao gerar PDF.");
    } finally {
      setPdfLoadingId(null);
    }
  }

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />

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
                <div className="small">Acompanhe itens aprovados, em produção e prontos para entrega.</div>
              </div>
            </div>
            <div className="text-end">
              <div className="small">Fluxo operacional</div>
              <strong>{quotes.length} orçamento(s)</strong>
            </div>
          </div>

          <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
            {erro ? <div className="alert alert-danger mb-4">{erro}</div> : null}

            {loading ? (
              <div className="text-center py-5 text-muted">Carregando produção...</div>
            ) : quotes.length === 0 ? (
              <div className="alert alert-info mb-0">Nenhum orçamento encontrado para este cliente no fluxo de produção.</div>
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
                      const canOpenPdf = Boolean(quote.latestPdfUrl);
                      const statusBusy = statusSavingId === quote.id;
                      const pdfBusy = pdfLoadingId === quote.id;

                      return (
                        <tr key={quote.id}>
                          <td>
                            <div className="fw-semibold">#{quoteNumber}</div>
                            <div className="text-muted small">{quote.id}</div>
                          </td>
                          <td>
                            <div className="fw-semibold">{customerName}</div>
                            <div className="text-muted small">{quote.body.cliente?.telefone || "Sem telefone"}</div>
                          </td>
                          <td>{quote.body.vendedorNome || "Sem vendedor"}</td>
                          <td>{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td>{new Date(quote.updatedAt).toLocaleString("pt-BR")}</td>
                          <td>
                            <div className="d-flex flex-column gap-2">
                              <span className={`status-pill status-${quote.statusKey.toLowerCase()}`}>{quote.statusLabel}</span>
                              <select
                                className="form-select form-select-sm"
                                value=""
                                disabled={statusBusy || quote.availableNextStatuses.length === 0}
                                onChange={(event) => {
                                  const selectedStatus = event.target.value;
                                  event.target.value = "";
                                  if (selectedStatus) {
                                    void handleStatusChange(quote, selectedStatus);
                                  }
                                }}
                              >
                                <option value="">{statusBusy ? "Salvando..." : "Alterar status"}</option>
                                {quote.availableNextStatuses.map((status) => (
                                  <option key={status.value} value={status.value}>
                                    {status.label}
                                  </option>
                                ))}
                              </select>
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
                              {quote.latestPdfUrl ? (
                                <a
                                  className="btn btn-sm btn-outline-dark"
                                  href={quote.latestPdfUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Abrir PDF
                                </a>
                              ) : null}
                              {quote.chatwootConversationUrl ? (
                                <a
                                  className="btn btn-sm btn-success"
                                  href={quote.chatwootConversationUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Abrir Chatwoot
                                </a>
                              ) : (
                                <span className="text-muted small">Sem conversa vinculada</span>
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

      <style>{`
        body { background: #f7f1e3; font-size: 1.02rem; }
        .orcamento-header {
          background: linear-gradient(135deg, #c5f2e8 0%, #cbe1f9 25%, #e7d8f9 50%, #f9e7f5 75%, #f0cacb 100%);
          color: #222;
        }
        .orcamento-section { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .logo-img {
          max-width: 140px;
          max-height: 88px;
          background: #fff;
          border-radius: 8px;
          padding: 6px;
        }
        .production-table th {
          background: #f9e7f5;
          color: #222;
          white-space: nowrap;
        }
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
        .action-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        @media (max-width: 768px) {
          .container { padding-inline: 1rem; }
          .production-table th,
          .production-table td { font-size: 0.92rem; }
        }
      `}</style>
    </>
  );
}
