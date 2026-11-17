import { IsNumber, Max, Min } from "class-validator";

import { TETO_JUROS_MES, TETO_MULTA_PERCENTUAL } from "../cobranca-boleto-atualizado.util";

/**
 * Corpo do PUT /cobranca/encargos-config (Fase 50, D-07/D-16). Ambos obrigatorios;
 * tetos: juros ate 1% a.m. e multa ate 2%.
 */
export class AtualizarEncargosConfigDto {
  @IsNumber({ maxDecimalPlaces: 4 }, { message: "taxaJurosMes deve ser um número com até 4 casas decimais." })
  @Min(0, { message: "taxaJurosMes não pode ser negativa." })
  @Max(TETO_JUROS_MES, { message: `taxaJurosMes acima do limite de ${TETO_JUROS_MES}% ao mês.` })
  taxaJurosMes!: number;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: "multaPercentual deve ser um número com até 4 casas decimais." })
  @Min(0, { message: "multaPercentual não pode ser negativa." })
  @Max(TETO_MULTA_PERCENTUAL, { message: `multaPercentual acima do limite de ${TETO_MULTA_PERCENTUAL}%.` })
  multaPercentual!: number;
}
