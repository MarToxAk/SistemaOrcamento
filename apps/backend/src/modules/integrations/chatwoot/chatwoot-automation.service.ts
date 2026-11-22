import { Injectable, InternalServerErrorException, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QuoteStatus } from "@prisma/client";
import axios from "axios";
import Handlebars from "handlebars";

import {
  ETIQUETA_CLIENTE_FREQUENTE,
  ETIQUETAS_GERENCIADAS,
  ETIQUETA_FINALIZADO,
  agendarEnvioFechamento,
  aplicarEtiquetasGerenciadas,
  avaliarRespostaDoCliente,
  cancelarTodosEnviosFechamento,
  clienteEhFrequente,
  enfileirarPorConversa,
  etiquetaDaFase,
  lerAtrasoFechamentoS,
  mesclarEtiquetasFechamento,
  sortearAtrasoHumanoMs,
} from "./chatwoot-etiquetas";
import { ChatwootService } from "./chatwoot.service";
import { PrismaService } from "../../database/prisma.service";

export type ChatwootAutomationWebhookPayload = {
  id: number | string;
  inbox_id?: number;
  contact_inbox?: { inbox_id?: number };
  messages?: Array<{ id?: number; account_id?: number; content?: string }>;
};

const DEFAULT_PROMPT_FECHAMENTO =
  'Crie UMA mensagem curta e natural para WhatsApp de atendimento de papelaria/grafica.\n\n' +
  'Regras:\n' +
  '- Comece com uma variacao de "{{saudacao}}" (ex: "{{saudacao}}!", "{{saudacao}}, tudo bem?", "{{saudacao}}! Como vai?" — varie a forma a cada vez).\n' +
  '- Transmita esta ideia reescrevendo com suas proprias palavras (NAO repita sempre a mesma frase): perguntar se a pessoa precisa de ajuda com um orcamento, ou se a solicitacao dela ja foi atendida.\n' +
  '- SEMPRE inclua pelo menos 1 emoji, variando os emojis usados.\n' +
  '- Maximo 2 frases curtas.\n' +
  '- Responda APENAS com a mensagem final, sem aspas, sem explicacoes, sem markdown.';

const STATUS_FECHAMENTO_PADRAO: QuoteStatus[] = [QuoteStatus.ENTREGUE, QuoteStatus.ENVIADO, QuoteStatus.CANCELADO];

const DEFAULT_MENSAGEM_PEDIDO_PENDENTE =
  '⚠️ ATENCAO: PEDIDO PENDENTE\n\n' +
  'Nao e possivel finalizar este atendimento. Existe um servico vinculado a este cliente que ainda nao esta com status "Finalizado" ou "Entregue".\n\n' +
  'Por favor, verifique a producao e atualize o status do servico antes de encerrar o contato.';

