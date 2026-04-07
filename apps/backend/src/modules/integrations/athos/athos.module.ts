import { Module } from "@nestjs/common";
import { AthosService } from "./athos.service";

@Module({
  providers: [AthosService],
  exports: [AthosService],
})
export class AthosModule {}
