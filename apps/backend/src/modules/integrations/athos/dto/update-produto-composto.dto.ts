import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, Min } from "class-validator";

export class UpdateProdutoCompostoDto {
  @ApiProperty({ example: 3, description: "Nova quantidade do componente no kit" })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantidade!: number;
}
