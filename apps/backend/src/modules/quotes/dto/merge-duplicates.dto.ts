import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";

export class MergeDuplicatesDto {
  @IsNumber()
  externalQuoteId!: number;

  @IsOptional()
  @IsString()
  keepId?: string;

  @IsOptional()
  @IsIn(["oldest", "newest"])
  strategy?: "oldest" | "newest";
}
