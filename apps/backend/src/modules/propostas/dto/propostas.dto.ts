import { Transform, Type } from "class-transformer";
import { PropostaStatus } from "@prisma/client";
import {
  Equals,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
  MinLength,
  ValidationArguments,
  registerDecorator,
  ValidateNested,
} from "class-validator";

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

/** Atualizacao parcial do cabecalho (rascunho): mesmos campos da criacao; null limpa o campo. */
export class UpdatePropostaDto extends CreatePropostaDto {}

/**
 * Ajuste de preco de um item. PERCENTUAL: porcentagem sobre o preco base (-99.999 a 1000). VALOR: o novo preco
 * unitario final em reais (substitui o preco base, nao e acrescimo, D-02a). NENHUM: volta ao preco base.
 */
export class AjusteItemDto {
  @IsIn(["PERCENTUAL", "VALOR", "NENHUM"])
  tipo!: "PERCENTUAL" | "VALOR" | "NENHUM";

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: "valor deve ser numero: percentual (ate 3 casas) ou preco unitario em reais (ate 2 casas)" },
  )
  @Min(-99.999, { message: "valor abaixo do minimo: percentual maior que -100 ou preco unitario maior que zero" })
  @Max(1000000, { message: "valor acima do maximo aceito para percentual ou preco unitario" })
  valor?: number;
}

/** Edicao de item em rascunho: nunca recebe preco final (T-55-20). */
export class UpdateItemPropostaDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(10000)
  quantidade?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome?: string;

  /** Vazio ou null limpa a descricao curta. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  descricaoCurta?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AjusteItemDto)
  ajuste?: AjusteItemDto;
}

/** Aplicar a mesma porcentagem ao preco base de todos os itens (D-11). 0 limpa os ajustes. */
export class AplicarPercentualDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(-99.999)
  @Max(1000)
  percentual!: number;
}

/** Filtros da listagem (paginada, tamanho maximo 100). */
export class ListarPropostasQueryDto {
  @IsOptional()
  @IsEnum(PropostaStatus)
  status?: PropostaStatus;

  /** Numero do orcamento (numerico) ou nome do cliente. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  tamanho?: number;
}

/**
 * Preview de template da familia PROPOSTA: `source` direto (validado por validateUpload no controller) ou
 * `templateId` de um template salvo. Ao menos um dos dois e exigido no controller.
 */
export class PreviewTemplatePropostaDto {
  @IsOptional() @IsString() @MaxLength(200000) source?: string;
  @IsOptional() @IsString() @MaxLength(100) templateId?: string;
}

/** Marcar a proposta como FECHADA ou CANCELADA manualmente (D-06). Nenhum outro status e aceito. */
export class AtualizarStatusPropostaDto {
  @IsIn(["FECHADA", "CANCELADA"], { message: "status deve ser FECHADA ou CANCELADA" })
  status!: "FECHADA" | "CANCELADA";
}

/**
 * Gerar a proposta (lancar no Athos + PDF oficial, D-07). `confirmar` e a confirmacao explicita do botao
 * "Gerar proposta e lancar no Athos" e tambem e exigida no servidor. Assinante do documento (D-19).
 */
export class GerarPropostaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  assinanteNome!: string;

  @IsOptional() @IsString() @MaxLength(120) assinanteCargo?: string;
  @IsOptional() @IsString() @MaxLength(20) assinanteCpf?: string;

  @Equals(true, { message: "confirmar deve ser true: a geracao lanca o orcamento no Athos e nao pode ser desfeita" })
  confirmar!: boolean;
}

/**
 * Dados bancarios impressos no PDF da proposta (D-18), editados em Configuracoes > Propostas.
 * Ficam SO no banco do Sistema (o repositorio e publico); nunca em migration, seed ou codigo.
 */
const aparar = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const apararMaiusculo = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, "").toUpperCase() : value;

/** CPF (11 digitos) ou CNPJ (14 digitos) com digitos verificadores validos; pontuacao opcional. */
export function documentoCpfCnpjValido(valor: unknown): boolean {
  if (typeof valor !== "string" || !/^[0-9./\- ]+$/.test(valor)) return false;
  const d = valor.replace(/\D/g, "");
  if (/^(\d)\1+$/.test(d)) return false;
  const dv = (base: string, pesos: number[]) => {
    const soma = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (d.length === 11) {
    const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    const p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    return dv(d, p1) === Number(d[9]) && dv(d, p2) === Number(d[10]);
  }
  if (d.length === 14) {
    const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return dv(d, p1) === Number(d[12]) && dv(d, p2) === Number(d[13]);
  }
  return false;
}

function IsCpfCnpj() {
  return (alvo: object, propriedade: string) =>
    registerDecorator({
      name: "isCpfCnpj",
      target: alvo.constructor,
      propertyName: propriedade,
      options: { message: (a: ValidationArguments) => `${a.property}: CPF ou CNPJ invalido` },
      validator: { validate: (v: unknown) => documentoCpfCnpjValido(v) },
    });
}

export class SalvarConfigBancariaDto {
  @Transform(aparar) @IsString() @MinLength(2) @MaxLength(80) bancoNome!: string;
  /** Agencia: 3 a 6 digitos, opcionalmente com digito verificador (ex. 1234 ou 1234-5). */
  @Transform(apararMaiusculo) @IsString() @Matches(/^\d{3,6}(-?[0-9X])?$/, { message: "agencia invalida" }) agencia!: string;
  /** Conta: 3 a 13 digitos, opcionalmente com digito verificador (ex. 13005559-4 ou 123456-X). */
  @Transform(apararMaiusculo) @IsString() @Matches(/^\d{3,13}(-?[0-9X])?$/, { message: "conta invalida" }) conta!: string;
  @Transform(aparar) @IsString() @MinLength(2) @MaxLength(200) titular!: string;
  @Transform(aparar) @IsString() @MaxLength(20) @IsCpfCnpj() documentoTitular!: string;
}
