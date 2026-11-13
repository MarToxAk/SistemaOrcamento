"use client";

import { useRef, useState } from "react";
import BoletoDetalhe from "../../_componentes/boleto-detalhe";
import { formatBRL, formatDate } from "../../_shared/formatadores";
import {
  EMAIL_CC_MAX,
  EMAIL_CC_PADRAO_TIMEOUT_MS,
  StatusEmailBadge,
  badgeClassName,
  mesclarEmailsCc,
  type DadosCliente,
  type TituloReceber,
} from "./compartilhado";
import { EstilosModal } from "./estilos-modal";

interface AbaBoletosProps {
  idcliente: string;
  dadosCliente: DadosCliente | null;
  titulos: TituloReceber[];
  loadingTitulos: boolean;
  erroTitulos: string;
}

/** Boletos emitidos agrupados, com PDF, verificar pagamento, cancelar e envio por e-mail com CC. */
export function AbaBoletos({ idcliente, dadosCliente, titulos, loadingTitulos, erroTitulos }: AbaBoletosProps) {
  // ─── Envio de e-mail (boleto + NFS-e + NF-e XML) ───
  const [emailModalState, setEmailModalState] = useState<
    "idle" | "confirm" | "loading" | "success" | "error"
  >("idle");
  const [emailCtx, setEmailCtx] = useState<{
    cobrancaId: number;
    nfseEmitidaIds: number[];
    nfeCount: number;
  } | null>(null);
  const [emailDestinatario, setEmailDestinatario] = useState("");
  const [emailCc, setEmailCc] = useState<string[]>([]);
  const [emailCcInput, setEmailCcInput] = useState("");
  const [emailCcErro, setEmailCcErro] = useState("");
  const [emailCcCarregando, setEmailCcCarregando] = useState(false); // GET do padrao em andamento
  const [emailCcPadraoAviso, setEmailCcPadraoAviso] = useState(""); // falha ao carregar o padrao
  const [emailCcSalvarPadrao, setEmailCcSalvarPadrao] = useState(false); // checkbox opt-in (D-06)
  const [emailCcPadraoResultado, setEmailCcPadraoResultado] = useState<"salvo" | "falhou" | null>(
    null,
  ); // resultado do PUT pos-envio
  const emailCcCargaSeq = useRef(0); // descarta resposta do GET de uma abertura anterior do modal
  const [emailResult, setEmailResult] = useState<{
    destinatario: string;
    cc?: string[];
    status: string;
    anexos?: string[];
  } | null>(null);
  const [emailErro, setEmailErro] = useState("");
  // Boleto cujo detalhe (linha digitavel, PIX, titulos, historico de baixa) esta aberto (D-06).
  const [detalheAbertoId, setDetalheAbertoId] = useState<number | null>(null);

  // Boletos ativos agrupados por cobranca
  const boletoGrupos = new Map<number, { boleto: NonNullable<typeof titulos[0]["boletoAtivo"]>; titulos: typeof titulos }>();
  for (const t of titulos) {
    if (t.boletoAtivo) {
      const id = t.boletoAtivo.cobrancaId;
      if (!boletoGrupos.has(id)) boletoGrupos.set(id, { boleto: t.boletoAtivo, titulos: [] });
      boletoGrupos.get(id)!.titulos.push(t);
    }
  }

  function abreEmailModal(
    boleto: NonNullable<(typeof titulos)[0]["boletoAtivo"]>,
    tsBoleto: typeof titulos,
  ) {
    const nfseIds = [
      ...new Set(
        tsBoleto
          .map((t) => t.nfseAtivo?.nfseEmitidaId)
          .filter((v): v is number => !!v),
      ),
    ];
    const nfeCount = new Set(
      tsBoleto
        .filter((t) => t.tipoNf?.includes("NF-e"))
        .map((t) => t.numeroNf)
        .filter(Boolean),
    ).size;
    setEmailCtx({ cobrancaId: boleto.cobrancaId, nfseEmitidaIds: nfseIds, nfeCount });
    setEmailDestinatario(
      dadosCliente?.emailcobrancacliente ?? dadosCliente?.emailcliente ?? "",
    );
    const principal = dadosCliente?.emailcobrancacliente ?? dadosCliente?.emailcliente ?? "";
    setEmailCc([]);
    setEmailCcInput("");
    setEmailCcErro("");
    setEmailCcSalvarPadrao(false);
    setEmailCcPadraoAviso("");
    setEmailCcPadraoResultado(null);
    setEmailErro("");
    setEmailResult(null);
    setEmailModalState("confirm");
    void carregarCcPadrao(principal);
  }

  /** Pre-preenche o CC com a lista fixa do cliente (D-01). Falha vira aviso e segue com a lista vazia. */
  async function carregarCcPadrao(principal: string) {
    const seq = ++emailCcCargaSeq.current;
    setEmailCcCarregando(true);
    // O padrao e um dado opcional: se o GET pendurar, aborta por timeout para nao bloquear o Enviar.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMAIL_CC_PADRAO_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/cobranca/email/cc-padrao/${idcliente}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (seq !== emailCcCargaSeq.current) return;
      if (!res.ok) {
        setEmailCcPadraoAviso("Não foi possível carregar a lista de cópia padrão deste cliente.");
        setEmailCcSalvarPadrao(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const emails: string[] = Array.isArray(data?.emails)
        ? data.emails.filter((e: unknown): e is string => typeof e === "string")
        : [];
      const { lista } = mesclarEmailsCc([], emails.join(","), principal);
      setEmailCc(lista);
    } catch {
      if (seq !== emailCcCargaSeq.current) return;
      setEmailCcPadraoAviso("Não foi possível carregar a lista de cópia padrão deste cliente.");
      setEmailCcSalvarPadrao(false);
    } finally {
      clearTimeout(timer);
      if (seq === emailCcCargaSeq.current) setEmailCcCarregando(false);
    }
  }

  /** Aplica a mescla de CC no estado e devolve a lista final + se houve problema (invalidos/excedentes). */
  function aplicarMesclaCc(): { lista: string[]; ok: boolean } {
    const { lista, invalidos, excedentes } = mesclarEmailsCc(emailCc, emailCcInput, emailDestinatario);
    setEmailCc(lista);
    setEmailCcInput(invalidos.join(", "));
    if (invalidos.length > 0) {
      setEmailCcErro(`E-mail inválido: ${invalidos.join(", ")}`);
    } else if (excedentes > 0) {
      setEmailCcErro(`Limite de ${EMAIL_CC_MAX} e-mails em cópia.`);
    } else {
      setEmailCcErro("");
    }
    return { lista, ok: invalidos.length === 0 && excedentes === 0 };
  }

  function adicionarEmailCc() {
    aplicarMesclaCc();
  }

  function removerEmailCc(email: string) {
    setEmailCc((atual) => atual.filter((e) => e !== email));
    setEmailCcErro("");
  }

  async function confirmarEnviarEmail() {
    if (!emailCtx) return;
    // Incorpora texto digitado e ainda nao adicionado; aborta se houver problema.
    const { lista: ccFinal, ok } = aplicarMesclaCc();
    if (!ok) return;
    setEmailModalState("loading");
    try {
      const res = await fetch("/api/cobranca/email/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idclienteAthos: Number(idcliente),
          cobrancaBoletoId: emailCtx.cobrancaId,
          nfseEmitidaIds: emailCtx.nfseEmitidaIds,
          destinatario: emailDestinatario.trim() || undefined,
          cc: ccFinal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // D-06: so grava o padrao com opt-in explicito e envio ok; falha aqui nunca desfaz o envio.
        if (emailCcSalvarPadrao && !emailCcPadraoAviso) {
          const listaEnviada: string[] = Array.isArray(data?.cc) ? data.cc : ccFinal;
          try {
            const resPadrao = await fetch(`/api/cobranca/email/cc-padrao/${idcliente}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emails: listaEnviada }),
            });
            setEmailCcPadraoResultado(resPadrao.ok ? "salvo" : "falhou");
          } catch {
            setEmailCcPadraoResultado("falhou");
          }
        }
        setEmailResult(data);
        setEmailModalState("success");
      } else {
        const msg = Array.isArray(data.message) ? data.message.join(" ") : data.message;
        setEmailErro(msg ?? data.error ?? "Falha ao enviar.");
        setEmailModalState("error");
      }
    } catch {
      setEmailErro("Falha ao conectar. Tente novamente.");
      setEmailModalState("error");
    }
  }

  return (
    <>
      <div className="pa-card">
        <div className="pa-card-header">
          <strong><i className="bi bi-files me-2 text-primary" />Boletos Emitidos</strong>
        </div>
        <div className="pa-card-body">
          {loadingTitulos ? (
            <div className="text-center py-3">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Carregando...</span>
              </div>
            </div>
          ) : erroTitulos ? (
            <div className="alert alert-danger">{erroTitulos}</div>
          ) : boletoGrupos.size === 0 ? (
            <div className="alert alert-info mb-0">
              <i className="bi bi-info-circle me-2" />Nenhum boleto emitido para os títulos em aberto deste cliente.
            </div>
          ) : (
            <div>
                {[...boletoGrupos.values()].map(({ boleto, titulos: tsBoleto }) => {
                  const totalBoleto = tsBoleto.reduce((s, t) => s + t.valor, 0);
                  const isPago = boleto.status === "pago";
                  const pillVariante = isPago ? "success" : boleto.status === "cancelado" ? "secondary" : "warning";
                  const detalheAberto = detalheAbertoId === boleto.cobrancaId;
                  return (
                    <div key={boleto.cobrancaId} className="pa-card mb-2">
                      {/* Cabeçalho do grupo */}
                      <div className="pa-card-header flex-wrap gap-2">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className={`pa-pill pa-pill-${pillVariante}`}>
                            <i className="bi bi-receipt me-1" />Boleto #{boleto.cobrancaId} — {boleto.status}
                          </span>
                          <span className="small fw-semibold">{formatBRL(totalBoleto)}</span>
                          <span className="small text-muted">({tsBoleto.length} título{tsBoleto.length > 1 ? "s" : ""})</span>
                          <StatusEmailBadge ultimoEmail={boleto.ultimoEmail} />
                        </div>
                        <div className="d-flex gap-2">
                          <button type="button" className="btn btn-sm btn-outline-secondary"
                            aria-expanded={detalheAberto}
                            title="Mostrar linha digitável, PIX, títulos e histórico de baixa"
                            onClick={() => setDetalheAbertoId(detalheAberto ? null : boleto.cobrancaId)}>
                            <i className={`bi ${detalheAberto ? "bi-chevron-up" : "bi-chevron-down"} me-1`} />Detalhes
                          </button>
                          {boleto.linkBoleto && (
                            <a href={`/api/cobranca/boleto/${boleto.cobrancaId}/pdf`}
                              download={boleto.nomeArquivo ?? undefined}
                              className="btn btn-sm btn-outline-primary"
                              title="Baixar PDF do boleto">
                              <i className="bi bi-download me-1" />PDF
                            </a>
                          )}
                          <button type="button" className="btn btn-sm btn-outline-info"
                            title="Verificar pagamento na EFI"
                            onClick={async () => {
                              await fetch(`/api/cobranca/boleto/${boleto.cobrancaId}/verificar-pagamento`, { method: "POST" });
                              window.location.reload();
                            }}>
                            <i className="bi bi-arrow-clockwise me-1" />Verificar
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-success"
                            title="Enviar boleto e notas por e-mail"
                            onClick={() => abreEmailModal(boleto, tsBoleto)}>
                            <i className="bi bi-envelope me-1" />E-mail
                          </button>
                          {!isPago && (
                            <button type="button" className="btn btn-sm btn-outline-danger"
                              title="Cancelar boleto e liberar títulos"
                              onClick={async () => {
                                if (!confirm(`Cancelar boleto #${boleto.cobrancaId}? Os ${tsBoleto.length} título(s) ficarão disponíveis para novo boleto.`)) return;
                                await fetch(`/api/cobranca/boleto/${boleto.cobrancaId}/cancelar`, { method: "POST" });
                                window.location.reload();
                              }}>
                              <i className="bi bi-x-circle me-1" />Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                      {detalheAberto && (
                        <BoletoDetalhe cobrancaId={boleto.cobrancaId} status={boleto.status} />
                      )}
                      {/* Sub-tabela de títulos deste boleto */}
                      <div className="pa-card-body-flush">
                        <table className="pa-table">
                          <thead>
                            <tr>
                              <th>Título</th>
                              <th>Vencimento</th>
                              <th>Valor</th>
                              <th>NF</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tsBoleto.map((t) => {
                              const vencido = new Date(t.datavencimento) < new Date();
                              return (
                                <tr key={t.idcontareceber}>
                                  <td className="small">{t.numerotitulo ?? "—"}</td>
                                  <td className={`small${vencido ? " text-danger" : ""}`}>{formatDate(t.datavencimento)}</td>
                                  <td className="small fw-semibold">{formatBRL(t.valor)}</td>
                                  <td>
                                    {t.tipoNf ? (
                                      <span className="d-inline-flex align-items-center gap-1">
                                        <span className={`badge ${badgeClassName(t.tipoNf)}`}>
                                          {t.tipoNf}{t.numeroNf ? ` #${t.numeroNf}` : ""}
                                        </span>
                                        {t.nfseAtivo?.nfseEmitidaId && (
                                          <a
                                            href={`/api/cobranca/nfse/${t.nfseAtivo.nfseEmitidaId}/pdf`}
                                            className="btn btn-link btn-sm p-0 text-success"
                                            title="Baixar PDF da NFS-e"
                                            style={{ lineHeight: 1 }}
                                          >
                                            <i className="bi bi-file-earmark-arrow-down" />
                                          </a>
                                        )}
                                      </span>
                                    ) : <span className="badge bg-secondary opacity-50">Sem NF</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Modal envio de e-mail — 4 estados */}
      {emailModalState !== "idle" && emailCtx && (
        <div
          className="boleto-modal-backdrop"
          onClick={emailModalState !== "loading" ? () => setEmailModalState("idle") : undefined}
        >
          <div
            className="boleto-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Enviar boleto e notas por e-mail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="boleto-modal-header">
              <h5 className="mb-0 fw-semibold" style={{ fontSize: "var(--fs-lg, 1.35rem)" }}>
                <i className="bi bi-send me-2" />Enviar por e-mail
              </h5>
              {emailModalState !== "loading" && (
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setEmailModalState("idle")}
                  aria-label="Fechar"
                />
              )}
            </div>

            {emailModalState === "confirm" && (
              <>
                <div className="boleto-modal-body">
                  <label className="form-label small fw-semibold" htmlFor="email-destinatario">
                    Destinatário
                  </label>
                  <input
                    id="email-destinatario"
                    type="email"
                    className="form-control mb-3"
                    value={emailDestinatario}
                    onChange={(e) => setEmailDestinatario(e.target.value)}
                    placeholder="cliente@exemplo.com"
                  />
                  <label className="form-label small fw-semibold" htmlFor="email-cc-input">
                    Cópia (CC)
                  </label>
                  <div className="input-group">
                    <input
                      id="email-cc-input"
                      type="text"
                      className="form-control"
                      value={emailCcInput}
                      disabled={emailCcCarregando}
                      onChange={(e) => setEmailCcInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          adicionarEmailCc();
                        }
                      }}
                      placeholder="outro@exemplo.com"
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={emailCcCarregando || !emailCcInput.trim()}
                      onClick={adicionarEmailCc}
                    >
                      <i className="bi bi-plus-lg me-1" />Adicionar
                    </button>
                  </div>
                  {emailCcCarregando && (
                    <div className="d-flex align-items-center gap-2 mt-1">
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      <span className="small text-muted">Carregando lista padrão…</span>
                    </div>
                  )}
                  {emailCcPadraoAviso && (
                    <div className="small text-warning-emphasis mt-1">{emailCcPadraoAviso}</div>
                  )}
                  {emailCcErro && <div className="small text-danger mt-1">{emailCcErro}</div>}
                  <small className="text-muted d-block mt-1">
                    Opcional — até {EMAIL_CC_MAX} e-mails. Enter ou vírgula para adicionar. ({emailCc.length}/{EMAIL_CC_MAX})
                  </small>
                  {emailCc.length > 0 && (
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      {emailCc.map((email) => (
                        <span
                          key={email}
                          className="badge rounded-pill text-bg-light border fw-normal d-inline-flex align-items-center gap-1"
                        >
                          {email}
                          <button
                            type="button"
                            className="btn-close"
                            style={{ fontSize: "0.5rem" }}
                            aria-label={`Remover ${email}`}
                            onClick={() => removerEmailCc(email)}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="form-check mt-2">
                    <input
                      id="email-cc-salvar-padrao"
                      type="checkbox"
                      className="form-check-input"
                      checked={emailCcSalvarPadrao}
                      disabled={emailCcCarregando || !!emailCcPadraoAviso}
                      onChange={(e) => setEmailCcSalvarPadrao(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="email-cc-salvar-padrao">
                      Salvar como padrão deste cliente
                    </label>
                  </div>
                  {emailCcPadraoAviso && (
                    <small className="text-muted d-block">
                      Salvar como padrão indisponível: a lista atual não foi carregada e seria sobrescrita.
                    </small>
                  )}
                  {emailCcSalvarPadrao && emailCc.length === 0 && (
                    <small className="text-muted d-block">
                      Com a lista vazia, o padrão salvo deste cliente será removido.
                    </small>
                  )}
                  <small className="text-muted d-block mt-3">
                    Serão anexados: boleto (PDF) + {emailCtx.nfseEmitidaIds.length} NFS-e (PDF + XML) +{" "}
                    {emailCtx.nfeCount} NF-e (PDF + XML)
                  </small>
                </div>
                <div className="boleto-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setEmailModalState("idle")}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    disabled={!emailDestinatario.trim() || emailCcCarregando}
                    onClick={confirmarEnviarEmail}
                  >
                    <i className="bi bi-send me-1" />Enviar e-mail
                  </button>
                </div>
              </>
            )}

            {emailModalState === "loading" && (
              <div className="boleto-modal-body text-center py-4">
                <div className="spinner-border text-success mb-2" role="status">
                  <span className="visually-hidden">Enviando…</span>
                </div>
                <div className="small text-muted">Enviando e-mail…</div>
              </div>
            )}

            {emailModalState === "success" && emailResult && (
              <>
                <div className="boleto-modal-body">
                  <div className="alert alert-success d-flex gap-2">
                    <i className="bi bi-check-circle-fill flex-shrink-0" />
                    <div>E-mail enviado para {emailResult.destinatario}</div>
                  </div>
                  {emailResult.cc && emailResult.cc.length > 0 && (
                    <div className="small mb-2">Cópia (CC): {emailResult.cc.join(", ")}</div>
                  )}
                  {emailCcPadraoResultado === "salvo" && (
                    <div className="small text-success mb-2">
                      Lista de cópia salva como padrão deste cliente.
                    </div>
                  )}
                  {emailCcPadraoResultado === "falhou" && (
                    <div className="alert alert-warning">
                      E-mail enviado, mas não foi possível salvar a lista de cópia como padrão deste cliente.
                    </div>
                  )}
                  {emailResult.anexos && emailResult.anexos.length > 0 && (
                    <ul className="small mb-2">
                      {emailResult.anexos.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  )}
                  <small className="text-muted d-block">
                    A confirmação de leitura depende do cliente abrir a imagem ou clicar no link de
                    confirmação — o pixel pode não registrar em alguns provedores.
                    {emailResult.cc && emailResult.cc.length > 0
                      ? " Com cópia, a abertura/confirmação pode ter vindo de qualquer destinatário."
                      : ""}
                  </small>
                </div>
                <div className="boleto-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setEmailModalState("idle")}
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}

            {emailModalState === "error" && (
              <>
                <div className="boleto-modal-body" role="alert" aria-live="assertive">
                  <div className="alert alert-danger d-flex gap-2">
                    <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />
                    <div>{emailErro || "Não foi possível enviar o e-mail."}</div>
                  </div>
                </div>
                <div className="boleto-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setEmailModalState("idle")}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => {
                      setEmailErro("");
                      setEmailModalState("confirm");
                    }}
                  >
                    Tentar novamente
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <EstilosModal />
    </>
  );
}

export default AbaBoletos;
