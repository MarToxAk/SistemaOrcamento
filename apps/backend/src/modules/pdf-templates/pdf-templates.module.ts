import { Module } from "@nestjs/common";

import { QuotesModule } from "../quotes/quotes.module";
import { PdfTemplatesController } from "./pdf-templates.controller";
import { PdfTemplatesService } from "./pdf-templates.service";

/**
 * PdfTemplatesModule — gerenciamento de templates PDF (D-01/D-03/D-04/D-08).
 *
 * Importa QuotesModule para reutilizar QuotesPdfStorageService no endpoint
 * de preview (renderPreviewPdf) — decisão única, sem provedor compartilhado
 * alternativo (resolve W3). DatabaseModule é @Global() e não precisa ser
 * importado aqui (PrismaService já disponível via DI global).
 */
@Module({
  imports: [QuotesModule],
  controllers: [PdfTemplatesController],
  providers: [PdfTemplatesService],
})
export class PdfTemplatesModule {}
