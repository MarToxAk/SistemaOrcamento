"use client";

import { useEffect, useRef, useState } from "react";
import { formatBRL } from "../../_shared/formatadores";
import { formatarDataEmissao } from "../../_shared/notas-util";

/** Resposta da previa (POST /cobranca/boleto/:id/atualizacao/previa), Fase 50. Tudo calculado no servidor. */
interface PreviaBoletoAtualizado {
  cobrancaIdOriginal: number;
  hoje: string;
  vencimentosPermitidos: [string, string];
  novoVencimento: string;
  taxaJurosMes: number;
  multaPercentual: number;
  taxaJurosMesPadrao: number;
  multaPercentualPadrao: number;
  tetos: { taxaJurosMes: number; multaPercentual: number };
  titulos: Array<{
    idcontareceber: number;
    numerotitulo: string | null;
    vencimentoOriginal: string;
    diasAtraso: number;
    principal: number;
    juros: number;
    multa: number;
    total: number;
  }>;
  principal: number;
  juros: number;
  multa: number;
  total: number;
  mensagem: string[];
  sucessorAtivoId: number | null;
}

/** Resposta da geracao (POST /cobranca/boleto/:id/atualizar). */
interface GerarBoletoAtualizadoResultado {
  cobrancaId: number;
  cobrancaIdOriginal: number;
  chargeId: number;
  linkBoleto: string;
  barcodeLinhaDigitavel: string;
  expireAt: string;
  valor: number;
  principal: number;
  juros: number;
  multa: number;
  cancelamentoOriginal: "ok" | "falhou";
  aviso: string | null;
  reaproveitado: boolean;
}

interface ModalBoletoAtualizadoProps {
  cobrancaId: number;
  onFechar: () => void;
  onEnviarEmail: (novoCobrancaId: number) => void;
  onConcluido: () => void;
}

type Fase = "carregando" | "pronto" | "gerando" | "sucesso" | "erro";

const ESPERA_PREVIA_MS = 400;

/** "0.99" -> "0,99" para exibir no campo (virgula decimal). */
function taxaParaCampo(n: number): string {
  return String(n).replace(".", ",");
}

/** Aceita virgula ou ponto; qualquer coisa fora de numero decimal simples vira NaN. */
function campoParaTaxa(txt: string): number {
  const t = txt.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Number(t);
}

/** Mensagem do backend (Nest: message texto ou lista) ou do proxy (error). */
function mensagemDeErro(data: unknown, padrao: string): string {
  if (data && typeof data === "object") {
    const d = data as { message?: unknown; error?: unknown };
    if (typeof d.message === "string" && d.message) return d.message;
    if (Array.isArray(d.message) && typeof d.message[0] === "string") return d.message[0];
    if (typeof d.error === "string" && d.error) return d.error;
  }
  return padrao;
}

/**
 * Modal do boleto atualizado com juros e multa (Fase 50). A previa vem do servidor: o novo vencimento so pode
 * ser uma das duas datas devolvidas (D-01) e o browser nunca calcula data nem valor cobrado.
 */
