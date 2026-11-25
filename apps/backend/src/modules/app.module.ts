import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import path from "node:path";

import { DatabaseModule } from "./database/database.module";
import { EventsModule } from "./events/events.module";
import { HealthController } from "./health.controller";
import { ChatwootModule } from "./integrations/chatwoot/chatwoot.module";
import { EfiModule } from "./integrations/efi/efi.module";
import { AthosModule } from "./integrations/athos/athos.module";
import { NfseModule } from "./integrations/nfse/nfse.module";
import { PdvModule } from "./integrations/pdv/pdv.module";
import { PesquisaModule } from "./pesquisa/pesquisa.module";
import { QuotesModule } from "./quotes/quotes.module";
import { PdfTemplatesModule } from "./pdf-templates/pdf-templates.module";
import { validateEnv } from "./common/env-validation";
import { LoggingInterceptor } from "./common/logging.interceptor";
import { InternalAuthGuard } from "./security/internal-auth.guard";
import { SecurityModule } from "./security/security.module";
import { THROTTLE_DEFAULT } from "./security/throttle.config";
import { CobrancaModule } from "./cobranca/cobranca.module";

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
    EventsModule,
    QuotesModule,
    ChatwootModule,
    EfiModule,
    AthosModule,
    NfseModule,
    PdvModule,
    ScheduleModule.forRoot(),
    CobrancaModule,
    PdfTemplatesModule,
    PesquisaModule,
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
