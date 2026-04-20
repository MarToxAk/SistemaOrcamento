import { IsString } from "class-validator";

export class UpdateStatusDto {
  @IsString()
  newStatus!: string;

  @IsString()
  changedBy!: string;
}
