import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health.controller";
import { ChatwootModule } from "./integrations/chatwoot/chatwoot.module";
import { PdvModule } from "./integrations/pdv/pdv.module";
import { QuotesModule } from "./quotes/quotes.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? "development"}`, ".env"],
    }),
    DatabaseModule,
    QuotesModule,
    ChatwootModule,
    PdvModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
