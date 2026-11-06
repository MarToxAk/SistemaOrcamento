import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from "class-validator";

// Limite de e-mails em copia (CC) por envio (D-02). Espelhado no frontend.
export const EMAIL_CC_MAX = 10;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EMAIL_CC_MAX, { message: `Máximo de ${EMAIL_CC_MAX} e-mails em cópia (CC).` })
  @IsString({ each: true })
  @IsEmail({}, { each: true, message: "Cada e-mail em cópia (CC) deve ser um e-mail válido." })
  cc?: string[];
}
