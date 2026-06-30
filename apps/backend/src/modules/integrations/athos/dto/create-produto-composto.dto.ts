import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNumber, Min } from "class-validator";

export class CreateProdutoCompostoDto {
  @ApiProperty({ example: 42, description: "ID do produto detail (componente) no Athos" })
  @IsInt()
  @Type(() => Number)
  idprodutodetail!: number;

  // SCAFFOLD — decorators finais pendentes do spike (a) / Fase 40.
  // O spike (a) determina o tipo-base do DOMAIN 'quantidade' (integer vs numeric) e
  // a clausula CHECK (floor do valor). Apos o usuario colar os resultados do spike,
  // a Fase 40 vai:
  //   - Se base_type = integer: substituir @IsNumber() por @IsInt() e ajustar @Min()
  //     para o floor definido pelo CHECK (ex.: @Min(1) se CHECK VALUE > 0).
  //   - Se base_type = numeric/decimal: manter @IsNumber() e ajustar @Min() conforme o CHECK.
  // Default seguro atual: @IsNumber() + @Min(0.001) (D-01/RESEARCH §"DTO Scaffolds").
  @ApiProperty({ example: 2, description: "Quantidade do componente no kit" })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantidade!: number;
}
