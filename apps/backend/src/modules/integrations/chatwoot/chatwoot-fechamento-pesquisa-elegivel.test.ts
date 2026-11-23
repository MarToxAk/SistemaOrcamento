/**
 * Quick 261123-ot3: a pesquisa de satisfacao so sai para orcamento ENTREGUE/ENVIADO e a rota
 * "sem pesquisa" nunca a envia. Fake timers; Chatwoot, IA e gancho sempre falsos.
 */
import { QuoteStatus } from "@prisma/client";
import { UnauthorizedException } from "@nestjs/common";

import { ChatwootAutomationController } from "./chatwoot-automation.controller";
import {
  ChatwootAutomationService,
  JANELA_PESQUISA_DIAS,
  STATUS_ELEGIVEIS_PESQUISA,
  elegivelParaPesquisa,
  momentoProntoOuEntregue,
} from "./chatwoot-automation.service";
import { aguardarFilaEtiquetas, cancelarTodosEnviosFechamento } from "./chatwoot-etiquetas";

const PAYLOAD = { id: 42, contact_inbox: { inbox_id: 1 } };
const ATRASO_MAX_MS = 180000;

const DIA_MS = 24 * 60 * 60 * 1000;
const diasAtras = (dias: number) => new Date(Date.now() - dias * DIA_MS);

type Aprovacao = { historico?: Date | null };
/** Por padrao o pedido ficou entregue/pronto ha 2 dias (dentro da janela de 7). */
const APROVADO_HA_2_DIAS: Aprovacao = { historico: diasAtras(2) };

function buildService(quoteStatus: QuoteStatus | null, statusFechamento?: string, aprovacao: Aprovacao = APROVADO_HA_2_DIAS) {
  const prisma = {
    chatwootAutomationConfig: {
      findUnique: jest.fn().mockResolvedValue({ id: "default", promptFechamento: "Ola", mensagemPedidoPendente: "Pendente" }),
      create: jest.fn(),
      update: jest.fn(),
    },
    quote: {
      findFirst: jest.fn().mockResolvedValue(
        quoteStatus === null
          ? null
          : {
              status: quoteStatus,
              customerId: "cus-1",
              statusHistory: aprovacao.historico ? [{ changedAt: aprovacao.historico }] : [],
            },
      ),
      count: jest.fn().mockResolvedValue(0),
    },
    chatwootMensagemEnviada: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
    },
  };
  const chatwoot = {
    toggleConversationStatus: jest.fn().mockResolvedValue({ enabled: true }),
    postConversationNote: jest.fn().mockResolvedValue({ enabled: true }),
    addConversationLabels: jest.fn().mockResolvedValue({ enabled: true }),
    sendOutgoingMessage: jest.fn().mockResolvedValue({ enabled: true }),
    getConversation: jest.fn().mockResolvedValue({ status: "resolved", messages: [] }),
    getConversationLabels: jest.fn().mockResolvedValue(["finalizado"]),
    listMessagesAfter: jest.fn().mockResolvedValue([]),
  };
  const config = {
    get: jest.fn((chave: string) => {
      if (chave === "CHATWOOT_AUTOMATION_INBOX_IDS") return "1,21";
      if (chave === "CHATWOOT_AUTOMATION_STATUS_FECHAMENTO") return statusFechamento;
      return undefined;
    }),
  };
  const service = new ChatwootAutomationService(prisma as any, chatwoot as any, config as any);
  jest.spyOn(service as any, "chamarIA").mockResolvedValue({ output: [{ content: [{ text: "Mensagem da IA" }] }] });
  jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);
  jest.spyOn((service as any).logger, "log").mockImplementation(() => undefined);

  const gancho = {
    prepararFechamento: jest.fn().mockResolvedValue({ bloco: "Link da pesquisa", pesquisaId: "pq-1" }),
    aoFechamentoEnviado: jest.fn().mockResolvedValue(undefined),
  };
  service.registrarGanchoPesquisa(gancho);
  return { service, chatwoot, gancho };
}

