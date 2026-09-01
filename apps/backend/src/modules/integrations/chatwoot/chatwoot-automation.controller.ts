import { Body, Controller, Get, HttpCode, InternalServerErrorException, Logger, Param, Post, Put, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { timingSafeEqual } from "crypto";

import { ChatwootAutomationService, ChatwootAutomationWebhookPayload } from "./chatwoot-automation.service";
import { UpdateChatwootAutomationConfigDto } from "./dto/update-chatwoot-automation-config.dto";
import { AdminOnly } from "../../security/admin.decorator";
import { Public } from "../../security/public.decorator";
import { THROTTLE_WEBHOOK } from "../../security/throttle.config";

// Substitui o fluxo que rodava no n8n (workflow "My workflow 12"): Chatwoot chama este
// webhook no evento automation_event.conversation_resolved. O token no path funciona como
// segredo (mesmo papel do path aleatorio do webhook n8n) — configure no Chatwoot a URL
// completa com o CHATWOOT_AUTOMATION_WEBHOOK_TOKEN configurado no .env.
@ApiTags("Chatwoot Automation")
@Controller("integrations/chatwoot/automation")
export class ChatwootAutomationController {
  private readonly logger = new Logger(ChatwootAutomationController.name);

  constructor(private readonly automationService: ChatwootAutomationService) {}

  private validateWebhookToken(token: string): void {
    const expected = process.env.CHATWOOT_AUTOMATION_WEBHOOK_TOKEN;
    if (!expected) {
      throw new InternalServerErrorException("CHATWOOT_AUTOMATION_WEBHOOK_TOKEN nao configurado no servidor");
    }
    const providedBuf = Buffer.from(token ?? "", "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    const isValid = providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
    if (!isValid) {
      throw new UnauthorizedException("Token invalido");
    }
  }

  @ApiOperation({
    summary: "Webhook de automacao do Chatwoot (fechamento de conversa)",
    description:
      "Configure no Chatwoot (Automation > conversation_resolved) a URL: POST /integrations/chatwoot/automation/webhook/<token>. Substitui o workflow n8n equivalente.",
  })
  @Public()
  @Throttle({ default: THROTTLE_WEBHOOK })
  @Post("webhook/:token")
  @HttpCode(200)
  async webhook(@Param("token") token: string, @Body() payload: ChatwootAutomationWebhookPayload) {
    this.validateWebhookToken(token);
    try {
      return await this.automationService.handleConversationResolved(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erro ao processar webhook de fechamento de conversa: ${msg}`);
      return { processed: false, error: msg };
    }
  }

  @ApiOperation({ summary: "Ler o prompt/texto atual da automacao de fechamento" })
  @ApiOkResponse({ description: "Configuracao atual" })
  @AdminOnly()
  @Get("config")
  async getConfig() {
    return this.automationService.getConfig();
  }

  @ApiOperation({ summary: "Atualizar o prompt/texto da automacao de fechamento" })
  @ApiOkResponse({ description: "Configuracao atualizada" })
  @AdminOnly()
  @Put("config")
  async updateConfig(@Body() dto: UpdateChatwootAutomationConfigDto) {
    return this.automationService.updateConfig(dto);
  }
}
