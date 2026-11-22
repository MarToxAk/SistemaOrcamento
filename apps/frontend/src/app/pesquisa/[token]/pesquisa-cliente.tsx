"use client";

// Formulario da pesquisa publica (fase 52, plano 52-02). Unico Client Component da rota:
// o estado inicial e resolvido no servidor (page.tsx) e entregue via `estadoInicial`.
// Estilos 100% locais (classe com prefixo `pesquisa-`), sem Bootstrap CSS e sem tema fixo
// (UI-D02). A unica folha externa e bootstrap-icons 1.11.1, carregada na pagina servidor com SRI.

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import {
  ROTULOS_NOTA,
  TEXTO_LGPD,
  TEXTO_NOTA_LEGAL_GOOGLE,
  TEXTO_OPT_OUT,
  linkGoogleSeguro,
  mensagemErroEnvio,
  type EstadoPagina,
  type PesquisaPublicaView,
  type RespostaPublica,
  type TextosPagina,
} from "@/lib/pesquisa-publica";

type Empresa = { nome: string; logoUrl: string; whatsapp: string; corFallback: string };

type Fase = EstadoPagina | { tipo: "OBRIGADO"; resposta: RespostaPublica };

const ERRO_SEM_NOTA = "Escolha uma nota de 1 a 5 antes de enviar.";

const EMOJIS_CARINHAS = [
  "bi-emoji-angry",
  "bi-emoji-frown",
  "bi-emoji-neutral",
  "bi-emoji-smile",
  "bi-emoji-laughing",
] as const;

function corAtual(fase: Fase, fallback: string): string {
  if (fase.tipo === "ABERTA" || fase.tipo === "RESPONDIDA") return fase.corPrimaria || fallback;
  if (fase.tipo === "OBRIGADO") return fase.resposta.corPrimaria || fallback;
  return fallback;
}

function viewParaEstado(view: PesquisaPublicaView): EstadoPagina {
  if (view.estado === "ABERTA") {
    return { tipo: "ABERTA", variante: view.variante, textos: view.textos, corPrimaria: view.corPrimaria, linkGoogle: view.linkGoogle };
  }
  if (view.estado === "RESPONDIDA") {
    return { tipo: "RESPONDIDA", textos: view.textos, corPrimaria: view.corPrimaria, linkGoogle: view.linkGoogle };
  }
  return { tipo: "INDISPONIVEL" };
}

