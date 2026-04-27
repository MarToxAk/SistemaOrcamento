import { Module, forwardRef } from "@nestjs/common";
import { QuotesController } from "./quotes.controller";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
import { QuotesService } from "./quotes.service";
import { AthosModule } from "../integrations/athos/athos.module";
import { ChatwootModule } from "../integrations/chatwoot/chatwoot.module";
import { EfiModule } from "../integrations/efi/efi.module";

@Module({
  imports: [
    forwardRef(() => AthosModule),
    forwardRef(() => ChatwootModule),
    forwardRef(() => EfiModule),
  ],
  controllers: [QuotesController],
  providers: [QuotesService, QuotesPdfStorageService],
  exports: [QuotesService],
})
export class QuotesModule {}
