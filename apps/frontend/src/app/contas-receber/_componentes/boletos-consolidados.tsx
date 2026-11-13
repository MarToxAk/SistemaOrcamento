"use client";

import { useEffect, useState } from "react";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
  const [boletos, setBoletos] = useState<BoletoDashboardItem[]>([]);
  const [boletosLoading, setBoletosLoading] = useState(true);
  const [boletosErro, setBoletosErro] = useState("");
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null);

  async function fetchBoletosDashboard() {
    setBoletosLoading(true);
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
        void fetchBoletosDashboard();
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
      await fetchBoletosDashboard();
    } catch {
      alert("Falha na conexão.");
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  const pendentes = boletos.filter((b) => b.status === "pendente");
  const totalAVencer = pendentes.filter(
    (b) => b.situacaoVencimento === "a_vencer" || b.situacaoVencimento === "vence_hoje",
  ).length;
  const totalAtrasados = pendentes.filter((b) => b.situacaoVencimento === "atrasado").length;

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
      <div className="pa-card-body pa-card-body-scroll">
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
          <table className="pa-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>NFS-e</th>
                <th>Athos</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {boletos.map((boleto) => {
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
                const ultimoAviso = descreverUltimoAviso(boleto.ultimoAviso);
                return (
                  <tr key={boleto.id}>
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
                      {ultimoAviso && <small className={`d-block ${ultimoAviso.className}`}>{ultimoAviso.texto}</small>}
                    </td>
                    <td>
                      <span className={`pa-pill pa-pill-${paPillVariant(getStatusBoletoBadgeClass(boleto.status))}`}>
                        {boleto.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`pa-pill pa-pill-${paPillVariant(nfseBadge.cls)}`}
                        title={nfseBadge.title}
                      >
                        {nfseBadge.label}
                      </span>
                    </td>
                    <td>
                      {athosPill ? (
                        <span className={`pa-pill pa-pill-${athosPill.variant}`} title={athosPill.title}>
                          {athosPill.label}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        <a href={`/contas-receber/${boleto.idclienteAthos}`} className="pa-link-btn text-nowrap">
                          Ver Cliente
                        </a>
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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
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
