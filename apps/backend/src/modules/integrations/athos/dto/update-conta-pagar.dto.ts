import { PartialType } from "@nestjs/swagger";
import { CreateContaPagarDto } from "./create-conta-pagar.dto";

export class UpdateContaPagarDto extends PartialType(CreateContaPagarDto) {}
