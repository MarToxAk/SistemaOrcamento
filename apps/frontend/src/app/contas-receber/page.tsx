"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import PasswordGate from "@/components/password-gate";
import AdminShell from "./admin-shell";
import ClienteAutocomplete from "./cliente-autocomplete";

interface DashboardSummary {
  total_a_receber: number;
  total_atrasado: number;
  total_clientes_devedores: number;
  total_recebido_mes: number;
  taxa_inadimplencia: number;
  aging: {
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d90_mais: number;
  };
  a_vencer: {
    d7: number;
    d15: number;
    d30: number;
  };
}

type NfseStatusBoleto = "completa" | "parcial" | "pendente";

/** Classificacao de vencimento calculada no backend (Fase 45); o frontend so mapeia rotulo e cor. */
type SituacaoVencimento = "atrasado" | "vence_hoje" | "a_vencer";

interface UltimoAvisoBoleto {
  tipo: string;
  status: string;
  enviadoEm: string | null;
  criadoEm: string;
}

interface BoletoDashboardItem {
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

interface ResultadoBaixaEstornoAthos {
  simulado?: boolean;
  status?: string;
  detalhe?: {
    titulos?: unknown[];
    valorTotal?: number;
    modo?: string;
  };
}

interface ErroBackendAthos {
  error?: string;
  message?: string | { message?: string };
}

interface ClienteDevedor {
  idcliente: number;
  nome_cliente: string;
  telefone_completo: string | null;
  emailcliente: string | null;
  emailcobrancacliente: string | null;
  limitecredito: number;
  bloqueaprazo: string | null;
  total_devido: number;
  total_atrasado: number;
  titulos_pendentes: number;
  maior_atraso_dias: number | null;
}

interface TopItemVendido {
  idproduto: number;
  descricao: string;
  quantidade: number;
  valorTotal: number;
  compras: number;
}

interface ClienteInativo {
  idcliente: number;
  nome_cliente: string;
  telefone_completo: string | null;
  emailcliente: string | null;
  ultimoPedido: string | null;
  diasInativo: number | null;
  totalPedidos: number;
}

interface IndicadoresContasReceber {
  topProduto: TopItemVendido | null;
  topServico: TopItemVendido | null;
  clientesInativos: ClienteInativo[];
  totalClientesInativos: number;
  truncado: boolean;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function getDiasInativoPillClass(diasInativo: number | null): string {
  if (diasInativo === null) return "pa-pill pa-pill-secondary";
  if (diasInativo > 365) return "pa-pill pa-pill-danger";
  return "pa-pill pa-pill-warning";
}


function getBadgeClass(maior_atraso_dias: number | null): string {
  if (maior_atraso_dias === null || maior_atraso_dias === 0) return "badge bg-success";
  if (maior_atraso_dias <= 30) return "badge bg-warning text-dark";
  if (maior_atraso_dias <= 90) return "badge bg-orange text-white";
  return "badge bg-danger";
}

function getBadgeLabel(dias: number | null): string {
  if (dias === null || dias === 0) return "Em dia";
  return `${dias}d atraso`;
}

function getStatusBoletoBadgeClass(status: string): string {
  if (status === "pendente") return "badge bg-warning text-dark";
  if (status === "pago") return "badge bg-success";
  return "badge bg-secondary";
}

function getVencimentoSuffix(dias: number | null): string {
  if (dias === null) return "";
  if (dias > 0) return `${dias}d`;
  if (dias === 0) return "vence hoje";
  return `${Math.abs(dias)}d em atraso`;
}

function getNfseBadge(nfseStatus: NfseStatusBoleto, totalTitulos: number): { cls: string; label: string; title: string } {
  if (nfseStatus === "completa") {
    return { cls: "badge bg-success", label: "NFS-e OK", title: `${totalTitulos} de ${totalTitulos} título(s) com NFS-e` };
  }
  if (nfseStatus === "parcial") {
    return { cls: "badge bg-warning text-dark", label: "NFS-e parcial", title: `Parte dos ${totalTitulos} título(s) já tem NFS-e emitida` };
  }
  return { cls: "badge bg-secondary", label: "NFS-e pendente", title: `0 de ${totalTitulos} título(s) com NFS-e` };
}

type AthosPillVariant = "success" | "warning" | "secondary" | "danger";

/** Situacao da baixa do boleto no Athos (Fase 43) para a coluna "Athos" do painel. */
function getAthosBaixaPill(boleto: BoletoDashboardItem): { variant: AthosPillVariant; label: string; title: string } | null {
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
function getSituacaoVencimentoPill(boleto: BoletoDashboardItem): { cls: string; label: string; title: string } | null {
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
function descreverUltimoAviso(aviso: UltimoAvisoBoleto | null | undefined): { texto: string; className: string } | null {
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
function paPillVariant(badgeClass: string): "success" | "warning" | "secondary" {
  if (badgeClass.includes("bg-success")) return "success";
  if (badgeClass.includes("bg-warning")) return "warning";
  return "secondary";
}

function BoletosConsolidadosPanel() {
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

type StatusFiltro = "AVC" | "VEN" | "REC" | "CAN" | "";

const STATUS_OPTIONS: { value: StatusFiltro; label: string; cls: string }[] = [
  { value: "",    label: "Todos (abertos)", cls: "btn-outline-secondary" },
  { value: "AVC", label: "A Vencer",        cls: "btn-outline-info"      },
  { value: "VEN", label: "Vencidos",        cls: "btn-outline-danger"    },
  { value: "REC", label: "Recebidos",       cls: "btn-outline-success"   },
  { value: "CAN", label: "Cancelados",      cls: "btn-outline-dark"      },
];

type SortKey = "nome" | "total_devido" | "total_atrasado";
type SortDir = "asc" | "desc";

const CLIENTE_SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "nome",           label: "Cliente" },
  { key: "total_devido",   label: "Total devido" },
  { key: "total_atrasado", label: "Atrasado" },
];

export default function ContasReceberPage() {
  return (
    <PasswordGate title="Contas a Receber" description="Esta area exibe dados financeiros de clientes. Digite a senha de configuracoes para continuar.">
      <ContasReceberDashboard />
    </PasswordGate>
  );
}

function ContasReceberDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [clientes, setClientes] = useState<ClienteDevedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("");
  const [busca, setBusca] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("total_atrasado");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [indicadores, setIndicadores] = useState<IndicadoresContasReceber | null>(null);
  const [loadingIndicadores, setLoadingIndicadores] = useState(true);
  const [erroIndicadores, setErroIndicadores] = useState("");

  async function fetchIndicadores() {
    setLoadingIndicadores(true);
    setErroIndicadores("");
    try {
      const res = await fetch("/api/athos/contas-receber/dashboard/indicadores", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Erro ao carregar indicadores de contas a receber.");
      }
      const data = (await res.json()) as IndicadoresContasReceber;
      setIndicadores(data);
    } catch {
      setErroIndicadores("Erro ao carregar indicadores de contas a receber.");
    } finally {
      setLoadingIndicadores(false);
    }
  }

  useEffect(() => {
    void fetchIndicadores();
  }, []);

  async function fetchDashboard(status: StatusFiltro = statusFiltro) {
    setLoading(true);
    setErro("");
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await fetch(`/api/athos/contas-receber/dashboard${qs}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Erro ao carregar dashboard de contas a receber.");
      }
      const data = (await res.json()) as { summary: DashboardSummary; clientes: ClienteDevedor[] };
      setSummary(data.summary);
      setClientes(data.clientes);
    } catch {
      setErro("Erro ao carregar dashboard de contas a receber.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchDashboard(statusFiltro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  }

  const buscaNormalizada = busca.trim().toLowerCase();
  const clientesFiltrados = buscaNormalizada
    ? clientes.filter(
        (c) =>
          c.nome_cliente.toLowerCase().includes(buscaNormalizada) ||
          String(c.idcliente).includes(buscaNormalizada),
      )
    : clientes;

  const clientesOrdenados = [...clientesFiltrados].sort((a, b) => {
    const mult = sortDir === "asc" ? 1 : -1;
    if (sortBy === "nome") {
      return a.nome_cliente.localeCompare(b.nome_cliente, "pt-BR") * mult;
    }
    return (a[sortBy] - b[sortBy]) * mult;
  });

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"
        strategy="beforeInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js"
        strategy="beforeInteractive"
      />
      <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
        rel="stylesheet"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
      />

      <AdminShell
        activeHref="/contas-receber"
        title="Contas a Receber"
        subtitle="Monitoramento de inadimplência"
        actions={
          <>
            <ClienteAutocomplete
              clientes={clientes}
              valor={busca}
              onValorChange={setBusca}
              onSelecionar={(id) => {
                window.location.href = `/contas-receber/${Number(id)}`;
              }}
            />
            <div className="pa-seg">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`pa-seg-btn${statusFiltro === opt.value ? " pa-seg-btn-active" : ""}`}
                  onClick={() => {
                    setStatusFiltro(opt.value);
                    void fetchDashboard(opt.value);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="pa-icon-btn"
              onClick={() => void fetchDashboard(statusFiltro)}
              title="Atualizar"
            >
              <i className="bi bi-arrow-clockwise" />
            </button>
          </>
        }
      >
        <BoletosConsolidadosPanel />

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Carregando...</span>
            </div>
          </div>
        ) : erro ? (
          <div className="alert alert-danger">{erro}</div>
        ) : (
          <>
            {/* SEÇÃO 1 — Fileira 1: resumo (D-02) */}
            {summary && (
              <div className="pa-stat-grid">
                <div className="pa-card pa-stat">
                  <div className="pa-stat-icon">
                    <i className="bi bi-cash-stack" />
                  </div>
                  <div className="pa-stat-body">
                    <p className="pa-stat-label">Total a Receber</p>
                    <h4 className="pa-stat-value pa-stat-value-accent">{formatBRL(summary.total_a_receber)}</h4>
                  </div>
                </div>
                <div className="pa-card pa-stat">
                  <div className="pa-stat-icon">
                    <i className="bi bi-exclamation-triangle-fill" />
                  </div>
                  <div className="pa-stat-body">
                    <p className="pa-stat-label">Inadimplência Ativa</p>
                    <h4 className="pa-stat-value pa-stat-value-danger">{formatBRL(summary.total_atrasado)}</h4>
                  </div>
                </div>
                <div className="pa-card pa-stat">
                  <div className="pa-stat-icon">
                    <i className="bi bi-graph-up-arrow" />
                  </div>
                  <div className="pa-stat-body">
                    <p className="pa-stat-label">Recebido no Mês</p>
                    <h4 className="pa-stat-value pa-stat-value-success">{formatBRL(summary.total_recebido_mes)}</h4>
                  </div>
                </div>
                <div className="pa-card pa-stat">
                  <div className="pa-stat-icon">
                    <i className="bi bi-percent" />
                  </div>
                  <div className="pa-stat-body">
                    <p className="pa-stat-label">Taxa de Inadimplência</p>
                    <h4 className="pa-stat-value pa-stat-value-text">{formatPercent(summary.taxa_inadimplencia)}</h4>
                    <small className="text-muted">
                      {summary.total_clientes_devedores} cliente(s) com título em aberto
                    </small>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 1B — Fileira 2: aging da inadimplência (D-07) */}
            {summary && (
              <div className="mb-4">
                <p className="small text-muted fw-bold mb-2">Inadimplência por faixa</p>
                <div className="pa-aging-grid">
                  <div className="pa-card pa-aging-card pa-aging-1">
                    <span className="text-muted small">1-30 dias</span>
                    <div className="fw-bold">{formatBRL(summary.aging.d1_30)}</div>
                  </div>
                  <div className="pa-card pa-aging-card pa-aging-2">
                    <span className="text-muted small">31-60 dias</span>
                    <div className="fw-bold">{formatBRL(summary.aging.d31_60)}</div>
                  </div>
                  <div className="pa-card pa-aging-card pa-aging-3">
                    <span className="text-muted small">61-90 dias</span>
                    <div className="fw-bold">{formatBRL(summary.aging.d61_90)}</div>
                  </div>
                  <div className="pa-card pa-aging-card pa-aging-4">
                    <span className="text-muted small">Mais de 90 dias</span>
                    <div className="fw-bold">{formatBRL(summary.aging.d90_mais)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 1C — Fileira 3: próximos vencimentos (D-09) */}
            {summary && (
              <div className="mb-4">
                <p className="small text-muted fw-bold mb-2">A vencer</p>
                <div className="pa-vencer-grid">
                  <div className="pa-card pa-vencer-card">
                    <p className="text-muted small mb-1">
                      <i className="bi bi-calendar-event pa-icon-muted me-1" />Próximos 7 dias
                    </p>
                    <div className="fw-bold">{formatBRL(summary.a_vencer.d7)}</div>
                    <small className="text-muted">Acumulado a partir de hoje</small>
                  </div>
                  <div className="pa-card pa-vencer-card">
                    <p className="text-muted small mb-1">
                      <i className="bi bi-calendar-event pa-icon-muted me-1" />Próximos 15 dias
                    </p>
                    <div className="fw-bold">{formatBRL(summary.a_vencer.d15)}</div>
                    <small className="text-muted">Acumulado a partir de hoje</small>
                  </div>
                  <div className="pa-card pa-vencer-card">
                    <p className="text-muted small mb-1">
                      <i className="bi bi-calendar-event pa-icon-muted me-1" />Próximos 30 dias
                    </p>
                    <div className="fw-bold">{formatBRL(summary.a_vencer.d30)}</div>
                    <small className="text-muted">Acumulado a partir de hoje</small>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 2 — Tabela de clientes */}
            {clientes.length === 0 ? (
              <div className="alert alert-info">
                <i className="bi bi-info-circle me-2" />Nenhum cliente com contas em aberto.
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="alert alert-info">
                <i className="bi bi-info-circle me-2" />Nenhum cliente encontrado para &quot;{busca}&quot;.
              </div>
            ) : (
              <div className="pa-card">
                <div className="pa-card-body pa-card-body-flush">
                  <table className="pa-table">
                    <thead>
                      <tr>
                        {CLIENTE_SORT_COLUMNS.map((col) => (
                          <th key={col.key}>
                            <button type="button" className="pa-th-sort" onClick={() => handleSort(col.key)}>
                              {col.label}
                              {sortBy === col.key && (
                                <i className={`bi ${sortDir === "desc" ? "bi-sort-down" : "bi-sort-up"} ms-1`} />
                              )}
                            </button>
                          </th>
                        ))}
                        <th>Títulos</th>
                        <th>Limite de crédito</th>
                        <th>Atraso</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientesOrdenados.map((cliente) => {
                        const pct =
                          cliente.limitecredito > 0
                            ? Math.min(100, Math.round((cliente.total_devido / cliente.limitecredito) * 100))
                            : 0;
                        const progressBarClass =
                          pct >= 80 ? "pa-progress-bar-danger" : pct >= 50 ? "pa-progress-bar-warning" : "pa-progress-bar-success";
                        const critico = cliente.maior_atraso_dias !== null && cliente.maior_atraso_dias > 90;

                        return (
                          <tr key={cliente.idcliente} className={critico ? "pa-row-critico" : ""}>
                            <td className="pa-td-cliente">
                              <span className="pa-id-badge">#{cliente.idcliente}</span>
                              <span className="text-truncate" title={cliente.nome_cliente}>
                                {cliente.nome_cliente}
                              </span>
                            </td>
                            <td className="fw-semibold text-nowrap">{formatBRL(cliente.total_devido)}</td>
                            <td className="text-nowrap">
                              {cliente.total_atrasado > 0 ? (
                                <span style={{ color: "var(--pa-danger)" }} className="fw-semibold">
                                  {formatBRL(cliente.total_atrasado)}
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="text-muted small">{cliente.titulos_pendentes}</td>
                            <td style={{ minWidth: "160px" }}>
                              {cliente.limitecredito > 0 ? (
                                <>
                                  <div className="d-flex justify-content-between small text-muted mb-1">
                                    <span>{formatBRL(cliente.limitecredito)}</span>
                                    <span>{pct}%</span>
                                  </div>
                                  <div className="pa-progress">
                                    <div
                                      className={`pa-progress-bar ${progressBarClass}`}
                                      role="progressbar"
                                      style={{ width: `${pct}%` }}
                                      aria-valuenow={pct}
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                    />
                                  </div>
                                </>
                              ) : (
                                <span className="text-muted small">—</span>
                              )}
                            </td>
                            <td>
                              <span className={getBadgeClass(cliente.maior_atraso_dias)}>
                                {getBadgeLabel(cliente.maior_atraso_dias)}
                              </span>
                            </td>
                            <td>
                              <a href={`/contas-receber/${cliente.idcliente}`} className="pa-link-btn text-nowrap">
                                Ver Detalhe
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SEÇÃO 3 — Item Mais Vendido (Histórico) — QT-GXV-01 */}
            <div className="pa-card">
              <div className="pa-card-header">
                <strong>Item Mais Vendido (Histórico)</strong>
              </div>
              <div className="pa-card-body">
                {loadingIndicadores ? (
                  <div className="text-center py-4">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Carregando...</span>
                    </div>
                  </div>
                ) : erroIndicadores ? (
                  <div className="pa-empty pa-empty-erro">
                    <span>{erroIndicadores}</span>
                    <button
                      type="button"
                      className="pa-icon-btn"
                      onClick={() => void fetchIndicadores()}
                      title="Atualizar"
                    >
                      <i className="bi bi-arrow-clockwise" />
                    </button>
                  </div>
                ) : (
                  <div className="pa-stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                    <div className="pa-card pa-stat">
                      <div className="pa-stat-icon">
                        <i className="bi bi-box-seam" />
                      </div>
                      <div className="pa-stat-body">
                        <p className="pa-stat-label">Produto Mais Vendido</p>
                        {indicadores?.topProduto ? (
                          <>
                            <h4 className="pa-stat-value pa-stat-value-text">
                              {indicadores.topProduto.descricao}
                            </h4>
                            <div className="fw-bold">{formatBRL(indicadores.topProduto.valorTotal)}</div>
                            <small className="text-muted">
                              {indicadores.topProduto.compras} compra(s)
                            </small>
                          </>
                        ) : (
                          <h4 className="pa-stat-value pa-stat-value-text">—</h4>
                        )}
                      </div>
                    </div>
                    <div className="pa-card pa-stat">
                      <div className="pa-stat-icon">
                        <i className="bi bi-tools" />
                      </div>
                      <div className="pa-stat-body">
                        <p className="pa-stat-label">Serviço Mais Vendido</p>
                        {indicadores?.topServico ? (
                          <>
                            <h4 className="pa-stat-value pa-stat-value-text">
                              {indicadores.topServico.descricao}
                            </h4>
                            <div className="fw-bold">{formatBRL(indicadores.topServico.valorTotal)}</div>
                            <small className="text-muted">
                              {indicadores.topServico.compras} compra(s)
                            </small>
                          </>
                        ) : (
                          <h4 className="pa-stat-value pa-stat-value-text">—</h4>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SEÇÃO 4 — Clientes Inativos — QT-GXV-02 */}
            <div className="pa-card">
              <div className="pa-card-header">
                <div>
                  <strong>Clientes Inativos</strong>
                  <span className="pa-card-header-count">({indicadores?.totalClientesInativos ?? 0})</span>
                </div>
              </div>
              <div className="pa-card-body pa-card-body-flush">
                {loadingIndicadores ? (
                  <div className="text-center py-4">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Carregando...</span>
                    </div>
                  </div>
                ) : erroIndicadores ? (
                  <div className="pa-empty pa-empty-erro">
                    <span>{erroIndicadores}</span>
                  </div>
                ) : !indicadores || indicadores.clientesInativos.length === 0 ? (
                  <div className="pa-empty">
                    <strong>Nenhum cliente inativo</strong>
                    <div className="small mt-1 text-muted">
                      Todos os clientes com pedido compraram novamente nos últimos 180 dias.
                    </div>
                  </div>
                ) : (
                  <>
                    <table className="pa-table">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Telefone</th>
                          <th>E-mail</th>
                          <th>Último Pedido</th>
                          <th>Dias sem Pedido</th>
                          <th>Pedidos</th>
                          <th>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {indicadores.clientesInativos.map((cliente) => (
                          <tr key={cliente.idcliente}>
                            <td className="pa-td-cliente">
                              <span className="pa-id-badge">#{cliente.idcliente}</span>
                              <span className="text-truncate" title={cliente.nome_cliente}>
                                {cliente.nome_cliente}
                              </span>
                            </td>
                            <td className="text-nowrap small">{cliente.telefone_completo ?? "—"}</td>
                            <td className="text-nowrap small">{cliente.emailcliente ?? "—"}</td>
                            <td className="text-nowrap small">
                              {cliente.ultimoPedido ? formatDate(cliente.ultimoPedido) : "—"}
                            </td>
                            <td>
                              <span className={getDiasInativoPillClass(cliente.diasInativo)}>
                                {cliente.diasInativo !== null ? `${cliente.diasInativo}d` : "—"}
                              </span>
                            </td>
                            <td className="text-muted small">{cliente.totalPedidos}</td>
                            <td>
                              <a href={`/contas-receber/${cliente.idcliente}`} className="pa-link-btn text-nowrap">
                                Ver Detalhe
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {indicadores.truncado && (
                      <div className="small text-muted p-3">
                        Mostrando os 100 clientes inativos há mais tempo. A contagem no cabeçalho cobre o total.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </AdminShell>
    </>
  );
}
