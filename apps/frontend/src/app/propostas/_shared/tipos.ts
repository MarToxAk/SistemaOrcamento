/**
 * Tipos da API de propostas (contrato do backend, plano 55-06). Somente tipos, sem logica.
 * Dinheiro e quantidades chegam como TEXTO ja calculado pelo servidor; o navegador nunca calcula preco.
 */

export type PropostaStatus = "RASCUNHO" | "LANCANDO" | "ENVIADA" | "FECHADA" | "CANCELADA";

/** Snapshot do cliente do Athos gravado na proposta (campos usados pelas telas). */
export interface ClienteSnapshot {
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  documento?: string | null;
  [chave: string]: unknown;
}

export interface AjusteItem {
  tipo: "PERCENTUAL" | "VALOR";
  valor: string;
}

export interface ItemProposta {
  id: string;
  sequencia: number;
  idproduto: number;
  nomeAthos: string;
  nome: string;
  descricaoCurta: string | null;
  unidade: string | null;
  permiteFracionar: boolean;
  quantidade: string;
  precoBase: string;
  ajuste: AjusteItem | null;
  precoUnitario: string;
  totalLinha: string;
  custoUnitario: string;
  margemPercentual: string;
  abaixoDoCusto: boolean;
}

export interface AssinanteProposta {
  nome: string;
  cargo: string | null;
  cpf: string | null;
}

export interface PropostaDetalhe {
  id: string;
  status: PropostaStatus;
  idclienteAthos: number | null;
  cliente: ClienteSnapshot | null;
  clienteOverride: Record<string, unknown> | null;
  numeroProcesso: string | null;
  setorResponsavel: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
  validadeDias: number;
  prazoEntregaDias: number;
  observacao: string | null;
  assinante: AssinanteProposta | null;
  total: string;
  idorcamentoAthos: number | null;
  senhaBalcao: number | null;
  athosData: string | null;
  athosHora: string | null;
  pdfDisponivel: boolean;
  duplicadaDeId: string | null;
  criadoEm: string;
  atualizadoEm: string;
  enviadaEm: string | null;
  fechadaEm: string | null;
  canceladaEm: string | null;
  itens: ItemProposta[];
}

export interface PropostaResumo {
  id: string;
  status: PropostaStatus;
  idclienteAthos: number | null;
  clienteNome: string | null;
  numeroProcesso: string | null;
  total: string;
  quantidadeItens: number;
  idorcamentoAthos: number | null;
  senhaBalcao: number | null;
  pdfDisponivel: boolean;
  criadoEm: string;
  atualizadoEm: string;
  enviadaEm: string | null;
  fechadaEm: string | null;
  canceladaEm: string | null;
}

export interface ListaPropostas {
  itens: PropostaResumo[];
  total: number;
  pagina: number;
  tamanho: number;
}

export interface ProdutoBusca {
  idproduto: number;
  descricao: string;
  descricaoCurta: string | null;
  marca: string | null;
  referencia: string | null;
  codigoBarra: string | null;
  /** Texto de precovendaproduto; null quando o Athos nao tem preco. */
  preco: string | null;
  emPromocao: boolean;
  estoqueLoja: string;
  estoqueDeposito: string;
  permiteFracionar: boolean;
  unidade: string | null;
  custoUnitario: string;
}

/** Corpo de erro do backend (PropostaError) ou do proxy ({ error }). */
export interface ErroApi {
  statusCode?: number;
  codigo?: string;
  mensagem?: string;
  error?: string;
}

/** Rotulos de exibicao do status (dados constantes, sem regra de negocio). */
export const STATUS_ROTULO: Record<PropostaStatus, string> = {
  RASCUNHO: "Rascunho",
  LANCANDO: "Lançando",
  ENVIADA: "Enviada",
  FECHADA: "Fechada",
  CANCELADA: "Cancelada",
};

/** Variante da pilula `pa-pill-*` do admin por status. */
export const STATUS_PILL: Record<PropostaStatus, "secondary" | "warning" | "success" | "danger"> = {
  RASCUNHO: "secondary",
  LANCANDO: "secondary",
  ENVIADA: "warning",
  FECHADA: "success",
  CANCELADA: "danger",
};
