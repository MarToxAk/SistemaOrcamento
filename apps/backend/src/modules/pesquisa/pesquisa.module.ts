import { Module } from "@nestjs/common";

import { PesquisaPublicController } from "./pesquisa-public.controller";
import { PesquisaService } from "./pesquisa.service";
import { ChatwootModule } from "../integrations/chatwoot/chatwoot.module";

@Module({
  imports: [ChatwootModule],
  controllers: [PesquisaPublicController],
  providers: [PesquisaService],
  exports: [PesquisaService],
})
export class PesquisaModule {}
