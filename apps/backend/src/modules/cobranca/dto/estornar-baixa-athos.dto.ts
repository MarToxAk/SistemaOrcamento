import { IsBoolean, IsOptional } from "class-validator";

/**
 * Corpo do POST /cobranca/boleto/:id/estornar-baixa-athos (Fase 43, D-06). Estorno e destrutivo no Athos:
 * sem `simular`, exige `confirmar: true`. Corpo vazio nunca estorna.
 */
export class EstornarBaixaAthosDto {
  /** true = confirma o estorno real (obrigatorio quando nao for simulacao). */
  @IsOptional()
  @IsBoolean({ message: "confirmar deve ser verdadeiro ou falso." })
  confirmar?: boolean;

  /** true = somente leitura: valida e calcula o que seria estornado, sem gravar nada. Dispensa confirmar. */
  @IsOptional()
  @IsBoolean({ message: "simular deve ser verdadeiro ou falso." })
  simular?: boolean;
}
