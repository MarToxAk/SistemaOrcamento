"use client";

import { formatDateHora } from "../../_shared/formatadores";

export interface NfseEmitidaCliente {
  id: number;
  numeroNfse: string | null;
  numeroRps: number | null;
  valorServico: number;
  linkNfse: string | null;
  dataEmissao: string;
  titulos: number[];
}

export interface NotaFiscalAthos {
  numero: string;
  dataemissao: string | null;
  valor: number;
  tipo: string;
}

export interface DadosCliente {
  idcliente: number;
  nome_cliente: string;
  telefone_completo: string | null;
  emailcliente: string | null;
  emailcobrancacliente: string | null;
  limitecredito: number;
  bloqueaprazo: string | null;
}

export interface TituloReceber {
  idcontareceber: number;
  numerotitulo: string | null;
  datavencimento: string;
  valor: number;
  observacao: string | null;
  idvenda: number | null;
  dataemissao: string | null;
  numeroordem: string | null;
  tipoNf?: string | null;
  numeroNf?: string | null;
  boletoAtivo?: {
    cobrancaId: number;
    status: string;
    linkBoleto: string | null;
    nomeArquivo: string | null;
    /** AAAA-MM-DD do titulos-em-uso (Fase 48); ausente antes do deploy do backend. */
    expireAt?: string | null;
    dataPagamento?: string | null;
    ultimoEmail?: {
      status: string;
      destinatario: string;
      cc?: string[];
      enviadoEm: string;
      abertoEm: string | null;
      confirmadoEm: string | null;
    } | null;
  } | null;
  nfseAtivo?: { nfseEmitidaId: number; numeroNfse: string | null; linkNfse?: string | null } | null;
}

export interface HistoricoCliente {
  pagos: Array<{
    idcontareceber: number;
    numerotitulo: string | null;
    datavencimento: string;
    datapagamento: string | null;
    valor: number;
    valorpago: number;
    juros: number;
    desconto: number;
    idvenda: number | null;
    numeroordem: string | null;
  }>;
  truncado: boolean;
  totalPago: number;
  titulosPagos: number;
  itensPorValor: Array<{ idproduto: number; descricao: string; quantidade: number; valorTotal: number; compras: number }>;
  itensPorQuantidade: Array<{ idproduto: number; descricao: string; quantidade: number; valorTotal: number; compras: number }>;
  meses: Array<{ mes: string; total: number; titulos: number }>;
  mesMaiorGasto: { mes: string; total: number } | null;
}

export const EMAIL_CC_MAX = 10; // espelha EMAIL_CC_MAX de apps/backend/src/modules/cobranca/dto/enviar-email-cobranca.dto.ts
export const EMAIL_CC_PADRAO_TIMEOUT_MS = 8000; // limite do GET do padrao de CC (nao pode travar o Enviar)
// mesma regex do backend (email-envio.service.ts)
export const EMAIL_RE =
  /^[^\s@<>,;"()[\]\\\x00-\x1f\x7f]+@[^\s@<>,;"()[\]\\\x00-\x1f\x7f]+\.[^\s@<>,;"()[\]\\\x00-\x1f\x7f]+$/;

/** Funde o texto digitado (separado por virgula, ponto e virgula ou espaco) na lista de CC atual. */
export function mesclarEmailsCc(
  atual: string[],
  texto: string,
  principal: string,
): { lista: string[]; invalidos: string[]; excedentes: number } {
  const principalLc = principal.trim().toLowerCase();
  const lista = atual.filter((e) => e.toLowerCase() !== principalLc);
  const invalidos: string[] = [];
  let excedentes = 0;
  const tokens = texto
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const token of tokens) {
    if (!EMAIL_RE.test(token)) {
      invalidos.push(token);
      continue;
    }
    const lc = token.toLowerCase();
    if (lc === principalLc || lista.some((e) => e.toLowerCase() === lc)) continue;
    if (lista.length >= EMAIL_CC_MAX) {
      excedentes += 1;
      continue;
    }
    lista.push(token);
  }
  return { lista, invalidos, excedentes };
}

