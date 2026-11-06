import { ArrayMaxSize, IsArray, IsEmail, IsString } from "class-validator";

import { EMAIL_CC_MAX } from "./enviar-email-cobranca.dto";

export class SalvarCcPadraoDto {
  @IsArray()
  @ArrayMaxSize(EMAIL_CC_MAX, { message: `Máximo de ${EMAIL_CC_MAX} e-mails em cópia (CC).` })
  @IsString({ each: true })
  @IsEmail({}, { each: true, message: "Cada e-mail em cópia (CC) deve ser um e-mail válido." })
  emails!: string[];
}
