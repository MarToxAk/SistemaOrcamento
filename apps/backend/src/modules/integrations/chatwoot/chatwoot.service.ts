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

  async sendOutgoingMessage(conversationId: string, message: string) {
    const baseUrl = this.config.get<string>("CHATWOOT_BASE_URL");
    const accountId = this.config.get<string>("CHATWOOT_ACCOUNT_ID");
    const token = this.config.get<string>("CHATWOOT_API_TOKEN");

    if (!baseUrl || !accountId || !token) {
      return { enabled: false, message: "Configuração do Chatwoot ausente." };
    }

    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
    const response = await axios.post(
      url,
      {
        content: message,
        message_type: "outgoing",
        private: false,
      },
      {
        headers: {
          api_access_token: token,
        },
      },
    );

    return { enabled: true, response: response.data };
  }

  async sendAttachment(conversationId: string, buffer: Buffer, fileName: string, contentType: string) {
    const baseUrl = this.config.get<string>("CHATWOOT_BASE_URL");
    const accountId = this.config.get<string>("CHATWOOT_ACCOUNT_ID");
    const token = this.config.get<string>("CHATWOOT_API_TOKEN");

    if (!baseUrl || !accountId || !token) {
      return { enabled: false, message: "Configuração do Chatwoot ausente." };
    }

    const boundary = `----FormBoundary${Date.now()}`;
    const CRLF = "\r\n";

    const formParts: Buffer[] = [
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="attachments[]"; filename="${fileName}"${CRLF}` +
          `Content-Type: ${contentType}${CRLF}${CRLF}`,
      ),
      buffer,
      Buffer.from(
        `${CRLF}--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="message_type"${CRLF}${CRLF}` +
          `outgoing${CRLF}` +
          `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="private"${CRLF}${CRLF}` +
          `false${CRLF}` +
          `--${boundary}--${CRLF}`,
      ),
    ];

    const formData = Buffer.concat(formParts);
    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;

    const response = await axios.post(url, formData, {
      headers: {
        api_access_token: token,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(formData.length),
      },
    });

    return { enabled: true, response: response.data };
  }
}
