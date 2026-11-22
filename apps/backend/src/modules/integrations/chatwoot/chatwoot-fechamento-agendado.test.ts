/**
 * Fase 51 (plano 51-04): fechamento de conversa com etiquetas enfileiradas e mensagem agendada.
 * Fake timers; axios e Chatwoot sempre falsos; nenhum teste espera tempo real.
 */
import { QuoteStatus } from "@prisma/client";

import { ChatwootAutomationService } from "./chatwoot-automation.service";
import {
  agendarEnvioFechamento,
  aguardarFilaEtiquetas,
  cancelarTodosEnviosFechamento,
  enviosFechamentoPendentes,
  lerAtrasoFechamentoS,
  sortearAtrasoHumanoMs,
} from "./chatwoot-etiquetas";

type Opcoes = {
  quoteStatus?: QuoteStatus | null;
  customerId?: string;
  contagem?: number;
  podeEnviar?: boolean;
  statusFechamento?: string;
  atrasoMin?: string;
  atrasoMax?: string;
};

function buildService(opcoes: Opcoes = {}) {
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
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opcoes.quoteStatus === undefined || opcoes.quoteStatus === null
            ? null
            : { status: opcoes.quoteStatus, customerId: opcoes.customerId ?? "cus-1" },
        ),
      count: jest.fn().mockResolvedValue(opcoes.contagem ?? 0),
    },
    chatwootMensagemEnviada: {
      findFirst: jest.fn().mockResolvedValue(opcoes.podeEnviar === false ? { id: "existente" } : null),
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
    get: jest.fn((chave: string) => {
      if (chave === "CHATWOOT_AUTOMATION_INBOX_IDS") return "1,21";
      if (chave === "CHATWOOT_AUTOMATION_STATUS_FECHAMENTO") return opcoes.statusFechamento;
      if (chave === "CHATWOOT_FECHAMENTO_ATRASO_MIN_S") return opcoes.atrasoMin;
      if (chave === "CHATWOOT_FECHAMENTO_ATRASO_MAX_S") return opcoes.atrasoMax;
      return undefined;
    }),
  };

  const service = new ChatwootAutomationService(prisma as any, chatwoot as any, config as any);
  jest
    .spyOn(service as any, "chamarIA")
    .mockResolvedValue({ output: [{ content: [{ text: "Mensagem gerada pela IA" }] }] });
  const warn = jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);
  jest.spyOn((service as any).logger, "log").mockImplementation(() => undefined);

  return { service, prisma, chatwoot, config, warn };
}

/** O retorno e uma uniao discriminada; os testes olham so o campo action. */
const acao = (resultado: unknown) => (resultado as { action?: string }).action;

const PAYLOAD = { id: 42, contact_inbox: { inbox_id: 1 } };

