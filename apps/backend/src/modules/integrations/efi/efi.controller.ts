import { Body, Controller, Get, Headers, HttpCode, Logger, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { EfiService } from "./efi.service";
import { Public } from "../../security/public.decorator";
import { THROTTLE_WEBHOOK } from "../../security/throttle.config";

@Controller("integrations/efi")
export class EfiController {
  private readonly logger = new Logger(EfiController.name);

  constructor(private readonly efiService: EfiService) {}

  @Get("status")
  getStatus() {
    return this.efiService.getIntegrationStatus();
  }

  @Public()
  @Throttle({ default: THROTTLE_WEBHOOK })
  @Post("webhook/payment")
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: unknown,
    @Headers("x-signature") signature?: string,
    @Headers("x-gn-signature") gnSignature?: string,
  ) {
    return this.efiService.processWebhook(payload, signature ?? gnSignature);
  }

  @Public()
  @Throttle({ default: THROTTLE_WEBHOOK })
  @Post("webhook/payment/pix")
  @HttpCode(200)
  async handleWebhookPix(
    @Body() payload: unknown,
    @Headers("x-signature") signature?: string,
    @Headers("x-gn-signature") gnSignature?: string,
  ) {
    return this.efiService.processWebhook(payload, signature ?? gnSignature);
  }

  /**
   * Webhook EFI — notificacao de pagamento por cartao de credito (API Cobrancas).
   * Payload: { notification: "<token>" } — diferente do payload PIX ({ pix: [...] }).
   * Deve retornar HTTP 200 sempre (sem auth), mesmo em caso de erro interno.
   */
  @Public()
  @Throttle({ default: THROTTLE_WEBHOOK })
  @Post("webhook/payment/card")
  @HttpCode(200)
  async handleWebhookCard(
    @Body() body: { notification?: string },
    @Query("notification") notificationQuery?: string,
  ): Promise<{ ok: boolean }> {
    const token = body?.notification ?? notificationQuery ?? "";
    try {
      await this.efiService.processCardWebhook(token);
    } catch (err: unknown) {
      this.logger.error(`Erro inesperado no webhook EFI (cartao): ${String(err)}`);
    }
    return { ok: true };
  }
}
