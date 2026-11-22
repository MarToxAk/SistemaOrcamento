/**
 * Fase 52 (plano 52-12): corpo do POST /pesquisa/admin/cupons/:codigo/resgate (D-17).
 *
 * O valor da compra vem do balcao; tudo o mais e recalculado no servidor a partir do snapshot do cupom.
 */
import { IsNumber, Max, Min } from "class-validator";

export class ResgatarCupomDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "valorCompra deve ser um número com até 2 casas decimais." })
  @Min(0.01, { message: "Informe o valor da compra." })
  @Max(1000000, { message: "Valor da compra acima do limite permitido." })
  valorCompra!: number;
}
