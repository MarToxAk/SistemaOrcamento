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

  return { conversation };
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
      const convId = parseMaybeNumber(conversation?.id);
      if (convId !== undefined && convId > 0) {
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
    const params = new URLSearchParams(window.location.search);
    const externalUrl = params.get("pdfUrl") ?? params.get("nfseUrl") ?? params.get("documentUrl");
    if (externalUrl) {
      setExternalPdfUrl(externalUrl);
    }
  }, []);

  useEffect(() => {
    if (validationState !== "valid" || !quoteId) {
      return;
    }

    const fetchDetail = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as QuoteDetail & { error?: string; message?: string };

        if (!response.ok) {
          throw new Error(data?.message || data?.error || "Erro ao carregar orçamento.");
        }

        setQuote(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar orçamento.");
      } finally {
        setLoading(false);
      }
    };

    void fetchDetail();
  }, [validationState, quoteId]);

  async function handleStatusChange(nextStatus: string) {
    setStatusSavingState("saving");
    setStatusError("");
    try {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus: nextStatus, changedBy: "Detalhe do orcamento" }),
      });
      const data = (await response.json().catch(() => ({}))) as QuoteDetail & { message?: string; error?: string };
      if (!response.ok) throw new Error(data?.message || data?.error || "Falha ao atualizar status.");
      setQuote(data as QuoteDetail);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Erro ao atualizar status.");
    } finally {
      setStatusSavingState("idle");
    }
  }

  async function handleEmitirNfse() {
    setNfseState("emitindo");
    setNfseMsg("");
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/nfse`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { numero?: string; jaEmitida?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data?.message || data?.error || "Falha ao emitir NFS-e.");
      const numero = data.numero ?? null;
      setNfseNumero(numero);
      setNfseState("sucesso");
      setNfseMsg(data.jaEmitida ? `NFS-e já emitida: número ${numero}` : `NFS-e emitida com sucesso! Número: ${numero}`);
    } catch (err) {
      setNfseState("erro");
      setNfseMsg(err instanceof Error ? err.message : "Erro ao emitir NFS-e.");
    }
  }

  async function handleEnviar() {
    setSendingState("sending");
    setSendMessage("");
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/enviar`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data?.message || data?.error || "Falha ao enviar.");
      setSendingState("success");
      setSendMessage("Mensagem enviada ao cliente com sucesso.");
      const updated = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}`, { cache: "no-store" });
      if (updated.ok) setQuote(await updated.json() as QuoteDetail);
    } catch (err) {
      setSendingState("error");
      setSendMessage(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      window.setTimeout(() => setSendingState("idle"), 3000);
    }
  }

  const isDevEnv =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "0.0.0.0");

  const canEnviar =
    isDevEnv || Boolean(quote?.availableNextStatuses?.some((s) => s.value === "ENVIADO"));

  const body = quote?.body;
  const itens = body?.itens ?? [];
  const carimbos = body?.carimbos?.itens ?? [];
  const documentoPdf = Array.isArray(body?.documentoPdf) && body?.documentoPdf.length > 0 ? body.documentoPdf[0] : null;
  const pdfViewerUrl = externalPdfUrl ?? documentoPdf?.publicUrl ?? null;
  const quoteNumber = body?.idorcamento ?? body?.idorcamento_interno;

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
                  <p className="mb-0 small text-muted">{validationMessage || "Abra esta página pelo Chatwoot."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {validationState === "valid" && (
        <div className="container my-5">
          <div className="orcamento-header p-3 rounded-top" style={{background: "linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%)", color: "#222"}}>
            <div className="header-left d-flex align-items-start gap-3 flex-grow-1">
              <img src="/media/logo_new.svg" alt="Logo Bom Custo" className="me-3 logo-img" style={{maxWidth:140, maxHeight:100, background: "#fff", borderRadius:8, padding:6}} />
              <div className="header-info">
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
            <div className="header-right d-flex flex-column align-items-end justify-content-start ms-3" style={{minWidth:160}}>
              <h5 className="mb-1">Orçamento Nº {quoteNumber ?? "-"}</h5>
              <div>{body?.dataorcamento ? new Date(body.dataorcamento).toLocaleDateString("pt-BR") : "-"}</div>
            </div>
          </div>

          <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
            {loading ? <div className="text-muted">Carregando orçamento...</div> : null}
            {error ? <div className="alert alert-danger">{error}</div> : null}

            {!loading && !error && body && (
              <>
                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <strong>Status:</strong>{" "}
                    <span className="badge bg-light text-dark border me-2">{body.status ?? "-"}</span>
                    {quote?.availableNextStatuses && quote.availableNextStatuses.length > 0 && (
                      <div className="d-inline-block mt-1">
                        <select
                          className="form-select form-select-sm"
                          style={{ maxWidth: 180 }}
                          value=""
                          disabled={statusSavingState === "saving"}
                          onChange={(e) => {
                            const v = e.target.value;
                            e.target.value = "";
                            if (v) void handleStatusChange(v);
                          }}
                        >
                          <option value="">{statusSavingState === "saving" ? "Salvando..." : "Alterar status"}</option>
                          {quote.availableNextStatuses.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        {statusError && <div className="text-danger small mt-1">{statusError}</div>}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4"><strong>Vendedor:</strong> {body.vendedorNome ?? "-"}</div>
                  <div className="col-md-4"><strong>Data:</strong> {body.dataorcamento ? new Date(body.dataorcamento).toLocaleDateString("pt-BR") : "-"}</div>
                </div>

                <div className="row g-3 mb-4">
                  <div className="col-md-4"><strong>Cliente:</strong> {body.cliente?.nome ?? "-"}</div>
                  <div className="col-md-4"><strong>Telefone:</strong> {body.cliente?.telefone ?? "-"}</div>
                  <div className="col-md-4"><strong>E-mail:</strong> {body.cliente?.email ?? "-"}</div>
                  <div className="col-md-4"><strong>Validade:</strong> {body.validade ?? "-"}</div>
                  <div className="col-md-4"><strong>Prazo entrega:</strong> {body.prazoEntrega ?? "-"}</div>
                  <div className="col-md-4"><strong>Pagamento:</strong> {body.condicaoPagamento ?? "-"}</div>
                </div>

                <h5>Itens</h5>
                <div className="table-responsive mb-4">
                  <table className="table table-bordered align-middle itens-table">
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>Descrição</th>
                        <th>Qtd</th>
                        <th>Valor</th>
                        <th>Desconto</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item, idx) => (
                        <tr key={`${item.sequenciaitem ?? idx}-${idx}`}>
                          <td>{item.sequenciaitem ?? idx + 1}</td>
                          <td>{item.produto?.descricaocurta || item.produto?.descricaoproduto || "-"}</td>
                          <td>{Number(item.quantidadeitem ?? 0)}</td>
                          <td>{Number(item.valoritem ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td>{Number(item.valordesconto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td>{Number(item.orcamentovalorfinalitem ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {carimbos.length > 0 && (
                  <>
                    <h5>Carimbos</h5>
                    <ul className="list-group mb-4">
                      {carimbos.map((carimbo, idx) => (
                        <li key={`${carimbo.numero ?? idx}-${idx}`} className="list-group-item">
                          <strong>{carimbo.numero ?? idx + 1}.</strong> {carimbo.carimbo ?? "-"}
                          {carimbo.dimensoes ? ` - ${carimbo.dimensoes}` : ""}
                          {carimbo.descricao ? ` - ${carimbo.descricao}` : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <div className="row g-3 mb-4">
                  <div className="col-md-4"><strong>Total:</strong> {Number(body.totais?.valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                  <div className="col-md-4"><strong>Desconto:</strong> {Number(body.totais?.desconto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                  <div className="col-md-4"><strong>Acréscimo:</strong> {Number(body.totais?.valoracrescimo ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                </div>

                {body.observacoes ? <div className="alert alert-light"><strong>Observações:</strong> {body.observacoes}</div> : null}

                {sendMessage ? (
                  <div className={`alert ${sendingState === "success" ? "alert-success" : "alert-danger"} mb-3`}>
                    {sendMessage}
                  </div>
                ) : null}

                {nfseMsg ? (
                  <div className={`alert ${nfseState === "sucesso" ? "alert-success" : "alert-danger"} mb-3`}>
                    <i className={`bi ${nfseState === "sucesso" ? "bi-check-circle" : "bi-exclamation-triangle"} me-2`} />
                    {nfseMsg}
                  </div>
                ) : null}

                <div className="d-flex gap-2 flex-wrap">
                  {quote?.statusKey === "APROVADO" && !nfseNumero ? (
                    <button
                      type="button"
                      className="btn btn-warning"
                      onClick={() => void handleEmitirNfse()}
                      disabled={nfseState === "emitindo"}
                    >
                      {nfseState === "emitindo" ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" />
                          Emitindo NFS-e...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-receipt me-2" />
                          Emitir Nota Fiscal
                        </>
                      )}
                    </button>
                  ) : nfseNumero ? (
                    <span className="btn btn-outline-success disabled">
                      <i className="bi bi-check-circle me-2" />
                      NFS-e #{nfseNumero}
                    </span>
                  ) : null}
                  {canEnviar ? (
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={() => void handleEnviar()}
                      disabled={sendingState === "sending"}
                    >
                      {sendingState === "sending" ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-send me-2" />
                          Enviar ao Cliente
                        </>
                      )}
                    </button>
                  ) : null}
                  {pdfViewerUrl ? (
                    <button type="button" className="btn btn-primary" onClick={() => setPdfModalOpen(true)}>
                      Visualizar PDF
                    </button>
                  ) : null}
                  {documentoPdf?.publicUrl ? (
                    <a className="btn btn-outline-dark" href={documentoPdf.publicUrl} target="_blank" rel="noreferrer">Abrir PDF</a>
                  ) : null}
                  <a className="btn btn-outline-secondary" href="/orcamento">Voltar para lista</a>
                </div>

                {!pdfViewerUrl ? (
                  <div className="alert alert-warning mt-3 mb-0">
                    Nenhum PDF disponível para visualização. Gere um PDF primeiro ou envie `pdfUrl` na URL para usar um PDF externo (NFS-e).
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

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
              <iframe
                id="iframe_show_document_modal"
                style={{ border: "none", width: "100%", height: "100%", position: "relative", zIndex: 4 }}
                allowFullScreen
                src={pdfViewerUrl}
              />
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        body { background: #f9f7ed; }
        .orcamento-header { border-radius: 8px 8px 0 0; display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 1rem; }
        .orcamento-section { border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px #0001; }
        .itens-table thead th { background: #f9e7f5; }
        .pdf-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
          padding: 1rem;
        }
        .pdf-modal-card {
          width: min(1200px, 100%);
          height: min(860px, calc(100vh - 2rem));
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 20px 45px rgba(0,0,0,0.22);
          display: grid;
          grid-template-rows: auto auto 1fr;
          overflow: hidden;
        }
        .pdf-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.85rem 1rem;
          border-bottom: 1px solid #ececec;
          background: #f8fafb;
        }
        .pdf-modal-actions {
          display: flex;
          gap: 0.5rem;
          padding: 0.7rem 1rem;
          border-bottom: 1px solid #f0f0f0;
          background: #fff;
        }
        .pdf-modal-body {
          min-height: 0;
          height: 100%;
          background: #2d3339;
        }
        .orcamento-header .small { font-size: 0.85rem; opacity: 0.9; }
        .header-right { text-align: right; display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-end; }
        .header-left { display:flex; align-items:flex-start; gap:1rem; }
        .logo-img { max-width:140px; max-height:100px; }
        @media (max-width: 768px) {
          .orcamento-header { display:block; text-align: center; }
          .header-left { display:flex; align-items:center; justify-content:center; gap:1rem; }
          .header-right { text-align:center; align-items:center; margin-top:0.75rem; }
          .logo-img { margin: 0 auto; }
          .pdf-modal-card { height: calc(100vh - 1.25rem); }
        }
      `}</style>
    </>
  );
}
