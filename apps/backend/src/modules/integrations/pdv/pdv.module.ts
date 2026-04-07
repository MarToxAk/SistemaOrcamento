import { Module } from "@nestjs/common";

import { PdvController } from "./pdv.controller";
import { PdvService } from "./pdv.service";

@Module({
  controllers: [PdvController],
  providers: [PdvService],
  exports: [PdvService],
})
export class PdvModule {}
