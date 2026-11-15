import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateStatusDto {
  @IsString()
  newStatus!: string;

  @IsString()
  changedBy!: string;

  // Fase 49 (D-02): false silencia qualquer mensagem publica ao cliente; ausente vale true.
  @IsOptional()
  @IsBoolean()
  notificarCliente?: boolean;
}
