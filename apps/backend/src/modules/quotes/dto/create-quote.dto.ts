import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

class QuoteProductDto {
  @IsOptional()
  @IsNumber()
  idproduto?: number;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  descricaocurta?: string;

  @IsString()
  descricaoproduto!: string;
}

class CreateQuoteChildItemDto {
  @IsOptional()
  @IsNumber()
  idorcamentoitem?: number;

  @IsOptional()
  @IsNumber()
  sequenciaitem?: number;

  @ValidateNested()
  @Type(() => QuoteProductDto)
  produto!: QuoteProductDto;

  @IsNumber()
  @Min(0.01)
  quantidadeitem!: number;

  @IsNumber()
  @Min(0)
  valoritem!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valordesconto?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  orcamentovalorfinalitem?: number;
}

class CreateQuoteItemDto {
  @IsOptional()
  @IsNumber()
  idorcamentoitem?: number;

  @IsOptional()
  @IsNumber()
  sequenciaitem?: number;

  @ValidateNested()
  @Type(() => QuoteProductDto)
  produto!: QuoteProductDto;

  @IsNumber()
  @Min(0.01)
  quantidadeitem!: number;

  @IsNumber()
  @Min(0)
  valoritem!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valordesconto?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  orcamentovalorfinalitem?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteChildItemDto)
  filhos?: CreateQuoteChildItemDto[];
}

class CreateCustomerDto {
  @IsString()
  nome!: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

class CreateQuoteStampItemDto {
  @IsNumber()
  numero!: number;

  @IsString()
  carimbo!: string;

  @IsOptional()
  @IsString()
  dimensoes?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}

class CreateQuoteStampsDto {
  @IsOptional()
  @IsNumber()
  quantidade_total?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteStampItemDto)
  itens!: CreateQuoteStampItemDto[];
}

class CreateQuoteTotalsDto {
  @IsOptional()
  @IsNumber()
  valor?: number;

  @IsOptional()
  @IsNumber()
  desconto?: number;

  @IsOptional()
  @IsNumber()
  valoracrescimo?: number;
}

export class CreateQuoteDto {
  @IsOptional()
  @IsNumber()
  idorcamento_interno?: number;

  @IsOptional()
  @IsNumber()
  idorcamento?: number;

  @IsOptional()
  @IsDateString()
  dataorcamento?: string;

  @IsOptional()
  @IsDateString()
  dataEdicao?: string;

  @IsOptional()
  @IsNumber()
  idvendedor?: number;

  @IsOptional()
  @IsString()
  vendedorNome?: string;

  @IsOptional()
  @IsNumber()
  conversationId?: number;

  @IsOptional()
  @IsNumber()
  chatwootContactId?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerDto)
  customer?: CreateCustomerDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerDto)
  cliente?: CreateCustomerDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  items?: CreateQuoteItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  itens?: CreateQuoteItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateQuoteStampsDto)
  carimbos?: CreateQuoteStampsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateQuoteTotalsDto)
  totais?: CreateQuoteTotalsDto;

  @IsOptional()
  @IsString()
  validade?: string;

  @IsOptional()
  @IsDateString()
  prazoEntrega?: string;

  @IsOptional()
  @IsString()
  condicaoPagamento?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsString()
  source?: "MANUAL" | "PDV" | "CHATWOOT";
}
