import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import path from "node:path";

import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health.controller";
import { ChatwootModule } from "./integrations/chatwoot/chatwoot.module";
import { PdvModule } from "./integrations/pdv/pdv.module";
import { QuotesModule } from "./quotes/quotes.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), `.env.${process.env.NODE_ENV ?? "development"}`),
        path.resolve(process.cwd(), ".env"),
        path.resolve(process.cwd(), "../../.env"),
      ],
    }),
    DatabaseModule,
    QuotesModule,
    ChatwootModule,
    PdvModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
