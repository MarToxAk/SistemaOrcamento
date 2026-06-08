import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class CriarBoletoDto {
  @IsInt()
  @IsPositive()
  idclienteAthos!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  idcontasReceber!: number[];

  @IsDateString()
  expireAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  observacao?: string;
}
