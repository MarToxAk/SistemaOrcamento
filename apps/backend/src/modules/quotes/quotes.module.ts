import { Module, forwardRef } from "@nestjs/common";
import { QuotesController } from "./quotes.controller";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
import { QuotesService } from "./quotes.service";
import { AthosModule } from "../integrations/athos/athos.module";
import { ChatwootModule } from "../integrations/chatwoot/chatwoot.module";
import { EfiModule } from "../integrations/efi/efi.module";
import { EventsModule } from "../events/events.module";
import { PdfTemplatesRepository } from "../pdf-templates/pdf-templates.repository";

@Module({
  imports: [
    forwardRef(() => AthosModule),
    forwardRef(() => ChatwootModule),
    forwardRef(() => EfiModule),
    EventsModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService, QuotesPdfStorageService, PdfTemplatesRepository],
  // QuotesPdfStorageService exportado para que PdfTemplatesModule (Plano 05)
  // importe QuotesModule e reutilize o render hardened no endpoint de preview (D-08).
  exports: [QuotesService, QuotesPdfStorageService],
})
export class QuotesModule {}
