import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty } from "class-validator";

export class AlterarStatusProdutoDto {
  @ApiProperty({ example: true, description: "true reativa o produto, false desativa" })
  @IsBoolean()
  @IsNotEmpty()
  ativo!: boolean;
}