// Status do Quote (deste sistema) considerados "seguros para fechar" a conversa —
// configuravel via CHATWOOT_AUTOMATION_STATUS_FECHAMENTO (default ENTREGUE,ENVIADO,
// CANCELADO). Quando nao ha Quote vinculado a conversationId tambem liberamos o
// fechamento normal, independente da lista configurada.
export function podeFecharConversa(
  statusAtual: QuoteStatus | null | undefined,
  statusPermitidos: QuoteStatus[],
): boolean {
  if (statusAtual === null || statusAtual === undefined) return true;
  return statusPermitidos.includes(statusAtual);
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

/** Fase 52: recorte da conversa do Chatwoot que o gancho da pesquisa precisa. */
export interface ConversaChatwootResumo {
  status?: string;
  uuid?: string;
  inbox_id?: number;
  meta?: { sender?: { id?: number; phone_number?: string | null } };
}

/**
 * Fase 52: gancho do fechamento. Registrado pelo PesquisaService em onModuleInit (sem dependencia
 * circular de modulo: o ChatwootModule nao conhece o PesquisaModule). Ambos os metodos nunca lancam.
 */
export interface GanchoPesquisaFechamento {
  prepararFechamento(entrada: {
    conversationId: string;
    customerId: string | null;
    conversa: ConversaChatwootResumo;
  }): Promise<{ bloco: string; pesquisaId: string } | null>;
  aoFechamentoEnviado(pesquisaId: string): Promise<void>;
}

@Injectable()
export class ChatwootAutomationService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatwootAutomationService.name);
  private gancho: GanchoPesquisaFechamento | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatwoot: ChatwootService,
    private readonly config: ConfigService,
  ) {}

  /** Fase 52: registra (ou remove, com null) o gancho da pesquisa de satisfacao no fechamento. */
  registrarGanchoPesquisa(gancho: GanchoPesquisaFechamento | null): void {
    this.gancho = gancho;
  }

  private getInboxesPermitidos(): number[] {
    const raw = this.config.get<string>("CHATWOOT_AUTOMATION_INBOX_IDS") ?? "1,21";
    return raw
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v));
  }

  private getStatusPermitidosFechamento(): QuoteStatus[] {
    const raw = this.config.get<string>("CHATWOOT_AUTOMATION_STATUS_FECHAMENTO");
    if (!raw) return STATUS_FECHAMENTO_PADRAO;
    const valores = raw
      .split(",")
      .map((v) => v.trim())
      .filter((v): v is QuoteStatus => Object.values(QuoteStatus).includes(v as QuoteStatus));
    return valores.length > 0 ? valores : STATUS_FECHAMENTO_PADRAO;
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

  /**
   * Fase 51 (plano 51-04): fechamento em duas fases.
   * 1) Na hora: etiquetas finais enfileiradas SEM await (finalizado + cliente-frequente quando for o caso;
   *    o POST de labels substitui a lista inteira, D-06) e resposta rapida ao Chatwoot.
   * 2) Depois de um atraso aleatorio (D-12, D-20, D-22): a mensagem de encerramento, por setTimeout em
   *    processo, um timer por conversa. Reiniciar o backend perde a mensagem agendada (aceito, D-24).
   * O ramo bloqueado por pendencia nao mexe em etiquetas (D-07).
   */
  async handleConversationResolved(payload: ChatwootAutomationWebhookPayload): Promise<
    | { processed: false; reason: "inbox_nao_monitorado" }
    | { processed: true; action: "bloqueado_pedido_pendente" }
    | { processed: true; action: "mensagem_ja_enviada_hoje" }
    | { processed: true; action: "mensagem_agendada"; atrasoMs: number }
  > {
    const resolvidaEmMs = Date.now();
    const inboxId = payload.contact_inbox?.inbox_id ?? payload.inbox_id;
    if (!inboxPermitido(inboxId, this.getInboxesPermitidos())) {
      return { processed: false, reason: "inbox_nao_monitorado" };
    }

    const conversationId = String(payload.id);
    const quote = await this.prisma.quote.findFirst({
      where: { conversationId: BigInt(conversationId) },
      orderBy: { updatedAt: "desc" },
      select: { status: true, customerId: true },
    });

    if (!podeFecharConversa(quote?.status, this.getStatusPermitidosFechamento())) {
      const config = await this.getConfig();
      await this.chatwoot.toggleConversationStatus(conversationId, "open");
      await this.chatwoot.postConversationNote(conversationId, config.mensagemPedidoPendente);
      return { processed: true, action: "bloqueado_pedido_pendente" };
    }

    const customerId = quote?.customerId ?? null;
    // D-19/D-20: etiquetas na hora, sem segurar o webhook, mesmo que a mensagem do dia ja tenha saido.
    this.enfileirarEtiquetasFinalizado(conversationId, customerId);

    const podeEnviar = await this.podeEnviarMensagemFechamento(conversationId);
    if (!podeEnviar) {
      return { processed: true, action: "mensagem_ja_enviada_hoje" };
    }

    const { minS, maxS } = lerAtrasoFechamentoS((chave) => this.config.get<string>(chave));
    const atrasoMs = sortearAtrasoHumanoMs(minS, maxS);
    // D-40: guarda o id da ultima mensagem conhecida no webhook para o re-check por GET .../messages.
    const idUltimaMensagem = payload.messages?.[0]?.id;
    const ultimaMensagemId =
      typeof idUltimaMensagem === "number" && Number.isFinite(idUltimaMensagem) ? idUltimaMensagem : undefined;
    const contexto = { resolvidaEmMs, status: quote?.status ?? null, customerId, ultimaMensagemId };
    agendarEnvioFechamento(conversationId, atrasoMs, () => this.enviarMensagemFechamento(conversationId, contexto));
    this.logger.log(`Mensagem de fechamento agendada conversationId=${conversationId} atrasoMs=${atrasoMs}`);

    return { processed: true, action: "mensagem_agendada", atrasoMs };
  }

  /** Tarefa best-effort na fila por conversa: nunca lanca nem rejeita; falha vira warn sem segredo. */
  private enfileirarEtiquetasFinalizado(conversationId: string, customerId: string | null): void {
    void enfileirarPorConversa(conversationId, async () => {
      let frequente = false;
      if (customerId) {
        try {
          frequente = await clienteEhFrequente(this.prisma, customerId, (chave) => this.config.get<string>(chave));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Falha ao contar cliente frequente conversationId=${conversationId}: ${msg}`);
        }
      }
      const desejadas = [ETIQUETA_FINALIZADO, ...(frequente ? [ETIQUETA_CLIENTE_FREQUENTE] : [])];
      // D-34: o POST de labels substitui a lista inteira; preservar avaliou e csat-baixo da ultima
      // pesquisa. Falha na leitura nao impede o finalizado: grava so as desejadas e registra warn.
      let atuais: string[] = [];
      try {
        atuais = await this.chatwoot.getConversationLabels(conversationId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Falha ao ler etiquetas do fechamento conversationId=${conversationId}: ${msg}`);
      }
      await this.chatwoot.addConversationLabels(conversationId, mesclarEtiquetasFechamento(atuais, desejadas));
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao gravar etiquetas de fechamento conversationId=${conversationId}: ${msg}`);
    });
  }

  /**
   * Disparo do timer. Nunca rejeita: qualquer erro vira warn com conversationId e err.message.
   * Re-check D-13 (a guarda FECHA): so envia se a conversa foi relida com sucesso, continua resolvida,
   * sem mensagem nova do cliente depois da resolucao e com a avaliacao conclusiva. Logs: so
   * conversationId e motivo (nunca o texto da mensagem, o token da IA nem o objeto de erro do axios).
   */
  private async enviarMensagemFechamento(
    conversationId: string,
    contexto: { resolvidaEmMs: number; status: QuoteStatus | null; customerId: string | null; ultimaMensagemId?: number },
  ): Promise<void> {
    try {
      let conversa: Awaited<ReturnType<ChatwootService["getConversation"]>>;
      try {
        conversa = await this.chatwoot.getConversation(conversationId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Mensagem de fechamento nao enviada conversationId=${conversationId} motivo=falha_recheck: ${msg}`);
        return;
      }
      if (!conversa || typeof conversa !== "object") {
        this.logger.warn(`Mensagem de fechamento nao enviada conversationId=${conversationId} motivo=falha_recheck`);
        return;
      }

      if (conversa.status !== "resolved") {
        this.logger.log(`Mensagem de fechamento nao enviada conversationId=${conversationId} motivo=reaberta`);
        await this.restaurarEtiquetasAposReabertura(conversationId, contexto);
        return;
      }

      // D-40: o re-check le o historico recente por GET .../messages. O campo `messages` do GET da
      // conversa so traz a ultima mensagem, e uma atividade posterior esconderia a resposta do cliente.
      let mensagens: unknown = null;
      try {
        mensagens = await this.chatwoot.listMessagesAfter(conversationId, contexto.ultimaMensagemId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Mensagem de fechamento nao enviada conversationId=${conversationId} motivo=falha_recheck: ${msg}`);
        return;
      }

      const avaliacao = avaliarRespostaDoCliente(mensagens, contexto.resolvidaEmMs);
      if (avaliacao === "resposta_nova") {
        this.logger.log(`Mensagem de fechamento nao enviada conversationId=${conversationId} motivo=resposta_nova`);
        return;
      }
      if (avaliacao === "indeterminado") {
        this.logger.warn(
          `Mensagem de fechamento nao enviada conversationId=${conversationId} motivo=mensagens_indeterminadas`,
        );
        return;
      }

      // D-19: o limite de uma mensagem por dia e reavaliado no envio, nao so no webhook.
      if (!(await this.podeEnviarMensagemFechamento(conversationId))) return;

      const config = await this.getConfig();
      // A saudacao e calculada no momento do envio, nao no do webhook.
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

      // Fase 52: o gancho da pesquisa (se registrado e ativo) devolve o bloco com o link unico.
      const pesquisa = await this.prepararPesquisa(conversationId, conversa, contexto.customerId);
      const mensagemFinal = pesquisa ? `${mensagem}\n\n${pesquisa.bloco}` : mensagem;

      const envio = await this.chatwoot.sendOutgoingMessage(conversationId, mensagemFinal);

      // Ordem fixa: envio -> registro -> gancho. O registro entra em try/catch proprio para que uma falha
      // de gravacao nao impeca o gancho (a pesquisa nao pode ficar CRIADA com o link ja entregue) e para
      // o limite diario enxergar a mensagem assim que ela sai.
      try {
        await this.prisma.chatwootMensagemEnviada.create({
          data: { conversationId, tipoEvento: "close", mensagemEnviada: mensagemFinal },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Falha ao registrar mensagem de fechamento enviada conversationId=${conversationId}: ${msg}`);
      }

      if (pesquisa && this.gancho && envio?.enabled === true) {
        try {
          await this.gancho.aoFechamentoEnviado(pesquisa.pesquisaId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Falha no gancho pos-envio da pesquisa conversationId=${conversationId}: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao enviar mensagem de fechamento conversationId=${conversationId}: ${msg}`);
    }
  }

  /** Fase 52: pede o bloco da pesquisa ao gancho; sem gancho ou em qualquer erro devolve null (fechamento da fase 51). */
  private async prepararPesquisa(
    conversationId: string,
    conversa: ConversaChatwootResumo,
    customerId: string | null,
  ): Promise<{ bloco: string; pesquisaId: string } | null> {
    if (!this.gancho) return null;
    try {
      return await this.gancho.prepararFechamento({ conversationId, customerId, conversa });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao preparar pesquisa de satisfacao conversationId=${conversationId}: ${msg}`);
      return null;
    }
  }

  /**
   * Conversa reaberta durante a espera: tira "finalizado" e devolve a etiqueta da fase e, se for o caso,
   * cliente-frequente (recalculado na hora). Best-effort: falha vira warn.
   */
  private async restaurarEtiquetasAposReabertura(
    conversationId: string,
    contexto: { status: QuoteStatus | null; customerId: string | null },
  ): Promise<void> {
    try {
      await enfileirarPorConversa(conversationId, async () => {
        let frequente = false;
        if (contexto.customerId) {
          try {
            frequente = await clienteEhFrequente(this.prisma, contexto.customerId, (chave) =>
              this.config.get<string>(chave),
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Falha ao contar cliente frequente conversationId=${conversationId}: ${msg}`);
          }
        }
        const fase = etiquetaDaFase(contexto.status);
        const desejadas = [...(fase ? [fase] : []), ...(frequente ? [ETIQUETA_CLIENTE_FREQUENTE] : [])];
        await aplicarEtiquetasGerenciadas(this.chatwoot, conversationId, desejadas, [
          ...ETIQUETAS_GERENCIADAS,
          ETIQUETA_FINALIZADO,
        ]);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao restaurar etiquetas apos reabertura conversationId=${conversationId}: ${msg}`);
    }
  }

  onModuleDestroy(): void {
    cancelarTodosEnviosFechamento();
  }

  private async podeEnviarMensagemFechamento(conversationId: string): Promise<boolean> {
    const jaEnviouHoje = await this.prisma.chatwootMensagemEnviada.findFirst({
      where: {
        conversationId,
        tipoEvento: "close",
        enviadoEm: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      select: { id: true },
    });
    return !jaEnviouHoje;
  }
}
