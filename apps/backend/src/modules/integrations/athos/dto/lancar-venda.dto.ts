import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

/** Corpo do lancamento da venda do orcamento no Athos (Fase 53). */
export class LancarVendaDto {
  @ApiProperty({ example: 3, description: "Funcionario do PDV que fez a venda (idvendedor/idfuncionariousuario)." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idvendedor!: number;

  @ApiProperty({ example: 3, description: "Terminal do PDV." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idterminal!: number;

  @ApiProperty({ example: 291, description: "Caixa aberto do terminal (caixa_movimento com status ABE)." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idcaixaMovimento!: number;

  @ApiPropertyOptional({ example: 11.5, description: "Desconto total do cupom em R$ (ate 2 casas). Padrao 0." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999)
  descontoCupom?: number;

  @ApiPropertyOptional({ example: 5, description: "Forma de pagamento. So a 5 (a vista) e aceita." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idformapagamento?: number;

  @ApiPropertyOptional({
    example: true,
    description: "Padrao true: so simula, sem gravar. Para gravar envie false (e ATHOS_VENDA_AUTOMATICA=true no servidor).",
  })
  @IsOptional()
  @IsBoolean()
  simular?: boolean;
}