function formatarPercentual(valor: number): string {
  return Number.isInteger(valor)
    ? `${valor}%`
    : `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function PesquisaCliente({
  token,
  estadoInicial,
  empresa,
}: {
  token: string;
  estadoInicial: EstadoPagina;
  empresa: Empresa;
}) {
  const [fase, setFase] = useState<Fase>(estadoInicial);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const emEnvio = useRef(false);
  const campoNotaRef = useRef<HTMLFieldSetElement>(null);
  const tituloObrigadoRef = useRef<HTMLHeadingElement>(null);
  const codigoRef = useRef<HTMLDivElement>(null);
  const timerCopiadoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cor = corAtual(fase, empresa.corFallback);

  useEffect(() => {
    if (fase.tipo === "OBRIGADO") tituloObrigadoRef.current?.focus();
  }, [fase]);

  useEffect(
    () => () => {
      if (timerCopiadoRef.current) clearTimeout(timerCopiadoRef.current);
    },
    [],
  );

  function selecionarNota(n: number) {
    setNota(n);
    setErroEnvio(null);
  }

  async function copiarCodigo(codigo: string) {
    if (timerCopiadoRef.current) clearTimeout(timerCopiadoRef.current);
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado("Código copiado.");
    } catch {
      const el = codigoRef.current;
      if (el) {
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      setCopiado("Selecione e copie o código.");
    }
    timerCopiadoRef.current = setTimeout(() => setCopiado(null), 2000);
  }

  async function enviar() {
    if (emEnvio.current) return;
    if (nota === null) {
      setErroEnvio(ERRO_SEM_NOTA);
      campoNotaRef.current?.focus();
      return;
    }

    emEnvio.current = true;
    setEnviando(true);
    setErroEnvio(null);

    const comentarioLimpo = comentario.trim();
    const corpo: { nota: number; comentario?: string } = { nota };
    if (comentarioLimpo) corpo.comentario = comentarioLimpo;

    try {
      const res = await fetch(`/pesquisa/${encodeURIComponent(token)}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const data: unknown = await res.json().catch(() => null);

      if (res.ok) {
        setFase({ tipo: "OBRIGADO", resposta: data as RespostaPublica });
      } else if (res.status === 409) {
        setFase(viewParaEstado(data as PesquisaPublicaView));
      } else if (res.status === 404) {
        setFase({ tipo: "INDISPONIVEL" });
      } else {
        setErroEnvio(mensagemErroEnvio(res.status));
      }
    } catch {
      setErroEnvio(mensagemErroEnvio("rede"));
    } finally {
      emEnvio.current = false;
      setEnviando(false);
    }
  }

  return (
    <div className="pesquisa-pagina" style={{ "--pesquisa-cor": cor } as CSSProperties}>
      <style>{`
        .pesquisa-pagina {
          background: #ffffff;
          min-height: 100vh;
          min-height: 100dvh;
          box-sizing: border-box;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #1b2431;
        }
        .pesquisa-cabecalho {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          max-width: 480px;
          margin-bottom: 20px;
        }
        .pesquisa-logo-tile {
          width: 64px;
          height: 64px;
          flex: 0 0 64px;
          box-sizing: border-box;
          background: #ffffff;
          border: 1px solid #e6e9f0;
          border-radius: 8px;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .pesquisa-logo-tile img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .pesquisa-logo-tile i { font-size: 2rem; color: var(--pesquisa-cor); }
        .pesquisa-nome { font-size: 1.25rem; font-weight: 600; line-height: 1.2; }
        .pesquisa-card {
          width: 100%;
          max-width: 480px;
          box-sizing: border-box;
          background: #ffffff;
          border: 1px solid #e6e9f0;
          border-radius: 12px;
          padding: 16px;
        }
        @media (min-width: 480px) {
          .pesquisa-card { padding: 24px; }
        }
        .pesquisa-titulo { font-size: 1.25rem; font-weight: 600; line-height: 1.2; margin: 0 0 8px; }
        .pesquisa-titulo:focus { outline: none; }
        .pesquisa-subtitulo { font-size: 1rem; font-weight: 400; line-height: 1.5; color: #5b6778; margin: 0 0 16px; }
        .pesquisa-fieldset { border: 0; margin: 0 0 16px; padding: 0; }
        .pesquisa-fieldset:focus { outline: none; }
        .pesquisa-legend { font-size: 1rem; font-weight: 600; line-height: 1.5; margin: 0 0 4px; padding: 0; }
        .pesquisa-ajuda { font-size: 0.8rem; font-weight: 400; line-height: 1.4; color: #5b6778; margin: 0 0 8px; }
        .pesquisa-opcoes { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
        .pesquisa-opcao {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }
        .pesquisa-radio {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          border: 0;
          clip: rect(0, 0, 0, 0);
          clip-path: inset(50%);
          overflow: hidden;
          white-space: nowrap;
        }
        .pesquisa-icone {
          box-sizing: border-box;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #8a94a3;
          border-radius: 8px;
          font-size: 1.5rem;
          color: #5b6778;
          transition: color 0.2s, border-color 0.2s;
        }
        .pesquisa-icone-ativa { color: var(--pesquisa-cor); border-color: var(--pesquisa-cor); }
        .pesquisa-radio:focus-visible + .pesquisa-icone { outline: 3px solid var(--pesquisa-cor); outline-offset: 2px; }
        .pesquisa-rotulo {
          font-size: 0.8rem;
          font-weight: 400;
          line-height: 1.4;
          color: #5b6778;
          text-align: center;
          word-break: break-word;
        }
        .pesquisa-rotulo-ativa { color: #1b2431; font-weight: 600; }
        .pesquisa-live {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          border: 0;
          clip: rect(0, 0, 0, 0);
          clip-path: inset(50%);
          overflow: hidden;
          white-space: nowrap;
        }
        .pesquisa-campo { margin-bottom: 16px; }
        .pesquisa-label { display: block; font-size: 1rem; font-weight: 600; line-height: 1.5; margin-bottom: 4px; }
        .pesquisa-textarea {
          box-sizing: border-box;
          width: 100%;
          min-height: 96px;
          padding: 8px 10px;
          font-size: 1rem;
          line-height: 1.5;
          font-family: inherit;
          color: #1b2431;
          background: #ffffff;
          border: 1px solid #8a94a3;
          border-radius: 8px;
          resize: vertical;
        }
        .pesquisa-textarea:focus-visible { outline: 3px solid var(--pesquisa-cor); outline-offset: 2px; }
        .pesquisa-contador { font-size: 0.8rem; font-weight: 400; line-height: 1.4; color: #5b6778; text-align: right; margin-top: 4px; }
        .pesquisa-alerta {
          box-sizing: border-box;
          background: #fbe5e6;
          color: #b02a37;
          border: 1px solid #e5484d;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 0.8rem;
          line-height: 1.4;
          margin-bottom: 16px;
        }
        .pesquisa-botao {
          box-sizing: border-box;
          width: 100%;
          height: 48px;
          border: none;
          border-radius: 8px;
          background: var(--pesquisa-cor);
          color: #ffffff;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .pesquisa-botao:disabled { opacity: 0.65; cursor: default; }
        .pesquisa-botao:focus-visible { outline: 3px solid var(--pesquisa-cor); outline-offset: 2px; }
        .pesquisa-spinner {
          width: 1rem;
          height: 1rem;
          border: 2px solid rgba(255, 255, 255, 0.4);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: pesquisa-girar 0.8s linear infinite;
        }
        @keyframes pesquisa-girar { to { transform: rotate(360deg); } }
        .pesquisa-rodape {
          margin-top: 16px;
          font-size: 0.8rem;
          font-weight: 400;
          line-height: 1.4;
          color: #5b6778;
          text-align: center;
        }
        .pesquisa-cupom {
          box-sizing: border-box;
          background: #f4f6fa;
          border-left: 4px solid var(--pesquisa-cor);
          border-radius: 8px;
          padding: 16px;
          margin-top: 16px;
        }
        .pesquisa-cupom-titulo {
          font-size: 0.8rem;
          font-weight: 600;
          line-height: 1.4;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #5b6778;
          margin: 0 0 8px;
        }
        .pesquisa-cupom-codigo {
          font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 2rem;
          font-weight: 600;
          line-height: 1.1;
          overflow-wrap: anywhere;
          word-break: break-word;
          color: #1b2431;
          margin: 0 0 12px;
        }
        .pesquisa-cupom-linha { font-size: 1rem; font-weight: 400; line-height: 1.5; color: #1b2431; margin: 0 0 4px; }
        .pesquisa-botao-copiar {
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 40px;
          padding: 0 12px;
          font-size: 0.8rem;
          font-weight: 600;
          border: 1px solid #8a94a3;
          border-radius: 8px;
          background: #ffffff;
          color: #1b2431;
          cursor: pointer;
        }
        .pesquisa-botao-copiar:focus-visible { outline: 3px solid var(--pesquisa-cor); outline-offset: 2px; }
        .pesquisa-copiado { font-size: 0.8rem; font-weight: 400; line-height: 1.4; color: #5b6778; margin-top: 8px; }
        .pesquisa-google {
          box-sizing: border-box;
          background: #f4f6fa;
          border-radius: 8px;
          padding: 16px;
          margin-top: 24px;
        }
        .pesquisa-google-titulo { font-size: 1.25rem; font-weight: 600; line-height: 1.2; margin: 0 0 8px; }
        .pesquisa-google-corpo { font-size: 1rem; font-weight: 400; line-height: 1.5; color: #1b2431; margin: 0 0 8px; }
        .pesquisa-google-nota { font-size: 0.8rem; font-weight: 400; line-height: 1.4; color: #5b6778; margin: 0 0 12px; }
        .pesquisa-botao-google {
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          height: 48px;
          border: 2px solid var(--pesquisa-cor);
          border-radius: 8px;
          background: transparent;
          color: var(--pesquisa-cor);
          font-size: 1rem;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
        }
        .pesquisa-botao-google:focus-visible { outline: 3px solid var(--pesquisa-cor); outline-offset: 2px; }
        @media (max-width: 359px) {
          .pesquisa-opcoes { gap: 4px; }
          .pesquisa-icone { width: 48px; height: 48px; font-size: 1.25rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pesquisa-icone { transition: none; }
          .pesquisa-spinner { animation: none; }
        }
      `}</style>

      <Cabecalho empresa={empresa} />

      <main className="pesquisa-card">
        {fase.tipo === "ABERTA" && (
          <Formulario
            variante={fase.variante}
            textos={fase.textos}
            nota={nota}
            comentario={comentario}
            enviando={enviando}
            erroEnvio={erroEnvio}
            campoNotaRef={campoNotaRef}
            onSelecionarNota={selecionarNota}
            onComentario={setComentario}
            onEnviar={enviar}
          />
        )}

        {fase.tipo === "OBRIGADO" && (
          <Obrigado
            resposta={fase.resposta}
            copiado={copiado}
            tituloRef={tituloObrigadoRef}
            codigoRef={codigoRef}
            onCopiar={copiarCodigo}
          />
        )}

        {fase.tipo === "RESPONDIDA" && <JaRespondida textos={fase.textos} linkGoogle={fase.linkGoogle} />}

        {fase.tipo === "INDISPONIVEL" && <Indisponivel whatsapp={empresa.whatsapp} />}

        {fase.tipo === "ERRO" && <ErroCarregamento />}
      </main>
    </div>
  );
}