async function fechar(ctx: ReturnType<typeof buildService>, semPesquisa?: boolean) {
  await ctx.service.handleConversationResolved(PAYLOAD, semPesquisa ? { semPesquisa: true } : undefined);
  await aguardarFilaEtiquetas();
  await jest.advanceTimersByTimeAsync(ATRASO_MAX_MS);
  await aguardarFilaEtiquetas();
}

describe("fechamento: pesquisa so para pedido entregue/enviado (quick 261123-ot3)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    await aguardarFilaEtiquetas();
    cancelarTodosEnviosFechamento();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("elegivelParaPesquisa: ENTREGUE e PRONTO_PARA_ENTREGA, nos ultimos 7 dias", () => {
    expect(STATUS_ELEGIVEIS_PESQUISA).toEqual([QuoteStatus.ENTREGUE, QuoteStatus.PRONTO_PARA_ENTREGA]);
    expect(JANELA_PESQUISA_DIAS).toBe(7);
    const agora = Date.now();
    const hoje = new Date(agora);
    expect(elegivelParaPesquisa(QuoteStatus.ENTREGUE, hoje, agora)).toBe(true);
    expect(elegivelParaPesquisa(QuoteStatus.PRONTO_PARA_ENTREGA, hoje, agora)).toBe(true);
    for (const s of [
      QuoteStatus.PENDENTE,
      QuoteStatus.PAGAMENTO_PARCIAL,
      QuoteStatus.APROVADO,
      QuoteStatus.EM_PRODUCAO,
      QuoteStatus.ENVIADO,
      QuoteStatus.CANCELADO,
    ]) {
      expect(elegivelParaPesquisa(s, hoje, agora)).toBe(false);
    }
    expect(elegivelParaPesquisa(null, hoje, agora)).toBe(false);
    expect(elegivelParaPesquisa(undefined, hoje, agora)).toBe(false);
  });

  it("janela de 7 dias: borda inclusiva, 7 dias e 1 ms fora, sem data e data futura fora", () => {
    const agora = Date.now();
    expect(elegivelParaPesquisa(QuoteStatus.ENTREGUE, new Date(agora - 7 * DIA_MS), agora)).toBe(true);
    expect(elegivelParaPesquisa(QuoteStatus.ENTREGUE, new Date(agora - 7 * DIA_MS - 1), agora)).toBe(false);
    expect(elegivelParaPesquisa(QuoteStatus.ENTREGUE, null, agora)).toBe(false);
    expect(elegivelParaPesquisa(QuoteStatus.ENTREGUE, undefined, agora)).toBe(false);
    expect(elegivelParaPesquisa(QuoteStatus.ENTREGUE, new Date(agora + DIA_MS), agora)).toBe(false);
  });

  it("momentoProntoOuEntregue: usa o registro mais recente do historico; sem registro, null", () => {
    const h = new Date("2026-11-20T10:00:00Z");
    expect(momentoProntoOuEntregue({ statusHistory: [{ changedAt: h }] })).toBe(h);
    expect(momentoProntoOuEntregue({ statusHistory: [] })).toBeNull();
    expect(momentoProntoOuEntregue(null)).toBeNull();
  });

  it("ENTREGUE ha 10 dias: fecha com o resolvido, sem pesquisa", async () => {
    const ctx = buildService(QuoteStatus.ENTREGUE, undefined, { historico: diasAtras(10) });
    await fechar(ctx);

    expect(ctx.gancho.prepararFechamento).not.toHaveBeenCalled();
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", "Mensagem da IA");
  });

  it("ENTREGUE sem registro no historico: sem pesquisa", async () => {
    const ctx = buildService(QuoteStatus.ENTREGUE, undefined, {});
    await fechar(ctx);

    expect(ctx.gancho.prepararFechamento).not.toHaveBeenCalled();
  });

  it("PRONTO_PARA_ENTREGA ha 3 dias (liberado por env): recebe a pesquisa", async () => {
    const ctx = buildService(QuoteStatus.PRONTO_PARA_ENTREGA, "PRONTO_PARA_ENTREGA", { historico: diasAtras(3) });
    await fechar(ctx);

    expect(ctx.gancho.prepararFechamento).toHaveBeenCalledTimes(1);
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", "Mensagem da IA\n\nLink da pesquisa");
  });

  it("ENVIADO nao recebe pesquisa (fora da lista)", async () => {
    const ctx = buildService(QuoteStatus.ENVIADO);
    await fechar(ctx);

    expect(ctx.gancho.prepararFechamento).not.toHaveBeenCalled();
  });

  it("CANCELADO (fecha, mas nao elegivel): mensagem de resolvido sem pesquisa, etiquetas mantidas", async () => {
    const ctx = buildService(QuoteStatus.CANCELADO);
    await fechar(ctx);

    expect(ctx.gancho.prepararFechamento).not.toHaveBeenCalled();
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", "Mensagem da IA");
    expect(ctx.gancho.aoFechamentoEnviado).not.toHaveBeenCalled();
    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado"]);
  });

  it("sem orcamento: fecha com a mensagem de resolvido e sem pesquisa", async () => {
    const ctx = buildService(null);
    await fechar(ctx);

    expect(ctx.gancho.prepararFechamento).not.toHaveBeenCalled();
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", "Mensagem da IA");
  });

  it("status liberado por env (EM_PRODUCAO) fecha mas nao recebe pesquisa", async () => {
    const ctx = buildService(QuoteStatus.EM_PRODUCAO, "EM_PRODUCAO");
    await fechar(ctx);

    expect(ctx.gancho.prepararFechamento).not.toHaveBeenCalled();
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", "Mensagem da IA");
  });

  it("rota sem pesquisa: mesmo com ENTREGUE nao chama o gancho, mas envia o resolvido e aplica etiquetas", async () => {
    const ctx = buildService(QuoteStatus.ENTREGUE);
    await fechar(ctx, true);

    expect(ctx.gancho.prepararFechamento).not.toHaveBeenCalled();
    expect(ctx.gancho.aoFechamentoEnviado).not.toHaveBeenCalled();
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", "Mensagem da IA");
    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado"]);
  });

  it("rota sem pesquisa continua bloqueando pedido pendente", async () => {
    const ctx = buildService(QuoteStatus.EM_PRODUCAO);
    const resultado = await ctx.service.handleConversationResolved(PAYLOAD, { semPesquisa: true });

    expect((resultado as { action?: string }).action).toBe("bloqueado_pedido_pendente");
    expect(ctx.chatwoot.toggleConversationStatus).toHaveBeenCalledWith("42", "open");
  });
});

