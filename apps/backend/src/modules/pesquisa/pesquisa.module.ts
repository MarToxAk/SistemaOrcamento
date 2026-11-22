import { Module } from "@nestjs/common";

import { PesquisaConfigService } from "./pesquisa-config.service";
import { PesquisaPublicController } from "./pesquisa-public.controller";
import { PesquisaService } from "./pesquisa.service";
import { ChatwootModule } from "../integrations/chatwoot/chatwoot.module";

@Module({
  imports: [ChatwootModule],
  controllers: [PesquisaPublicController],
  providers: [PesquisaService, PesquisaConfigService],
  exports: [PesquisaService, PesquisaConfigService],
})
export class PesquisaModule {}
