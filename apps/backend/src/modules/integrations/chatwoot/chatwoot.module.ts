import { Module } from "@nestjs/common";

import { ChatwootAutomationController } from "./chatwoot-automation.controller";
import { ChatwootAutomationService } from "./chatwoot-automation.service";
import { ChatwootController } from "./chatwoot.controller";
import { ChatwootService } from "./chatwoot.service";
import { PedidosDbService } from "./pedidos-db.service";

@Module({
  controllers: [ChatwootController, ChatwootAutomationController],
  providers: [ChatwootService, ChatwootAutomationService, PedidosDbService],
  exports: [ChatwootService, ChatwootAutomationService],
})
export class ChatwootModule {}
