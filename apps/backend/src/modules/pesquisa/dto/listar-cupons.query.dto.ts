/**
 * Fase 52 (plano 52-12): query do GET /pesquisa/admin/cupons (D-17/UI-D09).
 *
 * Lista fechada de situacoes, cursor curto e limite entre 1 e 100; o servico ainda normaliza o limite.
 */
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ListarCuponsQueryDto {
  @IsOptional()
  @IsIn(["disponiveis", "usados", "vencidos", "cancelados"], {
    message: "status deve ser disponiveis, usados, vencidos ou cancelados.",
  })
  status?: string;

  @IsOptional()
  @IsString({ message: "cursor deve ser texto." })
  @MaxLength(64, { message: "cursor deve ter no máximo 64 caracteres." })
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limite deve ser um número inteiro." })
  @Min(1, { message: "limite mínimo de 1." })
  @Max(100, { message: "limite máximo de 100." })
  limite?: number;
}
