import { Body, Controller, Get, Headers, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { EfiService } from "./efi.service";
import { Public } from "../../security/public.decorator";
import { THROTTLE_WEBHOOK } from "../../security/throttle.config";

@Controller("integrations/efi")
export class EfiController {
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
}
