import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module";
import { EventsModule } from "../../events/events.module";
import { QuotesModule } from "../../quotes/quotes.module";
import { AthosController } from "./athos.controller";
import { AthosListenerService } from "./athos-listener.service";
import { AthosService } from "./athos.service";
import { AthosProdutoService } from "./athos-produto.service";
import { ProdutoController } from "./athos-produto.controller";
import { AthosDefaultsService } from "./athos-defaults.service";
// Phase 39 — produto_composto read API
import { AthosProdutoCompostoService } from "./athos-produto-composto.service";
import { ProdutoCompostoController } from "./athos-produto-composto.controller";

@Module({
  imports: [DatabaseModule, EventsModule, forwardRef(() => QuotesModule)],
  providers: [
    AthosService,
    AthosListenerService,
    AthosProdutoService,
    AthosDefaultsService,
    AthosProdutoCompostoService, // Phase 39
  ],
  controllers: [
    AthosController,
    ProdutoController,
    ProdutoCompostoController, // Phase 39
  ],
  exports: [AthosService, AthosProdutoService, AthosDefaultsService],
  // AthosProdutoCompostoService nao exportado — nenhum outro modulo precisa dele no v2.5
})
export class AthosModule {}
