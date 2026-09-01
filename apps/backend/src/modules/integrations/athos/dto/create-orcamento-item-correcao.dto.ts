import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateOrcamentoItemCorrecaoDto {
  @ApiProperty({ example: "21659", description: "idorcamento do orcamento no Athos" })
  @IsString()
  @IsNotEmpty()
  idOrcamento!: string;

  @ApiProperty({ example: "42510", description: "iditemorcamento do item no Athos" })
  @IsString()
  @IsNotEmpty()
  idItemOrcamento!: string;

  @ApiProperty({ example: 3.3, description: "Valor unitario correto do item" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorItem!: number;

  @ApiProperty({ example: 0, description: "Desconto correto do item" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorDesconto!: number;

  @ApiProperty({ example: 3.3, description: "Valor final correto do item (valorItem - valorDesconto)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorFinalItem!: number;

  @ApiPropertyOptional({ example: "Preco lancado errado no caixa (2,50 ao inves de 3,30)" })
  @IsOptional()
  @IsString()
  motivo?: string;

  @ApiPropertyOptional({ example: "Jose" })
  @IsOptional()
  @IsString()
  criadoPor?: string;
}
