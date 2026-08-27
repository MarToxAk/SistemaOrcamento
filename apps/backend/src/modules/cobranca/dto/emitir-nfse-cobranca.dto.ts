import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

export class EmitirNfseCobrancaDto {
  @IsInt()
  @IsPositive()
  idclienteAthos!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  idcontasReceber!: number[];

  @IsNumber()
  @Min(0.01)
  valor!: number;

  @IsOptional()
  @IsString()
  descricaoServico?: string;

  @IsOptional()
  @IsString()
  servicoCodigo?: string;
}
