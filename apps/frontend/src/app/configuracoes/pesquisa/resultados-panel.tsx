"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { MSG_SESSAO, formatarDataHora, formatarPercentual, formatarReais } from "@/lib/pesquisa-admin";

/**
 * Fase 52 (plano 52-09): painel de resultados da pesquisa (aba "Resultados", D-25).
 *
 * Mostra nota média, taxa de resposta com o par n de N, cupons e gasto real do mês contra o teto,
 * comparativo entre as variantes sem decidir com amostra pequena, distribuição das notas e as 20
 * últimas respostas. Cada resposta ainda ativa pode ser revogada com confirmação inline; qualquer
 * desfecho recarrega os resultados do servidor (nunca atualiza de forma otimista).
 *
 * Privacidade: nada de telefone, token ou conversationId; o comentário do cliente é texto (sem HTML).
 */

type Periodo = "mes" | "30d" | "tudo";
type SituacaoCupom = "EMITIDO" | "SUSPENSO" | "USADO" | "EXPIRADO" | "CANCELADO" | "SEM_CUPOM";

interface ResultadosDTO {
  periodo: Periodo;
  notaMedia: number | null;
  totalRespostas: number;
  taxaResposta: { respondidas: number; enviadas: number; percentual: number | null };
  cupons: { emitidos: number; usados: number; vencidos: number };
  gastoMes: { valor: number; teto: number; percentual: number; atingido: boolean };
  variantes: Array<{
    variante: "ESTRELAS" | "CARINHAS";
    respostas: number;
    notaMedia: number | null;
    enviadas: number;
    taxaResposta: number | null;
  }>;
  amostraPequena: boolean;
  distribuicao: Array<{ nota: 1 | 2 | 3 | 4 | 5; total: number; percentual: number }>;
  ultimas: Array<{
    id: string;
    respondidaEm: string;
    nota: number;
    variante: string;
    comentario: string | null;
    revogada: boolean;
    cupom: { situacao: SituacaoCupom };
  }>;
  relatorioChatwootUrl: string | null;
}

interface RespostaRevogacao {
  pesquisaId?: string;
  jaRevogada?: boolean;
  cupomCancelado?: boolean;
  cupomJaUsado?: boolean;
  error?: string;
}

interface Mensagem {
  tipo: "status" | "erro";
  texto: string;
}

const PERIODOS: Array<{ valor: Periodo; rotulo: string }> = [
  { valor: "mes", rotulo: "Mês atual" },
  { valor: "30d", rotulo: "Últimos 30 dias" },
  { valor: "tudo", rotulo: "Todo o período" },
];

const ROTULO_NOTA: Record<number, string> = {
  1: "Muito ruim",
  2: "Ruim",
  3: "Regular",
  4: "Bom",
  5: "Excelente",
};

function comPlural(quantidade: number, singular: string, plural: string): string {
  return quantidade === 1 ? singular : plural;
}

