import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateIf } from "class-validator";

const CODIGOS_SERVICO = ["130501", "140801", "240101"] as const;

export class EmitirNfseCobrancaDto {
  @IsInt()
  @IsPositive()
  idclienteAthos!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  idcontasReceber!: number[];

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

  @IsOptional()
  @IsNumber()
  @IsPositive()
  valorServico?: number;

  @IsOptional()
  @IsString()
  descricaoServico?: string;

  @IsOptional()
  @IsBoolean()
  incluirIbsCbs?: boolean;
}
