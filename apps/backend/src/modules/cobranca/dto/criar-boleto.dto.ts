import { ArrayMinSize, IsArray, IsDateString, IsInt, IsPositive } from "class-validator";

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
}