/** "4,5" sem forçar casa decimal quando a média é inteira. */
function formatarNota(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function formatarVariante(variante: string): { rotulo: string; icone: string } {
  if (variante === "CARINHAS") return { rotulo: "Carinhas", icone: "bi-emoji-smile" };
  return { rotulo: "Estrelas", icone: "bi-star" };
}

function pillCupom(situacao: SituacaoCupom): { classe: string; rotulo: string } {
  switch (situacao) {
    case "EMITIDO":
      return { classe: "pa-pill pa-pill-warning", rotulo: "Emitido" };
    case "SUSPENSO":
      return { classe: "pa-pill pa-pill-warning", rotulo: "Suspenso" };
    case "USADO":
      return { classe: "pa-pill pesquisa-pill-ok", rotulo: "Usado" };
    case "EXPIRADO":
      return { classe: "pa-pill pesquisa-pill-neutral", rotulo: "Vencido" };
    case "CANCELADO":
      return { classe: "pa-pill pesquisa-pill-danger", rotulo: "Cancelado" };
    default:
      return { classe: "pa-pill pesquisa-pill-neutral", rotulo: "Sem cupom" };
  }
}

function classeBarraTeto(percentual: number): string {
  if (percentual >= 100) return "pa-progress-bar-danger";
  if (percentual >= 70) return "pa-progress-bar-warning";
  return "pa-progress-bar-success";
}

export default function ResultadosPanel(props: { periodo: Periodo; onPeriodo: (p: Periodo) => void }) {
  const { periodo, onPeriodo } = props;

  const [dados, setDados] = useState<ResultadosDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [revogando, setRevogando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const emEnvio = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    let vivo = true;
    setCarregando(true);
    setErro("");

    void (async () => {
      try {
        const res = await fetch(`/api/admin/pesquisa-resultados?periodo=${periodo}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!vivo) return;
        if (res.status === 401) {
          setErro(MSG_SESSAO);
          return;
        }
        const json = (await res.json().catch(() => ({}))) as ResultadosDTO & { error?: string };
        if (!vivo) return;
        if (!res.ok) {
          setErro("Não foi possível carregar os resultados.");
          return;
        }
        setDados(json);
      } catch (e) {
        if (!vivo) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErro("Não foi possível carregar os resultados.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();

    return () => {
      vivo = false;
      ctrl.abort();
    };
  }, [periodo, versao]);

  function recarregar() {
    setVersao((v) => v + 1);
  }

  function alternarComentario(id: string) {
    setExpandidos((atual) => ({ ...atual, [id]: !atual[id] }));
  }

  async function confirmarRevogacao(id: string) {
    if (emEnvio.current) return;
    emEnvio.current = true;
    setRevogando(true);
    setMensagem(null);
    try {
      const res = await fetch(`/api/admin/pesquisa-revogar/${encodeURIComponent(id)}`, { method: "POST" });
      if (res.status === 401) {
        setMensagem({ tipo: "erro", texto: MSG_SESSAO });
        return;
      }
      if (res.status === 404) {
        setMensagem({ tipo: "erro", texto: "Pesquisa não encontrada. Atualize os resultados." });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as RespostaRevogacao;
      if (!res.ok) {
        setMensagem({ tipo: "erro", texto: "Não foi possível revogar a pesquisa. Tente de novo." });
        return;
      }
      const partes = ["Pesquisa revogada."];
      if (json.cupomCancelado) partes.push("Cupom cancelado.");
      if (json.cupomJaUsado) partes.push("O cupom já havia sido usado e não foi alterado.");
      setMensagem({ tipo: "status", texto: partes.join(" ") });
      setConfirmandoId(null);
    } catch {
      setMensagem({ tipo: "erro", texto: "Não foi possível revogar a pesquisa. Tente de novo." });
    } finally {
      emEnvio.current = false;
      // Nunca otimista: qualquer desfecho recarrega os resultados do servidor.
      setVersao((v) => v + 1);
      setRevogando(false);
    }
  }

  const gasto = dados?.gastoMes;
  const percentualTeto = gasto ? Math.min(100, Math.max(0, gasto.percentual)) : 0;

  return (
    <div className="pesquisa-resultados">
      <style>{`
        .pesquisa-filtros { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .pesquisa-nota-gasto { color: #5b6778; font-size: .82rem; }
        .pesquisa-duas-colunas { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        @media (max-width: 992px) { .pesquisa-duas-colunas { grid-template-columns: 1fr; } }
        .pesquisa-tabela-scroll { overflow-x: auto; }
        .pesquisa-pill-ok { background: rgba(30, 181, 100, 0.14); color: #177333; }
        .pesquisa-pill-danger { background: rgba(229, 72, 77, 0.14); color: #b02a37; }
        .pesquisa-pill-neutral { background: #f4f6fa; color: #5b6778; }
        .pesquisa-aviso { color: #8a5a00; background: rgba(247, 166, 0, .16); border-radius: 6px; padding: .5rem .7rem; font-size: .82rem; margin-top: .5rem; }
        .pesquisa-secundario { color: #5b6778; font-size: .8rem; margin: .15rem 0 0; }
        .pesquisa-gasto-barra { margin-top: .5rem; }
        .pesquisa-gasto-texto { color: #5b6778; font-size: .78rem; margin-top: .3rem; }
        .pesquisa-gasto-alerta { color: #b02a37; font-size: .8rem; font-weight: 600; margin: .4rem 0 0; }
        .pesquisa-dist { display: grid; gap: .55rem; }
        .pesquisa-dist-linha { display: grid; grid-template-columns: 7.5rem 1fr auto; gap: .6rem; align-items: center; font-size: .85rem; }
        .pesquisa-dist-barra { height: 10px; border-radius: 5px; background: #eef1f6; overflow: hidden; }
        .pesquisa-dist-preenchida { height: 100%; border-radius: 5px; background: #5b6778; }
        .pesquisa-dist-valor { color: #5b6778; font-size: .8rem; white-space: nowrap; }
        @media (max-width: 480px) {
          .pesquisa-dist-linha { grid-template-columns: 6rem 1fr; }
          .pesquisa-dist-valor { grid-column: 1 / -1; }
        }
        .pesquisa-comentario { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; white-space: pre-wrap; }
        .pesquisa-comentario-aberto { display: block; overflow: visible; }
        .pesquisa-sem-comentario { color: #5b6778; font-size: .85rem; }
        .pesquisa-ver-tudo { background: none; border: none; padding: 0; margin-top: .2rem; color: #3d42df; font-size: .8rem; font-weight: 600; cursor: pointer; }
        .pesquisa-acao { min-height: 44px; background: #fff; color: #1f2a37; border: 1px solid #8a94a3; border-radius: 6px; padding: .35rem .8rem; font-size: .82rem; font-weight: 600; }
        .pesquisa-acao:hover { background: #f4f6fa; }
        .pesquisa-confirmacao { border-left: 4px solid #f7a600; background: #fff8e6; color: #8a5a00; border-radius: 6px; padding: .75rem .9rem; display: flex; gap: .6rem; align-items: flex-start; font-size: .85rem; }
        .pesquisa-confirmacao-acoes { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .6rem; }
        .pesquisa-confirmacao-acoes button { min-height: 44px; }
        .pesquisa-btn-cancelar { background: #fff; color: #1f2a37; border: 1px solid #8a94a3; border-radius: 6px; padding: .4rem .9rem; font-size: .85rem; font-weight: 600; }
        .pesquisa-btn-cancelar:hover { background: #f4f6fa; }
        .pesquisa-btn-confirmar { padding: .4rem .9rem; }
        .pesquisa-ver-tudo:focus-visible, .pesquisa-acao:focus-visible, .pesquisa-btn-cancelar:focus-visible, .pesquisa-btn-confirmar:focus-visible { outline: 3px solid #3d42df; outline-offset: 2px; }
      `}</style>

      <div className="pesquisa-filtros">
        <div className="pa-seg" role="group" aria-label="Período dos resultados">
          {PERIODOS.map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              className={`pa-seg-btn${periodo === opcao.valor ? " pa-seg-btn-active" : ""}`}
              aria-pressed={periodo === opcao.valor}
              onClick={() => onPeriodo(opcao.valor)}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
        {periodo !== "mes" && <span className="pesquisa-nota-gasto">O gasto é sempre do mês atual.</span>}
        {dados?.relatorioChatwootUrl && (
          <a
            className="pa-link-btn"
            href={dados.relatorioChatwootUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver relatório no Chatwoot (abre em nova aba)
          </a>
        )}
      </div>

      {mensagem && (
        <div
          className={mensagem.tipo === "erro" ? "alert alert-danger" : "alert alert-success"}
          role={mensagem.tipo === "erro" ? "alert" : "status"}
        >
          {mensagem.texto}
        </div>
      )}

      {carregando ? (
        <div className="pa-card">
          <div className="pa-card-body" aria-busy="true">
            <div className="d-flex align-items-center gap-2">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Carregando...</span>
              </div>
              <span>Carregando resultados...</span>
            </div>
          </div>
        </div>
      ) : erro ? (
        <div className="pa-card">
          <div className="pa-card-body">
            <div className="pa-empty pa-empty-erro">
              <span>{erro}</span>
              <button type="button" className="pa-link-btn bg-transparent" onClick={recarregar}>
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      ) : dados ? (
        <>
          <div className="pa-stat-grid">
            <div className="pa-card pa-stat">
              <div className="pa-stat-icon">
                <i className="bi bi-star-fill" aria-hidden="true" />
              </div>
              <div className="pa-stat-body">
                <p className="pa-stat-label">Nota média</p>
                <h4 className="pa-stat-value pa-stat-value-text">
                  {dados.notaMedia === null ? "—" : `${formatarNota(dados.notaMedia)} de 5`}
                </h4>
                <p className="pesquisa-secundario">
                  {dados.totalRespostas === 0
                    ? "Sem respostas no período"
                    : `${dados.totalRespostas} ${comPlural(dados.totalRespostas, "resposta", "respostas")}`}
                </p>
              </div>
            </div>

            <div className="pa-card pa-stat">
              <div className="pa-stat-icon">
                <i className="bi bi-send-check" aria-hidden="true" />
              </div>
              <div className="pa-stat-body">
                <p className="pa-stat-label">Taxa de resposta</p>
                <h4 className="pa-stat-value pa-stat-value-text">
                  {dados.taxaResposta.percentual === null ? "—" : formatarPercentual(dados.taxaResposta.percentual)}
                </h4>
                <p className="pesquisa-secundario">
                  {dados.taxaResposta.enviadas === 0
                    ? "0 de 0 · Sem envios no período"
                    : `${dados.taxaResposta.respondidas} de ${dados.taxaResposta.enviadas} pesquisas enviadas`}
                </p>
              </div>
            </div>

            <div className="pa-card pa-stat">
              <div className="pa-stat-icon">
                <i className="bi bi-ticket-perforated" aria-hidden="true" />
              </div>
              <div className="pa-stat-body">
                <p className="pa-stat-label">Cupons emitidos</p>
                <h4 className="pa-stat-value pa-stat-value-text">
                  {dados.cupons.emitidos}{" "}
                  <span style={{ fontSize: ".85rem", fontWeight: 600 }}>
                    {comPlural(dados.cupons.emitidos, "cupom", "cupons")}
                  </span>
                </h4>
                <p className="pesquisa-secundario">
                  {dados.cupons.usados} usados · {dados.cupons.vencidos} vencidos
                </p>
              </div>
            </div>

            <div className="pa-card pa-stat">
              <div className="pa-stat-icon">
                <i className="bi bi-cash-coin" aria-hidden="true" />
              </div>
              <div className="pa-stat-body">
                <p className="pa-stat-label">Gasto real no mês</p>
                <h4 className={`pa-stat-value ${dados.gastoMes.atingido ? "pa-stat-value-danger" : "pa-stat-value-text"}`}>
                  {gasto ? formatarReais(gasto.valor) : "—"}
                </h4>
                <p className="pesquisa-secundario">{gasto ? `de ${formatarReais(gasto.teto)} de teto` : ""}</p>
                <div className="pesquisa-gasto-barra">
                  <div
                    className="pa-progress"
                    role="progressbar"
                    aria-label="Gasto real do mês contra o teto"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percentualTeto)}
                  >
                    <div className={`pa-progress-bar ${classeBarraTeto(percentualTeto)}`} style={{ width: `${percentualTeto}%` }} />
                  </div>
                  <p className="pesquisa-gasto-texto">{formatarPercentual(percentualTeto)} do teto</p>
                  {gasto?.atingido && (
                    <p className="pesquisa-gasto-alerta">
                      Teto atingido. Novos cupons estão suspensos até o mês seguinte.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pesquisa-duas-colunas">
            <div className="pa-card">
              <div className="pa-card-header">
                <span>Estrelas e carinhas</span>
              </div>
              <div className="pa-card-body">
                {dados.amostraPequena && (
                  <div className="pesquisa-aviso">
                    Amostra pequena: menos de 30 respostas por variante. Não compare as variantes ainda.
                  </div>
                )}
                <table className="pa-table" style={{ marginTop: dados.amostraPequena ? ".75rem" : 0 }}>
                  <caption className="visually-hidden">Comparativo entre as variantes estrelas e carinhas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Variante</th>
                      <th scope="col">Respostas</th>
                      <th scope="col">Nota média</th>
                      <th scope="col">Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.variantes.map((v) => {
                      const visual = formatarVariante(v.variante);
                      return (
                        <tr key={v.variante}>
                          <td>
                            <i className={`bi ${visual.icone}`} aria-hidden="true" /> {visual.rotulo}
                          </td>
                          <td>{v.respostas}</td>
                          <td>{formatarNota(v.notaMedia)}</td>
                          <td>{v.taxaResposta === null ? "—" : formatarPercentual(v.taxaResposta)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pa-card">
              <div className="pa-card-header">
                <span>Notas recebidas</span>
              </div>
              <div className="pa-card-body">
                <div className="pesquisa-dist">
                  {dados.distribuicao.map((item) => (
                    <div className="pesquisa-dist-linha" key={item.nota}>
                      <span>
                        {item.nota} {ROTULO_NOTA[item.nota]}
                      </span>
                      <div
                        className="pesquisa-dist-barra"
                        role="img"
                        aria-label={`Nota ${item.nota}: ${item.total} ${comPlural(item.total, "resposta", "respostas")}, ${formatarPercentual(item.percentual)}`}
                      >
                        <div
                          className="pesquisa-dist-preenchida"
                          style={{ width: `${Math.min(100, Math.max(0, item.percentual))}%` }}
                        />
                      </div>
                      <span className="pesquisa-dist-valor">
                        {item.total} {comPlural(item.total, "resposta", "respostas")} · {formatarPercentual(item.percentual)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="pa-card">
            <div className="pa-card-header">
              <span>
                Últimas respostas
                <span className="pa-card-header-count">({dados.ultimas.length})</span>
              </span>
            </div>
            <div className="pa-card-body pa-card-body-flush pa-card-body-scroll pesquisa-tabela-scroll">
              {dados.ultimas.length === 0 ? (
                <div className="pa-empty" style={{ margin: "1rem" }}>
                  <div>
                    <strong>Nenhuma resposta ainda</strong>
                    <div className="small mt-1" style={{ color: "#5b6778" }}>
                      As respostas aparecem aqui depois que os clientes avaliarem o atendimento.
                    </div>
                  </div>
                </div>
              ) : (
                <table className="pa-table">
                  <caption className="visually-hidden">Últimas respostas da pesquisa</caption>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Nota</th>
                      <th scope="col">Variante</th>
                      <th scope="col">Comentário</th>
                      <th scope="col">Cupom</th>
                      <th scope="col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.ultimas.map((linha) => {
                      const visual = formatarVariante(linha.variante);
                      const pill = pillCupom(linha.cupom.situacao);
                      const expandido = Boolean(expandidos[linha.id]);
                      const temComentario = Boolean(linha.comentario && linha.comentario.trim());
                      return (
                        <Fragment key={linha.id}>
                          <tr>
                            <td>{formatarDataHora(linha.respondidaEm)}</td>
                            <td className="text-nowrap">
                              <i className="bi bi-star-fill" aria-hidden="true" /> {linha.nota}/5
                            </td>
                            <td>{visual.rotulo}</td>
                            <td style={{ minWidth: 220 }}>
                              {temComentario ? (
                                <>
                                  <div className={`pesquisa-comentario${expandido ? " pesquisa-comentario-aberto" : ""}`}>
                                    {linha.comentario}
                                  </div>
                                  <button
                                    type="button"
                                    className="pesquisa-ver-tudo"
                                    aria-expanded={expandido}
                                    onClick={() => alternarComentario(linha.id)}
                                  >
                                    {expandido ? "Ver menos" : "Ver tudo"}
                                  </button>
                                </>
                              ) : (
                                <span className="pesquisa-sem-comentario">Sem comentário</span>
                              )}
                            </td>
                            <td>
                              <span className={pill.classe}>{pill.rotulo}</span>
                            </td>
                            <td>
                              {linha.revogada ? (
                                <span className="pa-pill pesquisa-pill-danger">Revogada</span>
                              ) : confirmandoId === linha.id ? (
                                <span className="pesquisa-secundario">Confirmando...</span>
                              ) : (
                                <button
                                  type="button"
                                  className="pesquisa-acao"
                                  onClick={() => {
                                    setMensagem(null);
                                    setConfirmandoId(linha.id);
                                  }}
                                >
                                  Revogar pesquisa
                                </button>
                              )}
                            </td>
                          </tr>
                          {confirmandoId === linha.id && (
                            <tr>
                              <td colSpan={6} style={{ background: "#fff" }}>
                                <div className="pesquisa-confirmacao">
                                  <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
                                  <div>
                                    <div>
                                      Revogar esta pesquisa? O link deixa de funcionar e, se houver cupom disponível, ele
                                      será cancelado. Esta ação não pode ser desfeita.
                                    </div>
                                    <div className="pesquisa-confirmacao-acoes">
                                      <button
                                        type="button"
                                        className="pa-btn-accent pesquisa-btn-confirmar"
                                        disabled={revogando}
                                        onClick={() => void confirmarRevogacao(linha.id)}
                                      >
                                        {revogando ? "Revogando..." : "Confirmar revogação"}
                                      </button>
                                      <button
                                        type="button"
                                        className="pesquisa-btn-cancelar"
                                        disabled={revogando}
                                        onClick={() => setConfirmandoId(null)}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
