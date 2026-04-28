
"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

type QuoteRow = {
  id: string;
  internalNumber?: number;
  statusLabel?: string;
  statusKey?: string;
  updatedAt?: string;
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
  if (typeof window === "undefined") {
    return "/orcamento/novo#condPagamento";
  }

  const query = window.location.search.replace(/^\?/, "");
  return query ? `/orcamento/novo?${query}#condPagamento` : "/orcamento/novo#condPagamento";
}

function getQuoteDetailHref(identifier: string) {
  if (typeof window === "undefined") {
    return `/orcamento/${encodeURIComponent(identifier)}`;
  }

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

export default function OrcamentoListaPage() {
  const [validationState, setValidationState] = useState<"checking" | "valid" | "invalid">("checking");
  const [validationMessage, setValidationMessage] = useState("");
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quotesError, setQuotesError] = useState("");
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);
  const [chatwootContactId, setChatwootContactId] = useState<number | undefined>(undefined);
  const createQuoteHref = getCreateQuoteHref();

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

    if (convParam && convParam > 0) {
      setConversationId(convParam);
    }
    if (contactParam && contactParam > 0) {
      setChatwootContactId(contactParam);
    }

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

      if (contactId !== undefined && contactId > 0) {
        setChatwootContactId(contactId);
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

  useEffect(() => {
    if (validationState !== "valid") {
      return;
    }

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

        const response = await fetch(`/api/quotes?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || "Erro ao buscar orçamentos do contato.");
        }

        const data = (await response.json()) as unknown;
        setQuotes(Array.isArray(data) ? (data as QuoteRow[]) : []);
      } catch (error) {
        setQuotesError(error instanceof Error ? error.message : "Falha ao carregar orçamentos.");
      } finally {
        setLoadingQuotes(false);
      }
    };

    void fetchQuotes();
  }, [validationState, chatwootContactId, conversationId]);

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
    } catch (error) {
      setQuotesError(error instanceof Error ? error.message : "Falha ao atualizar status.");
    } finally {
      setStatusSavingId(null);
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
                  <p className="mb-0 small text-muted">{validationMessage || "Por favor, volte ao Chatwoot."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {validationState === "valid" && (
      <div className="container my-5">
        <div className="orcamento-header d-flex align-items-center justify-content-between flex-wrap gap-3 p-3 rounded-top" style={{background: "linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%)", color: "#222"}}>
          <div className="d-flex align-items-center">
            <img src="/media/logo_new.svg" alt="Logo Bom Custo" className="me-3" style={{maxWidth:180, maxHeight:120, background: "#fff", borderRadius:8, padding:4}} />
            <div>
              <h3 className="mb-0">Bom Custo Papelaria & Gráfica Rápida LTDA</h3>
              <div className="small">CNPJ: 62.391.927/0001-57</div>
              <div className="small">Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê</div>
              <div className="small">Ilhabela - SP, CEP: 11633-078</div>
              <div className="small">
                Telefones: (12) 99648-4918 / (12) 3896-1474 / (12) 99678-2405<br />
                E-mail: orcamento@bomcustoilhabela.com.br
              </div>
            </div>
          </div>
          <div className="text-end">
            <h5 className="mb-1">Lista de Orçamentos</h5>
          </div>
        </div>
        <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
          {quotesError ? <div className="alert alert-danger">{quotesError}</div> : null}

          <div className="table-responsive mb-4">
            <table className="table orcamento-list-table align-middle">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Vendedor</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {loadingQuotes ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">Carregando orçamentos do contato...</td>
                  </tr>
                ) : quotes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">Nenhum orçamento encontrado para este contato.</td>
                  </tr>
                ) : (
                  quotes.map((quote) => {
                    const status = quote.statusLabel || quote.statusKey || "-";
                    const quoteNumber = quote.body?.idorcamento ?? quote.internalNumber;
                    const quoteIdentifier = getQuoteIdentifier(quote);
                    const statusClass =
                      status.toLowerCase().includes("pend")
                        ? "status-pendente"
                        : status.toLowerCase().includes("apro")
                          ? "status-aprovado"
                          : status.toLowerCase().includes("recu") || status.toLowerCase().includes("cancel")
                            ? "status-recusado"
                            : "";

                    return (
                      <tr key={quote.id}>
                        <td>{quoteNumber ?? "-"}</td>
                        <td>{quote.body?.cliente?.nome || "Não informado"}</td>
                        <td>{quote.updatedAt ? new Date(quote.updatedAt).toLocaleDateString("pt-BR") : "-"}</td>
                        <td>{quote.body?.vendedorNome || "-"}</td>
                        <td>{(quote.body?.totais?.valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                        <td><span className={statusClass}>{status}</span></td>
                        <td>
                          <div className="acoes-lista">
                            <a href={getQuoteDetailHref(quoteIdentifier)} className="btn btn-sm btn-outline-primary" title="Visualizar orçamento"><i className="bi bi-eye"></i></a>
                            {quote.availableNextStatuses && quote.availableNextStatuses.length > 0 && (
                              <select
                                className="form-select form-select-sm"
                                style={{ minWidth: 140 }}
                                value=""
                                disabled={statusSavingId === quote.id}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  e.target.value = "";
                                  if (val) void handleStatusChange(quote, val);
                                }}
                              >
                                <option value="">{statusSavingId === quote.id ? "Salvando..." : "Alterar status"}</option>
                                {quote.availableNextStatuses.map((s) => (
                                  <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-end">
            <a href={createQuoteHref} className="btn btn-add-orcamento" style={{fontSize:"1.15rem",padding:"0.7rem 2.2rem",fontWeight:600,backgroundColor:"#7dc8aa",color:"#fff",border:"none",borderRadius:6}}>
              <i className="bi bi-plus-circle me-2"></i>Adicionar Orçamento
            </a>
          </div>
        </div>
      </div>
      )}
      <style>{`
        body { background: #f9f7ed; font-size: 1.18rem; }
        .status-pendente { color: #f39c12; font-weight: 600; }
        .status-aprovado { color: #27ae60; font-weight: 600; }
        .status-recusado { color: #ee3637; font-weight: 600; }
        .acoes-lista { display: flex; gap: 0.5rem; }
        .orcamento-header { border-radius: 8px 8px 0 0; }
        .orcamento-section { border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .orcamento-list-table th, .orcamento-list-table td { vertical-align: middle; white-space: normal; word-break: break-word; font-size: 1.15rem; }
        .orcamento-list-table th { background: #f9e7f5; color: #222; border-bottom: 2px solid rgba(0,0,0,0.04); }
        .btn-add-orcamento:hover { background-color: #6ab594 !important; color: #fff !important; }
        @media (max-width: 576px) {
          .orcamento-header { padding: 0.75rem !important; }
          .orcamento-section { padding: 1rem !important; }
          .orcamento-list-table th, .orcamento-list-table td { font-size: 0.98rem !important; }
          .btn-add-orcamento { font-size: 1rem !important; padding: 0.6rem 1.2rem !important; }
        }
      `}</style>
    </>
  );
}
