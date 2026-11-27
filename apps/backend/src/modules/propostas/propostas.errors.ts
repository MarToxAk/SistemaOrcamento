import { HttpException } from "@nestjs/common";

/** Codigos de erro do modulo de propostas (Fase 55). Mensagens em portugues, sem detalhes internos. */
export type PropostaCodigo =
  | "PROPOSTA_NAO_ENCONTRADA"
  | "PROPOSTA_NAO_EDITAVEL"
  | "PRODUTO_INEXISTENTE"
  | "PRECO_INDISPONIVEL"
  | "QUANTIDADE_FRACIONADA"
  | "LIMITE_ITENS"
  | "CLIENTE_INEXISTENTE"
  | "CLIENTE_OBRIGATORIO"
  | "SEM_ITENS"
  | "ASSINANTE_OBRIGATORIO"
  | "TRANSICAO_INVALIDA"
  | "LANCAMENTO_EM_ANDAMENTO"
  | "PDF_INDISPONIVEL"
  | "VALOR_INVALIDO";

/** Erro legivel pelo frontend: corpo { statusCode, codigo, mensagem } (mesmo formato de OrcamentoAthosError). */
export class PropostaError extends HttpException {
  readonly codigo: PropostaCodigo;

  constructor(codigo: PropostaCodigo, mensagem: string, status: number) {
    super({ statusCode: status, codigo, mensagem }, status);
    this.name = "PropostaError";
    this.codigo = codigo;
  }
}
