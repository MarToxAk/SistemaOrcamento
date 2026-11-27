import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";

/**
 * DTOs do modulo de propostas (Fase 55). Nenhum DTO aceita preco final: o servidor recalcula o preco de
 * cada item a partir do snapshot do preco base e do ajuste (T-55-20).
 */

const INT4_MAX = 2147483647;

/** Sobrescritas de cliente para o PDF (D-16). Somente estas chaves sao aceitas. */
export class ClienteOverrideDto {
  @IsOptional() @IsString() @MaxLength(200) razaoSocial?: string;
  @IsOptional() @IsString() @MaxLength(30) documento?: string;
  @IsOptional() @IsString() @MaxLength(200) logradouro?: string;
  @IsOptional() @IsString() @MaxLength(30) numero?: string;
  @IsOptional() @IsString() @MaxLength(100) complemento?: string;
  @IsOptional() @IsString() @MaxLength(100) bairro?: string;
  @IsOptional() @IsString() @MaxLength(100) cidade?: string;
  @IsOptional() @IsString() @MaxLength(2) uf?: string;
  @IsOptional() @IsString() @MaxLength(12) cep?: string;
}

/** Cabecalho da proposta: todos os campos opcionais (D-14..D-16, D-20, D-21). */
export class CreatePropostaDto {
  /** Cliente do Athos; null limpa o cliente e o snapshot. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  idclienteAthos?: number | null;

  @IsOptional() @IsString() @MaxLength(100) numeroProcesso?: string | null;
  @IsOptional() @IsString() @MaxLength(200) setorResponsavel?: string | null;

  /** Validacao de formato simples feita no servico (e-mail de orgao e opcional). */
  @IsOptional() @IsString() @MaxLength(200) contatoEmail?: string | null;

  @IsOptional() @IsString() @MaxLength(50) contatoTelefone?: string | null;

  @IsOptional() @IsInt() @Min(1) @Max(365) validadeDias?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) prazoEntregaDias?: number;

  @IsOptional() @IsString() @MaxLength(2000) observacao?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClienteOverrideDto)
  clienteOverride?: ClienteOverrideDto | null;
}

/** Adicionar item: o servidor busca preco e custo no Athos (D-01). */
export class AddItemPropostaDto {
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  idproduto!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(10000)
  quantidade!: number;
}
