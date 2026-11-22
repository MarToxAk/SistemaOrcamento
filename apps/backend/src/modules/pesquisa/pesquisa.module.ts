import { Module } from "@nestjs/common";

import { PesquisaAdminController } from "./pesquisa-admin.controller";
import { PesquisaConfigService } from "./pesquisa-config.service";
import { PesquisaCupomService } from "./pesquisa-cupom.service";
import { PesquisaPublicController } from "./pesquisa-public.controller";
import { PesquisaResultadosService } from "./pesquisa-resultados.service";
import { PesquisaRevogacaoService } from "./pesquisa-revogacao.service";
import { PesquisaService } from "./pesquisa.service";
import { ChatwootModule } from "../integrations/chatwoot/chatwoot.module";

@Module({
  imports: [ChatwootModule],
  controllers: [PesquisaPublicController, PesquisaAdminController],
  providers: [
    PesquisaService,
    PesquisaConfigService,
    PesquisaCupomService,
    PesquisaResultadosService,
    PesquisaRevogacaoService,
  ],
  exports: [PesquisaService, PesquisaConfigService, PesquisaCupomService, PesquisaResultadosService, PesquisaRevogacaoService],
})
export class PesquisaModule {}
