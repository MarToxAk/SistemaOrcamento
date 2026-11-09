import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * DTO da criacao de orcamento no Athos para IA (Fase 44, plano 44-01).
 *
 * O ValidationPipe global usa whitelist + forbidNonWhitelisted: campo sem decorator e recusado
 * com 400. O DTO nao tem forma de pagamento (D-04: pagamento sempre PIX, definido por env).
 */
export class ItemOrcamentoDto {
  @ApiProperty({ example: 29246, description: "ID do produto no Athos (idproduto). Preco vem sempre do Athos." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idproduto!: number;

  @ApiProperty({
    example: 2,
    description:
      "Quantidade (ate 3 casas decimais; fracao so para produtos que permitem fracionar). Minimo 0.001, maximo 10000.",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(10000)
  quantidade!: number;

  @ApiPropertyOptional({
    example: 9,
    description:
      "Preco unitario negociado (ate 3 casas). Abaixo do preco do Athos vira desconto da linha; acima substitui o preco. " +
      "Omitido = preco de venda do Athos.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999.999)
  valorUnitario?: number;

  @ApiPropertyOptional({
    example: 5,
    description: "Desconto em R$ da LINHA inteira (nao por unidade), ate 2 casas. Nao pode exceder o total da linha.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  descontoRS?: number;
}

export class CreateAthosOrcamentoDto {
  @ApiProperty({
    type: [ItemOrcamentoDto],
    description: "Itens do orcamento (minimo 1, maximo 200). O preco de cada item e o preco de venda atual do Athos.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ItemOrcamentoDto)
  itens!: ItemOrcamentoDto[];

  @ApiPropertyOptional({
    example: "Cliente pediu entrega na sexta",
    description: "Observacao livre (acentos e simbolos sao removidos). Gravada com o prefixo [IA].",
    maxLength: 1500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  obs?: string;

  @ApiPropertyOptional({
    example: 2641,
    description: "ID do cliente no Athos (idcliente). Opcional: o orcamento PIX nao exige cliente. Inexistente -> 422 CLIENTE_INEXISTENTE.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idcliente?: number;

  @ApiPropertyOptional({
    example: 2.98,
    description:
      "Desconto global em R$ (ate 2 casas), rateado entre as linhas proporcionalmente ao valor liquido. " +
      "Nao pode exceder a soma dos liquidos nem o limite percentual de conf_vendas.permitedescontode do Athos.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  descontoTotalRS?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      "Quando true, calcula e valida tudo como na criacao mas NAO grava nada e NAO consome numero do Balcao " +
      "(transacao somente leitura). Funciona mesmo com a escrita desabilitada. idorcamento e senhabalcao voltam null.",
  })
  @IsOptional()
  @IsBoolean()
  simular?: boolean;
}
