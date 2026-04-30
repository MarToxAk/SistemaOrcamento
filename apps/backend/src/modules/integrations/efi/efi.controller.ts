import { Body, Controller, Get, Headers, HttpCode, Post } from "@nestjs/common";

import { EfiService } from "./efi.service";

@Controller("integrations/efi")
export class EfiController {
  constructor(private readonly efiService: EfiService) {}

  @Get("status")
  getStatus() {
    return this.efiService.getIntegrationStatus();
  }

  @Post("webhook/payment")
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: unknown,
    @Headers("x-signature") signature?: string,
    @Headers("x-gn-signature") gnSignature?: string,
  ) {
    return this.efiService.processWebhook(payload, signature ?? gnSignature);
  }

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
