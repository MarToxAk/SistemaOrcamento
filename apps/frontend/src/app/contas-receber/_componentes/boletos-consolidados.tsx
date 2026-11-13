"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import BoletoDetalhe from "./boleto-detalhe";
import { filtrarBoletos, lerFiltrosBoletos, type FiltrosBoletos } from "../_shared/filtros-boletos";
import { lerData, lerInteiroPositivo, lerTexto } from "../_shared/filtros-url";
import { formatBRL } from "../_shared/formatadores";
import { useFiltrosUrl } from "../_shared/use-filtros-url";

export type NfseStatusBoleto = "completa" | "parcial" | "pendente";

/** Classificacao de vencimento calculada no backend (Fase 45); o frontend so mapeia rotulo e cor. */
export type SituacaoVencimento = "atrasado" | "vence_hoje" | "a_vencer";

export interface UltimoAvisoBoleto {
  tipo: string;
  status: string;
  enviadoEm: string | null;
  criadoEm: string;
}

export interface BoletoDashboardItem {
  id: number;
  idclienteAthos: number;
  nomeCliente: string;
  status: string;
  valor: number;
  expireAt: string | null;
  diasParaVencer: number | null;
  situacaoVencimento?: SituacaoVencimento | null;
  ultimoAviso?: UltimoAvisoBoleto | null;
  linkBoleto: string | null;
  criadoEm: string;
  titulos: number[];
  nfseStatus: NfseStatusBoleto;
  athosBaixaStatus: string | null;
  athosBaixaErroCodigo: string | null;
  athosBaixaErroMensagem: string | null;
}

export interface ResultadoBaixaEstornoAthos {
  simulado?: boolean;
  status?: string;
  detalhe?: {
    titulos?: unknown[];
    valorTotal?: number;
    modo?: string;
  };
}

export interface ErroBackendAthos {
  error?: string;
  message?: string | { message?: string };
}

export function getStatusBoletoBadgeClass(status: string): string {
  if (status === "pendente") return "badge bg-warning text-dark";
  if (status === "pago") return "badge bg-success";
  return "badge bg-secondary";
}

export function getVencimentoSuffix(dias: number | null): string {
  if (dias === null) return "";
  if (dias > 0) return `${dias}d`;
  if (dias === 0) return "vence hoje";
  return `${Math.abs(dias)}d em atraso`;
}

export function getNfseBadge(nfseStatus: NfseStatusBoleto, totalTitulos: number): { cls: string; label: string; title: string } {
  if (nfseStatus === "completa") {
    return { cls: "badge bg-success", label: "NFS-e OK", title: `${totalTitulos} de ${totalTitulos} título(s) com NFS-e` };
  }
  if (nfseStatus === "parcial") {
    return { cls: "badge bg-warning text-dark", label: "NFS-e parcial", title: `Parte dos ${totalTitulos} título(s) já tem NFS-e emitida` };
  }
  return { cls: "badge bg-secondary", label: "NFS-e pendente", title: `0 de ${totalTitulos} título(s) com NFS-e` };
}

export type AthosPillVariant = "success" | "warning" | "secondary" | "danger";

/** Situacao da baixa do boleto no Athos (Fase 43) para a coluna "Athos" do painel. */
export function getAthosBaixaPill(boleto: BoletoDashboardItem): { variant: AthosPillVariant; label: string; title: string } | null {
  if (boleto.status !== "pago") return null;
  switch (boleto.athosBaixaStatus) {
    case "baixado":
      return { variant: "success", label: "Baixado", title: "Baixa registrada no contas a receber do Athos" };
    case "ja_baixado":
      return { variant: "secondary", label: "Já baixado", title: "O título já estava baixado no Athos" };
    case "pendente":
      return { variant: "warning", label: "Baixa pendente", title: "Pago, aguardando baixa no Athos" };
    case "falha": {
      const detalhe = [boleto.athosBaixaErroCodigo, boleto.athosBaixaErroMensagem].filter(Boolean).join(": ");
      return { variant: "danger", label: "Falha na baixa", title: detalhe || "Falha na baixa no Athos" };
    }
    case "estornado":
      return { variant: "secondary", label: "Estornado", title: "Baixa estornada no Athos" };
    default:
      return {
        variant: "secondary",
        label: "Não processado",
        title: "Pago antes da baixa automática ou ainda não processado",
      };
  }
}

