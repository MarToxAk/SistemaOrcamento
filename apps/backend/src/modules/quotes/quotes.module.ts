import { Module } from "@nestjs/common";


import { QuotesController } from "./quotes.controller";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
import { QuotesService } from "./quotes.service";
import { AthosModule } from "../integrations/athos/athos.module";

@Module({
  imports: [AthosModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuotesPdfStorageService],
  exports: [QuotesService],
})
export class QuotesModule {}
