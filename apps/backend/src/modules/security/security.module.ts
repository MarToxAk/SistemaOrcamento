import { Global, Module } from "@nestjs/common";

import { EfiWebhookGuard } from "./efi-webhook.guard";
import { InternalAuthGuard } from "./internal-auth.guard";

@Global()
@Module({
  providers: [InternalAuthGuard, EfiWebhookGuard],
  exports: [InternalAuthGuard, EfiWebhookGuard],
})
export class SecurityModule {}
