import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module";
import { EventsModule } from "../../events/events.module";
import { AthosController } from "./athos.controller";
import { AthosListenerService } from "./athos-listener.service";
import { AthosService } from "./athos.service";

@Module({
  imports: [DatabaseModule, EventsModule],
  providers: [AthosService, AthosListenerService],
  controllers: [AthosController],
  exports: [AthosService],
})
export class AthosModule {}
