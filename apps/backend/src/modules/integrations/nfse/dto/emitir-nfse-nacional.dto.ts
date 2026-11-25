import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

const CODIGOS_SERVICO = ["130501", "140801", "240101"] as const;

export class EmitirNfseNacionalDto {
  @IsIn(CODIGOS_SERVICO)
  codigoServico!: (typeof CODIGOS_SERVICO)[number];

  @ValidateIf((dto) => !dto.cnpjTomador)
  @IsString()
  @IsNotEmpty()
  cpfTomador?: string;

  @ValidateIf((dto) => !dto.cpfTomador)
  @IsString()
  @IsNotEmpty()
  cnpjTomador?: string;

  @IsString()
  @IsNotEmpty()
  nomeTomador!: string;

  @IsNumber()
  @IsPositive()
  valorServico!: number;

  @IsOptional()
  @IsString()
  descricaoServico?: string;

  @IsOptional()
  @IsBoolean()
  incluirIbsCbs?: boolean;

  // Endereco opcional do tomador, digitado manualmente no formulario de
  // emissao. Campos planos (nao um objeto aninhado) porque o ValidationPipe
  // global roda com whitelist+forbidNonWhitelisted e um objeto exigiria
  // @ValidateNested + @Type — superficie desnecessaria para cinco strings.
  // Sem UF: buildAndSignDps nao usa UF na DPS.
  @IsOptional()
  @IsString()
  enderecoLogradouro?: string;

  @IsOptional()
  @IsString()
  enderecoNumero?: string;

  @IsOptional()
  @IsString()
  enderecoBairro?: string;

  @IsOptional()
  @IsString()
  enderecoCep?: string;

  @IsOptional()
  @IsString()
  enderecoCodigoMunicipio?: string;

  // Fase 54 (D-09): liberacao por senha quando o pagamento integral nao esta confirmado.
  // O ValidationPipe global roda com whitelist+forbidNonWhitelisted (main.ts), entao campos novos
  // precisam estar declarados aqui ou a emissao toma 400. NAO existe campo para o front afirmar
  // "pago": a decisao de pagamento e so do backend. Nunca logar este DTO (carrega a senha).
  @IsOptional()
  @IsString()
  @MaxLength(200)
  senhaLiberacao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  liberadoPor?: string;
}
