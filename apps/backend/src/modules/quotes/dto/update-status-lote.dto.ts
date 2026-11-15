import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

/** Maximo de orcamentos por pedido de troca de status em lote (Fase 49, D-03). */
export const LIMITE_STATUS_LOTE = 50;

/**
 * Corpo do PATCH /quotes/status/lote (Fase 49, D-03). O lote e sempre silencioso: nao existe campo
 * de aviso ao cliente (forbidNonWhitelisted devolve 400 se vier notificarCliente).
 */
export class UpdateStatusLoteDto {
  /** Identificadores aceitos por changeStatus: UUID, numero interno ou numero do Athos. */
  @IsArray({ message: "ids deve ser uma lista." })
  @ArrayNotEmpty({ message: "ids deve ter ao menos 1 orcamento." })
  @ArrayMaxSize(LIMITE_STATUS_LOTE, { message: `ids aceita no maximo ${LIMITE_STATUS_LOTE} orcamentos por lote.` })
  @ArrayUnique({ message: "ids nao pode ter itens repetidos." })
  @IsString({ each: true, message: "cada id deve ser texto." })
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, {
    each: true,
    message: "cada id deve ter de 1 a 64 caracteres entre letras, numeros, _ e -.",
  })
  ids!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  newStatus!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  changedBy!: string;
}
