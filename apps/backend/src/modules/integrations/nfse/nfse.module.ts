import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module";
import { DanfePdfService } from "./danfe-pdf.service";
import { DanfsePdfService } from "./danfse-pdf.service";
import { NfseController } from "./nfse.controller";
import { NfseNacionalService } from "./nfse-nacional.service";
import { NfseService } from "./nfse.service";

@Module({
  imports: [DatabaseModule],
  controllers: [NfseController],
  providers: [NfseService, NfseNacionalService, DanfsePdfService, DanfePdfService],
  exports: [NfseService, NfseNacionalService, DanfsePdfService, DanfePdfService],
})
export class NfseModule {}
