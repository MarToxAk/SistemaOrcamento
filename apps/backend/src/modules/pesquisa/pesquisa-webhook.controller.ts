/**
 * Fase 52 (plano 52-06): webhook de conta do Chatwoot para o opt-out "SAIR" (D-35, D-36, D-49).
 *
 * Rota propria (`/api/integrations/chatwoot/pesquisa/webhook`), autenticada por HMAC sobre o corpo
 * bruto e nao pelo guard interno (que esta desligado aqui por `@Public`). O limite e proprio e alto:
 * `message_created` dispara a cada mensagem da conta, entao o limite de 30/min do webhook de
 * fechamento descartaria SAIR num pico (P9/T-52-38) — por isso NAO reaproveita `THROTTLE_WEBHOOK`.
 *
 * Ordem: segredo -> assinatura/timestamp (antes de olhar o corpo) -> filtro da mensagem -> supressao.
 * Logs so com evento e resultado; nunca telefone completo, texto da mensagem, corpo ou segredo.
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { verificarAssinaturaChatwoot, extrairOptOut } from "./pesquisa-webhook";
import { PesquisaService } from "./pesquisa.service";
import { Public } from "../security/public.decorator";

/** P9/T-52-38: limite proprio (o global do webhook de fechamento e 30/min). */
const LIMITE_WEBHOOK_PESQUISA = { ttl: 60_000, limit: 600 };

type RequisicaoComCorpoBruto = { rawBody?: Buffer };

@ApiTags("Chatwoot Pesquisa")
@Controller("integrations/chatwoot/pesquisa")
export class PesquisaWebhookController {
  private readonly logger = new Logger(PesquisaWebhookController.name);

  constructor(
    private readonly pesquisa: PesquisaService,
    private readonly config: ConfigService,
  ) {}

  @ApiOperation({
    summary: "Webhook de conta do Chatwoot (message_created) para o opt-out SAIR",
    description:
      "Configure no Chatwoot (Account Settings > Integrations > Webhooks) a URL POST /api/integrations/chatwoot/pesquisa/webhook " +
      "com o segredo de CHATWOOT_WEBHOOK_SECRET. A assinatura X-Chatwoot-Signature e conferida sobre o corpo bruto.",
  })
  @Public()
  @Throttle({ default: LIMITE_WEBHOOK_PESQUISA })
  @Post("webhook")
  @HttpCode(200)
  async webhook(
    @Req() req: RequisicaoComCorpoBruto,
    @Headers("x-chatwoot-signature") assinatura: string | undefined,
    @Headers("x-chatwoot-timestamp") timestamp: string | undefined,
    @Body() payload: unknown,
  ): Promise<{ processed: boolean; optOut: boolean }> {
    const segredo = this.config.get<string>("CHATWOOT_WEBHOOK_SECRET");
    if (!segredo) {
      throw new InternalServerErrorException("CHATWOOT_WEBHOOK_SECRET nao configurado no servidor");
    }

    // T-52-36/T-52-37: autenticacao sobre o corpo bruto ANTES de qualquer consulta ao banco.
    const valida = verificarAssinaturaChatwoot({
      rawBody: req?.rawBody,
      timestamp,
      assinatura,
      segredo,
    });
    if (!valida) {
      throw new UnauthorizedException("Assinatura invalida");
    }

    const processado =
      payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as { event?: unknown }).event === "message_created"
        : false;

    const optOut = extrairOptOut(payload);
    if (!optOut) {
      if (processado) this.logger.log("message_created sem opt-out");
      return { processed: processado, optOut: false };
    }

    try {
      await this.pesquisa.registrarOptOut(optOut.telefone);
    } catch (err) {
      // O Chatwoot repete em erro; aqui o efeito e idempotente e a falha nao pode virar retentativa infinita.
      this.logger.error(`Falha ao registrar o opt-out: ${err instanceof Error ? err.name : "erro"}`);
      return { processed: processado, optOut: false };
    }

    this.logger.log("Opt-out registrado");
    return { processed: processado, optOut: true };
  }
}
