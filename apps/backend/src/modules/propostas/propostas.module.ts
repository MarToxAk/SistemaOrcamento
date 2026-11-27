import { Module } from "@nestjs/common";

import { AthosModule } from "../integrations/athos/athos.module";
import { PdfTemplatesRepository } from "../pdf-templates/pdf-templates.repository";
import { PdfTemplatesService } from "../pdf-templates/pdf-templates.service";
import { QuotesModule } from "../quotes/quotes.module";
import { PropostasController } from "./propostas.controller";
import { PropostasPdfService } from "./propostas-pdf.service";
import { PropostasService } from "./propostas.service";

/**
 * Propostas comerciais para orgaos publicos (Fase 55). O DatabaseModule e global (PrismaService); o
 * AthosModule exporta AthosService e AthosOrcamentoService (leitura de produto com custo e de cliente).
 * QuotesModule exporta QuotesPdfStorageService (render hardened e MinIO); PdfTemplatesRepository nao e
 * exportado por ele, por isso e provider local (como no proprio QuotesModule), junto com
 * PdfTemplatesService (validateUpload, usado pelas rotas de previa de template do plano 55-13).
 */
@Module({
  imports: [AthosModule, QuotesModule],
  controllers: [PropostasController],
  providers: [PropostasService, PropostasPdfService, PdfTemplatesRepository, PdfTemplatesService],
})
export class PropostasModule {}
