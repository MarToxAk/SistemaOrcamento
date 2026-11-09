import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/** Query da busca de produtos para a IA (Fase 44, 44-04). */
export class BuscarProdutosOrcamentoQueryDto {
  @ApiProperty({
    description:
      "Texto de busca (ate 100 caracteres). Procura por descricao, referencia e codigo de barras; varias palavras " +
      "sao combinadas com E. Se for apenas numero, tambem procura pelo idproduto exato.",
    example: "caneta bic azul",
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({
    description: "Quantidade maxima de produtos devolvidos (1 a 50). Padrao 20.",
    minimum: 1,
    maximum: 50,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
