import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class UploadContaPagarAnexoDto {
  @ApiPropertyOptional({ example: 1, description: "ID do funcionário responsável pelo upload (default: 1)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idfuncionario?: number;
}
