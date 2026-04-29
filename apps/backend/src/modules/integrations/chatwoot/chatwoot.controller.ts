import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import { ChatwootService } from "./chatwoot.service";

@Controller("integrations/chatwoot")
export class ChatwootController {
  constructor(private readonly chatwootService: ChatwootService) {}

  @Get("contacts")
  async searchContacts(@Query("q") query?: string) {
    return this.chatwootService.searchContact(query ?? "");
  }

  @Post("conversations/:conversationId/note")
  async addConversationNote(
    @Param("conversationId") conversationId: string,
    @Body() payload: { note: string },
  ) {
    return this.chatwootService.postConversationNote(conversationId, payload.note);
  }
}
