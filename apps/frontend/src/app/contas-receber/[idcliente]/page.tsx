"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import { safeHttpUrl } from "@/lib/safe-url";
import PasswordGate from "@/components/password-gate";
import AdminShell from "../admin-shell";
import RecursosBootstrap from "../_shared/recursos-bootstrap";
import { lerOpcao } from "../_shared/filtros-url";
import { formatBRL, formatDate } from "../_shared/formatadores";
import { useFiltrosUrl } from "../_shared/use-filtros-url";
import {
  AbasNavegacao,
  EMAIL_CC_MAX,
  EMAIL_CC_PADRAO_TIMEOUT_MS,
  StatusEmailBadge,
  badgeClassName,
  mesclarEmailsCc,
  type AbaCliente,
  type NfseEmitidaCliente,
  type NotaFiscalAthos,
} from "./_abas/compartilhado";
import { useDadosCliente } from "./_abas/use-dados-cliente";
import { AbaContasEmAberto } from "./_abas/aba-contas-em-aberto";
import { AbaGerarBoleto } from "./_abas/aba-gerar-boleto";
import { EstilosModal } from "./_abas/estilos-modal";

const ABAS_PERMITIDAS: readonly AbaCliente[] = ["contas", "gerar-boleto", "boletos", "notas"];

export default function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ idcliente: string }>;
}) {
  const { idcliente } = use(params);

  return (
    <PasswordGate
      title="Contas a Receber"
      description="Esta area exibe dados financeiros de clientes. Digite a senha de configuracoes para continuar."
    >
      <Suspense
        fallback={
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Carregando...</span>
            </div>
          </div>
        }
      >
        <ClienteDetalheConteudo idcliente={idcliente} />
      </Suspense>
    </PasswordGate>
  );
}

