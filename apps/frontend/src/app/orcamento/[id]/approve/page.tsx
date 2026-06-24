"use client";

import Script from "next/script";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/empresa";

type ApproveState = "loading-quote" | "idle" | "submitting" | "success" | "already-approved" | "error" | "no-token";

export default function ApprovePage() {
  const { EMPRESA_NOME, EMPRESA_LOGO_URL, EMPRESA_TELEFONES, EMPRESA_WHATSAPP } = useEmpresa();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<ApproveState>("loading-quote");
  const [quoteNumber, setQuoteNumber] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [quoteTotal, setQuoteTotal] = useState<number | null>(null);
  const [quoteItems, setQuoteItems] = useState<Array<{
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    subtotal: number;
  }>>([]);

  useEffect(() => {
    if (!token) {
      setState("no-token");
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/quotes/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Orçamento não encontrado.");
        const data = await res.json();
        setQuoteNumber(data?.body?.idorcamento_interno ?? null);
        setClientName(data?.body?.cliente?.nome ?? "");
        setQuoteTotal(data?.body?.totais?.valor ?? null);
        setQuoteItems(
          (data?.body?.itens ?? []).map((item: Record<string, unknown>) => ({
            descricao:
              String((item.produto as Record<string, unknown>)?.descricaocurta ?? '') ||
              String((item.produto as Record<string, unknown>)?.descricaoproduto ?? ''),
            quantidade: Number(item.quantidadeitem ?? 0),
            valorUnitario: Number(item.valoritem ?? 0),
            subtotal: Number(item.orcamentovalorfinalitem ?? 0),
          }))
        );

        // If already approved, show dedicated already-approved state
        if (data?.approved) {
          setState("already-approved");
        } else {
          setState("idle");
        }
      } catch {
        setErrorMessage("Não foi possível carregar o orçamento.");
        setState("error");
      }
    };

    void load();
  }, [id, token]);

  const handleApprove = async () => {
    setState("submitting");
    try {
      const res = await fetch(
        `/api/quotes/${encodeURIComponent(id)}/approve?token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Idempotency: treat "já aprovado" as success
        const msg: string = String(data?.message ?? data?.error ?? "");
        if (msg.toLowerCase().includes("aprovado")) {
          setState("success");
          return;
        }
        throw new Error(msg || "Erro ao aprovar orçamento.");
      }

      setState("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido.");
      setState("error");
    }
  };

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />

      <style>{`
        body { margin: 0; background-color: #f9f7ed; }
        .approve-card {
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0,0,0,0.10);
          max-width: 480px;
          width: 100%;
        }
        .approve-header {
          background: linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%);
          padding: 24px 20px 16px 20px;
        }
        .btn-approve {
          background-color: #7dc8aa;
          border-color: #7dc8aa;
          color: #fff;
          font-weight: 600;
          font-size: 1.05rem;
          padding: 12px 32px;
          border-radius: 8px;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .btn-approve:hover:not(:disabled) {
          background-color: #6ab594;
          border-color: #6ab594;
          color: #fff;
        }
        .btn-approve:disabled {
          opacity: 0.65;
        }
        .page-wrapper {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          background-color: #f9f7ed;
          box-sizing: border-box;
        }
      `}</style>

      <div className="page-wrapper">
        <div className="approve-card bg-white">
          <div className="approve-header text-center">
            {EMPRESA_LOGO_URL && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={EMPRESA_LOGO_URL}
                alt={EMPRESA_NOME}
                style={{ maxWidth: 140, maxHeight: 80, background: "#fff", borderRadius: 8, padding: 6 }}
              />
            )}
            <div className="mt-2 small text-muted">{EMPRESA_NOME}</div>
          </div>

          <div className="p-4 text-center">
            {/* Loading quote */}
            {state === "loading-quote" && (
              <div className="py-4">
                <div className="spinner-border text-secondary" role="status" />
                <div className="mt-3 text-muted">Carregando orçamento...</div>
              </div>
            )}

            {/* No token */}
            {state === "no-token" && (
              <div className="alert alert-warning">
                Link de aprovação inválido. Solicite um novo link à equipe.
              </div>
            )}

            {/* Idle — awaiting customer action */}
            {state === "idle" && (
              <>
                <h5 className="mb-1">Aprovação de Orçamento</h5>
                {quoteNumber && (
                  <div className="text-muted mb-1">
                    Orçamento <strong>#{quoteNumber}</strong>
                  </div>
                )}
                {clientName && <div className="text-muted mb-4 small">{clientName}</div>}
                {quoteItems.length > 0 && (
                  <div className="mb-4 text-start">
                    <table className="table table-sm table-borderless mb-1">
                      <thead>
                        <tr className="small text-muted border-bottom">
                          <th>Item</th>
                          <th className="text-end">Qtd</th>
                          <th className="text-end">Unit.</th>
                          <th className="text-end">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quoteItems.map((item, idx) => (
                          <tr key={idx} className="small">
                            <td>{item.descricao}</td>
                            <td className="text-end">{item.quantidade}</td>
                            <td className="text-end">
                              {item.valorUnitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </td>
                            <td className="text-end">
                              {item.subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {quoteTotal !== null && (
                      <div className="text-end fw-semibold small border-top pt-1">
                        Total:{" "}
                        {quoteTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    )}
                  </div>
                )}
                <p className="mb-4">
                  Ao clicar no botão abaixo, você confirma a aprovação deste orçamento e autoriza o
                  início da produção.
                </p>
                <button className="btn btn-approve w-100" onClick={handleApprove}>
                  Aprovar Orçamento
                </button>
              </>
            )}

            {/* Submitting */}
            {state === "submitting" && (
              <>
                <h5 className="mb-3">Aprovação de Orçamento</h5>
                <button className="btn btn-approve w-100" disabled>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Aprovando...
                </button>
              </>
            )}

            {/* Success */}
            {state === "success" && (
              <div className="py-2">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                  style={{ width: 64, height: 64, background: "#c5f2e8" }}
                >
                  <i className="bi bi-check-lg" style={{ fontSize: 32, color: "#2e7d62" }} />
                </div>
                <h5 className="mb-2">Orçamento Aprovado!</h5>
                <p className="text-muted">
                  Nossa equipe já foi notificada e em breve seu pedido entra em produção. Avisaremos assim que estiver pronto.
                </p>
                {EMPRESA_WHATSAPP && (
                  <div className="mt-3 border-top pt-3 small text-muted">
                    Dúvidas? Fale conosco:{" "}
                    <a href={`https://wa.me/${EMPRESA_WHATSAPP}`} className="text-decoration-none fw-semibold">
                      {EMPRESA_TELEFONES || EMPRESA_WHATSAPP}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Already approved */}
            {state === "already-approved" && (
              <div className="py-2">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                  style={{ width: 64, height: 64, background: "#c5f2e8" }}
                >
                  <i className="bi bi-check-lg" style={{ fontSize: 32, color: "#2e7d62" }} />
                </div>
                <h5 className="mb-2">Orçamento já aprovado</h5>
                {quoteNumber && (
                  <div className="text-muted mb-2 small">Orçamento <strong>#{quoteNumber}</strong></div>
                )}
                <p className="text-muted">
                  Você já aprovou este orçamento anteriormente. Nossa equipe está cuidando do seu pedido.
                </p>
                {EMPRESA_WHATSAPP && (
                  <div className="mt-3 border-top pt-3 small text-muted">
                    Dúvidas? Fale conosco:{" "}
                    <a href={`https://wa.me/${EMPRESA_WHATSAPP}`} className="text-decoration-none fw-semibold">
                      {EMPRESA_TELEFONES || EMPRESA_WHATSAPP}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {state === "error" && (
              <div className="py-2">
                <div className="alert alert-danger">{errorMessage || "Ocorreu um erro inesperado."}</div>
                {EMPRESA_WHATSAPP && (
                  <div className="small text-muted mt-2">
                    Tente novamente ou entre em contato:{" "}
                    <a href={`https://wa.me/${EMPRESA_WHATSAPP}`} className="text-decoration-none">
                      {EMPRESA_TELEFONES || EMPRESA_WHATSAPP}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