describe("ChatwootAutomationService - fechamento agendado (Fase 51)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await aguardarFilaEtiquetas();
    cancelarTodosEnviosFechamento();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("A1 (tracer): enfileira finalizado + cliente-frequente e so envia a mensagem depois do atraso", async () => {
    const { service, chatwoot, prisma } = buildService({ quoteStatus: QuoteStatus.ENTREGUE, contagem: 3 });

    const resultado = await service.handleConversationResolved(PAYLOAD);

    expect(acao(resultado)).toBe("mensagem_agendada");
    const atrasoMs = (resultado as unknown as { atrasoMs: number }).atrasoMs;
    expect(atrasoMs).toBeGreaterThanOrEqual(45000);
    expect(atrasoMs).toBeLessThanOrEqual(180000);

    await aguardarFilaEtiquetas();
    expect(chatwoot.addConversationLabels).toHaveBeenCalledTimes(1);
    expect(chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado", "cliente-frequente"]);
    expect(chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(atrasoMs - 1);
    expect(chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(chatwoot.sendOutgoingMessage).toHaveBeenCalledWith("42", "Mensagem gerada pela IA");
    expect(prisma.chatwootMensagemEnviada.create).toHaveBeenCalledWith({
      data: { conversationId: "42", tipoEvento: "close", mensagemEnviada: "Mensagem gerada pela IA" },
    });
  });

  it("A2 (D-19): mensagem ja enviada hoje ainda enfileira as etiquetas e nao agenda nada", async () => {
    const { service, chatwoot } = buildService({ quoteStatus: QuoteStatus.ENTREGUE, contagem: 0, podeEnviar: false });

    const resultado = await service.handleConversationResolved(PAYLOAD);

    expect(acao(resultado)).toBe("mensagem_ja_enviada_hoje");
    await aguardarFilaEtiquetas();
    expect(chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado"]);
    expect(enviosFechamentoPendentes()).toBe(0);

    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
  });

  it("A3 (D-07): pedido pendente reabre, posta a nota e nao toca em etiqueta nem na contagem", async () => {
    const { service, chatwoot, prisma } = buildService({ quoteStatus: QuoteStatus.EM_PRODUCAO });

    const resultado = await service.handleConversationResolved(PAYLOAD);

    expect(acao(resultado)).toBe("bloqueado_pedido_pendente");
    expect(chatwoot.toggleConversationStatus).toHaveBeenCalledWith("42", "open");
    expect(chatwoot.postConversationNote).toHaveBeenCalledWith("42", "Pedido pendente");
    await aguardarFilaEtiquetas();
    expect(chatwoot.addConversationLabels).not.toHaveBeenCalled();
    expect(prisma.quote.count).not.toHaveBeenCalled();
    expect(enviosFechamentoPendentes()).toBe(0);
  });

  it("A4: sem cotacao grava so finalizado e nao conta pedidos", async () => {
    const { service, chatwoot, prisma } = buildService({ quoteStatus: null });

    const resultado = await service.handleConversationResolved(PAYLOAD);

    expect(acao(resultado)).toBe("mensagem_agendada");
    await aguardarFilaEtiquetas();
    expect(chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado"]);
    expect(prisma.quote.count).not.toHaveBeenCalled();
  });

  it("A5: cliente com 2 pedidos concretizados nao recebe cliente-frequente", async () => {
    const { service, chatwoot } = buildService({ quoteStatus: QuoteStatus.ENTREGUE, contagem: 2 });

    await service.handleConversationResolved(PAYLOAD);

    await aguardarFilaEtiquetas();
    expect(chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado"]);
  });

  it("A6 (best-effort): falha ao gravar etiquetas ou contar vira warn e a mensagem e agendada do mesmo jeito", async () => {
    const falhaGravar = buildService({ quoteStatus: QuoteStatus.ENTREGUE, contagem: 3 });
    falhaGravar.chatwoot.addConversationLabels.mockRejectedValue(new Error("chatwoot fora"));

    const resultado = await falhaGravar.service.handleConversationResolved(PAYLOAD);
    expect(acao(resultado)).toBe("mensagem_agendada");
    await aguardarFilaEtiquetas();
    expect(falhaGravar.warn).toHaveBeenCalledWith(expect.stringContaining("chatwoot fora"));
    expect(enviosFechamentoPendentes()).toBe(1);
    cancelarTodosEnviosFechamento();

    const falhaContar = buildService({ quoteStatus: QuoteStatus.ENTREGUE });
    falhaContar.prisma.quote.count.mockRejectedValue(new Error("banco fora"));

    const resultado2 = await falhaContar.service.handleConversationResolved({ id: 43, contact_inbox: { inbox_id: 1 } });
    expect(acao(resultado2)).toBe("mensagem_agendada");
    await aguardarFilaEtiquetas();
    expect(falhaContar.chatwoot.addConversationLabels).toHaveBeenCalledWith("43", ["finalizado"]);
    expect(falhaContar.warn).toHaveBeenCalledWith(expect.stringContaining("banco fora"));
  });

  it("A7 (dedupe): duas resolucoes da mesma conversa deixam um timer e enviam uma unica mensagem", async () => {
    const { service, chatwoot } = buildService({ quoteStatus: QuoteStatus.ENTREGUE });

    await service.handleConversationResolved(PAYLOAD);
    await service.handleConversationResolved(PAYLOAD);

    expect(enviosFechamentoPendentes()).toBe(1);
    await jest.advanceTimersByTimeAsync(180000);
    expect(chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
  });

  it("A8 (D-08): a lista de liberacao por env libera PRONTO_PARA_ENTREGA e bloqueia EM_PRODUCAO", async () => {
    const lista = "PRONTO_PARA_ENTREGA,ENTREGUE,ENVIADO,CANCELADO";
    const liberado = buildService({ quoteStatus: QuoteStatus.PRONTO_PARA_ENTREGA, statusFechamento: lista });
    const bloqueado = buildService({ quoteStatus: QuoteStatus.EM_PRODUCAO, statusFechamento: lista });

    expect(acao(await liberado.service.handleConversationResolved(PAYLOAD))).toBe("mensagem_agendada");
    expect(acao(await bloqueado.service.handleConversationResolved({ id: 43, contact_inbox: { inbox_id: 1 } }))).toBe(
      "bloqueado_pedido_pendente",
    );
  });

  it("A9: atraso minimo e maximo vindos de env limitam o sorteio e o envio ocorre dentro da janela", async () => {
    const { service, chatwoot } = buildService({ quoteStatus: QuoteStatus.ENTREGUE, atrasoMin: "10", atrasoMax: "20" });

    const resultado = await service.handleConversationResolved(PAYLOAD);

    const atrasoMs = (resultado as unknown as { atrasoMs: number }).atrasoMs;
    expect(atrasoMs).toBeGreaterThanOrEqual(10000);
    expect(atrasoMs).toBeLessThanOrEqual(20000);
    await jest.advanceTimersByTimeAsync(20000);
    expect(chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
  });

  it("A10 (limite no envio): se o limite diario estourar entre o webhook e o disparo, nao envia", async () => {
    const { service, chatwoot, prisma } = buildService({ quoteStatus: QuoteStatus.ENTREGUE });
    prisma.chatwootMensagemEnviada.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: "chegou-depois" });

    const resultado = await service.handleConversationResolved(PAYLOAD);
    expect(acao(resultado)).toBe("mensagem_agendada");

    await jest.advanceTimersByTimeAsync(180000);
    expect(chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
    expect(prisma.chatwootMensagemEnviada.create).not.toHaveBeenCalled();
  });

  it("A11 (W2): o webhook responde e a mensagem sai mesmo com a escrita de etiquetas pendente", async () => {
    const { service, chatwoot } = buildService({ quoteStatus: QuoteStatus.ENTREGUE, contagem: 3 });
    let liberar: (valor: unknown) => void = () => undefined;
    chatwoot.addConversationLabels.mockImplementation(
      () => new Promise((resolver) => { liberar = resolver; }),
    );

    const resultado = await service.handleConversationResolved(PAYLOAD);

    expect(acao(resultado)).toBe("mensagem_agendada");
    await jest.advanceTimersByTimeAsync(180000);
    expect(chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);

    liberar({ enabled: true });
    await aguardarFilaEtiquetas();
    expect(chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado", "cliente-frequente"]);
  });
});

describe("atraso humano do fechamento (funcoes puras)", () => {
  it("sortearAtrasoHumanoMs e triangular: extremos e meio do intervalo", () => {
    expect(sortearAtrasoHumanoMs(45, 180, () => 0)).toBe(45000);
    expect(sortearAtrasoHumanoMs(45, 180, () => 1)).toBe(180000);
    expect(sortearAtrasoHumanoMs(45, 180, () => 0.5)).toBe(112500);
  });

  it("sortearAtrasoHumanoMs troca min e max invertidos e fica sempre dentro do intervalo", () => {
    expect(sortearAtrasoHumanoMs(180, 45, () => 0.5)).toBe(sortearAtrasoHumanoMs(45, 180, () => 0.5));
    for (let i = 0; i < 200; i++) {
      const valor = sortearAtrasoHumanoMs(45, 180, Math.random);
      expect(valor).toBeGreaterThanOrEqual(45000);
      expect(valor).toBeLessThanOrEqual(180000);
    }
  });

  it("lerAtrasoFechamentoS: padrao quando vazio, valores validos e troca de min e max", () => {
    expect(lerAtrasoFechamentoS(() => undefined)).toEqual({ minS: 45, maxS: 180 });
    const env = (min?: string, max?: string) => (chave: string) =>
      chave === "CHATWOOT_FECHAMENTO_ATRASO_MIN_S" ? min : max;
    expect(lerAtrasoFechamentoS(env("10", "20"))).toEqual({ minS: 10, maxS: 20 });
    expect(lerAtrasoFechamentoS(env("20", "10"))).toEqual({ minS: 10, maxS: 20 });
  });

  it("lerAtrasoFechamentoS: valor invalido volta ao padrao e o teto e 900 s", () => {
    const env = (min?: string, max?: string) => (chave: string) =>
      chave === "CHATWOOT_FECHAMENTO_ATRASO_MIN_S" ? min : max;
    expect(lerAtrasoFechamentoS(env("abc", "0"))).toEqual({ minS: 45, maxS: 180 });
    expect(lerAtrasoFechamentoS(env("-5", "-1"))).toEqual({ minS: 45, maxS: 180 });
    expect(lerAtrasoFechamentoS(env("10", "5000"))).toEqual({ minS: 10, maxS: 900 });
  });

  it("agendarEnvioFechamento substitui o timer anterior da mesma conversa e engole falha da tarefa", async () => {
    jest.useFakeTimers();
    try {
      const primeira = jest.fn().mockResolvedValue(undefined);
      const segunda = jest.fn().mockRejectedValue(new Error("falha da tarefa"));
      agendarEnvioFechamento("99", 1000, primeira);
      agendarEnvioFechamento("99", 2000, segunda);
      expect(enviosFechamentoPendentes()).toBe(1);

      await jest.advanceTimersByTimeAsync(2000);
      expect(primeira).not.toHaveBeenCalled();
      expect(segunda).toHaveBeenCalledTimes(1);
      expect(enviosFechamentoPendentes()).toBe(0);
    } finally {
      cancelarTodosEnviosFechamento();
      jest.useRealTimers();
    }
  });
});
