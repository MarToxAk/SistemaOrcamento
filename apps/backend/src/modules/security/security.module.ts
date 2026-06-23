import { Global, Module } from "@nestjs/common";

import { AdminAuthGuard } from "./admin-auth.guard";
import { EfiWebhookGuard } from "./efi-webhook.guard";
import { InternalAuthGuard } from "./internal-auth.guard";

@Global()
@Module({
  providers: [InternalAuthGuard, EfiWebhookGuard, AdminAuthGuard],
  exports: [InternalAuthGuard, EfiWebhookGuard, AdminAuthGuard],
})
export class SecurityModule {}