describe("ChatwootAutomationController: rota webhook-sem-pesquisa (quick 261123-ot3)", () => {
  const ORIGINAL = process.env.CHATWOOT_AUTOMATION_WEBHOOK_TOKEN;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CHATWOOT_AUTOMATION_WEBHOOK_TOKEN;
    else process.env.CHATWOOT_AUTOMATION_WEBHOOK_TOKEN = ORIGINAL;
  });

  const criar = () => {
    const automation = { handleConversationResolved: jest.fn().mockResolvedValue({ processed: true }) };
    const controller = new ChatwootAutomationController(automation as any);
    return { controller, automation };
  };

  it("token valido chama handleConversationResolved com semPesquisa e o normal chama sem opcao", async () => {
    process.env.CHATWOOT_AUTOMATION_WEBHOOK_TOKEN = "segredo-de-teste";
    const { controller, automation } = criar();

    await controller.webhookSemPesquisa("segredo-de-teste", PAYLOAD as any);
    expect(automation.handleConversationResolved).toHaveBeenLastCalledWith(PAYLOAD, { semPesquisa: true });

    await controller.webhook("segredo-de-teste", PAYLOAD as any);
    expect(automation.handleConversationResolved).toHaveBeenLastCalledWith(PAYLOAD);
  });

  it("token invalido na rota nova e rejeitado e nada e processado", async () => {
    process.env.CHATWOOT_AUTOMATION_WEBHOOK_TOKEN = "segredo-de-teste";
    const { controller, automation } = criar();

    await expect(controller.webhookSemPesquisa("errado", PAYLOAD as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(automation.handleConversationResolved).not.toHaveBeenCalled();
  });
});
