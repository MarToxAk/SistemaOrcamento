import { Module } from "@nestjs/common";

import { AthosModule } from "../integrations/athos/athos.module";
import { EfiModule } from "../integrations/efi/efi.module";
import { CobrancaController } from "./cobranca.controller";
import { CobrancaService } from "./cobranca.service";

@Module({
  imports: [EfiModule, AthosModule],
  controllers: [CobrancaController],
  providers: [CobrancaService],
})
export class CobrancaModule {}
