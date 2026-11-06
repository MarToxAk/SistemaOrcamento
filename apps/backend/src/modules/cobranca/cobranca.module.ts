import { Module } from "@nestjs/common";

import { AthosModule } from "../integrations/athos/athos.module";
import { EfiModule } from "../integrations/efi/efi.module";
import { NfseModule } from "../integrations/nfse/nfse.module";
import { CobrancaBaixaAthosService } from "./cobranca-baixa-athos.service";
import { CobrancaReconciliationJob } from "./cobranca-reconciliation.job";
import { CobrancaController } from "./cobranca.controller";
import { CobrancaService } from "./cobranca.service";
import { EmailEnvioService } from "./email-envio.service";

@Module({
  imports: [EfiModule, AthosModule, NfseModule],
  controllers: [CobrancaController],
  providers: [CobrancaService, EmailEnvioService, CobrancaReconciliationJob, CobrancaBaixaAthosService],
})
export class CobrancaModule {}

