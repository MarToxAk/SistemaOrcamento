import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsDefined } from "class-validator";

export class AlterarStatusProdutoDto {
  @ApiProperty({ example: true, description: "true reativa o produto, false desativa" })
  @IsDefined()
  @IsBoolean()
  ativo!: boolean;
}
