import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

/** Uma NF-e (produto) por tras de um boleto: o XML vem do Athos pelos titulos do boleto. */
export class NotaNfeZipDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cobrancaBoletoId!: number;

  @IsString()
  @Matches(/^\d{1,15}$/, { message: "numero deve conter apenas digitos (ate 15)." })
  numero!: string;
}

/**
 * Corpo do POST /cobranca/notas/zip (Fase 47, D-12). Maximo de 50 notas por pedido;
 * o limite somado (nfseIds + nfe) e conferido no servico (LIMITE_NOTAS_ZIP).
 */
export class BaixarNotasZipDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  nfseIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => NotaNfeZipDto)
  nfe?: NotaNfeZipDto[];
}
