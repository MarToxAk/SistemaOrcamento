import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module";
import { EventsModule } from "../../events/events.module";
import { QuotesModule } from "../../quotes/quotes.module";
import { AthosController } from "./athos.controller";
import { AthosListenerService } from "./athos-listener.service";
import { AthosService } from "./athos.service";
import { AthosProdutoService } from "./athos-produto.service";
import { ProdutoController } from "./athos-produto.controller";

@Module({
  imports: [DatabaseModule, EventsModule, forwardRef(() => QuotesModule)],
  providers: [AthosService, AthosListenerService, AthosProdutoService],
  controllers: [AthosController, ProdutoController],
  exports: [AthosService, AthosProdutoService],
})
export class AthosModule {}
