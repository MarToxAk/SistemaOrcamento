import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateContaPagarDto {
  @IsString()
  @IsNotEmpty()
  descricaoconta!: string;

  @IsDateString()
  datavencimento!: string;

  @IsNumber()
  @Min(0.01)
  valorconta!: number;

  @IsOptional()
  @IsDateString()
  dataemissao?: string;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsInt()
  idfornecedor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  numerodocumento?: string;
}
