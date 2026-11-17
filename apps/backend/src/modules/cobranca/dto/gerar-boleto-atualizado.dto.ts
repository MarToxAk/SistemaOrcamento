import { IsNumber, IsOptional, Matches, Max, Min } from "class-validator";

import { TETO_JUROS_MES, TETO_MULTA_PERCENTUAL } from "../cobranca-boleto-atualizado.util";

/**
 * Corpo do POST /cobranca/boleto/:id/atualizar (Fase 50, D-01, D-16). So o novo vencimento e as taxas:
 * total, juros e multa em reais nunca vem do cliente, o servidor recalcula.
 */
export class GerarBoletoAtualizadoDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "novoVencimento deve estar no formato YYYY-MM-DD." })
  novoVencimento!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 }, { message: "taxaJurosMes deve ser um número com até 4 casas decimais." })
  @Min(0, { message: "taxaJurosMes não pode ser negativa." })
  @Max(TETO_JUROS_MES, { message: `taxaJurosMes acima do limite de ${TETO_JUROS_MES}% ao mês.` })
  taxaJurosMes?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 }, { message: "multaPercentual deve ser um número com até 4 casas decimais." })
  @Min(0, { message: "multaPercentual não pode ser negativa." })
  @Max(TETO_MULTA_PERCENTUAL, { message: `multaPercentual acima do limite de ${TETO_MULTA_PERCENTUAL}%.` })
  multaPercentual?: number;
}
