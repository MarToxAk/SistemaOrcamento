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
}
