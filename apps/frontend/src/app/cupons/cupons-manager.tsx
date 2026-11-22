"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useFiltrosUrl } from "@/app/contas-receber/_shared/use-filtros-url";
import {
  MSG_SESSAO,
  formatarDataHora,
  formatarPercentual,
  formatarReais,
  lerNumero,
} from "@/lib/pesquisa-admin";

/**
 * Fase 52 (plano 52-10): busca, detalhe, resgate em dois passos e lista recente de cupons (D-17/D-30).
 *
 * - A situação vem pronta do servidor (UI-D09); a tela só exibe, nunca recalcula.
 * - O desconto do resumo é apenas visualização (UI-D10); o servidor recalcula tudo no resgate.
 * - O resgate é irreversível e em dois passos (UI-D11): depois de confirmar, o cupom é SEMPRE
 *   recarregado do servidor — nunca atualizado de forma otimista.
 * - Telefone só no campo mascarado do servidor (T-52-54); nenhuma chamada ao Athos ou ao PDV.
 */

type SituacaoCupom = "EMITIDO" | "SUSPENSO" | "USADO" | "EXPIRADO" | "CANCELADO";

interface CupomListaItem {
  codigo: string;
  criadoEm: string;
  telefoneMascarado: string;
  percentual: number;
  teto: number;
  compraMinima: number;
  validadeAte: string;
  situacao: SituacaoCupom;
  usadoEm: string | null;
  descontoAplicado: number | null;
  notaPesquisa: number | null;
}

interface CupomDetalhe extends CupomListaItem {
  valorCompra: number | null;
  usadoPor: string | null;
  suspensoAte: string | null;
}

interface RespostaResgate {
  cupom?: CupomDetalhe;
  descontoAplicado?: number;
  valorFinal?: number;
}

interface ErroBackend {
  error?: string;
  codigo?: string;
  message?: string;
  liberadoEm?: string;
}

interface RespostaLista {
  itens?: CupomListaItem[];
  proximoCursor?: string | null;
  error?: string;
}

const FILTROS = [
  { valor: "", rotulo: "Todos" },
  { valor: "disponiveis", rotulo: "Disponíveis" },
  { valor: "usados", rotulo: "Usados" },
  { valor: "vencidos", rotulo: "Vencidos" },
  { valor: "cancelados", rotulo: "Cancelados" },
] as const;

const INFO_SITUACAO: Record<SituacaoCupom, { rotulo: string; classe: string }> = {
  EMITIDO: { rotulo: "Disponível", classe: "pesquisa-pill-ok" },
  SUSPENSO: { rotulo: "Suspenso", classe: "pa-pill-warning" },
  USADO: { rotulo: "Já usado", classe: "pesquisa-pill-neutral" },
  EXPIRADO: { rotulo: "Vencido", classe: "pa-pill-warning" },
  CANCELADO: { rotulo: "Cancelado", classe: "pesquisa-pill-danger" },
};

const MSG_NAO_ENCONTRADO = "Cupom não encontrado. Confira se digitou o código completo.";
const MSG_ERRO_CUPOM = "Não foi possível carregar o cupom.";
const MSG_ERRO_LISTA = "Não foi possível carregar os cupons.";
const MSG_ERRO_RESGATE =
  "Não foi possível registrar o uso. Não lance o desconto no Athos ou no PDV antes de confirmar que o cupom foi marcado como usado.";

function normalizarCodigo(texto: string): string {
  return texto.trim().toUpperCase().replace(/\s+/g, "");
}

/** dd/mm/aaaa (America/Sao_Paulo); "—" quando ausente ou inválido. */
function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

function paraCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * UI-D10, só para exibição: piso de valor × percentual, limitado ao teto e ao valor da compra,
 * arredondado para baixo. O servidor é quem calcula o desconto oficial no resgate.
 */
function descontoCentavos(compraCentavos: number, percentual: number, tetoCentavos: number): number {
  if (![compraCentavos, percentual, tetoCentavos].every((n) => Number.isFinite(n))) return 0;
  const bruto = Math.floor((compraCentavos * Math.round(percentual * 100)) / 10_000);
  return Math.max(0, Math.min(bruto, Math.floor(tetoCentavos), Math.floor(compraCentavos)));
}

