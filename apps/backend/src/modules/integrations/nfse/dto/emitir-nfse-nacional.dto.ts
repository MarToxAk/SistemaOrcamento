import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateIf } from "class-validator";

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
}
