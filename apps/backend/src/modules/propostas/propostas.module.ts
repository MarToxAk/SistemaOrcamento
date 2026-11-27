import { Module } from "@nestjs/common";

import { AthosModule } from "../integrations/athos/athos.module";
import { PropostasController } from "./propostas.controller";
import { PropostasService } from "./propostas.service";

/**
 * Propostas comerciais para orgaos publicos (Fase 55). O DatabaseModule e global (PrismaService); o
 * AthosModule exporta AthosService e AthosOrcamentoService (leitura de produto com custo e de cliente).
 * QuotesModule e os providers de PDF entram no plano 55-07.
 */
@Module({
  imports: [AthosModule],
  controllers: [PropostasController],
  providers: [PropostasService],
})
export class PropostasModule {}
