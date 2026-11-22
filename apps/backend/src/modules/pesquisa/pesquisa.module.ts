import { Module } from "@nestjs/common";

import { PesquisaAdminController } from "./pesquisa-admin.controller";
import { PesquisaConfigService } from "./pesquisa-config.service";
import { PesquisaCupomService } from "./pesquisa-cupom.service";
import { PesquisaPublicController } from "./pesquisa-public.controller";
import { PesquisaRetencaoJob } from "./pesquisa-retencao.job";
import { PesquisaResultadosService } from "./pesquisa-resultados.service";
import { PesquisaRetryJob } from "./pesquisa-retry.job";
import { PesquisaRevogacaoService } from "./pesquisa-revogacao.service";
import { PesquisaService } from "./pesquisa.service";
import { PesquisaWebhookController } from "./pesquisa-webhook.controller";
import { ChatwootModule } from "../integrations/chatwoot/chatwoot.module";

@Module({
  imports: [ChatwootModule],
  controllers: [PesquisaPublicController, PesquisaAdminController, PesquisaWebhookController],
  providers: [
    PesquisaService,
    PesquisaConfigService,
    PesquisaCupomService,
    PesquisaResultadosService,
    PesquisaRevogacaoService,
    PesquisaRetryJob,
    PesquisaRetencaoJob,
  ],
  exports: [PesquisaService, PesquisaConfigService, PesquisaCupomService, PesquisaResultadosService, PesquisaRevogacaoService],
})
export class PesquisaModule {}