function Cabecalho({ empresa }: { empresa: Empresa }) {
  return (
    <header className="pesquisa-cabecalho">
      <div className="pesquisa-logo-tile">
        {empresa.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={empresa.logoUrl} alt="" />
        ) : (
          <i className="bi bi-shop" aria-hidden="true" />
        )}
      </div>
      <div className="pesquisa-nome">{empresa.nome}</div>
    </header>
  );
}

function Formulario({
  variante,
  textos,
  nota,
  comentario,
  enviando,
  erroEnvio,
  campoNotaRef,
  onSelecionarNota,
  onComentario,
  onEnviar,
}: {
  variante: "ESTRELAS" | "CARINHAS";
  textos: TextosPagina;
  nota: number | null;
  comentario: string;
  enviando: boolean;
  erroEnvio: string | null;
  campoNotaRef: RefObject<HTMLFieldSetElement>;
  onSelecionarNota: (n: number) => void;
  onComentario: (valor: string) => void;
  onEnviar: () => void;
}) {
  return (
    <form aria-busy={enviando} onSubmit={(e) => { e.preventDefault(); onEnviar(); }}>
      <h1 className="pesquisa-titulo">{textos.titulo}</h1>
      <p className="pesquisa-subtitulo">{textos.subtitulo}</p>

      <div className="pesquisa-live" aria-live="polite">
        {nota !== null ? `Nota selecionada: ${nota} de 5 (${ROTULOS_NOTA[nota - 1]}).` : ""}
      </div>

      <fieldset className="pesquisa-fieldset" ref={campoNotaRef} tabIndex={-1} aria-describedby="pesquisa-nota-ajuda">
        <legend className="pesquisa-legend">Qual nota você dá para o atendimento?</legend>
        <p className="pesquisa-ajuda" id="pesquisa-nota-ajuda">Toque em uma opção de 1 a 5.</p>
        <div className="pesquisa-opcoes">
          {ROTULOS_NOTA.map((rotulo, idx) => {
            const n = idx + 1;
            const selecionada = nota === n;
            const ativa = variante === "CARINHAS" ? selecionada : nota !== null && n <= nota;
            const icone = variante === "CARINHAS" ? EMOJIS_CARINHAS[idx] : ativa ? "bi-star-fill" : "bi-star";
            return (
              <label key={n} className="pesquisa-opcao">
                <input
                  type="radio"
                  name="nota"
                  value={n}
                  checked={selecionada}
                  onChange={() => onSelecionarNota(n)}
                  disabled={enviando}
                  className="pesquisa-radio"
                  aria-label={`${n} de 5: ${rotulo}`}
                />
                <span className={`pesquisa-icone${ativa ? " pesquisa-icone-ativa" : ""}`} aria-hidden="true">
                  <i className={`bi ${icone}`} aria-hidden="true" />
                </span>
                <span className={`pesquisa-rotulo${selecionada ? " pesquisa-rotulo-ativa" : ""}`}>
                  {n} {rotulo}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="pesquisa-campo">
        <label className="pesquisa-label" htmlFor="pesquisa-comentario">Quer contar mais? (opcional)</label>
        <p className="pesquisa-ajuda" id="pesquisa-comentario-ajuda">Máximo de 500 caracteres.</p>
        <textarea
          id="pesquisa-comentario"
          className="pesquisa-textarea"
          maxLength={500}
          rows={4}
          value={comentario}
          onChange={(e) => onComentario(e.target.value)}
          disabled={enviando}
          aria-describedby="pesquisa-comentario-ajuda"
        />
        <div className="pesquisa-contador">{comentario.length}/500</div>
      </div>

      {erroEnvio && (
        <div className="pesquisa-alerta" role="alert">{erroEnvio}</div>
      )}

      <button type="submit" className="pesquisa-botao" disabled={enviando}>
        {enviando ? (
          <>
            <span className="pesquisa-spinner" aria-hidden="true" />
            Enviando...
          </>
        ) : (
          "Enviar avaliação"
        )}
      </button>

      <p className="pesquisa-rodape">
        {TEXTO_OPT_OUT}
        <br />
        {TEXTO_LGPD}
      </p>
    </form>
  );
}

function Obrigado({
  resposta,
  copiado,
  tituloRef,
  codigoRef,
  onCopiar,
}: {
  resposta: RespostaPublica;
  copiado: string | null;
  tituloRef: RefObject<HTMLHeadingElement>;
  codigoRef: RefObject<HTMLDivElement>;
  onCopiar: (codigo: string) => void;
}) {
  const cupom = resposta.cupom;
  return (
    <div>
      <h1 className="pesquisa-titulo" ref={tituloRef} tabIndex={-1}>
        {cupom ? "Obrigado pela sua avaliação!" : "Obrigado por responder."}
      </h1>
      {cupom ? (
        <CartaoCupom cupom={cupom} copiado={copiado} codigoRef={codigoRef} onCopiar={onCopiar} />
      ) : (
        <p className="pesquisa-subtitulo">{resposta.textos.obrigadoSemRecompensa}</p>
      )}
      <BlocoGoogle textos={resposta.textos} linkGoogle={resposta.linkGoogle} />
    </div>
  );
}

function CartaoCupom({
  cupom,
  copiado,
  codigoRef,
  onCopiar,
}: {
  cupom: NonNullable<RespostaPublica["cupom"]>;
  copiado: string | null;
  codigoRef: RefObject<HTMLDivElement>;
  onCopiar: (codigo: string) => void;
}) {
  return (
    <div className="pesquisa-cupom">
      <p className="pesquisa-cupom-titulo">Seu cupom</p>
      <div className="pesquisa-cupom-codigo" ref={codigoRef}>{cupom.codigo}</div>
      <p className="pesquisa-cupom-linha">
        {formatarPercentual(cupom.percentual)} de desconto, até {formatarReais(cupom.teto)}
      </p>
      <p className="pesquisa-cupom-linha">Compra mínima de {formatarReais(cupom.compraMinima)}</p>
      <p className="pesquisa-cupom-linha">Válido até {formatarDataBR(cupom.validadeAte)}</p>
      <p className="pesquisa-cupom-linha">Uso único. Apresente o código no balcão ao fazer seu pedido.</p>
      <button
        type="button"
        className="pesquisa-botao-copiar"
        aria-label={`Copiar código ${cupom.codigo}`}
        onClick={() => onCopiar(cupom.codigo)}
      >
        <i className="bi bi-copy" aria-hidden="true" />
        Copiar código
      </button>
      <div className="pesquisa-copiado" role="status">{copiado ?? ""}</div>
    </div>
  );
}

function BlocoGoogle({ textos, linkGoogle }: { textos: TextosPagina; linkGoogle: string | null }) {
  const url = linkGoogleSeguro(linkGoogle);
  if (!url) return null;
  return (
    <section className="pesquisa-google" aria-label="Avaliação no Google">
      <h2 className="pesquisa-google-titulo">{textos.googleTitulo}</h2>
      <p className="pesquisa-google-corpo">{textos.googleCorpo}</p>
      <p className="pesquisa-google-nota">{TEXTO_NOTA_LEGAL_GOOGLE}</p>
      <a className="pesquisa-botao-google" href={url} target="_blank" rel="noopener noreferrer">
        Avaliar no Google (abre em nova aba)
      </a>
    </section>
  );
}

function JaRespondida({ textos, linkGoogle }: { textos: TextosPagina; linkGoogle: string | null }) {
  return (
    <div>
      <h1 className="pesquisa-titulo">Sua avaliação já foi registrada</h1>
      <p className="pesquisa-subtitulo">
        Obrigado por responder. Se o cupom não chegou pelo WhatsApp, fale com a gente pelo WhatsApp.
      </p>
      <BlocoGoogle textos={textos} linkGoogle={linkGoogle} />
    </div>
  );
}

function Indisponivel({ whatsapp }: { whatsapp: string }) {
  return (
    <div>
      <h1 className="pesquisa-titulo">Esta pesquisa não está mais disponível</h1>
      <p className="pesquisa-subtitulo">
        O link expirou ou já não é válido. Se quiser falar com a gente, use o WhatsApp da loja.
      </p>
      {whatsapp && (
        <a className="pesquisa-botao" href={`https://wa.me/${whatsapp}`}>
          <i className="bi bi-whatsapp" aria-hidden="true" />
          Falar no WhatsApp
        </a>
      )}
    </div>
  );
}

function ErroCarregamento() {
  return (
    <div>
      <h1 className="pesquisa-titulo">Não foi possível carregar a pesquisa</h1>
      <p className="pesquisa-subtitulo">Tente de novo em instantes.</p>
      <button type="button" className="pesquisa-botao" onClick={() => window.location.reload()}>
        Tentar novamente
      </button>
    </div>
  );
}
