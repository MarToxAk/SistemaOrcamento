import { QuoteStatus } from "@prisma/client";

import {
  ChatwootAutomationService,
  calcularSaudacao,
  extrairMensagemIA,
  inboxPermitido,
  podeFecharConversa,
  renderizarPrompt,
} from "./chatwoot-automation.service";

describe("ChatwootAutomationService - podeFecharConversa", () => {
  it("permite fechar quando status esta na lista permitida (ex: ENTREGUE, ENVIADO)", () => {
    expect(podeFecharConversa(QuoteStatus.ENTREGUE, [QuoteStatus.ENTREGUE, QuoteStatus.ENVIADO])).toBe(true);
    expect(podeFecharConversa(QuoteStatus.ENVIADO, [QuoteStatus.ENTREGUE, QuoteStatus.ENVIADO])).toBe(true);
  });

  it("permite fechar quando nao ha quote vinculado a conversa (null/undefined), mesmo com lista vazia", () => {
    expect(podeFecharConversa(null, [])).toBe(true);
    expect(podeFecharConversa(undefined, [])).toBe(true);
  });

  it("bloqueia fechamento quando quote esta em status fora da lista permitida (em producao)", () => {
    expect(podeFecharConversa(QuoteStatus.EM_PRODUCAO, [QuoteStatus.ENTREGUE, QuoteStatus.ENVIADO])).toBe(false);
    expect(podeFecharConversa(QuoteStatus.PENDENTE, [QuoteStatus.ENTREGUE, QuoteStatus.ENVIADO])).toBe(false);
  });

  it("lista configurada e respeitada (ex: incluindo status 'APROVADO')", () => {
    expect(podeFecharConversa(QuoteStatus.APROVADO, [QuoteStatus.APROVADO, QuoteStatus.ENTREGUE])).toBe(true);
    expect(podeFecharConversa(QuoteStatus.APROVADO, [QuoteStatus.ENTREGUE])).toBe(false);
  });
});

describe("ChatwootAutomationService - inboxPermitido", () => {
  it("permite quando inbox esta na lista configurada", () => {
    expect(inboxPermitido(21, [1, 21])).toBe(true);
  });

  it("bloqueia quando inbox nao esta na lista", () => {
    expect(inboxPermitido(99, [1, 21])).toBe(false);
  });

  it("bloqueia quando inboxId nao veio no payload", () => {
    expect(inboxPermitido(undefined, [1, 21])).toBe(false);
  });
});

describe("ChatwootAutomationService - calcularSaudacao", () => {
  it("Bom dia entre 5h e 11h59", () => {
    expect(calcularSaudacao(5)).toBe("Bom dia");
    expect(calcularSaudacao(11)).toBe("Bom dia");
  });

  it("Boa tarde entre 12h e 17h59", () => {
    expect(calcularSaudacao(12)).toBe("Boa tarde");
    expect(calcularSaudacao(17)).toBe("Boa tarde");
  });

  it("Boa noite fora do intervalo 5h-18h", () => {
    expect(calcularSaudacao(18)).toBe("Boa noite");
    expect(calcularSaudacao(2)).toBe("Boa noite");
  });
});

describe("ChatwootAutomationService - renderizarPrompt", () => {
  it("substitui o placeholder {{saudacao}} no template", () => {
    const resultado = renderizarPrompt('Comece com "{{saudacao}}"', "Boa tarde");
    expect(resultado).toBe('Comece com "Boa tarde"');
  });
});

describe("ChatwootAutomationService - extrairMensagemIA", () => {
  it("extrai o texto do formato de resposta esperado (estilo OpenAI responses)", () => {
    const resposta = { output: [{ content: [{ text: "Boa tarde! Precisa de ajuda? 😊" }] }] };
    expect(extrairMensagemIA(resposta)).toBe("Boa tarde! Precisa de ajuda? 😊");
  });

  it("retorna null quando o formato e inesperado (sem quebrar o fluxo)", () => {
    expect(extrairMensagemIA({})).toBeNull();
    expect(extrairMensagemIA(null)).toBeNull();
    expect(extrairMensagemIA({ output: [] })).toBeNull();
  });
});