function ClienteDetalheConteudo({ idcliente }: { idcliente: string }) {
  const { obter, definir } = useFiltrosUrl();
  const aba = lerOpcao<AbaCliente>(obter("aba"), ABAS_PERMITIDAS, "contas");

  const {
    dadosCliente,
    loadingCliente,
    erroCliente,
    titulos,
    loadingTitulos,
    erroTitulos,
    historico,
    loadingHistorico,
    erroHistorico,
    recarregar,
  } = useDadosCliente(idcliente);

  // Seção NFS-e Emitidas
  const [nfseAberta, setNfseAberta] = useState(false);
  const [nfseCarregada, setNfseCarregada] = useState(false);
  const [nfseEmitidas, setNfseEmitidas] = useState<NfseEmitidaCliente[]>([]);
  const [loadingNfse, setLoadingNfse] = useState(false);
  const nfseRef = useRef<HTMLDivElement>(null);

  // Seção Notas Fiscais Athos
  const [nfatAberta, setNfatAberta] = useState(false);
  const [nfatCarregada, setNfatCarregada] = useState(false);
  const [notasFiscaisAthos, setNotasFiscaisAthos] = useState<NotaFiscalAthos[]>([]);
  const [loadingNfat, setLoadingNfat] = useState(false);
  const [buscaNumeroNf, setBuscaNumeroNf] = useState("");
  const [resultadoBuscaNf, setResultadoBuscaNf] = useState<NotaFiscalAthos[] | null>(null);
  const [buscandoNf, setBuscandoNf] = useState(false);
  const nfatRef = useRef<HTMLDivElement>(null);

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


  // Separar títulos: com boleto (agrupados) vs livres
  const titulosLivres = titulos.filter((t) => !t.boletoAtivo);
  const boletoGrupos = new Map<number, { boleto: NonNullable<typeof titulos[0]["boletoAtivo"]>; titulos: typeof titulos }>();
  for (const t of titulos) {
    if (t.boletoAtivo) {
      const id = t.boletoAtivo.cobrancaId;
      if (!boletoGrupos.has(id)) boletoGrupos.set(id, { boleto: t.boletoAtivo, titulos: [] });
      boletoGrupos.get(id)!.titulos.push(t);
    }
  }

  async function carregarNfseEmitidas() {
    setLoadingNfse(true);
    try {
      const res = await fetch(`/api/cobranca/nfse/cliente/${idcliente}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as NfseEmitidaCliente[];
        setNfseEmitidas(data);
      }
    } catch { /* silently ignore */ }
    finally {
      setLoadingNfse(false);
      setNfseCarregada(true);
    }
  }

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !nfseCarregada) {
        void carregarNfseEmitidas();
      }
    });
    if (nfseRef.current) observer.observe(nfseRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfseAberta, nfseCarregada]);

  async function carregarNotasFiscaisAthos() {
    setLoadingNfat(true);
    try {
      const res = await fetch(`/api/athos/clientes/${idcliente}/notas-fiscais`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as NotaFiscalAthos[];
        setNotasFiscaisAthos(data);
      }
    } catch { /* silently ignore */ }
    finally {
      setLoadingNfat(false);
      setNfatCarregada(true);
    }
  }

  async function buscarNotaPorNumero() {
    if (!buscaNumeroNf.trim()) return;
    setBuscandoNf(true);
    try {
      const res = await fetch(
        `/api/athos/clientes/${idcliente}/notas-fiscais?numero=${encodeURIComponent(buscaNumeroNf.trim())}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as NotaFiscalAthos[];
        setResultadoBuscaNf(data);
      }
    } catch { /* silently ignore */ }
    finally {
      setBuscandoNf(false);
    }
  }

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !nfatCarregada) {
        void carregarNotasFiscaisAthos();
      }
    });
    if (nfatRef.current) observer.observe(nfatRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfatAberta, nfatCarregada]);

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
      <RecursosBootstrap />

      <AdminShell
        activeHref="/contas-receber"
        title="Detalhe do Cliente"
        subtitle={dadosCliente ? dadosCliente.nome_cliente : `Cliente #${idcliente}`}
        actions={
          <a href="/contas-receber" className="pa-link-btn text-nowrap">
            <i className="bi bi-arrow-left me-1" />Contas a Receber
          </a>
        }
      >
        {/* Dados do cliente */}
        <div className="pa-card">
          <div className="pa-card-header">
            <strong><i className="bi bi-person-circle me-2 text-primary" />Dados Cadastrais</strong>
          </div>
          <div className="pa-card-body">
            {loadingCliente ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
              </div>
            ) : erroCliente ? (
              <div className="pa-empty pa-empty-erro">{erroCliente}</div>
            ) : dadosCliente ? (
              <div className="row g-2">
                <div className="col-md-6">
                  <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span className="text-muted small">Nome</span>
                    <strong className="small text-end">{dadosCliente.nome_cliente}</strong>
                  </div>
                  <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span className="text-muted small">Telefone</span>
                    <span className="small">{dadosCliente.telefone_completo ?? "—"}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span className="text-muted small">E-mail</span>
                    <span className="small">{dadosCliente.emailcliente ?? "—"}</span>
                  </div>
                  <div className="d-flex justify-content-between pb-2">
                    <span className="text-muted small">Limite de Crédito</span>
                    <span className="small fw-semibold">
                      {formatBRL(dadosCliente.limitecredito)}
                      {dadosCliente.bloqueaprazo === "S" && (
                        <span className="pa-pill pa-pill-danger ms-2">Bloqueado</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <AbasNavegacao
          abaAtual={aba}
          onSelecionar={(id) => definir({ aba: id === "contas" ? null : id })}
          contagens={{
            contas: titulos.length,
            "gerar-boleto": titulosLivres.length,
            boletos: boletoGrupos.size,
          }}
        />

        {aba === "contas" && (
          <AbaContasEmAberto
            titulos={titulos}
            loadingTitulos={loadingTitulos}
            erroTitulos={erroTitulos}
            historico={historico}
            loadingHistorico={loadingHistorico}
            erroHistorico={erroHistorico}
          />
        )}

        {aba === "gerar-boleto" && (
          <AbaGerarBoleto
            idcliente={idcliente}
            dadosCliente={dadosCliente}
            titulos={titulos}
            loadingTitulos={loadingTitulos}
            erroTitulos={erroTitulos}
            onRecarregar={recarregar}
          />
        )}

        {aba === "boletos" && (
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
        )}

        {aba === "notas" && (
          <>
        {/* ─── SEÇÃO NFS-e Emitidas ─── */}
        <div className="pa-card mt-4">
          <button
            type="button"
            className="pa-card-header"
            style={{
              width: "100%",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
              textAlign: "left",
              font: "inherit",
              color: "inherit",
            }}
            onClick={() => setNfseAberta(!nfseAberta)}
          >
            <strong>
              <i className={`bi ${nfseAberta ? "bi-chevron-down" : "bi-chevron-right"} me-2`} />
              NFS-e Emitidas
            </strong>
          </button>
          {nfseAberta && (
            <div ref={nfseRef} className="pa-card-body">
              {loadingNfse ? (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Carregando NFS-e...</span>
                  </div>
                </div>
              ) : nfseCarregada && nfseEmitidas.length === 0 ? (
                <div className="pa-empty">
                  <span>Nenhuma NFS-e emitida para este cliente</span>
                </div>
              ) : nfseEmitidas.length > 0 ? (
                <div>
                  <table className="pa-table">
                    <thead>
                      <tr>
                        <th>Data emissão</th>
                        <th>Nº NFS-e</th>
                        <th>Nº RPS</th>
                        <th>Valor</th>
                        <th>Títulos vinculados</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfseEmitidas.map((nfse) => (
                        <tr key={nfse.id}>
                          <td className="small">{formatDate(nfse.dataEmissao)}</td>
                          <td className="small">{nfse.numeroNfse ?? "—"}</td>
                          <td className="small">{nfse.numeroRps ?? "—"}</td>
                          <td className="small fw-semibold">{formatBRL(nfse.valorServico)}</td>
                          <td className="small">
                            {nfse.titulos.length > 0
                              ? nfse.titulos.map((tid, i) => (
                                  <span key={tid}>
                                    <span className="badge bg-secondary">{tid}</span>
                                    {i < nfse.titulos.length - 1 && " "}
                                  </span>
                                ))
                              : <span className="text-muted">—</span>}
                          </td>
                          <td>
                            <div className="d-flex gap-2 align-items-center">
                              {nfse.linkNfse && (
                                <a
                                  href={safeHttpUrl(nfse.linkNfse) ?? undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm btn-outline-success"
                                  title="Baixar PDF da NFS-e"
                                >
                                  <i className="bi bi-file-earmark-arrow-down" />
                                </a>
                              )}
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                title="Remove o anexo local. Não cancela a nota na prefeitura."
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      `Remover anexo da NFS-e ${nfse.numeroNfse ? `#${nfse.numeroNfse}` : `(ID ${nfse.id})`}?\n\nIsso NÃO cancela a nota na prefeitura, apenas remove o registro local e libera o título para novo anexo.`,
                                    )
                                  )
                                    return;
                                  try {
                                    const res = await fetch(`/api/cobranca/nfse/${nfse.id}`, {
                                      method: "DELETE",
                                    });
                                    if (!res.ok) {
                                      const d = await res.json().catch(() => ({}));
                                      alert((d as { error?: string }).error ?? "Erro ao cancelar NFS-e.");
                                    } else {
                                      setNfseEmitidas((prev) => prev.filter((n) => n.id !== nfse.id));
                                      recarregar();
                                    }
                                  } catch {
                                    alert("Falha na conexão.");
                                  }
                                }}
                              >
                                Cancelar ⓘ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* ─── SEÇÃO Notas Fiscais Athos ─── */}
        <div className="pa-card mt-4 mb-4">
          <button
            type="button"
            className="pa-card-header"
            style={{
              width: "100%",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
              textAlign: "left",
              font: "inherit",
              color: "inherit",
            }}
            onClick={() => setNfatAberta(!nfatAberta)}
          >
            <strong>
              <i className={`bi ${nfatAberta ? "bi-chevron-down" : "bi-chevron-right"} me-2`} />
              Notas Fiscais Athos
            </strong>
          </button>
          {nfatAberta && (
            <div ref={nfatRef} className="pa-card-body">
              {/* Campo de busca por número */}
              <div className="d-flex gap-2 mb-3">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  style={{ maxWidth: "240px" }}
                  placeholder="Buscar por número da nota"
                  value={buscaNumeroNf}
                  onChange={(e) => setBuscaNumeroNf(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void buscarNotaPorNumero(); }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => void buscarNotaPorNumero()}
                  disabled={buscandoNf || !buscaNumeroNf.trim()}
                >
                  {buscandoNf ? (
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                  ) : "Buscar"}
                </button>
                {resultadoBuscaNf !== null && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => { setResultadoBuscaNf(null); setBuscaNumeroNf(""); }}
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Resultado da busca — acima da lista (D-16) */}
              {resultadoBuscaNf !== null && (
                <div className="alert alert-info mb-3">
                  <strong>Resultado da busca — Nota Nº {buscaNumeroNf}:</strong>
                  {resultadoBuscaNf.length === 0 ? (
                    <span className="ms-1">Nenhuma nota encontrada com este número.</span>
                  ) : (
                    <div className="mt-2">
                      <table className="pa-table">
                        <thead>
                          <tr>
                            <th>Nº da nota</th>
                            <th>Data emissão</th>
                            <th>Valor</th>
                            <th>Tipo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultadoBuscaNf.map((nf) => (
                            <tr key={nf.numero}>
                              <td className="small">{nf.numero}</td>
                              <td className="small">{nf.dataemissao ? formatDate(nf.dataemissao) : "—"}</td>
                              <td className="small fw-semibold">{formatBRL(nf.valor)}</td>
                              <td className="small"><span className="pa-pill pa-pill-secondary">{nf.tipo}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Lista geral de até 50 notas — sempre visível (D-15) */}
              {loadingNfat ? (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Carregando notas fiscais...</span>
                  </div>
                </div>
              ) : nfatCarregada && notasFiscaisAthos.length === 0 ? (
                <div className="pa-empty">
                  <span>Nenhuma nota fiscal encontrada no Athos</span>
                </div>
              ) : notasFiscaisAthos.length > 0 ? (
                <div>
                  <table className="pa-table">
                    <thead>
                      <tr>
                        <th>Nº da nota</th>
                        <th>Data emissão</th>
                        <th>Valor</th>
                        <th>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notasFiscaisAthos.map((nf) => (
                        <tr key={nf.numero}>
                          <td className="small">{nf.numero}</td>
                          <td className="small">{nf.dataemissao ? formatDate(nf.dataemissao) : "—"}</td>
                          <td className="small fw-semibold">{formatBRL(nf.valor)}</td>
                          <td className="small"><span className="pa-pill pa-pill-secondary">{nf.tipo}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </div>
          </>
        )}
      </AdminShell>

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
