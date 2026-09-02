import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module";
import { AthosModule } from "../athos/athos.module";
import { ChatwootModule } from "../chatwoot/chatwoot.module";
import { DanfseNacionalPdfService } from "./danfse-nacional-pdf.service";
import { DanfePdfService } from "./danfe-pdf.service";
import { DanfsePdfService } from "./danfse-pdf.service";
import { NfseController } from "./nfse.controller";
import { NfseNacionalDistribuicaoService } from "./nfse-nacional-distribuicao.service";
import { NfseNacionalService } from "./nfse-nacional.service";
import { NfseService } from "./nfse.service";

@Module({
  imports: [DatabaseModule, AthosModule, ChatwootModule],
  controllers: [NfseController],
  providers: [
    NfseService,
    NfseNacionalService,
    DanfsePdfService,
    DanfePdfService,
    DanfseNacionalPdfService,
    NfseNacionalDistribuicaoService,
  ],
  exports: [
    NfseService,
    NfseNacionalService,
    DanfsePdfService,
    DanfePdfService,
    DanfseNacionalPdfService,
    NfseNacionalDistribuicaoService,
  ],
})
export class NfseModule {}
