import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNumber, Min } from "class-validator";

export class CreateProdutoCompostoDto {
  @ApiProperty({ example: 42, description: "ID do produto detail (componente) no Athos" })
  @IsInt()
  @Type(() => Number)
  idprodutodetail!: number;

  // Spike (a) confirmou: DOMAIN 'quantidade' = numeric(9,3) SEM clausula CHECK.
  // @IsNumber() + @Min(0.001) e o floor seguro (nao ha CHECK de dominio).
  // Valores > 999999.999 ou com mais de 3 casas decimais dao pg error 22003 (overflow numeric).
  @ApiProperty({ example: 2, description: "Quantidade do componente no kit (numeric 9,3; min 0.001)" })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantidade!: number;
}
