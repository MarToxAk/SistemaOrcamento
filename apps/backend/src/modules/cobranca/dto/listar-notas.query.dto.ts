import { Type } from "class-transformer";
import { IsInt, IsOptional, Matches, Max, Min } from "class-validator";

/**
 * Query do GET /cobranca/notas (Fase 47, D-04/D-09). Todos os filtros sao opcionais;
 * datas no formato AAAA-MM-DD (dia de Sao Paulo). Parametro desconhecido da 400 (forbidNonWhitelisted).
 */
export class ListarNotasQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idclienteAthos?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "de deve estar no formato AAAA-MM-DD." })
  de?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "ate deve estar no formato AAAA-MM-DD." })
  ate?: string;
}
