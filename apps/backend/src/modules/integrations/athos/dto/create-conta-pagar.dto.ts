import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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
  @ApiProperty({ example: "Aluguel escritório maio/2026", description: "Descrição da conta a pagar" })
  @IsString()
  @IsNotEmpty()
  descricaoconta!: string;

  @ApiProperty({ example: "2026-05-31", description: "Data de vencimento (YYYY-MM-DD)" })
  @IsDateString()
  datavencimento!: string;

  @ApiProperty({ example: 4500.00, description: "Valor da conta (maior que 0)" })
  @IsNumber()
  @Min(0.01)
  valorconta!: number;

  @ApiPropertyOptional({ example: "2026-05-01", description: "Data de emissão (YYYY-MM-DD)" })
  @IsOptional()
  @IsDateString()
  dataemissao?: string;

  @ApiPropertyOptional({ example: "Referente ao contrato #123", description: "Observação livre" })
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional({ example: 42, description: "ID do fornecedor no Athos" })
  @IsOptional()
  @IsInt()
  idfornecedor?: number;

  @ApiPropertyOptional({ example: "NF-001234", description: "Número do documento (max 50 chars)" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numerodocumento?: string;
}