function descreverSituacao(cupom: CupomDetalhe): string {
  switch (cupom.situacao) {
    case "SUSPENSO":
      return cupom.suspensoAte
        ? `Teto mensal atingido. Pode ser usado a partir de ${formatarData(cupom.suspensoAte)}.`
        : "Teto mensal atingido. Pode ser usado no mês seguinte.";
    case "EXPIRADO":
      return `Venceu em ${formatarData(cupom.validadeAte)}. Não pode ser usado.`;
    case "USADO":
      return cupom.usadoEm
        ? `Usado em ${formatarDataHora(cupom.usadoEm)}, desconto de ${formatarReais(cupom.descontoAplicado ?? 0)}.`
        : "Já usado.";
    case "CANCELADO":
      return "Este cupom foi cancelado e não pode ser usado.";
    default:
      return "Cupom válido e disponível para uso nesta compra.";
  }
}

export default function CuponsManager() {
  const { obter, definir } = useFiltrosUrl();
  const statusUrl = obter("status") ?? "";
  const statusFiltro = FILTROS.some((filtro) => filtro.valor === statusUrl) ? statusUrl : "";

  // Busca e detalhe.
  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState("");
  const [cupom, setCupom] = useState<CupomDetalhe | null>(null);
  const detalheTituloRef = useRef<HTMLHeadingElement | null>(null);

  // Resgate em dois passos.
  const [valor, setValor] = useState("");
  const [valorTocado, setValorTocado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroResgate, setErroResgate] = useState("");
  const [okResgate, setOkResgate] = useState("");
  const emEnvio = useRef(false);
  const confirmacaoRef = useRef<HTMLDivElement | null>(null);

  // Lista recente.
  const [itens, setItens] = useState<CupomListaItem[]>([]);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroLista, setErroLista] = useState("");

  const buscarDetalhe = useCallback(async (codigoBruto: string, focar: boolean): Promise<boolean> => {
    const normalizado = normalizarCodigo(codigoBruto);
    if (!normalizado) {
      setCupom(null);
      return false;
    }
    setBuscando(true);
    setErroBusca("");
    try {
      const res = await fetch(`/api/admin/pesquisa-cupons/${encodeURIComponent(normalizado)}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        setErroBusca(MSG_SESSAO);
        return false;
      }
      const json = (await res.json().catch(() => ({}))) as CupomDetalhe & ErroBackend;
      if (!res.ok) {
        setCupom(null);
        setErroBusca(res.status === 404 ? MSG_NAO_ENCONTRADO : json.error ?? MSG_ERRO_CUPOM);
        return false;
      }
      setCupom(json);
      setCodigo(json.codigo);
      if (focar) {
        requestAnimationFrame(() => detalheTituloRef.current?.focus());
      }
      return true;
    } catch {
      setCupom(null);
      setErroBusca(MSG_ERRO_CUPOM);
      return false;
    } finally {
      setBuscando(false);
    }
  }, []);

  const carregarLista = useCallback(
    async (status: string, cursor: string | null, anexar: boolean) => {
      if (anexar) setCarregandoMais(true);
      else setCarregandoLista(true);
      setErroLista("");
      try {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (cursor) params.set("cursor", cursor);
        params.set("limite", "50");

        const res = await fetch(`/api/admin/pesquisa-cupons?${params.toString()}`, { cache: "no-store" });
        if (res.status === 401) {
          setErroLista(MSG_SESSAO);
          return;
        }
        const json = (await res.json().catch(() => ({}))) as RespostaLista;
        if (!res.ok || !Array.isArray(json.itens)) {
          setErroLista(json.error ?? MSG_ERRO_LISTA);
          return;
        }
        setItens((atuais) => (anexar ? [...atuais, ...(json.itens ?? [])] : (json.itens ?? [])));
        setProximoCursor(json.proximoCursor ?? null);
      } catch {
        setErroLista(MSG_ERRO_LISTA);
      } finally {
        setCarregandoLista(false);
        setCarregandoMais(false);
      }
    },
    [],
  );

  useEffect(() => {
    void carregarLista(statusFiltro, null, false);
  }, [statusFiltro, carregarLista]);

  useEffect(() => {
    if (confirmando) confirmacaoRef.current?.focus();
  }, [confirmando]);

  async function buscar(event: React.FormEvent) {
    event.preventDefault();
    if (buscando) return;
    setErroResgate("");
    setOkResgate("");
    setConfirmando(false);
    setValor("");
    setValorTocado(false);
    await buscarDetalhe(codigo, true);
  }

  async function abrirDetalhe(codigoItem: string) {
    setCodigo(codigoItem);
    setErroResgate("");
    setOkResgate("");
    setConfirmando(false);
    setValor("");
    setValorTocado(false);
    await buscarDetalhe(codigoItem, true);
  }

  function mudarFiltro(valorFiltro: string) {
    definir({ status: valorFiltro || null });
  }

  const valorNum = lerNumero(valor);
  const valorValido = Number.isFinite(valorNum) && valorNum > 0;
  const compraCentavos = valorValido ? paraCentavos(valorNum) : 0;
  const minimoCentavos = cupom ? paraCentavos(cupom.compraMinima) : 0;
  const tetoCentavos = cupom ? paraCentavos(cupom.teto) : 0;
  const abaixoDoMinimo = cupom !== null && valorValido && compraCentavos < minimoCentavos;
  const descontoExibicaoCentavos =
    cupom !== null && valorValido && !abaixoDoMinimo
      ? descontoCentavos(compraCentavos, cupom.percentual, tetoCentavos)
      : 0;
  const descontoExibicao = descontoExibicaoCentavos / 100;
  const totalExibicao = valorValido ? (compraCentavos - descontoExibicaoCentavos) / 100 : 0;
  const tetoLimita =
    cupom !== null &&
    valorValido &&
    compraCentavos > 0 &&
    Math.floor((compraCentavos * Math.round(cupom.percentual * 100)) / 10_000) > tetoCentavos;
  const erroValor = valorTocado && !valorValido ? "Informe o valor da compra." : "";
  const podeResgatar =
    cupom !== null && cupom.situacao === "EMITIDO" && valorValido && !abaixoDoMinimo && !enviando;

  async function confirmarResgate() {
    if (!cupom || emEnvio.current || !valorValido) return;
    emEnvio.current = true;
    setEnviando(true);
    setErroResgate("");
    setOkResgate("");
    const codigoAtual = cupom.codigo;
    try {
      const res = await fetch(`/api/admin/pesquisa-cupons/${encodeURIComponent(codigoAtual)}/resgate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valorCompra: valorNum }),
      });
      const json = (await res.json().catch(() => ({}))) as RespostaResgate & ErroBackend;

      if (res.status === 401) {
        setErroResgate(MSG_SESSAO);
      } else if (res.ok) {
        const aplicado = typeof json.descontoAplicado === "number" ? json.descontoAplicado : descontoExibicao;
        setOkResgate(
          `Cupom marcado como usado. Lance o desconto de ${formatarReais(aplicado)} no Athos ou no PDV.`,
        );
      } else if (res.status === 409) {
        setErroResgate("Este cupom já foi usado. Atualize a busca.");
      } else if (res.status === 422) {
        if (json.codigo === "TETO_MENSAL" && json.liberadoEm) {
          setErroResgate(
            `Teto mensal atingido. Este cupom só pode ser usado a partir de ${formatarData(json.liberadoEm)}.`,
          );
        } else {
          setErroResgate(json.message ?? MSG_ERRO_RESGATE);
        }
      } else {
        setErroResgate(MSG_ERRO_RESGATE);
      }
    } catch {
      setErroResgate(MSG_ERRO_RESGATE);
    } finally {
      emEnvio.current = false;
      setEnviando(false);
      setConfirmando(false);
      // Recarrega SEMPRE do servidor (nunca otimista) e atualiza a lista com a verdade.
      await buscarDetalhe(codigoAtual, false);
      setValor("");
      setValorTocado(false);
      await carregarLista(statusFiltro, null, false);
    }
  }

  const info = cupom ? INFO_SITUACAO[cupom.situacao] : null;

  return (
    <div>
      <style>{`
        .pesquisa-campo { border-color: #8a94a3; }
        .pesquisa-campo:focus { border-color: #3d42df; box-shadow: 0 0 0 .2rem rgba(61, 66, 223, .18); }
        .pesquisa-campo:focus-visible,
        .cupons-btn:focus-visible,
        .cupons-seg:focus-visible,
        .cupons-link-btn:focus-visible,
        .cupons-confirmacao:focus-visible { outline: 3px solid #3d42df; outline-offset: 2px; }

        .pesquisa-pill-ok { color: #177333; background: rgba(30, 181, 100, .14); }
        .pesquisa-pill-danger { color: #b02a37; background: rgba(229, 72, 77, .14); }
        .pesquisa-pill-neutral { color: #5b6778; background: #f4f6fa; }

        .cupons-input, .cupons-btn { min-height: 44px; }
        .cupons-codigo { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }

        .cupons-detalhe { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .75rem 1.25rem; margin: 0 0 .75rem; }
        .cupons-detalhe dt { font-size: .76rem; text-transform: uppercase; letter-spacing: .03em; color: #5b6778; margin-bottom: .1rem; }
        .cupons-detalhe dd { margin: 0; font-weight: 600; }
        .cupons-situacao-descricao { color: #5b6778; margin-bottom: 0; }

        .cupons-resumo { background: var(--pa-bg); border-radius: 8px; padding: .65rem .85rem; margin: .75rem 0; font-weight: 600; }
        .cupons-nota { color: #5b6778; font-size: .85rem; }

        .cupons-confirmacao {
          border-left: 4px solid #f7a600;
          background: #fff8e6;
          color: #8a5a00;
          border-radius: 6px;
          padding: .85rem 1rem;
          margin-top: 1rem;
        }
        .cupons-confirmacao .cupons-confirmacao-titulo { font-weight: 700; margin-bottom: .35rem; }

        .cupons-scroll { overflow-x: auto; }
        .cupons-tabela th:nth-child(1), .cupons-tabela td:nth-child(1) { position: sticky; left: 0; background: var(--pa-surface); z-index: 2; min-width: 132px; }
        .cupons-tabela th:nth-child(2), .cupons-tabela td:nth-child(2) { position: sticky; left: 132px; background: var(--pa-surface); z-index: 2; min-width: 132px; }
        .cupons-tabela thead th:nth-child(1), .cupons-tabela thead th:nth-child(2) { z-index: 3; }
        .cupons-tabela tbody tr:hover td:nth-child(1), .cupons-tabela tbody tr:hover td:nth-child(2) { background: var(--pa-bg); }
        .cupons-link-btn { border: 1px solid var(--pa-accent); background: var(--pa-surface); color: var(--pa-accent); border-radius: 6px; padding: .3rem .6rem; font-size: .8rem; min-height: 44px; }
        .cupons-link-btn:hover { background: var(--pa-accent); color: #fff; }
      `}</style>

      <section className="pa-card" aria-labelledby="cupons-busca-titulo">
        <div className="pa-card-header">
          <h2 id="cupons-busca-titulo" className="h6 m-0">
            Buscar cupom
          </h2>
        </div>
        <div className="pa-card-body">
          <form className="d-flex flex-wrap gap-2 align-items-end" onSubmit={buscar} noValidate>
            <div className="flex-grow-1" style={{ minWidth: "240px" }}>
              <label className="form-label" htmlFor="cupom-codigo">
                Código do cupom
              </label>
              <input
                id="cupom-codigo"
                type="text"
                className="form-control pesquisa-campo cupons-input"
                placeholder="Ex.: BOX-7K3Q9M"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                value={codigo}
                onChange={(event) => setCodigo(event.target.value)}
                aria-describedby="cupom-codigo-ajuda"
              />
              <div id="cupom-codigo-ajuda" className="form-text">
                Digite ou cole o código completo.
              </div>
            </div>
            <button type="submit" className="btn pa-btn-accent cupons-btn" disabled={buscando}>
              {buscando ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
                  Buscando cupom...
                </>
              ) : (
                "Buscar cupom"
              )}
            </button>
          </form>
          {erroBusca && (
            <div className="alert alert-danger mt-3 mb-0" role="alert">
              {erroBusca}
            </div>
          )}
        </div>
      </section>

      {cupom && info && (
        <section className="pa-card" aria-labelledby="cupom-detalhe-titulo">
          <div className="pa-card-header">
            <h2
              id="cupom-detalhe-titulo"
              ref={detalheTituloRef}
              tabIndex={-1}
              className="h6 m-0 d-flex align-items-center gap-2 flex-wrap"
            >
              <span className="cupons-codigo">{cupom.codigo}</span>
              <span className={`pa-pill ${info.classe}`}>{info.rotulo}</span>
            </h2>
          </div>
          <div className="pa-card-body">
            <dl className="cupons-detalhe">
              <div>
                <dt>Desconto</dt>
                <dd>
                  {formatarPercentual(cupom.percentual)} até {formatarReais(cupom.teto)}
                </dd>
              </div>
              <div>
                <dt>Teto</dt>
                <dd>{formatarReais(cupom.teto)}</dd>
              </div>
              <div>
                <dt>Compra mínima</dt>
                <dd>{formatarReais(cupom.compraMinima)}</dd>
              </div>
              <div>
                <dt>Válido até</dt>
                <dd>{formatarData(cupom.validadeAte)}</dd>
              </div>
              <div>
                <dt>Cliente</dt>
                <dd>{cupom.telefoneMascarado}</dd>
              </div>
              <div>
                <dt>Emitido em</dt>
                <dd>{formatarDataHora(cupom.criadoEm)}</dd>
              </div>
              <div>
                <dt>Nota da pesquisa</dt>
                <dd>{cupom.notaPesquisa === null ? "—" : `${cupom.notaPesquisa} de 5`}</dd>
              </div>
            </dl>
            <p className="cupons-situacao-descricao">{descreverSituacao(cupom)}</p>

            {okResgate && (
              <div className="alert alert-success mt-3" role="status">
                {okResgate}
              </div>
            )}
            {erroResgate && (
              <div className="alert alert-danger mt-3" role="alert">
                {erroResgate}
              </div>
            )}

            {cupom.situacao === "EMITIDO" && (
              <form
                className="mt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (podeResgatar) setConfirmando(true);
                }}
                noValidate
              >
                <div className="row g-3 align-items-start">
                  <div className="col-12 col-sm-6">
                    <label className="form-label" htmlFor="cupom-valor">
                      Valor da compra (R$)
                    </label>
                    <input
                      id="cupom-valor"
                      type="text"
                      inputMode="decimal"
                      className={`form-control pesquisa-campo cupons-input${erroValor ? " is-invalid" : ""}`}
                      value={valor}
                      onChange={(event) => setValor(event.target.value)}
                      onBlur={() => setValorTocado(true)}
                      aria-invalid={erroValor ? true : undefined}
                      aria-describedby={erroValor ? "cupom-valor-ajuda cupom-valor-erro" : "cupom-valor-ajuda"}
                    />
                    <div id="cupom-valor-ajuda" className="form-text">
                      Valor antes do desconto.
                    </div>
                    {erroValor && (
                      <div id="cupom-valor-erro" className="invalid-feedback d-block">
                        {erroValor}
                      </div>
                    )}
                    {abaixoDoMinimo && (
                      <div className="invalid-feedback d-block" role="alert">
                        Compra mínima de {formatarReais(cupom.compraMinima)} não atingida. Este cupom não pode ser
                        usado nesta compra.
                      </div>
                    )}
                  </div>
                </div>

                {valorValido && !abaixoDoMinimo && (
                  <p className="cupons-resumo mb-1">
                    Subtotal {formatarReais(valorNum)} · Desconto {formatarReais(descontoExibicao)} · Total com
                    desconto {formatarReais(totalExibicao)}
                  </p>
                )}
                {valorValido && !abaixoDoMinimo && (
                  <p className="cupons-nota mb-2">
                    {tetoLimita ? `Limitado ao teto de ${formatarReais(cupom.teto)}. ` : ""}
                    Desconto arredondado para baixo, no centavo.
                  </p>
                )}

                <button type="submit" className="btn pa-btn-accent cupons-btn" disabled={!podeResgatar}>
                  Marcar cupom como usado
                </button>

                {confirmando && (
                  <div
                    ref={confirmacaoRef}
                    className="cupons-confirmacao"
                    role="alertdialog"
                    aria-labelledby="cupom-confirmacao-titulo"
                    aria-describedby="cupom-confirmacao-corpo"
                    tabIndex={-1}
                  >
                    <p className="cupons-confirmacao-titulo" id="cupom-confirmacao-titulo">
                      <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                      Confirmar uso do cupom {cupom.codigo}?
                    </p>
                    <p id="cupom-confirmacao-corpo" className="mb-3">
                      Confirmar uso do cupom {cupom.codigo}: esta ação não pode ser desfeita. Lance o desconto de{" "}
                      {formatarReais(descontoExibicao)} no Athos ou no PDV antes de confirmar.
                    </p>
                    <div className="d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn pa-btn-accent cupons-btn"
                        onClick={confirmarResgate}
                        disabled={enviando}
                      >
                        {enviando ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
                            Confirmando...
                          </>
                        ) : (
                          "Confirmar uso"
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary cupons-btn"
                        onClick={() => setConfirmando(false)}
                        disabled={enviando}
                      >
                        Voltar ao valor da compra
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </section>
      )}

      <section className="pa-card" aria-labelledby="cupons-recentes-titulo">
        <div className="pa-card-header flex-wrap gap-2">
          <h2 id="cupons-recentes-titulo" className="h6 m-0">
            Cupons recentes
          </h2>
          <div className="pa-seg" role="group" aria-label="Filtrar por situação">
            {FILTROS.map((filtro) => (
              <button
                key={filtro.valor || "todos"}
                type="button"
                className={`pa-seg-btn cupons-seg${statusFiltro === filtro.valor ? " pa-seg-btn-active" : ""}`}
                aria-pressed={statusFiltro === filtro.valor}
                onClick={() => mudarFiltro(filtro.valor)}
              >
                {filtro.rotulo}
              </button>
            ))}
          </div>
        </div>

        {erroLista && (
          <div className="pa-card-body">
            <div className="pa-empty pa-empty-erro">
              <span>{erroLista}</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary cupons-btn"
                onClick={() => carregarLista(statusFiltro, null, false)}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {!erroLista && carregandoLista && itens.length === 0 && (
          <div className="pa-card-body text-center" role="status">
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
            Carregando cupons...
          </div>
        )}

        {!erroLista && !carregandoLista && itens.length === 0 && (
          <div className="pa-card-body">
            <div className="pa-empty">
              {statusFiltro ? (
                <span>Nenhum cupom com esta situação.</span>
              ) : (
                <div>
                  <strong className="d-block">Nenhum cupom ainda</strong>
                  <span className="small">Os cupons aparecem aqui depois que um cliente responder a pesquisa.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {itens.length > 0 && (
          <>
            <div className="pa-card-body-scroll cupons-scroll" aria-busy={carregandoLista}>
              <table className="pa-table cupons-tabela" aria-label="Cupons recentes">
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Emitido em</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Desconto</th>
                    <th scope="col">Validade</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Usado em</th>
                    <th scope="col">
                      <span className="visually-hidden">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item) => {
                    const situacao = INFO_SITUACAO[item.situacao];
                    return (
                      <tr key={item.codigo}>
                        <td>
                          <span className="cupons-codigo">{item.codigo}</span>
                        </td>
                        <td>{formatarDataHora(item.criadoEm)}</td>
                        <td>{item.telefoneMascarado}</td>
                        <td>
                          {formatarPercentual(item.percentual)} · até {formatarReais(item.teto)}
                        </td>
                        <td>{formatarData(item.validadeAte)}</td>
                        <td>
                          <span className={`pa-pill ${situacao.classe}`}>{situacao.rotulo}</span>
                        </td>
                        <td>{item.usadoEm ? formatarDataHora(item.usadoEm) : "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="cupons-link-btn"
                            onClick={() => void abrirDetalhe(item.codigo)}
                          >
                            Ver detalhes
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pa-card-body pt-0">
              {proximoCursor && (
                <button
                  type="button"
                  className="btn btn-outline-secondary cupons-btn"
                  onClick={() => void carregarLista(statusFiltro, proximoCursor, true)}
                  disabled={carregandoMais}
                >
                  {carregandoMais ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
                      Carregando...
                    </>
                  ) : (
                    "Carregar mais"
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
