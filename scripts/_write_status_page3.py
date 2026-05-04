import pathlib

# Emojis as Python unicode escapes
emojis = {
    "pendente":            "\U0001F550",
    "enviado":             "\U0001F4E4",
    "aprovado":            "\u2705",
    "pagamento_parcial":   "\U0001F4B0",
    "em_producao":         "\U0001F3A8",
    "pronto_para_entrega": "\U0001F4E6",
    "entregue":            "\U0001F389",
    "cancelado":           "\u274C",
}

status_lines = [
    f'  pendente:            {{ emoji: "{emojis["pendente"]}", label: "Pendente",             description: "Seu or\u00e7amento foi recebido e est\u00e1 aguardando confirma\u00e7\u00e3o.",                      color: "#6c757d" }},',
    f'  enviado:             {{ emoji: "{emojis["enviado"]}", label: "Enviado",              description: "O or\u00e7amento foi enviado para an\u00e1lise. Aguardando sua aprova\u00e7\u00e3o.",                color: "#0d6efd" }},',
    f'  aprovado:            {{ emoji: "{emojis["aprovado"]}", label: "Aprovado",             description: "Or\u00e7amento aprovado! Em breve seu pedido entra em produ\u00e7\u00e3o.",                    color: "#198754" }},',
    f'  pagamento_parcial:   {{ emoji: "{emojis["pagamento_parcial"]}", label: "Pagamento Parcial",    description: "Recebemos parte do pagamento. Aguardando quita\u00e7\u00e3o para iniciar a produ\u00e7\u00e3o.",    color: "#fd7e14" }},',
    f'  em_producao:         {{ emoji: "{emojis["em_producao"]}", label: "Em Produ\u00e7\u00e3o",          description: "Seu pedido est\u00e1 sendo produzido pela nossa equipe.",                            color: "#e6a817" }},',
    f'  pronto_para_entrega: {{ emoji: "{emojis["pronto_para_entrega"]}", label: "Pronto para Retirada", description: "Seu pedido est\u00e1 pronto! Pode passar na loja quando quiser.",                   color: "#0aa2c0" }},',
    f'  entregue:            {{ emoji: "{emojis["entregue"]}", label: "Entregue",             description: "Pedido entregue. Obrigado pela prefer\u00eancia!",                                  color: "#6f42c1" }},',
    f'  cancelado:           {{ emoji: "{emojis["cancelado"]}", label: "Cancelado",            description: "Este or\u00e7amento foi cancelado. D\u00favidas? Fale conosco.",                          color: "#dc3545" }},',
]

status_info_block = "\n".join(status_lines)

content = f'''"use client";

import Script from "next/script";
import {{ useParams }} from "next/navigation";
import {{ useEffect, useState }} from "react";

type StatusState = "loading" | "loaded" | "error";

const STATUS_INFO: Record<string, {{ emoji: string; label: string; description: string; color: string }}> = {{
{status_info_block}
}};

export default function StatusPage() {{
  const {{ id }} = useParams<{{ id: string }}>();

  const [pageState, setPageState] = useState<StatusState>("loading");
  const [statusLabel, setStatusLabel] = useState<string>("-");
  const [statusKey, setStatusKey] = useState<string>("");
  const [quoteNumber, setQuoteNumber] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {{
    const load = async () => {{
      try {{
        const res = await fetch(`/api/quotes/${{encodeURIComponent(id)}}`);
        if (!res.ok) throw new Error("Or\u00e7amento n\u00e3o encontrado.");
        const data = await res.json();

        setStatusLabel(data?.statusLabel ?? data?.body?.status ?? "-");
        setStatusKey((data?.statusKey ?? "").toLowerCase());
        setQuoteNumber(data?.body?.idorcamento_interno ?? null);
        setClientName(data?.body?.cliente?.nome ?? "");
        setUpdatedAt(data?.updatedAt ?? null);
        setPageState("loaded");
      }} catch (err) {{
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar status.");
        setPageState("error");
      }}
    }};

    void load();
  }}, [id]);

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

      <style>{{`
        body {{ margin: 0; background-color: #f9f7ed; }}
        .status-card {{
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0,0,0,0.10);
          width: 100%;
          max-width: 480px;
        }}
        .status-header {{
          background: linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%);
          padding: 24px 20px 16px 20px;
        }}
        .status-pill {{
          font-size: 1.1rem;
          padding: 10px 24px;
          border-radius: 50px;
          display: inline-block;
          color: #fff;
          font-weight: 600;
        }}
        .page-wrapper {{
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          background-color: #f9f7ed;
          box-sizing: border-box;
        }}
      `}}</style>

      <div className="page-wrapper">
        <div className="status-card bg-white">
          <div className="status-header text-center">
            {{/* eslint-disable-next-line @next/next/no-img-element */}}
            <img
              src="/media/logo_new.svg"
              alt="Bom Custo Papelaria &amp; Gr\u00e1fica R\u00e1pida"
              style={{{{ maxWidth: 140, maxHeight: 80, background: "#fff", borderRadius: 8, padding: 6 }}}}
            />
            <div className="mt-2 small text-muted">Bom Custo Papelaria &amp; Gr\u00e1fica R\u00e1pida</div>
          </div>

          <div className="p-4 text-center">
            {{/* Loading */}}
            {{pageState === "loading" && (
              <div className="py-4">
                <div className="spinner-border text-secondary" role="status" />
                <div className="mt-3 text-muted">Carregando status...</div>
              </div>
            )}}

            {{/* Error */}}
            {{pageState === "error" && (
              <div className="py-2">
                <div className="alert alert-danger">{{errorMessage}}</div>
                <div className="small text-muted mt-2">
                  Entre em contato:{{" "}}
                  <a href="https://wa.me/5512996484918" className="text-decoration-none">
                    (12) 99648-4918
                  </a>
                </div>
              </div>
            )}}

            {{/* Loaded */}}
            {{pageState === "loaded" && (
              <>
                <h5 className="mb-1">Status do Pedido</h5>
                {{quoteNumber && (
                  <div className="text-muted mb-1 small">Or\u00e7amento #{{quoteNumber}}</div>
                )}}
                {{clientName && (
                  <div className="text-muted mb-4 small">{{clientName}}</div>
                )}}

                <div className="my-4">
                  <span className="status-pill" style={{{{ backgroundColor: badgeColor }}}}>
                    {{badgeEmoji}} {{badgeLabel}}
                  </span>
                  {{badgeDescription && (
                    <p className="text-muted mt-3 mb-0 small px-2">{{badgeDescription}}</p>
                  )}}
                </div>

                {{updatedAt && (
                  <div className="text-muted small mb-4">
                    Atualizado em{{" "}}
                    {{new Date(updatedAt).toLocaleDateString("pt-BR", {{
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }})}}
                  </div>
                )}}

                <div className="border-top pt-3 small text-muted">
                  D\u00favidas? Fale conosco:{{" "}}
                  <a href="https://wa.me/5512996484918" className="text-decoration-none fw-semibold">
                    (12) 99648-4918
                  </a>
                </div>
              </>
            )}}
          </div>
        </div>
      </div>
    </>
  );
}}
'''

p = pathlib.Path("apps/frontend/src/app/orcamento/[id]/status/page.tsx")
p.write_text(content, encoding="utf-8")
print("ok", p.stat().st_size, "bytes")
