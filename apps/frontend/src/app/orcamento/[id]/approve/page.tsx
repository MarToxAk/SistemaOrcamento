"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type ApproveState = "loading-quote" | "idle" | "submitting" | "success" | "error" | "no-token";

export default function ApprovePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<ApproveState>("loading-quote");
  const [quoteNumber, setQuoteNumber] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

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

        // If already approved, show success state immediately
        if (data?.approved) {
          setState("success");
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
      <style>{`
        body { background-color: #f9f7ed; }
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
      `}</style>

      <div
        className="min-vh-100 d-flex align-items-center justify-content-center px-3"
        style={{ backgroundColor: "#f9f7ed" }}
      >
        <div className="approve-card bg-white">
          <div className="approve-header text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/logo_new.svg"
              alt="Bom Custo Papelaria & Gráfica Rápida"
              style={{ maxWidth: 140, maxHeight: 80, background: "#fff", borderRadius: 8, padding: 6 }}
            />
            <div className="mt-2 small text-muted">Bom Custo Papelaria &amp; Gráfica Rápida</div>
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
                  Recebemos sua aprovação. Em breve nossa equipe entrará em contato.
                </p>
                <div className="mt-3 border-top pt-3 small text-muted">
                  Dúvidas? Fale conosco:{" "}
                  <a href="https://wa.me/5512996484918" className="text-decoration-none fw-semibold">
                    (12) 99648-4918
                  </a>
                </div>
              </div>
            )}

            {/* Error */}
            {state === "error" && (
              <div className="py-2">
                <div className="alert alert-danger">{errorMessage || "Ocorreu um erro inesperado."}</div>
                <div className="small text-muted mt-2">
                  Tente novamente ou entre em contato:{" "}
                  <a href="https://wa.me/5512996484918" className="text-decoration-none">
                    (12) 99648-4918
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
