import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateProdutoDto {
  @ApiProperty({ example: "Papel A4 75g Resma 500fls", description: "Descricao do produto (obrigatorio)" })
  @IsString()
  @IsNotEmpty()
  descricaoproduto!: string;

  @ApiPropertyOptional({ example: "Papel A4", description: "Descricao curta (max 40 caracteres)" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  descricaocurta?: string;

  @ApiPropertyOptional({ example: "7891234567890", description: "Codigo de barras 1" })
  @IsOptional()
  @IsString()
  codigobarra1?: string;

  @ApiPropertyOptional({ example: "7891234567891", description: "Codigo de barras 2" })
  @IsOptional()
  @IsString()
  codigobarra2?: string;

  @ApiPropertyOptional({ example: "REF-001", description: "Referencia interna do produto" })
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiPropertyOptional({ example: "48026190", description: "Codigo NCM do produto" })
  @IsOptional()
  @IsString()
  ncm?: string;

  @ApiPropertyOptional({ example: "Produto de alta qualidade", description: "Informacao adicional do produto" })
  @IsOptional()
  @IsString()
  informacaoadicional?: string;

  @ApiPropertyOptional({ example: "Observacao interna", description: "Observacao interna do produto" })
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional({ example: 2, description: "ID da unidade de medida no Athos" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idunidade?: number;

  @ApiPropertyOptional({ example: 2, description: "ID do departamento no Athos" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  iddepartamento?: number;

  @ApiPropertyOptional({ example: 5, description: "ID do grupo no Athos" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idgrupo?: number;

  @ApiPropertyOptional({ example: 3, description: "ID da marca no Athos" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idmarca?: number;

  @ApiPropertyOptional({ example: 42, description: "ID do fornecedor no Athos" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idfornecedor?: number;

  @ApiPropertyOptional({ example: 29.9, description: "Valor de venda 1" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorvenda1?: number;

  @ApiPropertyOptional({ example: 28.5, description: "Valor de venda 2" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorvenda2?: number;

  @ApiPropertyOptional({ example: 27.0, description: "Valor de venda 3" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorvenda3?: number;

  @ApiPropertyOptional({ example: 26.5, description: "Valor de venda 4" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorvenda4?: number;

  @ApiPropertyOptional({ example: 25.9, description: "Valor de venda 5" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorvenda5?: number;

  @ApiPropertyOptional({ example: 24.9, description: "Valor de venda 6" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorvenda6?: number;

  @ApiPropertyOptional({ example: 22.5, description: "Valor de venda promocional" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorvendapromocao?: number;

  @ApiPropertyOptional({ example: 20.0, description: "Valor de venda atacado 1" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorvendaatacado1?: number;

  @ApiPropertyOptional({ example: 18.5, description: "Valor de custo unitario" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorcustounitario?: number;

  @ApiPropertyOptional({ example: 15.0, description: "Desconto maximo permitido (0 a 100)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  descontomaximo?: number;

  @ApiPropertyOptional({ example: false, description: "Tipo de produto: false = produto fisico, true = servico" })
  @IsOptional()
  @IsBoolean()
  tipoproduto?: boolean;

  @ApiPropertyOptional({ example: true, description: "Indica se o produto controla estoque" })
  @IsOptional()
  @IsBoolean()
  controlaestoque?: boolean;

  @ApiPropertyOptional({ example: true, description: "Indica se o produto pode ser vendido" })
  @IsOptional()
  @IsBoolean()
  vendeproduto?: boolean;

  @ApiPropertyOptional({ example: true, description: "Status ativo/inativo do produto" })
  @IsOptional()
  @IsBoolean()
  statusproduto?: boolean;
}
