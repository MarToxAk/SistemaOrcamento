import { Transform, Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsPositive } from "class-validator";

// Campos chegam como string via multipart/form-data (upload do XML da NFS-e).
export class AnexarNfseCobrancaDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  idclienteAthos!: number;

  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  idcontasReceber!: number[];
}
