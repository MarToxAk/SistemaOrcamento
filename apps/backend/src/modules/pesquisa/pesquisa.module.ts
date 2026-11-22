import { Module } from "@nestjs/common";

import { PesquisaConfigService } from "./pesquisa-config.service";
import { PesquisaCupomService } from "./pesquisa-cupom.service";
import { PesquisaPublicController } from "./pesquisa-public.controller";
import { PesquisaResultadosService } from "./pesquisa-resultados.service";
import { PesquisaService } from "./pesquisa.service";
import { ChatwootModule } from "../integrations/chatwoot/chatwoot.module";

@Module({
  imports: [ChatwootModule],
  controllers: [PesquisaPublicController],
  providers: [PesquisaService, PesquisaConfigService, PesquisaCupomService, PesquisaResultadosService],
  exports: [PesquisaService, PesquisaConfigService, PesquisaCupomService, PesquisaResultadosService],
})
export class PesquisaModule {}