/** Pill de vencimento do alerta interno (Fase 45): so boleto pendente dentro da janela de destaque. */
export function getSituacaoVencimentoPill(boleto: BoletoDashboardItem): { cls: string; label: string; title: string } | null {
  if (boleto.status !== "pendente") return null;
  const dias = boleto.diasParaVencer;
  const titulo = boleto.expireAt ? `Vencimento em ${boleto.expireAt}` : "Vencimento";
  switch (boleto.situacaoVencimento) {
    case "a_vencer":
      return {
        cls: "pa-pill pa-pill-warning",
        label: dias === null ? "A vencer" : `Vence em ${dias}d`,
        title: titulo,
      };
    case "vence_hoje":
      return { cls: "pa-pill pa-pill-warning", label: "Vence hoje", title: titulo };
    case "atrasado":
      return {
        cls: "pa-pill pa-pill-danger",
        label: dias === null ? "Atrasado" : `Atrasado há ${Math.abs(dias)}d`,
        title: titulo,
      };
    default:
      return null;
  }
}

const ROTULO_TIPO_AVISO: Record<string, string> = {
  "D-3": "3 dias antes",
  "D-1": "1 dia antes",
  "A+2": "2 dias após",
  "A+7": "7 dias após",
  "A+14": "14 dias após",
};

/** Linha do último aviso por e-mail; "sem_email" é o alerta interno de cliente sem e-mail (D-04). */
export function descreverUltimoAviso(aviso: UltimoAvisoBoleto | null | undefined): { texto: string; className: string } | null {
  if (!aviso) return null;
  const rotulo = ROTULO_TIPO_AVISO[aviso.tipo] ?? aviso.tipo;
  switch (aviso.status) {
    case "enviado": {
      const quando = new Date(aviso.enviadoEm ?? aviso.criadoEm).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
      });
      return { texto: `Aviso ${rotulo} enviado em ${quando}`, className: "text-muted" };
    }
    case "erro":
      return { texto: `Aviso ${rotulo} com erro no envio`, className: "text-danger" };
    case "enviando":
      return { texto: `Aviso ${rotulo} em envio`, className: "text-muted" };
    case "sem_email":
      return { texto: `Sem e-mail cadastrado (aviso ${rotulo} não enviado)`, className: "text-danger" };
    default:
      return null;
  }
}

function mensagemErroAthos(status: number, corpo: ErroBackendAthos | null): string {
  if (status === 401) return "Sessão de administrador necessária.";
  const msg = corpo?.message;
  if (typeof msg === "string" && msg) return msg;
  if (msg && typeof msg === "object" && typeof msg.message === "string" && msg.message) return msg.message;
  if (corpo?.error) return corpo.error;
  return `Erro ao processar (HTTP ${status}).`;
}

/** Traduz a classe de cor de um badge Bootstrap (bg-success/bg-warning/...) para a variante de pill --pa-*. */
export function paPillVariant(badgeClass: string): "success" | "warning" | "secondary" {
  if (badgeClass.includes("bg-success")) return "success";
  if (badgeClass.includes("bg-warning")) return "warning";
  return "secondary";
}

