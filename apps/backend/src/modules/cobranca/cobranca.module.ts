import { Module } from "@nestjs/common";

import { AthosModule } from "../integrations/athos/athos.module";
import { EfiModule } from "../integrations/efi/efi.module";
import { NfseModule } from "../integrations/nfse/nfse.module";
import { CobrancaController } from "./cobranca.controller";
import { CobrancaService } from "./cobranca.service";

@Module({
  imports: [EfiModule, AthosModule, NfseModule],
  controllers: [CobrancaController],
  providers: [CobrancaService],
})
export class CobrancaModule {}
