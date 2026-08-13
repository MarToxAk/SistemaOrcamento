import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import Handlebars from "handlebars";

import { ChatwootService } from "./chatwoot.service";
import { PedidosDbService } from "./pedidos-db.service";
import { PrismaService } from "../../database/prisma.service";

export type ChatwootAutomationWebhookPayload = {
  id: number | string;
  inbox_id?: number;
  contact_inbox?: { inbox_id?: number };
  messages?: Array<{ account_id?: number; content?: string }>;
};

const DEFAULT_PROMPT_FECHAMENTO =
  'Crie UMA mensagem curta e natural para WhatsApp de atendimento de papelaria/grafica.\n\n' +
  'Regras:\n' +
  '- Comece com uma variacao de "{{saudacao}}" (ex: "{{saudacao}}!", "{{saudacao}}, tudo bem?", "{{saudacao}}! Como vai?" — varie a forma a cada vez).\n' +
  '- Transmita esta ideia reescrevendo com suas proprias palavras (NAO repita sempre a mesma frase): perguntar se a pessoa precisa de ajuda com um orcamento, ou se a solicitacao dela ja foi atendida.\n' +
  '- SEMPRE inclua pelo menos 1 emoji, variando os emojis usados.\n' +
  '- Maximo 2 frases curtas.\n' +
  '- Responda APENAS com a mensagem final, sem aspas, sem explicacoes, sem markdown.';

const DEFAULT_MENSAGEM_PEDIDO_PENDENTE =
  '⚠️ ATENCAO: PEDIDO PENDENTE\n\n' +
  'Nao e possivel finalizar este atendimento. Existe um servico vinculado a este cliente que ainda nao esta com status "Finalizado" ou "Entregue".\n\n' +
  'Por favor, verifique a producao e atualize o status do servico antes de encerrar o contato.';

// Status considerados "seguros para fechar" no historico do pedido — configuravel via
// CHATWOOT_AUTOMATION_STATUS_FECHAMENTO (default "7,8" = Finalizado/Entregue, mesmos
// codigos do fluxo n8n original). Quando o pedido nao existe (chat sem pedido vinculado)
// tambem liberamos o fechamento normal da conversa, independente da lista configurada.
export function podeFecharConversa(ultimoStatus: number | null | undefined, statusPermitidos: number[]): boolean {
  if (ultimoStatus === null || ultimoStatus === undefined) return true;
  return statusPermitidos.includes(ultimoStatus);
}

export function inboxPermitido(inboxId: number | undefined, permitidos: number[]): boolean {
  return inboxId !== undefined && permitidos.includes(inboxId);
}

export function calcularSaudacao(horaLocal: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  if (horaLocal >= 5 && horaLocal < 12) return "Bom dia";
  if (horaLocal >= 12 && horaLocal < 18) return "Boa tarde";
  return "Boa noite";
}

export function getHoraSaoPaulo(data: Date = new Date()): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  }).format(data);
  return Number(hourStr) % 24;
}

export function renderizarPrompt(template: string, saudacao: string): string {
  return Handlebars.compile(template, { noEscape: true })({ saudacao });
}

// A IA (endpoint estilo OpenAI "responses") retorna { output: [{ content: [{ text }] }] }.
// Extrai defensivamente — qualquer formato inesperado vira null e o chamador usa fallback.
export function extrairMensagemIA(resposta: unknown): string | null {
  const texto = (resposta as { output?: Array<{ content?: Array<{ text?: string }> }> } | undefined)?.output?.[0]
    ?.content?.[0]?.text;
  return typeof texto === "string" && texto.trim() ? texto.trim() : null;
}

@Injectable()
export class ChatwootAutomationService {
  private readonly logger = new Logger(ChatwootAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatwoot: ChatwootService,
    private readonly pedidosDb: PedidosDbService,
    private readonly config: ConfigService,
  ) {}