export default function BoletosConsolidados() {
  const { obter, definir } = useFiltrosUrl();
  const filtros = lerFiltrosBoletos({
    status: obter("status"),
    situacao: obter("situacao"),
    de: obter("de"),
    ate: obter("ate"),
    busca: obter("busca"),
  });
  const boletoAbertoId = lerInteiroPositivo(obter("boleto"), 0);

  const [boletos, setBoletos] = useState<BoletoDashboardItem[]>([]);
  const [boletosLoading, setBoletosLoading] = useState(true);
  const [boletosErro, setBoletosErro] = useState("");
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null);

  // A busca e digitada localmente e gravada na URL com atraso, para nao perder letras a cada router.replace.
  const [buscaDigitada, setBuscaDigitada] = useState(filtros.busca);
  const buscaGravada = useRef(filtros.busca);
  const definirRef = useRef(definir);
  definirRef.current = definir;

  useEffect(() => {
    // Mudanca externa da URL (voltar do navegador, link colado): reflete no campo.
    if (filtros.busca !== buscaGravada.current) {
      buscaGravada.current = filtros.busca;
      setBuscaDigitada(filtros.busca);
    }
  }, [filtros.busca]);

  useEffect(() => {
    const alvo = lerTexto(buscaDigitada, 80);
    if (alvo === buscaGravada.current) return;
    const timer = setTimeout(() => {
      buscaGravada.current = alvo;
      definirRef.current({ busca: alvo || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaDigitada]);

  /** `silencioso` recarrega a lista sem trocar a tabela pelo spinner (mantem o detalhe aberto). */
  async function fetchBoletosDashboard(silencioso = false) {
    if (!silencioso) setBoletosLoading(true);
    setBoletosErro("");
    try {
      const res = await fetch("/api/cobranca/boleto/dashboard", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Erro ao carregar boletos consolidados.");
      }
      const data = (await res.json()) as BoletoDashboardItem[];
      setBoletos(data);
    } catch {
      setBoletosErro("Erro ao carregar boletos consolidados.");
    } finally {
      setBoletosLoading(false);
    }
  }

  useEffect(() => {
    void fetchBoletosDashboard();
  }, []);

  type AcaoAthos = "simular" | "baixar" | "estornar";

  /** Baixa manual / simulacao / estorno no Athos (Fase 43). Um clique por vez por boleto. */
  async function executarAcaoAthos(boleto: BoletoDashboardItem, acao: AcaoAthos) {
    if (acaoEmAndamento !== null) return;

    let url = "";
    let corpo: Record<string, boolean> = {};
    if (acao === "simular") {
      url = `/api/cobranca/boleto/${boleto.id}/baixar-athos`;
      corpo = { simular: true };
    } else if (acao === "baixar") {
      url = `/api/cobranca/boleto/${boleto.id}/baixar-athos`;
      const ok = confirm(
        `Dar baixa no Athos?\n\nBoleto #${boleto.id} - ${boleto.nomeCliente} - ${formatBRL(boleto.valor)}.\n` +
          "Isso grava o recebimento no contas a receber e no livro do banco do Athos.",
      );
      if (!ok) return;
    } else {
      const digitado = window.prompt(
        `Estornar a baixa do boleto #${boleto.id} (${boleto.nomeCliente})?\n\n` +
          "Isso apaga do Athos o recebimento gravado pelo Sistema e devolve o título a aberto.\n" +
          "Digite ESTORNAR para confirmar:",
      );
      if (digitado !== "ESTORNAR") return;
      url = `/api/cobranca/boleto/${boleto.id}/estornar-baixa-athos`;
      corpo = { confirmar: true };
    }

    setAcaoEmAndamento(`${boleto.id}:${acao}`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = (await res.json().catch(() => null)) as (ResultadoBaixaEstornoAthos & ErroBackendAthos) | null;
      if (!res.ok) {
        alert(mensagemErroAthos(res.status, dados));
        void fetchBoletosDashboard(true);
        return;
      }
      const qtd = dados?.detalhe?.titulos?.length ?? 0;
      const total = typeof dados?.detalhe?.valorTotal === "number" ? formatBRL(dados.detalhe.valorTotal) : "-";
      if (acao === "simular") {
        alert(`Simulação: nada foi gravado.\nTítulos: ${qtd}\nValor total: ${total}`);
      } else if (acao === "baixar") {
        alert(`Baixa concluída no Athos.\nTítulos: ${qtd}\nValor total: ${total}`);
      } else {
        alert(`Estorno concluído no Athos.\nTítulos: ${qtd}\nValor estornado: ${total}`);
      }
      await fetchBoletosDashboard(true);
    } catch {
      alert("Falha na conexão.");
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  /** Consulta a EFI (proxy existente) e mostra o status devolvido; recarrega a lista em seguida. */
  async function verificarPagamento(boleto: BoletoDashboardItem) {
    if (acaoEmAndamento !== null) return;
    setAcaoEmAndamento(`${boleto.id}:verificar`);
    try {
      const res = await fetch(`/api/cobranca/boleto/${boleto.id}/verificar-pagamento`, { method: "POST" });
      const dados = (await res.json().catch(() => null)) as
        | ({ status?: string; atualizado?: boolean } & ErroBackendAthos)
        | null;
      if (!res.ok) {
        alert(mensagemErroAthos(res.status, dados));
        return;
      }
      const situacao = dados?.status ?? "desconhecido";
      alert(
        `Boleto #${boleto.id}: situação ${situacao}.${dados?.atualizado ? " O status foi atualizado." : " Sem alteração."}`,
      );
      await fetchBoletosDashboard(true);
    } catch {
      alert("Falha na conexão.");
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  /** Cancela o boleto nao pago (mesma confirmacao da aba Boletos do cliente); o backend recusa boleto ja baixado no Athos. */
  async function cancelarBoleto(boleto: BoletoDashboardItem) {
    if (acaoEmAndamento !== null) return;
    if (
      !confirm(
        `Cancelar boleto #${boleto.id}? Os ${boleto.titulos.length} título(s) ficarão disponíveis para novo boleto.`,
      )
    ) {
      return;
    }
    setAcaoEmAndamento(`${boleto.id}:cancelar`);
    try {
      const res = await fetch(`/api/cobranca/boleto/${boleto.id}/cancelar`, { method: "POST" });
      const dados = (await res.json().catch(() => null)) as
        | ({ ok?: boolean; mensagem?: string } & ErroBackendAthos)
        | null;
      if (!res.ok) {
        alert(dados?.mensagem ?? mensagemErroAthos(res.status, dados));
        void fetchBoletosDashboard(true);
        return;
      }
      alert(dados?.mensagem ?? `Boleto #${boleto.id} cancelado.`);
      await fetchBoletosDashboard(true);
    } catch {
      alert("Falha na conexão.");
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  function limparFiltros() {
    buscaGravada.current = "";
    setBuscaDigitada("");
    definir({ status: null, situacao: null, de: null, ate: null, busca: null });
  }

  const pendentes = boletos.filter((b) => b.status === "pendente");
  const totalAVencer = pendentes.filter(
    (b) => b.situacaoVencimento === "a_vencer" || b.situacaoVencimento === "vence_hoje",
  ).length;
  const totalAtrasados = pendentes.filter((b) => b.situacaoVencimento === "atrasado").length;

  const visiveis = filtrarBoletos(boletos, filtros);
  const temFiltro =
    filtros.status !== "" ||
    filtros.situacao !== "" ||
    filtros.de !== "" ||
    filtros.ate !== "" ||
    filtros.busca !== "" ||
    buscaDigitada !== "";

  const opcoesStatus: Array<{ valor: FiltrosBoletos["status"]; rotulo: string }> = [
    { valor: "", rotulo: "Todos" },
    { valor: "pendente", rotulo: "Pendentes" },
    { valor: "pago", rotulo: "Pagos" },
  ];
  const opcoesSituacao: Array<{ valor: FiltrosBoletos["situacao"]; rotulo: string }> = [
    { valor: "", rotulo: "Todas" },
    { valor: "a_vencer", rotulo: "A Vencer" },
    { valor: "atrasado", rotulo: "Atrasados" },
  ];

  return (
    <div className="pa-card">
      <div className="pa-card-header">
        <div>
          <strong>Boletos a Receber</strong>
          <span className="pa-card-header-count">({boletos.length})</span>
          <span
            className="pa-pill pa-pill-warning ms-2"
            title="Boletos pendentes que vencem em até 3 dias, incluindo hoje"
          >
            A vencer: {totalAVencer}
          </span>
          <span className="pa-pill pa-pill-danger ms-1" title="Boletos pendentes vencidos">
            Atrasados: {totalAtrasados}
          </span>
        </div>
        <button
          type="button"
          className="pa-icon-btn"
          onClick={() => void fetchBoletosDashboard()}
          title="Atualizar"
        >
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      <div className="pa-filtros">
        <div className="pa-filtro">
          <span className="pa-filtro-rotulo">Status</span>
          <div className="pa-seg">
            {opcoesStatus.map((opt) => (
              <button
                key={opt.valor || "todos"}
                type="button"
                className={`pa-seg-btn${filtros.status === opt.valor ? " pa-seg-btn-active" : ""}`}
                onClick={() => definir({ status: opt.valor || null })}
              >
                {opt.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="pa-filtro">
          <span className="pa-filtro-rotulo">Situação</span>
          <div className="pa-seg">
            {opcoesSituacao.map((opt) => (
              <button
                key={opt.valor || "todas"}
                type="button"
                className={`pa-seg-btn${filtros.situacao === opt.valor ? " pa-seg-btn-active" : ""}`}
                onClick={() => definir({ situacao: opt.valor || null })}
              >
                {opt.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="pa-filtro">
          <label className="pa-filtro-rotulo" htmlFor="filtro-boletos-de">
            Vencimento De
          </label>
          <input
            id="filtro-boletos-de"
            type="date"
            className="form-control form-control-sm"
            value={filtros.de}
            onChange={(e) => definir({ de: lerData(e.target.value) || null })}
          />
        </div>
        <div className="pa-filtro">
          <label className="pa-filtro-rotulo" htmlFor="filtro-boletos-ate">
            Até
          </label>
          <input
            id="filtro-boletos-ate"
            type="date"
            className="form-control form-control-sm"
            value={filtros.ate}
            onChange={(e) => definir({ ate: lerData(e.target.value) || null })}
          />
        </div>
        <div className="pa-filtro pa-filtro-busca">
          <label className="pa-filtro-rotulo" htmlFor="filtro-boletos-busca">
            Buscar Cliente
          </label>
          <input
            id="filtro-boletos-busca"
            type="search"
            className="form-control form-control-sm"
            placeholder="Nome ou número do cliente"
            maxLength={80}
            value={buscaDigitada}
            onChange={(e) => setBuscaDigitada(e.target.value)}
          />
        </div>
        <div className="pa-filtro pa-filtro-limpar">
          <button type="button" className="pa-link-btn bg-transparent text-nowrap" onClick={limparFiltros} disabled={!temFiltro}>
            Limpar Filtros
          </button>
        </div>
      </div>

      <div className="pa-card-body pa-card-body-flush pa-tabela-scroll">
        {boletosLoading ? (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Carregando...</span>
            </div>
          </div>
        ) : boletosErro ? (
          <div className="pa-empty pa-empty-erro">
            <span>{boletosErro}</span>
            <button
              type="button"
              className="pa-icon-btn"
              onClick={() => void fetchBoletosDashboard()}
              title="Atualizar"
            >
              <i className="bi bi-arrow-clockwise" />
            </button>
          </div>
        ) : boletos.length === 0 ? (
          <div className="pa-empty">
            <strong>Nenhum boleto pendente</strong>
            <div className="small mt-1 text-muted">
              Todos os boletos emitidos já foram pagos, cancelados, ou não há boletos ativos no momento.
            </div>
          </div>
        ) : (
          <>
            <div className="pa-contagem small text-muted">
              Mostrando {visiveis.length} de {boletos.length}
            </div>
            {visiveis.length === 0 ? (
              <div className="pa-empty">
                <span>Nenhum boleto para os filtros escolhidos.</span>
                <button type="button" className="pa-link-btn bg-transparent mt-2" onClick={limparFiltros}>
                  Limpar Filtros
                </button>
              </div>
            ) : (
              <table className="pa-table pa-table-boletos">
                <thead>
                  <tr>
                    <th className="pa-th-chevron" aria-label="Detalhes" />
                    <th>Cliente</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th>Selos</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((boleto) => {
                    const nfseBadge = getNfseBadge(boleto.nfseStatus, boleto.titulos.length);
                    const athosPill = getAthosBaixaPill(boleto);
                    const podeBaixar =
                      boleto.status === "pago" &&
                      (boleto.athosBaixaStatus == null ||
                        boleto.athosBaixaStatus === "pendente" ||
                        boleto.athosBaixaStatus === "falha" ||
                        boleto.athosBaixaStatus === "estornado");
                    const podeEstornar = boleto.status === "pago" && boleto.athosBaixaStatus === "baixado";
                    const ocupado = acaoEmAndamento !== null;
                    const vencimentoSuffix = getVencimentoSuffix(boleto.diasParaVencer);
                    const situacaoPill = getSituacaoVencimentoPill(boleto);
                    const expandido = boletoAbertoId === boleto.id;
                    const alternar = () => definir({ boleto: expandido ? null : String(boleto.id) });
                    return (
                      <Fragment key={boleto.id}>
                        <tr
                          className={`pa-row-clicavel${expandido ? " pa-row-aberta" : ""}`}
                          onClick={alternar}
                        >
                          <td className="pa-td-chevron">
                            <button
                              type="button"
                              className="pa-icon-btn"
                              aria-expanded={expandido}
                              aria-label={`Mostrar detalhes do boleto #${boleto.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                alternar();
                              }}
                            >
                              <i className={`bi ${expandido ? "bi-chevron-up" : "bi-chevron-down"}`} />
                            </button>
                          </td>
                          <td className="pa-td-cliente">
                            <span className="pa-id-badge">#{boleto.idclienteAthos}</span>
                            <span className="text-truncate" title={boleto.nomeCliente}>
                              {boleto.nomeCliente}
                            </span>
                          </td>
                          <td className="text-nowrap fw-bold">{formatBRL(boleto.valor)}</td>
                          <td className="text-nowrap small">
                            {boleto.expireAt ?? "-"}
                            {situacaoPill ? (
                              <span className={`${situacaoPill.cls} ms-1`} title={situacaoPill.title}>
                                {situacaoPill.label}
                              </span>
                            ) : (
                              vencimentoSuffix && <span className="text-muted ms-1">({vencimentoSuffix})</span>
                            )}
                          </td>
                          <td>
                            <span className={`pa-pill pa-pill-${paPillVariant(getStatusBoletoBadgeClass(boleto.status))}`}>
                              {boleto.status}
                            </span>
                          </td>
                          <td>
                            <div className="d-flex flex-wrap gap-1">
                              <span
                                className={`pa-pill pa-pill-${paPillVariant(nfseBadge.cls)}`}
                                title={nfseBadge.title}
                              >
                                {nfseBadge.label}
                              </span>
                              {athosPill && (
                                <span className={`pa-pill pa-pill-${athosPill.variant}`} title={athosPill.title}>
                                  {athosPill.label}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandido && (
                          <tr className="pa-row-detalhe">
                            <td colSpan={6}>
                              <BoletoDetalhe
                                key={`${boleto.id}:${boleto.status}:${boleto.athosBaixaStatus ?? ""}`}
                                cobrancaId={boleto.id}
                                status={boleto.status}
                                ultimoAviso={descreverUltimoAviso(boleto.ultimoAviso)}
                                acoes={
                                  <>
                                    {boleto.linkBoleto && (
                                      <a
                                        href={`/api/cobranca/boleto/${boleto.id}/pdf`}
                                        className="pa-link-btn text-nowrap"
                                        title="Baixar PDF do boleto"
                                      >
                                        <i className="bi bi-download me-1" />
                                        Baixar PDF
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      className="pa-link-btn bg-transparent text-nowrap"
                                      disabled={ocupado}
                                      onClick={() => void verificarPagamento(boleto)}
                                      title="Consulta a EFI e atualiza o status do boleto"
                                    >
                                      <i className="bi bi-arrow-clockwise me-1" />
                                      {acaoEmAndamento === `${boleto.id}:verificar` ? "Verificando..." : "Verificar Pagamento"}
                                    </button>
                                    {boleto.status !== "pago" && (
                                      <button
                                        type="button"
                                        className="pa-link-btn bg-transparent text-nowrap"
                                        disabled={ocupado}
                                        onClick={() => void cancelarBoleto(boleto)}
                                        title="Cancela o boleto e libera os títulos"
                                      >
                                        <i className="bi bi-x-circle me-1" />
                                        {acaoEmAndamento === `${boleto.id}:cancelar` ? "Cancelando..." : "Cancelar Boleto"}
                                      </button>
                                    )}
                                    {podeBaixar && (
                                      <>
                                        <button
                                          type="button"
                                          className="pa-link-btn bg-transparent text-nowrap"
                                          disabled={ocupado}
                                          onClick={() => void executarAcaoAthos(boleto, "simular")}
                                          title="Confere o que seria baixado, sem gravar nada"
                                        >
                                          {acaoEmAndamento === `${boleto.id}:simular` ? "Simulando..." : "Simular"}
                                        </button>
                                        <button
                                          type="button"
                                          className="pa-link-btn bg-transparent text-nowrap"
                                          disabled={ocupado}
                                          onClick={() => void executarAcaoAthos(boleto, "baixar")}
                                          title="Grava a baixa no contas a receber do Athos"
                                        >
                                          {acaoEmAndamento === `${boleto.id}:baixar` ? "Baixando..." : "Baixar no Athos"}
                                        </button>
                                      </>
                                    )}
                                    {podeEstornar && (
                                      <button
                                        type="button"
                                        className="pa-link-btn bg-transparent text-nowrap"
                                        disabled={ocupado}
                                        onClick={() => void executarAcaoAthos(boleto, "estornar")}
                                        title="Desfaz a baixa gravada pelo Sistema no Athos"
                                      >
                                        {acaoEmAndamento === `${boleto.id}:estornar` ? "Estornando..." : "Estornar baixa"}
                                      </button>
                                    )}
                                    <a
                                      href={`/contas-receber/${boleto.idclienteAthos}?aba=boletos`}
                                      className="pa-link-btn text-nowrap"
                                    >
                                      Ver Cliente
                                    </a>
                                  </>
                                }
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <style>{`
        .pa-filtros {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 0.75rem 1rem;
          padding: 0.8rem 1.1rem;
          border-bottom: 1px solid var(--pa-border);
        }
        .pa-filtro { display: flex; flex-direction: column; gap: 0.2rem; }
        .pa-filtro-rotulo { color: var(--pa-text-muted); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin: 0; }
        .pa-filtro-busca { flex: 1 1 14rem; min-width: 12rem; }
        .pa-filtro-limpar { margin-left: auto; }
        .pa-contagem { padding: 0.5rem 1.1rem; }
        .pa-tabela-scroll { overflow-x: auto; }
        .pa-table-boletos .pa-th-chevron, .pa-table-boletos .pa-td-chevron { width: 2.5rem; padding-right: 0; }
        .pa-row-clicavel { cursor: pointer; }
        .pa-row-aberta { background: var(--pa-accent-soft); }
        .pa-table tbody tr.pa-row-detalhe:hover { background: transparent; }
        .pa-table tbody tr.pa-row-detalhe > td { padding: 0; }
      `}</style>
    </div>
  );
}

/** Cartao compacto para o resumo de /contas-receber: contadores do alerta interno da Fase 45 com links para a pagina de boletos. */
export function ResumoBoletos() {
  const [boletos, setBoletos] = useState<BoletoDashboardItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/cobranca/boleto/dashboard", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Erro ao carregar boletos consolidados.");
      }
      setBoletos((await res.json()) as BoletoDashboardItem[]);
    } catch {
      setErro("Não foi possível carregar os boletos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const pendentes = boletos.filter((b) => b.status === "pendente");
  const totalAVencer = pendentes.filter(
    (b) => b.situacaoVencimento === "a_vencer" || b.situacaoVencimento === "vence_hoje",
  ).length;
  const totalAtrasados = pendentes.filter((b) => b.situacaoVencimento === "atrasado").length;

  return (
    <div className="pa-card mb-3">
      <div className="pa-card-header">
        <div>
          <strong>Boletos</strong>
          {!carregando && !erro && <span className="pa-card-header-count">({boletos.length})</span>}
          {!carregando && !erro && (
            <>
              <span
                className="pa-pill pa-pill-warning ms-2"
                title="Boletos pendentes que vencem em até 3 dias, incluindo hoje"
              >
                Vencem em Até 3 Dias: {totalAVencer}
              </span>
              <span className="pa-pill pa-pill-danger ms-1" title="Boletos pendentes vencidos">
                Atrasados: {totalAtrasados}
              </span>
            </>
          )}
        </div>
        <div className="d-flex align-items-center gap-1">
          <a href="/contas-receber/boletos" className="pa-link-btn text-nowrap">
            Ver Boletos
          </a>
          <a href="/contas-receber/boletos?situacao=atrasado" className="pa-link-btn text-nowrap">
            Ver Atrasados
          </a>
        </div>
      </div>
      {(carregando || erro) && (
        <div className="pa-card-body">
          {carregando ? (
            <div className="text-center py-2">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Carregando...</span>
              </div>
            </div>
          ) : (
            <div className="pa-empty pa-empty-erro">
              <span>{erro}</span>
              <button type="button" className="pa-icon-btn" onClick={() => void carregar()} title="Atualizar">
                <i className="bi bi-arrow-clockwise" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
