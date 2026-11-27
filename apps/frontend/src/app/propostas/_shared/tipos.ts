/**
 * Tipos da API de propostas (contrato do backend, plano 55-06). Somente tipos, sem logica.
 * Dinheiro e quantidades chegam como TEXTO ja calculado pelo servidor; o navegador nunca calcula preco.
 */

export type PropostaStatus = "RASCUNHO" | "LANCANDO" | "ENVIADA" | "FECHADA" | "CANCELADA";

/** Endereco do snapshot do cliente do Athos: cada campo pode vir ausente (D-25 mostra "não informado"). */
export interface EnderecoSnapshot {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

/** Snapshot do cliente do Athos gravado na proposta (campos usados pelas telas). */
export interface ClienteSnapshot {
  idcliente?: number | null;
  tipoPessoa?: "fisico" | "juridico" | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  /** Somente digitos (CPF ou CNPJ). */
  documento?: string | null;
  endereco?: EnderecoSnapshot | null;
  email?: string | null;
  telefone?: string | null;
  [chave: string]: unknown;
}

/** Sobrescritas de cliente usadas so no PDF (D-16). Somente estas chaves existem; ausente = usa o Athos. */
export interface ClienteOverride {
  razaoSocial?: string;
  documento?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
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

/** Assinante em edicao na tela (texto livre; vazio = nao informado). Gravado so ao gerar a proposta (D-19). */
export interface Assinante {
  nome: string;
  cargo: string;
  cpf: string;
}

/** Assinante recente devolvido por GET /api/propostas/assinantes, para reuso (D-19). */
export interface AssinanteRecente {
  nome: string;
  cargo: string | null;
  cpf: string | null;
}

/**
 * Campos do cabecalho aceitos por PATCH /api/propostas/<id> (todos opcionais; null limpa o campo).
 * O assinante NAO faz parte do PATCH: o servidor o recebe somente em gerar (D-19).
 */
export interface CamposCabecalho {
  idclienteAthos?: number | null;
  numeroProcesso?: string | null;
  setorResponsavel?: string | null;
  contatoEmail?: string | null;
  contatoTelefone?: string | null;
  validadeDias?: number;
  prazoEntregaDias?: number;
  observacao?: string | null;
  clienteOverride?: ClienteOverride | null;
}

export interface PropostaDetalhe {
  id: string;
  status: PropostaStatus;
  idclienteAthos: number | null;
  cliente: ClienteSnapshot | null;
  clienteOverride: ClienteOverride | null;
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
