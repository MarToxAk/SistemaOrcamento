import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from "class-validator";

export class CreateContaPagarDto {
  @ApiProperty({ example: "Aluguel escritorio maio/2026", description: "Descricao da conta a pagar" })
  @IsString()
  @IsNotEmpty()
  descricaoconta!: string;

  @ApiProperty({ example: "2026-05-31", description: "Data de vencimento (YYYY-MM-DD)" })
  @IsDateString()
  datavencimento!: string;

  @ApiProperty({ example: 4500.0, description: "Valor da conta (maior que 0)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  valorconta!: number;

  @ApiPropertyOptional({ example: 2, description: "ID do tipo de conta" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idtipoconta?: number;

  @ApiPropertyOptional({ example: 8, description: "ID do grupo de conta" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idgrupoconta?: number;

  @ApiPropertyOptional({ example: 3, description: "ID do subgrupo de conta" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idsubgrupoconta?: number;

  @ApiPropertyOptional({ example: 15, description: "ID da conta contabil" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idconta?: number;

  @ApiPropertyOptional({ example: 6, description: "ID do centro de custo" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idcentrocusto?: number;

  @ApiPropertyOptional({ example: "NF-001234", description: "Numero do documento" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  numerodocumento?: string;

  @ApiPropertyOptional({ example: "2026-05-01", description: "Data de emissao (YYYY-MM-DD)" })
  @IsOptional()
  @IsDateString()
  dataemissao?: string;

  @ApiPropertyOptional({ example: "Pagamento apos aprovacao", description: "Observacao livre" })
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional({ example: "AVC", description: "Status da conta" })
  @IsOptional()
  @IsString()
  @Length(1, 3)
  statusconta?: string;

  @ApiPropertyOptional({ example: 600.0, description: "Valor pago" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorpago?: number;

  @ApiPropertyOptional({ example: 12.5, description: "Juros da conta" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  jurosconta?: number;

  @ApiPropertyOptional({ example: "05", description: "Mes de competencia" })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  competenciames?: string;

  @ApiPropertyOptional({ example: "2026", description: "Ano de competencia" })
  @IsOptional()
  @IsString()
  @Length(4, 4)
  competenciaano?: string;

  @ApiPropertyOptional({ example: 15.75, description: "Desconto aplicado" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  desconto?: number;

  @ApiPropertyOptional({ example: "2026-05-11", description: "Data de pagamento (YYYY-MM-DD)" })
  @IsOptional()
  @IsDateString()
  datapagamento?: string;

  @ApiPropertyOptional({ example: 9, description: "ID do funcionario responsavel" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idfuncionario?: number;

  @ApiPropertyOptional({ example: "2026-05-01", description: "Data de lancamento (YYYY-MM-DD)" })
  @IsOptional()
  @IsDateString()
  datalancamento?: string;

  @ApiPropertyOptional({ example: true, description: "Indica se deve enviar alerta" })
  @IsOptional()
  @IsBoolean()
  enviaalerta?: boolean;

  @ApiPropertyOptional({ example: 4, description: "ID do nivel 5" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idnivel5?: number;

  @ApiPropertyOptional({ example: 42, description: "ID do fornecedor no Athos" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idfornecedor?: number;

  @ApiPropertyOptional({ example: 8.2, description: "Multa da conta" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  multaconta?: number;

  @ApiPropertyOptional({ example: 1, description: "ID da origem de pagamento" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idorigempagamento?: number;

  @ApiPropertyOptional({ example: 3, description: "ID do livro_registro (banco) para liquidacao" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idlivroregistro?: number;

  @ApiPropertyOptional({ example: "2026-05-11T10:15:00.000Z", description: "Ultima alteracao" })
  @IsOptional()
  @IsDateString()
  ultimaalteracao?: string;

  @ApiPropertyOptional({ example: false, description: "Indica se o registro foi sincronizado" })
  @IsOptional()
  @IsBoolean()
  sincronizado?: boolean;

  @ApiPropertyOptional({ example: "Conta Suzano - papel couche", description: "Historico contabil" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  historicocontabil?: string;

  @ApiPropertyOptional({ example: false, description: "Indica se deve agrupar a conta" })
  @IsOptional()
  @IsBoolean()
  agruparconta?: boolean;

  @ApiPropertyOptional({ example: 1, description: "ID da loja" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idloja?: number;

  @ApiPropertyOptional({ example: 2026, description: "ID do budget" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idbudget?: number;

  @ApiPropertyOptional({ example: true, description: "Fornecedor recorrente" })
  @IsOptional()
  @IsBoolean()
  recorrenciafornecedor?: boolean;

  @ApiPropertyOptional({ example: true, description: "Exibe mensagem de recorrencia" })
  @IsOptional()
  @IsBoolean()
  exibemsgrecorrencia?: boolean;

  @ApiPropertyOptional({ example: "12345", description: "Numero da nota" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  numeronota?: string;
}
