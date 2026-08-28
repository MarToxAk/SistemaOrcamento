import { ArrayMinSize, IsArray, IsEmail, IsInt, IsOptional, IsPositive } from "class-validator";

export class EnviarEmailCobrancaDto {
  @IsInt()
  @IsPositive()
  idclienteAthos!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  cobrancaBoletoId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  nfseEmitidaIds?: number[];

  @IsOptional()
  @IsEmail()
  destinatario?: string;
}
