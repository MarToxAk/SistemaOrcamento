import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import path from "node:path";

import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health.controller";
import { ChatwootModule } from "./integrations/chatwoot/chatwoot.module";
import { EfiModule } from "./integrations/efi/efi.module";
import { NfseModule } from "./integrations/nfse/nfse.module";
import { PdvModule } from "./integrations/pdv/pdv.module";
import { QuotesModule } from "./quotes/quotes.module";
import { LoggingInterceptor } from "./common/logging.interceptor";
import { InternalAuthGuard } from "./security/internal-auth.guard";
import { SecurityModule } from "./security/security.module";
import { THROTTLE_DEFAULT } from "./security/throttle.config";

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "INTERNAL_API_KEY",
  "CHATWOOT_BASE_URL",
  "CHATWOOT_API_TOKEN",
  "CHATWOOT_ACCOUNT_ID",
  "NFSE_TOKEN",
] as const;

function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = config[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), `.env.${process.env.NODE_ENV ?? "development"}`),
        path.resolve(process.cwd(), ".env"),
        path.resolve(process.cwd(), "../../.env"),
      ],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: THROTTLE_DEFAULT.ttl,
        limit: THROTTLE_DEFAULT.limit,
      },
    ]),
    SecurityModule,
    DatabaseModule,
    QuotesModule,
    ChatwootModule,
    EfiModule,
    NfseModule,
    PdvModule,
  ],
  controllers: [HealthController],
  providers: [    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: InternalAuthGuard,
    },
  ],
})
export class AppModule {}
