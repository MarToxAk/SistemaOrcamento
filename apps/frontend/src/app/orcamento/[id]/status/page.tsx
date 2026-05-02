"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type StatusState = "loading" | "loaded" | "error";

const STATUS_CLASS: Record<string, string> = {
  aprovado: "badge bg-success",
  em_producao: "badge bg-warning text-dark",
  pronto_para_entrega: "badge bg-info text-dark",
  entregue: "badge bg-secondary",
  cancelado: "badge bg-danger",
  pendente: "badge bg-light text-dark border",
  enviado: "badge bg-primary",
  recusado: "badge bg-danger",
};

export default function StatusPage() {
  const { id } = useParams<{ id: string }>();

  const [pageState, setPageState] = useState<StatusState>("loading");
  const [statusLabel, setStatusLabel] = useState<string>("-");
  const [statusKey, setStatusKey] = useState<string>("");
  const [quoteNumber, setQuoteNumber] = useState<number | null>(null);
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

  const badgeClass = STATUS_CLASS[statusKey] ?? "badge bg-light text-dark border";

  return (
    <>
      <style>{`
        body { background-color: #f9f7ed; }
        .status-card {
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0,0,0,0.10);
          max-width: 480px;
          width: 100%;
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
        }
      `}</style>

      <div
        className="min-vh-100 d-flex align-items-center justify-content-center px-3"
        style={{ backgroundColor: "#f9f7ed" }}
      >
        <div className="status-card bg-white">
          <div className="status-header text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/logo_new.svg"
              alt="Bom Custo Papelaria & Gráfica Rápida"
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

                <div className="my-4">
                  <span className={`${badgeClass} status-pill`}>{statusLabel}</span>
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
