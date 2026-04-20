import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

@Injectable()
export class ChatwootService {
  constructor(private readonly config: ConfigService) {}

  async searchContact(query: string) {
    const baseUrl = this.config.get<string>("CHATWOOT_BASE_URL");
    const accountId = this.config.get<string>("CHATWOOT_ACCOUNT_ID");
    const token = this.config.get<string>("CHATWOOT_API_TOKEN");

    if (!baseUrl || !accountId || !token) {
      return {
        enabled: false,
        message: "Configure CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID e CHATWOOT_API_TOKEN no .env",
      };
    }

    const url = `${baseUrl}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        api_access_token: token,
      },
    });

    return {
      enabled: true,
      query,
      contacts: response.data?.payload ?? [],
    };
  }

  async postConversationNote(conversationId: string, note: string) {
    const baseUrl = this.config.get<string>("CHATWOOT_BASE_URL");
    const accountId = this.config.get<string>("CHATWOOT_ACCOUNT_ID");
    const token = this.config.get<string>("CHATWOOT_API_TOKEN");

    if (!baseUrl || !accountId || !token) {
      return { enabled: false };
    }

    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
    await axios.post(
      url,
      {
        content: note,
        message_type: "outgoing",
        private: true,
      },
      {
        headers: {
          api_access_token: token,
        },
      },
    );

    return { enabled: true, sent: true };
  }
}
