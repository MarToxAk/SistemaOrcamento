import pathlib

CONTENT = '''\
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type StatusState = "loading" | "loaded" | "error";

const STATUS_INFO: Record<string, { emoji: string; label: string; description: string; color: string }> = {
  pendente:            { emoji: "\u{1F550}", label: "Pendente",             description: "Seu or\u00e7amento foi recebido e est\u00e1 aguardando confirma\u00e7\u00e3o.",                      color: "#6c757d" },
  enviado:             { emoji: "\u{1F4E4}", label: "Enviado",              description: "O or\u00e7amento foi enviado para an\u00e1lise. Aguardando sua aprova\u00e7\u00e3o.",                color: "#0d6efd" },
  aprovado:            { emoji: "\u2705", label: "Aprovado",             description: "Or\u00e7amento aprovado! Em breve seu pedido entra em produ\u00e7\u00e3o.",                    color: "#198754" },
  pagamento_parcial:   { emoji: "\u{1F4B0}", label: "Pagamento Parcial",    description: "Recebemos parte do pagamento. Aguardando quita\u00e7\u00e3o para iniciar a produ\u00e7\u00e3o.",    color: "#fd7e14" },
  em_producao:         { emoji: "\u{1F3A8}", label: "Em Produ\u00e7\u00e3o",          description: "Seu pedido est\u00e1 sendo produzido pela nossa equipe.",                            color: "#e6a817" },
  pronto_para_entrega: { emoji: "\u{1F4E6}", label: "Pronto para Retirada", description: "Seu pedido est\u00e1 pronto! Pode passar na loja quando quiser.",                   color: "#0aa2c0" },
  entregue:            { emoji: "\u{1F389}", label: "Entregue",             description: "Pedido entregue. Obrigado pela prefer\u00eancia!",                                  color: "#6f42c1" },
  cancelado:           { emoji: "\u274C", label: "Cancelado",            description: "Este or\u00e7amento foi cancelado. D\u00favidas? Fale conosco.",                          color: "#dc3545" },
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
        if (!res.ok) throw new Error("Or\u00e7amento n\u00e3o encontrado.");
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

  const info = STATUS_INFO[statusKey];
  const badgeEmoji = info?.emoji ?? "";
  const badgeLabel = info?.label ?? statusLabel;
  const badgeDescription = info?.description ?? "";
  const badgeColor = info?.color ?? "#6c757d";

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
          color: #fff;
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
              alt="Bom Custo Papelaria &amp; Gr\u00e1fica R\u00e1pida"
              style={{ maxWidth: 140, maxHeight: 80, background: "#fff", borderRadius: 8, padding: 6 }}
            />
            <div className="mt-2 small text-muted">Bom Custo Papelaria &amp; Gr\u00e1fica R\u00e1pida</div>
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
                  <div className="text-muted mb-1 small">Or\u00e7amento #{quoteNumber}</div>
                )}
                {clientName && (
                  <div className="text-muted mb-4 small">{clientName}</div>
                )}

                <div className="my-4">
                  <span
                    className="status-pill"
                    style={{ backgroundColor: badgeColor }}
                  >
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
                  D\u00favidas? Fale conosco:{" "}
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
'''

p = pathlib.Path("apps/frontend/src/app/orcamento/[id]/status/page.tsx")
p.write_text(CONTENT, encoding="utf-8")
print("ok", p.stat().st_size, "bytes")