describe("ChatwootAutomationService - handleConversationResolved (orquestracao)", () => {
  function buildService(overrides: {
    quoteStatus?: QuoteStatus | null;
    podeEnviar?: boolean;
    aiResponse?: unknown;
    aiThrows?: boolean;
    statusFechamento?: string;
  } = {}) {
    const prisma = {
      chatwootAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: "default",
          promptFechamento: "Ola {{saudacao}}",
          mensagemPedidoPendente: "Pedido pendente",
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
      quote: {
        findFirst: jest.fn().mockResolvedValue(
          overrides.quoteStatus === undefined ? null : { status: overrides.quoteStatus },
        ),
      },
      chatwootMensagemEnviada: {
        findFirst: jest.fn().mockResolvedValue(overrides.podeEnviar === false ? { id: "existente" } : null),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const chatwoot = {
      toggleConversationStatus: jest.fn().mockResolvedValue({ enabled: true }),
      postConversationNote: jest.fn().mockResolvedValue({ enabled: true }),
      addConversationLabels: jest.fn().mockResolvedValue({ enabled: true }),
      sendOutgoingMessage: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === "CHATWOOT_AUTOMATION_INBOX_IDS") return "1,21";
        if (key === "CHATWOOT_AUTOMATION_STATUS_FECHAMENTO") return overrides.statusFechamento;
        if (key === "CHATWOOT_AI_URL") return "http://ia.local/v1/responses";
        if (key === "CHATWOOT_AI_TOKEN") return "token";
        if (key === "CHATWOOT_AI_MODEL") return "openclaw/main";
        return undefined;
      }),
    };

    const service = new ChatwootAutomationService(prisma as any, chatwoot as any, config as any);

    if (overrides.aiThrows) {
      jest.spyOn(service as any, "chamarIA").mockRejectedValue(new Error("IA indisponivel"));
    } else {
      jest.spyOn(service as any, "chamarIA").mockResolvedValue(
        overrides.aiResponse ?? { output: [{ content: [{ text: "Mensagem gerada pela IA" }] }] },
      );
    }

    return { service, prisma, chatwoot };
  }

  it("ignora webhook de inbox nao monitorado", async () => {
    const { service, prisma } = buildService();
    const result = await service.handleConversationResolved({ id: 1, contact_inbox: { inbox_id: 999 } });
    expect(result).toEqual({ processed: false, reason: "inbox_nao_monitorado" });
    expect(prisma.quote.findFirst).not.toHaveBeenCalled();
  });

  it("bloqueia fechamento e reabre a conversa quando quote esta em producao", async () => {
    const { service, chatwoot, prisma } = buildService({ quoteStatus: QuoteStatus.EM_PRODUCAO });
    const result = await service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 21 } });
    expect(result.action).toBe("bloqueado_pedido_pendente");
    expect(chatwoot.toggleConversationStatus).toHaveBeenCalledWith("42", "open");
    expect(chatwoot.postConversationNote).toHaveBeenCalledWith("42", "Pedido pendente");
    expect(prisma.chatwootMensagemEnviada.findFirst).not.toHaveBeenCalled();
  });

  it("respeita a lista configurada via CHATWOOT_AUTOMATION_STATUS_FECHAMENTO (ex: incluindo 'APROVADO')", async () => {
    const bloqueado = buildService({ quoteStatus: QuoteStatus.APROVADO, statusFechamento: "ENTREGUE,ENVIADO" });
    const resultBloqueado = await bloqueado.service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 1 } });
    expect(resultBloqueado.action).toBe("bloqueado_pedido_pendente");

    const liberado = buildService({ quoteStatus: QuoteStatus.APROVADO, podeEnviar: true, statusFechamento: "APROVADO,ENTREGUE,ENVIADO" });
    const resultLiberado = await liberado.service.handleConversationResolved({ id: 43, contact_inbox: { inbox_id: 1 } });
    expect(resultLiberado.action).toBe("mensagem_enviada");
  });

  it("nao reenvia mensagem de fechamento se ja foi enviada hoje", async () => {
    const { service, chatwoot } = buildService({ quoteStatus: QuoteStatus.ENTREGUE, podeEnviar: false });
    const result = await service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 1 } });
    expect(result.action).toBe("mensagem_ja_enviada_hoje");
    expect(chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
  });

  it("gera e envia mensagem de fechamento via IA quando quote esta entregue", async () => {
    const { service, chatwoot, prisma } = buildService({ quoteStatus: QuoteStatus.ENTREGUE, podeEnviar: true });
    const result = await service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 1 } });
    expect(result.action).toBe("mensagem_enviada");
    expect(chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado"]);
    expect(chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", "Mensagem gerada pela IA");
    expect(prisma.chatwootMensagemEnviada.create).toHaveBeenCalledWith({
      data: { conversationId: "42", tipoEvento: "close", mensagemEnviada: "Mensagem gerada pela IA" },
    });
  });

  it("usa mensagem fallback quando a chamada de IA falha", async () => {
    const { service, chatwoot } = buildService({ quoteStatus: null, podeEnviar: true, aiThrows: true });
    const result = await service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 1 } });
    expect(result.action).toBe("mensagem_enviada");
    expect(chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", expect.stringContaining("Precisa de ajuda com um orçamento"));
  });
});
