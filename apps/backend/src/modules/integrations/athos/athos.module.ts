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
// Phase 43 — baixa automatica de contas a receber
import { AthosContaReceberBaixaService } from "./athos-conta-receber-baixa.service";
// Phase 44 — criacao de orcamento no Athos para IA
import { AthosOrcamentoService } from "./athos-orcamento.service";
import { AthosOrcamentoController } from "./athos-orcamento.controller";

@Module({
  imports: [DatabaseModule, EventsModule, forwardRef(() => QuotesModule)],
  providers: [
    AthosService,
    AthosListenerService,
    AthosProdutoService,
    AthosDefaultsService,
    AthosProdutoCompostoService, // Phase 39
    AthosContaReceberBaixaService, // Phase 43
    AthosOrcamentoService, // Phase 44
  ],
  controllers: [
    AthosController,
    ProdutoController,
    ProdutoCompostoController, // Phase 39
    AthosOrcamentoController, // Phase 44
  ],
  exports: [AthosService, AthosProdutoService, AthosDefaultsService, AthosContaReceberBaixaService],
  // AthosOrcamentoService nao exportado (Phase 44): so o controller proprio o usa
  // AthosProdutoCompostoService nao exportado — nenhum outro modulo precisa dele no v2.5
})
export class AthosModule {}
