import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";
import { CreateContaPagarDto } from "./create-conta-pagar.dto";

export class UpdateContaPagarDto extends PartialType(CreateContaPagarDto) {
	@ApiPropertyOptional({
		example: 1,
		description: "ID do caixa central para liquidacao automatica quando statusconta = PAG",
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	idcaixacentral?: number;
}
