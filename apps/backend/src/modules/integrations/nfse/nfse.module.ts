import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module";
import { NfseController } from "./nfse.controller";
import { NfseService } from "./nfse.service";

@Module({
  imports: [DatabaseModule],
  controllers: [NfseController],
  providers: [NfseService],
  exports: [NfseService],
})
export class NfseModule {}
