import {
  ChatwootAutomationService,
  calcularSaudacao,
  extrairMensagemIA,
  inboxPermitido,
  podeFecharConversa,
  renderizarPrompt,
} from "./chatwoot-automation.service";

describe("ChatwootAutomationService - podeFecharConversa", () => {
  it("permite fechar quando status esta na lista permitida (ex: 7=finalizado, 8=entregue)", () => {
    expect(podeFecharConversa(7, [7, 8])).toBe(true);
    expect(podeFecharConversa(8, [7, 8])).toBe(true);
  });

  it("permite fechar quando nao ha pedido vinculado ao chat (null/undefined), mesmo com lista vazia", () => {
    expect(podeFecharConversa(null, [])).toBe(true);
    expect(podeFecharConversa(undefined, [])).toBe(true);
  });

  it("bloqueia fechamento quando pedido esta em status fora da lista permitida (em producao)", () => {
    expect(podeFecharConversa(3, [7, 8])).toBe(false);
    expect(podeFecharConversa(0, [7, 8])).toBe(false);
  });

  it("lista configurada e respeitada (ex: incluindo status de 'nao pago')", () => {
    expect(podeFecharConversa(1, [1, 7, 8])).toBe(true);
    expect(podeFecharConversa(1, [7, 8])).toBe(false);
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
    ultimoStatus?: number | null;
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
    };
    const chatwoot = {
      toggleConversationStatus: jest.fn().mockResolvedValue({ enabled: true }),
      postConversationNote: jest.fn().mockResolvedValue({ enabled: true }),
      addConversationLabels: jest.fn().mockResolvedValue({ enabled: true }),
      sendOutgoingMessage: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const pedidosDb = {
      buscarUltimoStatusPorChatId: jest.fn().mockResolvedValue(
        overrides.ultimoStatus === undefined ? null : { pedidoId: 1, numero: "1", nome: "Cliente", ultimoStatus: overrides.ultimoStatus, quando: new Date() },
      ),
      podeEnviarMensagemFechamento: jest.fn().mockResolvedValue(overrides.podeEnviar ?? true),
      registrarMensagemEnviada: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === "CHATWOOT_AUTOMATION_INBOX_IDS") return "1,21";
        if (key === "CHATWOOT_AUTOMATION_STATUS_FECHAMENTO") return overrides.statusFechamento ?? "7,8";
        if (key === "CHATWOOT_AI_URL") return "http://ia.local/v1/responses";
        if (key === "CHATWOOT_AI_TOKEN") return "token";
        if (key === "CHATWOOT_AI_MODEL") return "openclaw/main";
        return undefined;
      }),
    };

    const service = new ChatwootAutomationService(prisma as any, chatwoot as any, pedidosDb as any, config as any);

    if (overrides.aiThrows) {
      jest.spyOn(service as any, "chamarIA").mockRejectedValue(new Error("IA indisponivel"));
    } else {
      jest.spyOn(service as any, "chamarIA").mockResolvedValue(
        overrides.aiResponse ?? { output: [{ content: [{ text: "Mensagem gerada pela IA" }] }] },
      );
    }

    return { service, prisma, chatwoot, pedidosDb };
  }

  it("ignora webhook de inbox nao monitorado", async () => {
    const { service, pedidosDb } = buildService();
    const result = await service.handleConversationResolved({ id: 1, contact_inbox: { inbox_id: 999 } });
    expect(result).toEqual({ processed: false, reason: "inbox_nao_monitorado" });
    expect(pedidosDb.buscarUltimoStatusPorChatId).not.toHaveBeenCalled();
  });

  it("bloqueia fechamento e reabre a conversa quando pedido esta pendente", async () => {
    const { service, chatwoot, pedidosDb } = buildService({ ultimoStatus: 3 });
    const result = await service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 21 } });
    expect(result.action).toBe("bloqueado_pedido_pendente");
    expect(chatwoot.toggleConversationStatus).toHaveBeenCalledWith("42", "open");
    expect(chatwoot.postConversationNote).toHaveBeenCalledWith("42", "Pedido pendente");
    expect(pedidosDb.podeEnviarMensagemFechamento).not.toHaveBeenCalled();
  });

  it("respeita a lista configurada via CHATWOOT_AUTOMATION_STATUS_FECHAMENTO (ex: incluindo 'nao pago')", async () => {
    // status 1 = "Nao Pago" (primeiro status) — nao libera por default (7,8), mas libera quando configurado
    const bloqueado = buildService({ ultimoStatus: 1, statusFechamento: "7,8" });
    const resultBloqueado = await bloqueado.service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 1 } });
    expect(resultBloqueado.action).toBe("bloqueado_pedido_pendente");

    const liberado = buildService({ ultimoStatus: 1, podeEnviar: true, statusFechamento: "1,7,8" });
    const resultLiberado = await liberado.service.handleConversationResolved({ id: 43, contact_inbox: { inbox_id: 1 } });
    expect(resultLiberado.action).toBe("mensagem_enviada");
  });

  it("nao reenvia mensagem de fechamento se ja foi enviada hoje", async () => {
    const { service, chatwoot } = buildService({ ultimoStatus: 7, podeEnviar: false });
    const result = await service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 1 } });
    expect(result.action).toBe("mensagem_ja_enviada_hoje");
    expect(chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
  });

  it("gera e envia mensagem de fechamento via IA quando pedido esta finalizado", async () => {
    const { service, chatwoot, pedidosDb } = buildService({ ultimoStatus: 7, podeEnviar: true });
    const result = await service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 1 } });
    expect(result.action).toBe("mensagem_enviada");
    expect(chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado"]);
    expect(chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", "Mensagem gerada pela IA");
    expect(pedidosDb.registrarMensagemEnviada).toHaveBeenCalledWith("42", "close", "Mensagem gerada pela IA");
  });

  it("usa mensagem fallback quando a chamada de IA falha", async () => {
    const { service, chatwoot } = buildService({ ultimoStatus: null, podeEnviar: true, aiThrows: true });
    const result = await service.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 1 } });
    expect(result.action).toBe("mensagem_enviada");
    expect(chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", expect.stringContaining("Precisa de ajuda com um orçamento"));
  });
});
