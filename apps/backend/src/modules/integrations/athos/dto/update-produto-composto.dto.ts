import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, Min } from "class-validator";

export class UpdateProdutoCompostoDto {
  // SCAFFOLD — decorators finais pendentes do spike (a) / Fase 40.
  // Mesma pendencia de CreateProdutoCompostoDto.quantidade: o tipo-base do DOMAIN
  // 'quantidade' e o floor do CHECK serao definidos apos o usuario colar os
  // resultados do spike (a) no RESEARCH.md. A Fase 40 finaliza os decorators.
  // Default seguro atual: @IsNumber() + @Min(0.001).
  @ApiProperty({ example: 3, description: "Nova quantidade do componente no kit" })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantidade!: number;
}
