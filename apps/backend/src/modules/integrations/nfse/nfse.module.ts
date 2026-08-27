import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module";
import { AthosModule } from "../athos/athos.module";
import { ChatwootModule } from "../chatwoot/chatwoot.module";
import { NfseController } from "./nfse.controller";
import { NfseService } from "./nfse.service";

@Module({
  imports: [DatabaseModule, AthosModule, ChatwootModule],
  controllers: [NfseController],
  providers: [NfseService],
  exports: [NfseService],
})
export class NfseModule {}