  private getInboxesPermitidos(): number[] {
    const raw = this.config.get<string>("CHATWOOT_AUTOMATION_INBOX_IDS") ?? "1,21";
    return raw
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v));
  }

  private getStatusPermitidosFechamento(): number[] {
    const raw = this.config.get<string>("CHATWOOT_AUTOMATION_STATUS_FECHAMENTO") ?? "7,8";
    return raw
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v));
  }

  async getConfig() {
    const existing = await this.prisma.chatwootAutomationConfig.findUnique({ where: { id: "default" } });
    if (existing) return existing;
    return this.prisma.chatwootAutomationConfig.create({
      data: {
        id: "default",
        promptFechamento: DEFAULT_PROMPT_FECHAMENTO,
        mensagemPedidoPendente: DEFAULT_MENSAGEM_PEDIDO_PENDENTE,
      },
    });
  }

  async updateConfig(data: { promptFechamento?: string; mensagemPedidoPendente?: string; updatedBy?: string }) {
    const atual = await this.getConfig();
    return this.prisma.chatwootAutomationConfig.update({
      where: { id: "default" },
      data: {
        promptFechamento: data.promptFechamento ?? atual.promptFechamento,
        mensagemPedidoPendente: data.mensagemPedidoPendente ?? atual.mensagemPedidoPendente,
        updatedBy: data.updatedBy,
      },
    });
  }

  private async chamarIA(prompt: string): Promise<unknown> {
    const url = this.config.get<string>("CHATWOOT_AI_URL");
    const token = this.config.get<string>("CHATWOOT_AI_TOKEN");
    const model = this.config.get<string>("CHATWOOT_AI_MODEL") ?? "openclaw/main";

    if (!url || !token) {
      throw new InternalServerErrorException("Configuracao da IA ausente. Defina CHATWOOT_AI_URL e CHATWOOT_AI_TOKEN.");
    }

    const response = await axios.post(
      url,
      { model, input: prompt },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return response.data;
  }

  private mensagemFallback(saudacao: string): string {
    return `${saudacao}! Precisa de ajuda com um orçamento ou já podemos encerrar por aqui? 😊`;
  }

  async handleConversationResolved(payload: ChatwootAutomationWebhookPayload) {
    const inboxId = payload.contact_inbox?.inbox_id ?? payload.inbox_id;
    if (!inboxPermitido(inboxId, this.getInboxesPermitidos())) {
      return { processed: false, reason: "inbox_nao_monitorado" };
    }

    const conversationId = String(payload.id);
    const status = await this.pedidosDb.buscarUltimoStatusPorChatId(conversationId);

    if (!podeFecharConversa(status?.ultimoStatus, this.getStatusPermitidosFechamento())) {
      const config = await this.getConfig();
      await this.chatwoot.toggleConversationStatus(conversationId, "open");
      await this.chatwoot.postConversationNote(conversationId, config.mensagemPedidoPendente);
      return { processed: true, action: "bloqueado_pedido_pendente" as const };
    }

    const podeEnviar = await this.pedidosDb.podeEnviarMensagemFechamento(conversationId);
    if (!podeEnviar) {
      return { processed: true, action: "mensagem_ja_enviada_hoje" as const };
    }

    await this.chatwoot.addConversationLabels(conversationId, ["finalizado"]);

    const config = await this.getConfig();
    const saudacao = calcularSaudacao(getHoraSaoPaulo());
    const prompt = renderizarPrompt(config.promptFechamento, saudacao);

    let mensagem: string;
    try {
      const resposta = await this.chamarIA(prompt);
      mensagem = extrairMensagemIA(resposta) ?? this.mensagemFallback(saudacao);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao gerar mensagem de fechamento via IA (usando fallback): ${msg}`);
      mensagem = this.mensagemFallback(saudacao);
    }

    await this.chatwoot.sendOutgoingMessage(conversationId, mensagem);
    await this.pedidosDb.registrarMensagemEnviada(conversationId, "close", mensagem);

    return { processed: true, action: "mensagem_enviada" as const, mensagem };
  }
}
