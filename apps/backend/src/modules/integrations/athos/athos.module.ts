import { Module } from "@nestjs/common";
import { AthosService } from "./athos.service";
import { AthosController } from "./athos.controller";

@Module({
  providers: [AthosService],
  controllers: [AthosController],
  exports: [AthosService],
})
export class AthosModule {}
