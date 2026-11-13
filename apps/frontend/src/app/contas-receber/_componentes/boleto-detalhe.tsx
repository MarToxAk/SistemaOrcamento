"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatBRL, formatDateHora } from "../_shared/formatadores";

interface DetalheBoleto {
  id: number;
  status: string;
  linhaDigitavel: string | null;
  pixCopiaECola: string | null;
  consultaEfi: "ok" | "sem_charge" | "falha";
  avisoEfi: string | null;
  titulos: Array<{ idcontareceber: number; valor: number }>;
}

interface HistoricoBaixa {
  id: number;
  operacao: "baixa" | "estorno";
  origem: string;
  resultado: string;
  codigoErro: string | null;
  mensagem: string | null;
  criadoEm: string;
}

interface StatusBaixaAthos {
  athosBaixaStatus: string | null;
  historico: HistoricoBaixa[];
}

interface UltimoAvisoDescrito {
  texto: string;
  className: string;
}

interface BoletoDetalheProps {
  cobrancaId: number;
  status: string;
  ultimoAviso?: UltimoAvisoDescrito | null;
  acoes?: ReactNode;
}

/**
 * Copia o texto para a area de transferencia. Fora de contexto seguro (app aberto por HTTP na rede local)
 * `navigator.clipboard` nao existe: usa uma textarea temporaria fora da tela e `execCommand`.
 * Nunca lanca; o texto nao e gravado em storage nem em log.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // cai para a alternativa abaixo
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.left = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, texto.length);
    let copiou = false;
    try {
      copiou = document.execCommand("copy");
    } finally {
      document.body.removeChild(area);
    }
    return copiou;
  } catch {
    return false;
  }
}

const ROTULO_RESULTADO: Record<string, string> = {
  baixado: "Baixado",
  ja_baixado: "Já Baixado",
  pendente: "Pendente",
  falha: "Falha",
  estornado: "Estornado",
};

function rotuloResultado(resultado: string): string {
  const conhecido = ROTULO_RESULTADO[resultado];
  if (conhecido) return conhecido;
  return resultado
    .split("_")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function rotuloOrigem(origem: string): string {
  return origem
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function CampoCopiavel({ rotulo, valor, vazio }: { rotulo: string; valor: string | null; vazio: string }) {
  const [estado, setEstado] = useState<"ocioso" | "copiado" | "falhou">("ocioso");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copiar() {
    if (!valor) return;
    const ok = await copiarTexto(valor);
    setEstado(ok ? "copiado" : "falhou");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setEstado("ocioso"), 2000);
  }

  return (
    <div className="pa-detalhe-bloco">
      <div className="pa-detalhe-rotulo">{rotulo}</div>
      {valor ? (
        <div className="pa-detalhe-copiavel">
          <span className="pa-mono">{valor}</span>
          <button
            type="button"
            className="pa-link-btn bg-transparent text-nowrap"
            onClick={() => void copiar()}
            title={`Copiar ${rotulo}`}
          >
            <i className={`bi ${estado === "copiado" ? "bi-check2" : "bi-clipboard"} me-1`} />
            {estado === "copiado" ? "Copiado!" : estado === "falhou" ? "Não foi possível copiar" : "Copiar"}
          </button>
        </div>
      ) : (
        <span className="text-muted small">{vazio}</span>
      )}
    </div>
  );
}

/** Detalhe do boleto: linha digitavel e PIX (EFI), titulos, ultimo aviso, historico de baixa no Athos e acoes. */
export default function BoletoDetalhe({ cobrancaId, status, ultimoAviso, acoes }: BoletoDetalheProps) {
  const [detalhe, setDetalhe] = useState<DetalheBoleto | null>(null);
  const [detalheCarregando, setDetalheCarregando] = useState(true);
  const [detalheErro, setDetalheErro] = useState("");
  const [baixa, setBaixa] = useState<StatusBaixaAthos | null>(null);
  const [baixaCarregando, setBaixaCarregando] = useState(true);
  const [baixaErro, setBaixaErro] = useState("");

  useEffect(() => {
    let cancelado = false;

    async function carregarDetalhe() {
      setDetalheCarregando(true);
      setDetalheErro("");
      try {
        const res = await fetch(`/api/cobranca/boleto/${cobrancaId}/detalhe`, { cache: "no-store" });
        if (!res.ok) throw new Error("detalhe");
        const dados = (await res.json()) as DetalheBoleto;
        if (!cancelado) setDetalhe(dados);
      } catch {
        if (!cancelado) setDetalheErro("Não foi possível carregar o detalhe do boleto.");
      } finally {
        if (!cancelado) setDetalheCarregando(false);
      }
    }

    async function carregarBaixa() {
      setBaixaCarregando(true);
      setBaixaErro("");
      try {
        const res = await fetch(`/api/cobranca/boleto/${cobrancaId}/baixa-athos`, { cache: "no-store" });
        if (!res.ok) throw new Error("baixa");
        const dados = (await res.json()) as StatusBaixaAthos;
        if (!cancelado) setBaixa(dados);
      } catch {
        if (!cancelado) setBaixaErro("Não foi possível carregar o histórico de baixa.");
      } finally {
        if (!cancelado) setBaixaCarregando(false);
      }
    }

    void Promise.all([carregarDetalhe(), carregarBaixa()]);
    return () => {
      cancelado = true;
    };
  }, [cobrancaId, status]);

  const totalTitulos = detalhe ? detalhe.titulos.reduce((soma, t) => soma + t.valor, 0) : 0;

  return (
    <div className="pa-detalhe-grid">
      <div className="pa-detalhe-principal">
        {detalheCarregando ? (
          <div className="text-muted small">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Carregando detalhe...
          </div>
        ) : detalheErro ? (
          <div className="text-danger small">{detalheErro}</div>
        ) : detalhe ? (
          <>
            <CampoCopiavel
              rotulo="Linha Digitável"
              valor={detalhe.linhaDigitavel}
              vazio="Linha digitável indisponível para este boleto"
            />
            <CampoCopiavel
              rotulo="PIX Copia e Cola"
              valor={detalhe.pixCopiaECola}
              vazio="PIX indisponível para este boleto"
            />
            {detalhe.avisoEfi && <p className="text-muted small mb-2">{detalhe.avisoEfi}</p>}
            <div className="pa-detalhe-bloco">
              <div className="pa-detalhe-rotulo">Títulos Incluídos</div>
              {detalhe.titulos.length === 0 ? (
                <span className="text-muted small">Nenhum título vinculado.</span>
              ) : (
                <dl className="pa-kv">
                  {detalhe.titulos.map((t) => (
                    <div key={t.idcontareceber}>
                      <dt>Título #{t.idcontareceber}</dt>
                      <dd>{formatBRL(t.valor)}</dd>
                    </div>
                  ))}
                  <div className="pa-kv-total">
                    <dt>Total</dt>
                    <dd>{formatBRL(totalTitulos)}</dd>
                  </div>
                </dl>
              )}
            </div>
          </>
        ) : null}
        <div className="pa-detalhe-bloco">
          <div className="pa-detalhe-rotulo">Último Aviso</div>
          {ultimoAviso ? (
            <span className={`small ${ultimoAviso.className}`}>{ultimoAviso.texto}</span>
          ) : (
            <span className="text-muted small">Nenhum aviso registrado.</span>
          )}
        </div>
      </div>

      <div className="pa-detalhe-lateral">
        <div className="pa-detalhe-bloco">
          <div className="pa-detalhe-rotulo">Histórico de Baixa no Athos</div>
          {baixaCarregando ? (
            <div className="text-muted small">
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Carregando histórico...
            </div>
          ) : baixaErro ? (
            <div className="text-danger small">{baixaErro}</div>
          ) : !baixa || baixa.historico.length === 0 ? (
            <span className="text-muted small">Nenhuma tentativa de baixa registrada.</span>
          ) : (
            <ul className="pa-timeline">
              {baixa.historico.map((h) => (
                <li key={h.id}>
                  <b>{formatDateHora(h.criadoEm)}</b>
                  <span>
                    {h.operacao === "estorno" ? "Estorno" : "Baixa"} · {rotuloOrigem(h.origem)} ·{" "}
                    <em>{rotuloResultado(h.resultado)}</em>
                    {(h.codigoErro || h.mensagem) && (
                      <small className="d-block text-danger">
                        {[h.codigoErro, h.mensagem].filter(Boolean).join(": ")}
                      </small>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {acoes && <div className="pa-acoes">{acoes}</div>}
      </div>

      <style>{`
        .pa-detalhe-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
          gap: 1.25rem;
          padding: 1rem 1.1rem;
          background: var(--pa-bg);
          border-top: 1px solid var(--pa-border);
        }
        @media (max-width: 1000px) { .pa-detalhe-grid { grid-template-columns: 1fr; } }
        .pa-detalhe-principal, .pa-detalhe-lateral { min-width: 0; }
        .pa-detalhe-bloco { margin-bottom: 0.9rem; }
        .pa-detalhe-rotulo {
          color: var(--pa-text-muted);
          text-transform: uppercase;
          letter-spacing: .05em;
          font-size: 0.7rem;
          font-weight: 700;
          margin-bottom: 0.3rem;
        }
        .pa-detalhe-copiavel { display: flex; align-items: flex-start; gap: 0.6rem; }
        .pa-mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.82rem;
          color: var(--pa-text);
          word-break: break-all;
          overflow-wrap: anywhere;
          flex: 1 1 auto;
          min-width: 0;
        }
        .pa-kv { margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
        .pa-kv > div { display: flex; justify-content: space-between; gap: 0.75rem; font-size: 0.85rem; }
        .pa-kv dt { color: var(--pa-text-muted); font-weight: 500; }
        .pa-kv dd { margin: 0; color: var(--pa-text); text-align: right; font-weight: 600; }
        .pa-kv-total { border-top: 1px solid var(--pa-border); padding-top: 0.3rem; }
        .pa-kv-total dt, .pa-kv-total dd { color: var(--pa-text); font-weight: 700; }
        .pa-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
        .pa-timeline li {
          display: grid;
          grid-template-columns: 8.5rem minmax(0, 1fr);
          gap: 0.6rem;
          padding-left: 0.6rem;
          border-left: 2px solid var(--pa-border);
          font-size: 0.82rem;
          color: var(--pa-text-muted);
        }
        .pa-timeline li b { color: var(--pa-text); font-weight: 700; }
        .pa-timeline li em { color: var(--pa-accent); font-style: normal; font-weight: 700; }
        .pa-acoes {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.4rem;
          margin-top: 0.5rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--pa-border);
        }
      `}</style>
    </div>
  );
}