export function ModalBoletoAtualizado({ cobrancaId, onFechar, onEnviarEmail, onConcluido }: ModalBoletoAtualizadoProps) {
  const [fase, setFase] = useState<Fase>("carregando");
  const [previa, setPrevia] = useState<PreviaBoletoAtualizado | null>(null);
  const [dataSel, setDataSel] = useState("");
  const [jurosTxt, setJurosTxt] = useState("");
  const [multaTxt, setMultaTxt] = useState("");
  const [recalculando, setRecalculando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<GerarBoletoAtualizadoResultado | null>(null);

  const previaSeq = useRef(0); // descarta resposta de previa de uma solicitacao anterior
  const timerPrevia = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gerandoRef = useRef(false); // guarda contra duplo clique na confirmacao (T-50-26)

  // Previa inicial (sem parametros: o servidor devolve hoje, as duas datas e as taxas padrao).
  useEffect(() => {
    const seq = ++previaSeq.current;
    (async () => {
      try {
        const res = await fetch(`/api/cobranca/boleto/${cobrancaId}/atualizacao/previa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (seq !== previaSeq.current) return;
        if (!res.ok) {
          setErro(mensagemDeErro(data, "Não foi possível calcular a prévia do boleto atualizado."));
          setFase("erro");
          return;
        }
        const p = data as PreviaBoletoAtualizado;
        setPrevia(p);
        setDataSel(p.novoVencimento);
        setJurosTxt(taxaParaCampo(p.taxaJurosMes));
        setMultaTxt(taxaParaCampo(p.multaPercentual));
        setFase("pronto");
      } catch {
        if (seq !== previaSeq.current) return;
        setErro("Falha ao conectar. Tente novamente.");
        setFase("erro");
      }
    })();
    return () => {
      previaSeq.current++;
      if (timerPrevia.current) clearTimeout(timerPrevia.current);
    };
  }, [cobrancaId]);

  const juros = campoParaTaxa(jurosTxt);
  const multa = campoParaTaxa(multaTxt);
  const tetos = previa?.tetos;
  let avisoJuros = "";
  let avisoMulta = "";
  if (previa && tetos) {
    if (!Number.isFinite(juros) || juros < 0) avisoJuros = "Informe um número válido.";
    else if (juros > tetos.taxaJurosMes) avisoJuros = `Juros acima do limite de ${taxaParaCampo(tetos.taxaJurosMes)}% ao mês.`;
    if (!Number.isFinite(multa) || multa < 0) avisoMulta = "Informe um número válido.";
    else if (multa > tetos.multaPercentual) avisoMulta = `Multa acima do limite de ${taxaParaCampo(tetos.multaPercentual)}%.`;
  }
  const taxasValidas = !avisoJuros && !avisoMulta;

  /** Refaz a previa no servidor depois de uma pausa; so dispara com data e taxas validas. */
  function agendarPrevia(data: string, jTxt: string, mTxt: string) {
    if (timerPrevia.current) clearTimeout(timerPrevia.current);
    const j = campoParaTaxa(jTxt);
    const m = campoParaTaxa(mTxt);
    const t = previa?.tetos;
    if (!t || !Number.isFinite(j) || !Number.isFinite(m) || j > t.taxaJurosMes || m > t.multaPercentual) {
      previaSeq.current++; // invalida qualquer resposta em voo: os valores na tela ja nao correspondem
      setRecalculando(false);
      return;
    }
    setRecalculando(true);
    timerPrevia.current = setTimeout(async () => {
      const seq = ++previaSeq.current;
      try {
        const res = await fetch(`/api/cobranca/boleto/${cobrancaId}/atualizacao/previa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ novoVencimento: data, taxaJurosMes: j, multaPercentual: m }),
          cache: "no-store",
        });
        const corpo = await res.json().catch(() => ({}));
        if (seq !== previaSeq.current) return;
        if (!res.ok) {
          setErro(mensagemDeErro(corpo, "Não foi possível recalcular a prévia."));
          setRecalculando(false);
          setFase("erro");
          return;
        }
        setPrevia(corpo as PreviaBoletoAtualizado);
        setRecalculando(false);
      } catch {
        if (seq !== previaSeq.current) return;
        setErro("Falha ao conectar. Tente novamente.");
        setRecalculando(false);
        setFase("erro");
      }
    }, ESPERA_PREVIA_MS);
  }

  function escolherData(data: string) {
    setDataSel(data);
    agendarPrevia(data, jurosTxt, multaTxt);
  }

  function mudarJuros(txt: string) {
    setJurosTxt(txt);
    agendarPrevia(dataSel, txt, multaTxt);
  }

  function mudarMulta(txt: string) {
    setMultaTxt(txt);
    agendarPrevia(dataSel, jurosTxt, txt);
  }

  async function confirmar() {
    if (!previa || gerandoRef.current || !taxasValidas || recalculando || !dataSel) return;
    gerandoRef.current = true;
    setFase("gerando");
    try {
      const res = await fetch(`/api/cobranca/boleto/${cobrancaId}/atualizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novoVencimento: dataSel, taxaJurosMes: juros, multaPercentual: multa }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(mensagemDeErro(data, "Não foi possível gerar o boleto atualizado."));
        setFase("erro");
        return;
      }
      setResultado(data as GerarBoletoAtualizadoResultado);
      setFase("sucesso");
    } catch {
      setErro("Falha ao conectar. Confira a lista de boletos antes de tentar de novo.");
      setFase("erro");
    } finally {
      gerandoRef.current = false;
    }
  }

  const ocupado = fase === "gerando";
  const repetirCancelamento = !!previa?.sucessorAtivoId;
  const rotuloDatas: [string, string] = [
    previa && previa.vencimentosPermitidos[0] === previa.hoje ? "Hoje" : "Primeiro dia útil",
    previa && previa.vencimentosPermitidos[0] === previa.hoje ? "Próximo dia útil" : "Dia útil seguinte",
  ];

  return (
    <div className="boleto-modal-backdrop" onClick={!ocupado && fase !== "sucesso" ? onFechar : undefined}>
      <div
        className="boleto-modal-card"
        style={{ width: "min(900px, 100%)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Gerar boleto atualizado com juros e multa"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="boleto-modal-header">
          <h5 className="mb-0 fw-semibold" style={{ fontSize: "var(--fs-lg, 1.35rem)" }}>
            <i className="bi bi-arrow-repeat me-2" />Boleto atualizado — #{cobrancaId}
          </h5>
          {!ocupado && fase !== "sucesso" && (
            <button type="button" className="btn-close" onClick={onFechar} aria-label="Fechar" />
          )}
        </div>

        {fase === "carregando" && (
          <div className="boleto-modal-body text-center py-4">
            <div className="spinner-border text-primary mb-2" role="status">
              <span className="visually-hidden">Calculando…</span>
            </div>
            <div className="small text-muted">Calculando a prévia no servidor…</div>
          </div>
        )}

        {fase === "gerando" && (
          <div className="boleto-modal-body text-center py-4">
            <div className="spinner-border text-warning mb-2" role="status">
              <span className="visually-hidden">Gerando…</span>
            </div>
            <div className="small text-muted">Gerando o boleto atualizado e cancelando o original na EFI…</div>
          </div>
        )}

        {fase === "erro" && (
          <>
            <div className="boleto-modal-body" role="alert" aria-live="assertive">
              <div className="alert alert-danger d-flex gap-2 mb-0">
                <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />
                <div>{erro || "Não foi possível concluir a operação."}</div>
              </div>
            </div>
            <div className="boleto-modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onFechar}>
                Fechar
              </button>
              {previa && (
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={() => {
                    setErro("");
                    setFase("pronto");
                  }}
                >
                  Voltar
                </button>
              )}
            </div>
          </>
        )}

        {fase === "pronto" && previa && (
          <>
            <div className="boleto-modal-body">
              <div className="small mb-2">
                <strong>Hoje:</strong> {formatarDataEmissao(previa.hoje)}
              </div>

              {previa.sucessorAtivoId && (
                <div className="alert alert-warning small">
                  Este boleto já tem o boleto atualizado #{previa.sucessorAtivoId}; confirmar repete só o
                  cancelamento do original na EFI.
                </div>
              )}

              <div className="mb-3">
                <div className="form-label small fw-semibold mb-1">Novo vencimento</div>
                <div className="d-flex gap-2 flex-wrap" role="radiogroup" aria-label="Novo vencimento">
                  {previa.vencimentosPermitidos.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={dataSel === d}
                      className={`btn btn-sm ${dataSel === d ? "btn-warning" : "btn-outline-secondary"}`}
                      onClick={() => escolherData(d)}
                    >
                      {rotuloDatas[i]} ({formatarDataEmissao(d)})
                    </button>
                  ))}
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-sm-6">
                  <label className="form-label small fw-semibold" htmlFor="ba-juros">
                    Juros (% ao mês)
                  </label>
                  <input
                    id="ba-juros"
                    type="text"
                    inputMode="decimal"
                    className={`form-control${avisoJuros ? " is-invalid" : ""}`}
                    value={jurosTxt}
                    onChange={(e) => mudarJuros(e.target.value)}
                  />
                  {avisoJuros && <div className="small text-danger mt-1">{avisoJuros}</div>}
                </div>
                <div className="col-sm-6">
                  <label className="form-label small fw-semibold" htmlFor="ba-multa">
                    Multa (%)
                  </label>
                  <input
                    id="ba-multa"
                    type="text"
                    inputMode="decimal"
                    className={`form-control${avisoMulta ? " is-invalid" : ""}`}
                    value={multaTxt}
                    onChange={(e) => mudarMulta(e.target.value)}
                  />
                  {avisoMulta && <div className="small text-danger mt-1">{avisoMulta}</div>}
                </div>
              </div>

              <div className="table-responsive mb-3" style={recalculando ? { opacity: 0.6 } : undefined}>
                <table className="pa-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Venc. original</th>
                      <th>Dias</th>
                      <th>Valor</th>
                      <th>Juros</th>
                      <th>Multa</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.titulos.map((t) => (
                      <tr key={t.idcontareceber}>
                        <td className="small">{t.numerotitulo ?? t.idcontareceber}</td>
                        <td className="small">{formatarDataEmissao(t.vencimentoOriginal)}</td>
                        <td className="small">{t.diasAtraso}</td>
                        <td className="small">{formatBRL(t.principal)}</td>
                        <td className="small">{formatBRL(t.juros)}</td>
                        <td className="small">{formatBRL(t.multa)}</td>
                        <td className="small fw-semibold">{formatBRL(t.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="small fw-semibold" colSpan={3}>
                        Totais
                      </td>
                      <td className="small fw-semibold">{formatBRL(previa.principal)}</td>
                      <td className="small fw-semibold">{formatBRL(previa.juros)}</td>
                      <td className="small fw-semibold">{formatBRL(previa.multa)}</td>
                      <td className="small fw-bold">{formatBRL(previa.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {recalculando && <div className="small text-muted mb-2">Recalculando…</div>}

              {previa.mensagem.length > 0 && (
                <div className="border rounded p-2 mb-3 bg-light">
                  <div className="small fw-semibold mb-1">Mensagem no boleto e no e-mail</div>
                  {previa.mensagem.map((linha, i) => (
                    <div key={i} className="small">
                      {linha}
                    </div>
                  ))}
                </div>
              )}

              <ul className="small text-muted mb-0 ps-3">
                <li>O boleto original #{previa.cobrancaIdOriginal} será cancelado na EFI depois que o novo for gerado.</li>
                <li>
                  Se o cliente atrasar de novo, a EFI cobra juros de {taxaParaCampo(previa.taxaJurosMesPadrao)}% a.m. e
                  multa de {taxaParaCampo(previa.multaPercentualPadrao)}% sobre o valor atualizado.
                </li>
                <li>Sábados e domingos não contam como dia útil; feriados não são considerados.</li>
              </ul>
            </div>
            <div className="boleto-modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onFechar}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-warning"
                disabled={!taxasValidas || recalculando || ocupado || !dataSel}
                onClick={confirmar}
              >
                <i className="bi bi-arrow-repeat me-1" />
                {repetirCancelamento ? "Repetir cancelamento do original" : "Gerar boleto atualizado"}
              </button>
            </div>
          </>
        )}

        {fase === "sucesso" && resultado && previa && (
          <>
            <div className="boleto-modal-body">
              <div className="alert alert-success d-flex gap-2">
                <i className="bi bi-check-circle-fill flex-shrink-0" />
                <div>
                  Boleto atualizado #{resultado.cobrancaId} gerado: {formatBRL(resultado.valor)}, vencimento{" "}
                  {formatarDataEmissao(resultado.expireAt)}.
                  {resultado.reaproveitado && " O boleto atualizado já existia e foi reaproveitado."}
                </div>
              </div>
              {resultado.cancelamentoOriginal === "ok" ? (
                <div className="small mb-2">Boleto original #{resultado.cobrancaIdOriginal} cancelado na EFI.</div>
              ) : (
                <div className="alert alert-warning small" role="alert">
                  {resultado.aviso ??
                    `Não foi possível cancelar o boleto original #${resultado.cobrancaIdOriginal} na EFI. Cancele-o manualmente para evitar pagamento em dobro.`}
                </div>
              )}
              <a
                href={`/api/cobranca/boleto/${resultado.cobrancaId}/pdf`}
                className="btn btn-sm btn-outline-primary"
                title="Baixar PDF do boleto atualizado"
              >
                <i className="bi bi-download me-1" />Baixar PDF
              </a>
            </div>
            <div className="boleto-modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onConcluido}>
                Fechar
              </button>
              <button type="button" className="btn btn-success" onClick={() => onEnviarEmail(resultado.cobrancaId)}>
                <i className="bi bi-envelope me-1" />Enviar por e-mail
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ModalBoletoAtualizado;