/** Indicador de leitura do último e-mail enviado para o boleto (enviado -> aberto -> confirmado). */
export function StatusEmailBadge({ ultimoEmail }: { ultimoEmail: NonNullable<TituloReceber["boletoAtivo"]>["ultimoEmail"] }) {
  if (!ultimoEmail) return null;
  const config = {
    confirmado: { classe: "bg-success", icone: "bi-check-circle-fill", texto: "Confirmado", data: ultimoEmail.confirmadoEm },
    aberto: { classe: "bg-warning text-dark", icone: "bi-eye-fill", texto: "Aberto", data: ultimoEmail.abertoEm },
    enviado: { classe: "bg-secondary", icone: "bi-envelope-check", texto: "Enviado", data: ultimoEmail.enviadoEm },
  }[ultimoEmail.status] ?? { classe: "bg-secondary", icone: "bi-envelope", texto: ultimoEmail.status, data: ultimoEmail.enviadoEm };

  return (
    <span
      className={`badge ${config.classe}`}
      title={`E-mail para ${ultimoEmail.destinatario}${
        ultimoEmail.cc && ultimoEmail.cc.length > 0 ? ` (cópia: ${ultimoEmail.cc.join(", ")})` : ""
      } — enviado em ${formatDateHora(ultimoEmail.enviadoEm)}${
        ultimoEmail.abertoEm ? ` · aberto em ${formatDateHora(ultimoEmail.abertoEm)}` : ""
      }${ultimoEmail.confirmadoEm ? ` · confirmado em ${formatDateHora(ultimoEmail.confirmadoEm)}` : ""}`}
    >
      <i className={`bi ${config.icone} me-1`} />
      {config.texto}
      {config.data ? ` · ${formatDateHora(config.data)}` : ""}
    </span>
  );
}

export function badgeClassName(tipoNf?: string | null): string {
  if (!tipoNf) return "";
  if (tipoNf === "NF-e") return "bg-primary";
  if (tipoNf === "NFS-e") return "bg-success";
  return "bg-secondary"; // combined or other labels
}

export type AbaCliente = "contas" | "gerar-boleto" | "boletos" | "notas";

export const ABAS_CLIENTE: ReadonlyArray<{ id: AbaCliente; rotulo: string; icone: string }> = [
  { id: "contas", rotulo: "Contas em Aberto", icone: "bi-receipt" },
  { id: "gerar-boleto", rotulo: "Gerar Boleto", icone: "bi-upc-scan" },
  { id: "boletos", rotulo: "Boletos", icone: "bi-files" },
  { id: "notas", rotulo: "Notas Fiscais", icone: "bi-file-earmark-text" },
];

/** Navegacao de abas da tela do cliente (a aba ativa vive na URL, D-04). */
export function AbasNavegacao({
  abaAtual,
  onSelecionar,
  contagens,
}: {
  abaAtual: AbaCliente;
  onSelecionar: (aba: AbaCliente) => void;
  contagens?: Partial<Record<AbaCliente, number>>;
}) {
  return (
    <>
      <nav className="pa-tabs" role="tablist" aria-label="Seções do cliente">
        {ABAS_CLIENTE.map((aba) => {
          const ativa = aba.id === abaAtual;
          const total = contagens?.[aba.id];
          return (
            <button
              key={aba.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              className={`pa-tab${ativa ? " pa-tab-active" : ""}`}
              onClick={() => onSelecionar(aba.id)}
            >
              <i className={`bi ${aba.icone}`} />
              <span>{aba.rotulo}</span>
              {total !== undefined && <span className="pa-tab-count">{total}</span>}
            </button>
          );
        })}
      </nav>
      <style>{`
        .pa-tabs {
          display: flex;
          gap: 0.25rem;
          margin-bottom: 1rem;
          padding: 0 0.5rem;
          background: var(--pa-surface);
          border: 1px solid var(--pa-border);
          border-radius: 10px;
          overflow-x: auto;
        }
        .pa-tab {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.8rem 1rem;
          background: none;
          border: 0;
          border-bottom: 2px solid transparent;
          color: var(--pa-text-muted);
          font: inherit;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
        }
        .pa-tab:hover { color: var(--pa-text); }
        .pa-tab-active {
          color: var(--pa-text);
          border-bottom-color: var(--pa-accent);
        }
        .pa-tab-count {
          min-width: 1.5rem;
          padding: 0 0.45rem;
          border-radius: 999px;
          background: var(--pa-accent-soft);
          color: var(--pa-accent);
          font-size: 0.78rem;
          font-weight: 600;
          text-align: center;
        }
      `}</style>
    </>
  );
}
