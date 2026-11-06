import { IsBoolean, IsOptional, Matches } from "class-validator";

/**
 * Corpo do POST /cobranca/boleto/:id/baixar-athos (Fase 43, BX-08). Todos os campos sao opcionais:
 * corpo vazio = baixa real com a data e o valor da EFI ja guardados no boleto.
 */
export class BaixarAthosDto {
  /** Sobrepoe a data de pagamento guardada. YYYY-MM-DD, calendario de America/Sao_Paulo. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "dataPagamento deve estar no formato YYYY-MM-DD." })
  dataPagamento?: string;

  /** true = somente leitura: calcula e valida, sem gravar nada no Athos nem no Sistema. */
  @IsOptional()
  @IsBoolean({ message: "simular deve ser verdadeiro ou falso." })
  simular?: boolean;

  /** true = nao compara com o valor pago informado pela EFI (usa principal + encargos calculados). */
  @IsOptional()
  @IsBoolean({ message: "ignorarValorEfi deve ser verdadeiro ou falso." })
  ignorarValorEfi?: boolean;
}
