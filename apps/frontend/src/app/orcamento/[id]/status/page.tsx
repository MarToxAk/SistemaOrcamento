"use client";

import Script from "next/script";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type StatusState = "loading" | "loaded" | "error";

const STATUS_INFO: Record<string, { emoji: string; label: string; description: string; color: string }> = {
  pendente:            { emoji: "🕐", label: "Pendente",             description: "Seu orçamento foi recebido e está aguardando confirmação.",                      color: "#6c757d" },
  enviado:             { emoji: "📤", label: "Enviado",              description: "O orçamento foi enviado para análise. Aguardando sua aprovação.",                color: "#0d6efd" },
  aprovado:            { emoji: "✅", label: "Aprovado",             description: "Orçamento aprovado! Em breve seu pedido entra em produção.",                    color: "#198754" },
  pagamento_parcial:   { emoji: "💰", label: "Pagamento Parcial",    description: "Recebemos parte do pagamento. Aguardando quitação para iniciar a produção.",    color: "#fd7e14" },
  em_producao:         { emoji: "🎨", label: "Em Produção",          description: "Seu pedido está sendo produzido pela nossa equipe.",                            color: "#e6a817" },
  pronto_para_entrega: { emoji: "📦", label: "Pronto para Retirada", description: "Seu pedido está pronto! Pode passar na loja quando quiser.",                   color: "#0aa2c0" },
  entregue:            { emoji: "🎉", label: "Entregue",             description: "Pedido entregue. Obrigado pela preferência!",                                  color: "#6f42c1" },
  cancelado:           { emoji: "❌", label: "Cancelado",            description: "Este orçamento foi cancelado. Dúvidas? Fale conosco.",                          color: "#dc3545" },
};

export default function StatusPage() {
  const { id } = useParams<{ id: string }>();

  const [pageState, setPageState] = useState<StatusState>("loading");
  const [statusLabel, setStatusLabel] = useState<string>("-");
  const [statusKey, setStatusKey] = useState<string>("");
  const [quoteNumber, setQuoteNumber] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [paymentConfirmedAt, setPaymentConfirmedAt] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/quotes/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Orçamento não encontrado.");
        const data = await res.json();

        setStatusLabel(data?.statusLabel ?? data?.body?.status ?? "-");
        setStatusKey((data?.statusKey ?? "").toLowerCase());
        setQuoteNumber(data?.body?.idorcamento_interno ?? null);
        setOrderNumber(data?.saleExternalId != null ? String(data.saleExternalId) : null);
        setPaymentConfirmedAt(data?.paymentConfirmedAt ?? null);
        setClientName(data?.body?.cliente?.nome ?? "");
        setUpdatedAt(data?.updatedAt ?? null);
        setPageState("loaded");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar status.");
        setPageState("error");
      }
    };

    void load();
  }, [id]);

  const info = STATUS_INFO[statusKey];
  const badgeEmoji = info?.emoji ?? "";
  const badgeLabel = info?.label ?? statusLabel;
  const badgeDescription = info?.description ?? "";
  const badgeColor = info?.color ?? "#6c757d";

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />

      <style>{`
        body { margin: 0; background-color: #f9f7ed; }
        .status-card {
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0,0,0,0.10);
          width: 100%;
          max-width: 480px;
        }
        .status-header {
          background: linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%);
          padding: 24px 20px 16px 20px;
        }
        .status-pill {
          font-size: 1.1rem;
          padding: 10px 24px;
          border-radius: 50px;
          display: inline-block;
          color: #fff;
          font-weight: 600;
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
        <div className="status-card bg-white">
          <div className="status-header text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/logo_new.svg"
              alt="Bom Custo Papelaria &amp; Gráfica Rápida"
              style={{ maxWidth: 140, maxHeight: 80, background: "#fff", borderRadius: 8, padding: 6 }}
            />
            <div className="mt-2 small text-muted">Bom Custo Papelaria &amp; Gráfica Rápida</div>
          </div>

          <div className="p-4 text-center">
            {/* Loading */}
            {pageState === "loading" && (
              <div className="py-4">
                <div className="spinner-border text-secondary" role="status" />
                <div className="mt-3 text-muted">Carregando status...</div>
              </div>
            )}

            {/* Error */}
            {pageState === "error" && (
              <div className="py-2">
                <div className="alert alert-danger">{errorMessage}</div>
                <div className="small text-muted mt-2">
                  Entre em contato:{" "}
                  <a href="https://wa.me/5512996484918" className="text-decoration-none">
                    (12) 99648-4918
                  </a>
                </div>
              </div>
            )}

            {/* Loaded */}
            {pageState === "loaded" && (
              <>
                <h5 className="mb-1">Status do Pedido</h5>
                {quoteNumber && (
                  <div className="text-muted mb-1 small">Orçamento #{quoteNumber}</div>
                )}
                {clientName && (
                  <div className="text-muted mb-4 small">{clientName}</div>
                )}

                <div className="row g-2 text-start mb-3">
                  <div className="col-12 col-sm-6">
                    <div className="border rounded p-2 h-100 bg-light-subtle">
                      <div className="text-muted small">Nº do pedido</div>
                      <div className="fw-semibold">{orderNumber ? `#${orderNumber}` : "Aguardando geração"}</div>
                    </div>
                  </div>
                  <div className="col-12 col-sm-6">
                    <div className="border rounded p-2 h-100 bg-light-subtle">
                      <div className="text-muted small">Pagamento</div>
                      <div className="fw-semibold">
                        {paymentConfirmedAt
                          ? `Confirmado em ${new Date(paymentConfirmedAt).toLocaleString("pt-BR")}`
                          : "Aguardando confirmação"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="my-4">
                  <span className="status-pill" style={{ backgroundColor: badgeColor }}>
                    {badgeEmoji} {badgeLabel}
                  </span>
                  {badgeDescription && (
                    <p className="text-muted mt-3 mb-0 small px-2">{badgeDescription}</p>
                  )}
                </div>

                {updatedAt && (
                  <div className="text-muted small mb-4">
                    Atualizado em{" "}
                    {new Date(updatedAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}

                <div className="border-top pt-3 small text-muted">
                  Dúvidas? Fale conosco:{" "}
                  <a href="https://wa.me/5512996484918" className="text-decoration-none fw-semibold">
                    (12) 99648-4918
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
