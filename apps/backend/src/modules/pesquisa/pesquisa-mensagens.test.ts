/**
 * Fase 52 (plano 52-05): efeitos da resposta no Chatwoot, mensagens de WhatsApp, supressao e
 * re-tentativa. Prisma em memoria, PesquisaConfigService falso, Chatwoot e automacao falsos,
 * timers falsos. Nenhuma escrita real.
 */
import { Logger } from "@nestjs/common";

import { aguardarFilaEtiquetas, cancelarTodosEnviosFechamento, enviosFechamentoPendentes } from "../integrations/chatwoot/chatwoot-etiquetas";
import type { PesquisaConfigView } from "./pesquisa-config.service";
import { PesquisaService } from "./pesquisa.service";

type Linha = Record<string, any>;

const DIA = 86_400_000;
const MINUTO = 60_000;
const TOKEN = "a".repeat(48);
const TOKEN_B = "b".repeat(48);
const TELEFONE = "5512996484918";
const TELEFONE_B = "5512996484919";

const CONFIG_BASE: PesquisaConfigView = {
  ativo: true,
  percentualDesconto: 10,
  tetoDesconto: 5,
  compraMinima: 30,
  validadeCupomDias: 30,
  validadeLinkDias: 7,
  intervaloDias: 0,
  tetoMensal: 300,
  prefixoCupom: "BC",
  linkGoogle: "https://g.page/r/abc/review",
  varianteVisual: "ESTRELAS",
  textoFechamento: "Responda: {link}",
  textoSemRecompensa: "Responda: {link}",
  textoPosResposta: "Cupom {codigo}: {percentual} até {teto}, mínimo {compra_minima}, até {validade}. {nome_empresa}",
  textoConviteGoogle: "Avalie a {nome_empresa}: {link_google}",
  paginaTitulo: "Como foi seu atendimento?",
  paginaSubtitulo: "Leva menos de 1 minuto.",
  paginaObrigadoSemRecompensa: "Obrigado por responder.",
  paginaGoogleTitulo: "Quer compartilhar?",
  paginaGoogleCorpo: "Sua avaliação ajuda.",
  atualizadoEm: null,
  atualizadoPor: null,
};

function pesquisaPadrao(extra: Linha = {}): Linha {
  return {
    id: "pes-1",
    token: TOKEN,
    conversationId: 42n,
    conversationUuid: "uuid-123",
    contactId: 9n,
    telefone: TELEFONE,
    customerId: null,
    variante: "ESTRELAS",
    status: "ENVIADA",
    chatwootCsat: "MENSAGEM_OK",
    nota: null,
    comentario: null,
    envioConviteStatus: "PENDENTE",
    envioConviteReservadoEm: null,
    tentativasEnvio: 0,
    criadaEm: new Date(Date.now() - DIA),
    enviadaEm: new Date(Date.now() - DIA),
    expiraEm: new Date(Date.now() + DIA),
    respondidaEm: null,
    anonimizadaEm: null,
    revogadaEm: null,
    ...extra,
  };
}

function cupomPadrao(extra: Linha = {}): Linha {
  return {
    id: "cup-1",
    codigo: "BC-ABC234",
    pesquisaId: "pes-1",
    telefone: TELEFONE,
    percentual: 10,
    teto: 5,
    compraMinima: 30,
    status: "EMITIDO",
    validadeAte: new Date("2026-12-22T12:00:00-03:00"),
    envioCupomStatus: "PENDENTE",
    envioCupomReservadoEm: null,
    criadoEm: new Date(),
    ...extra,
  };
}

function numero(valor: unknown): number {
  if (valor instanceof Date) return valor.getTime();
  return Number(valor);
}

/** Matcher minimo de where do Prisma: igualdade, null, in, not, lt, lte, gt, gte, OR e AND. */
function casa(linha: Linha, where: Linha): boolean {
  return Object.entries(where).every(([campo, cond]) => {
    if (campo === "OR") return (cond as Linha[]).some((c) => casa(linha, c));
    if (campo === "AND") return (cond as Linha[]).every((c) => casa(linha, c));

    const valor = linha[campo];
    if (cond === null) return valor === null || valor === undefined;
    if (typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("in" in c) return (c.in as unknown[]).includes(valor);
      if ("not" in c) return valor !== c.not;
      if ("lt" in c) return valor !== null && valor !== undefined && numero(valor) < numero(c.lt);
      if ("lte" in c) return valor !== null && valor !== undefined && numero(valor) <= numero(c.lte);
      if ("gt" in c) return valor !== null && valor !== undefined && numero(valor) > numero(c.gt);
      if ("gte" in c) return valor !== null && valor !== undefined && numero(valor) >= numero(c.gte);
      throw new Error(`operador nao suportado no mock: ${JSON.stringify(Object.keys(c))}`);
    }
    return valor === cond;
  });
}

type Opcoes = {
  config?: Partial<PesquisaConfigView>;
  pesquisas?: Linha[];
  cupons?: Linha[];
  suprimidos?: string[];
  chatwoot?: Linha;
};

function montar(opcoes: Opcoes = {}) {
  let seq = 0;
  const cfg: PesquisaConfigView = { ...CONFIG_BASE, ...(opcoes.config ?? {}) };
  const pesquisas: Linha[] = (opcoes.pesquisas ?? [pesquisaPadrao()]).map((p) => ({ ...p }));
  const cupons: Linha[] = (opcoes.cupons ?? []).map((c) => ({ ...c }));
  const suprimidos = new Set<string>(opcoes.suprimidos ?? []);

  const prisma = {
    pesquisaSatisfacao: {
      findUnique: jest.fn(async ({ where, select }: { where: Linha; select?: Linha }) => {
        const achada = pesquisas.find((p) => casa(p, where));
        if (!achada) return null;
        if (select) return Object.fromEntries(Object.keys(select).map((campo) => [campo, achada[campo]]));
        return { ...achada };
      }),
      findFirst: jest.fn(async ({ where }: { where: Linha }) => {
        const achadas = pesquisas.filter((p) => casa(p, where));
        return achadas.length > 0 ? { ...achadas[achadas.length - 1] } : null;
      }),
      findMany: jest.fn(async ({ where }: { where?: Linha } = {}) =>
        pesquisas.filter((p) => (where ? casa(p, where) : true)).map((p) => ({ ...p })),
      ),
      create: jest.fn(async ({ data }: { data: Linha }) => {
        seq += 1;
        const linha: Linha = { ...pesquisaPadrao(), id: `pes-${seq}`, ...data };
        pesquisas.push(linha);
        return { ...linha };
      }),
      update: jest.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvo = pesquisas.find((p) => casa(p, where));
        if (!alvo) throw new Error("pesquisa inexistente");
        Object.assign(alvo, data);
        return { ...alvo };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvo = pesquisas.filter((p) => casa(p, where));
        alvo.forEach((p) => Object.assign(p, data));
        return { count: alvo.length };
      }),
      count: jest.fn(async ({ where }: { where: Linha }) => pesquisas.filter((p) => casa(p, where)).length),
    },
    cupomRecompensa: {
      findUnique: jest.fn(async ({ where }: { where: Linha }) => {
        const achado = cupons.find((c) => casa(c, where));
        return achado ? { ...achado } : null;
      }),
      findMany: jest.fn(async ({ where }: { where?: Linha } = {}) =>
        cupons.filter((c) => (where ? casa(c, where) : true)).map((c) => ({ ...c })),
      ),
      create: jest.fn(async ({ data }: { data: Linha }) => {
        seq += 1;
        const linha: Linha = { id: `cup-${seq}`, status: "EMITIDO", criadoEm: new Date(), ...data };
        cupons.push(linha);
        return { ...linha };
      }),
      count: jest.fn(async ({ where }: { where: Linha }) => cupons.filter((c) => casa(c, where)).length),
      aggregate: jest.fn(async () => ({ _sum: { descontoAplicado: null } })),
      update: jest.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvo = cupons.find((c) => casa(c, where));
        if (!alvo) throw new Error("cupom inexistente");
        Object.assign(alvo, data);
        return { ...alvo };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvo = cupons.filter((c) => casa(c, where));
        alvo.forEach((c) => Object.assign(c, data));
        return { count: alvo.length };
      }),
    },
    pesquisaSupressao: {
      findUnique: jest.fn(async ({ where }: { where: { telefone: string } }) =>
        suprimidos.has(where.telefone) ? { telefone: where.telefone, origem: "SAIR" } : null,
      ),
    },
  };

  const env: Record<string, string> = {
    APP_BASE_URL: "https://app.test",
    EMPRESA_NOME: "Loja Teste",
    EMPRESA_COR_PRIMARIA: "#112233",
  };
  const configService = { get: jest.fn((chave: string) => env[chave]) };
  const configPesquisa = {
    obter: jest.fn(async () => ({ ...cfg })),
    padroes: jest.fn(() => ({ ...cfg })),
  };
  const chatwoot: Record<string, jest.Mock> = {
    postConversationNote: jest.fn(async () => ({ enabled: true, sent: true })),
    sendOutgoingMessage: jest.fn(async () => ({ enabled: true })),
    updateContactCustomAttributes: jest.fn(async () => ({ enabled: true })),
    getConversationLabels: jest.fn(async () => [] as string[]),
    addConversationLabels: jest.fn(async () => ({ enabled: true })),
    createPrivateCsatMessage: jest.fn(async () => ({ enabled: true, id: 900 })),
    submitCsatResponse: jest.fn(async () => ({ enabled: true })),
    getInbox: jest.fn(async () => ({ csat_survey_enabled: false })),
    getConversation: jest.fn(async () => ({ inbox_id: 1 })),
    listMessagesAfter: jest.fn(async () => [] as unknown[]),
    ...(opcoes.chatwoot ?? {}),
  };
  const automation = { registrarGanchoPesquisa: jest.fn() };

  const service = new PesquisaService(
    prisma as never,
    chatwoot as never,
    configService as never,
    automation as never,
    configPesquisa as never,
  );

  return { service, prisma, chatwoot, cfg, pesquisas, cupons, suprimidos };
}

type Ctx = ReturnType<typeof montar>;

/** Deixa a fila de etiquetas e todos os efeitos em segundo plano terminarem. */
async function assentar(service: PesquisaService): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
    await service.aguardarEfeitos();
    await aguardarFilaEtiquetas();
  }
  await service.aguardarEfeitos();
}

async function avancar(service: PesquisaService, ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  await assentar(service);
}

let logs: string[] = [];

function espiarLogs(): void {
  logs = [];
  for (const nivel of ["log", "warn", "error", "debug", "verbose"] as const) {
    jest.spyOn(Logger.prototype, nivel).mockImplementation((...args: unknown[]) => {
      logs.push(`${nivel}: ${args.map((a) => String(a)).join(" ")}`);
    });
  }
}

function semSegredos(texto: string): void {
  expect(texto).not.toContain(TELEFONE);
  expect(texto).not.toContain(TELEFONE_B);
  expect(texto).not.toContain(TOKEN);
  expect(texto).not.toMatch(/BC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}/);
}

describe("PesquisaService - efeitos no Chatwoot (Fase 52, plano 52-05, Task 1)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    espiarLogs();
  });

  afterEach(async () => {
    await aguardarFilaEtiquetas();
    cancelarTodosEnviosFechamento();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("efeitos: nota 2 grava nota privada, atributos do contato e etiquetas mescladas", async () => {
    const ctx = montar();
    ctx.chatwoot.getConversationLabels.mockResolvedValue(["finalizado"]);

    const resultado = await ctx.service.responder(TOKEN, 2, "demorou");
    expect(resultado.tipo).toBe("OK");
    await assentar(ctx.service);

    const [conversationId, nota] = ctx.chatwoot.postConversationNote.mock.calls[0];
    const codigo = ctx.cupons[0].codigo as string;
    expect(conversationId).toBe("42");
    expect(nota).toContain("nota 2 de 5");
    expect(nota).toContain("ESTRELAS");
    expect(nota).toContain("demorou");
    expect(nota).toContain(codigo);

    expect(ctx.chatwoot.updateContactCustomAttributes).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ ultima_nota_csat: 2, cupom_ativo: codigo }),
    );
    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado", "avaliou", "csat-baixo"]);
  });

  it("efeitos: nota 5 remove csat-baixo e mantem avaliou", async () => {
    const ctx = montar();
    ctx.chatwoot.getConversationLabels.mockResolvedValue(["finalizado", "csat-baixo"]);

    await ctx.service.responder(TOKEN, 5);
    await assentar(ctx.service);

    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledWith("42", ["finalizado", "avaliou"]);
  });

  it("efeitos: sem cupom a nota privada diz que nenhum cupom foi emitido e os atributos ficam vazios", async () => {
    const ctx = montar({ config: { tetoMensal: 0 } });

    const resultado = await ctx.service.responder(TOKEN, 4);
    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).toBeNull();
    await assentar(ctx.service);

    const nota = ctx.chatwoot.postConversationNote.mock.calls[0][1] as string;
    expect(nota.toLowerCase()).toContain("nenhum cupom foi emitido");
    expect(ctx.chatwoot.updateContactCustomAttributes).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ cupom_ativo: "", cupom_validade: "" }),
    );
  });

  it("efeitos: sem contactId nao chama os atributos e os demais efeitos acontecem", async () => {
    const ctx = montar({ pesquisas: [pesquisaPadrao({ contactId: null })] });

    await ctx.service.responder(TOKEN, 4);
    await assentar(ctx.service);

    expect(ctx.chatwoot.updateContactCustomAttributes).not.toHaveBeenCalled();
    expect(ctx.chatwoot.postConversationNote).toHaveBeenCalledTimes(1);
    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledTimes(1);
  });

  it("best-effort: falha da nota privada nao impede atributos nem etiquetas", async () => {
    const ctx = montar();
    ctx.chatwoot.postConversationNote.mockRejectedValue(new Error("note fora"));

    const resultado = await ctx.service.responder(TOKEN, 2);
    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).not.toBeNull();
    await assentar(ctx.service);

    expect(ctx.chatwoot.updateContactCustomAttributes).toHaveBeenCalledTimes(1);
    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.startsWith("warn") && l.includes("pesquisaId=pes-1") && l.includes("note fora"))).toBe(true);
    for (const linha of logs) semSegredos(linha);
  });

  it("best-effort: falha dos atributos nao impede as etiquetas", async () => {
    const ctx = montar();
    ctx.chatwoot.updateContactCustomAttributes.mockRejectedValue(new Error("contato fora"));

    await ctx.service.responder(TOKEN, 3);
    await assentar(ctx.service);

    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.startsWith("warn") && l.includes("contato fora"))).toBe(true);
  });

  it("best-effort: falha das etiquetas nao bloqueia a resposta nem os outros efeitos", async () => {
    const ctx = montar();
    ctx.chatwoot.getConversationLabels.mockRejectedValue(new Error("labels fora"));

    const resultado = await ctx.service.responder(TOKEN, 4);
    expect(resultado.tipo).toBe("OK");
    await assentar(ctx.service);

    expect(ctx.chatwoot.postConversationNote).toHaveBeenCalledTimes(1);
    expect(ctx.chatwoot.updateContactCustomAttributes).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.startsWith("warn") && l.includes("labels fora"))).toBe(true);
    for (const linha of logs) semSegredos(linha);
  });

  it("best-effort: falha do PUT nativo vira RESPOSTA_FALHA e nao impede os outros efeitos", async () => {
    const ctx = montar();
    ctx.chatwoot.submitCsatResponse.mockRejectedValue(new Error("put fora"));

    await ctx.service.responder(TOKEN, 5);
    await assentar(ctx.service);

    expect(ctx.pesquisas[0].chatwootCsat).toBe("RESPOSTA_FALHA");
    expect(ctx.chatwoot.postConversationNote).toHaveBeenCalledTimes(1);
    expect(ctx.chatwoot.updateContactCustomAttributes).toHaveBeenCalledTimes(1);
    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.startsWith("warn") && l.includes("put fora"))).toBe(true);
  });

  it("D-28: AGUARDANDO_MENSAGEM e MENSAGEM_FALHA nao enviam o PUT e mantem o estado", async () => {
    for (const estado of ["AGUARDANDO_MENSAGEM", "MENSAGEM_FALHA"]) {
      const ctx = montar({ pesquisas: [pesquisaPadrao({ chatwootCsat: estado })] });

      await ctx.service.responder(TOKEN, 4);
      await assentar(ctx.service);

      expect(ctx.chatwoot.submitCsatResponse).not.toHaveBeenCalled();
      expect(ctx.pesquisas[0].chatwootCsat).toBe(estado);
      expect(ctx.chatwoot.postConversationNote).toHaveBeenCalledTimes(1);
    }
  });

  it("D-28: NAO_APLICAVEL nao faz CSAT nativo mas faz nota, atributos e etiquetas", async () => {
    const ctx = montar({ pesquisas: [pesquisaPadrao({ chatwootCsat: "NAO_APLICAVEL" })] });

    await ctx.service.responder(TOKEN, 5);
    await assentar(ctx.service);

    expect(ctx.chatwoot.submitCsatResponse).not.toHaveBeenCalled();
    expect(ctx.chatwoot.postConversationNote).toHaveBeenCalledTimes(1);
    expect(ctx.chatwoot.updateContactCustomAttributes).toHaveBeenCalledTimes(1);
    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledTimes(1);
  });

  it("D-28: a segunda pesquisa da mesma conversa nao chama o PUT mas gera os demais efeitos", async () => {
    const ctx = montar({
      pesquisas: [
        pesquisaPadrao({ id: "pes-1", token: TOKEN, chatwootCsat: "NAO_APLICAVEL" }),
        pesquisaPadrao({ id: "pes-2", token: TOKEN_B, telefone: TELEFONE_B, chatwootCsat: "NAO_APLICAVEL" }),
      ],
    });

    await ctx.service.responder(TOKEN_B, 4);
    await assentar(ctx.service);

    expect(ctx.chatwoot.submitCsatResponse).not.toHaveBeenCalled();
    expect(ctx.chatwoot.postConversationNote).toHaveBeenCalledWith("42", expect.stringContaining("nota 4 de 5"));
    expect(ctx.chatwoot.updateContactCustomAttributes).toHaveBeenCalledTimes(1);
    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledTimes(1);
  });

  it("fila por conversa: as etiquetas de duas respostas da mesma conversa rodam em serie", async () => {
    const ctx = montar({
      pesquisas: [
        pesquisaPadrao({ id: "pes-1", token: TOKEN, telefone: TELEFONE }),
        pesquisaPadrao({ id: "pes-2", token: TOKEN_B, telefone: TELEFONE_B, chatwootCsat: "NAO_APLICAVEL" }),
      ],
    });
    ctx.chatwoot.getConversationLabels.mockResolvedValue(["finalizado"]);

    await ctx.service.responder(TOKEN, 5);
    await ctx.service.responder(TOKEN_B, 1);
    await assentar(ctx.service);

    expect(ctx.chatwoot.addConversationLabels).toHaveBeenCalledTimes(2);
    const primeiraLeitura = ctx.chatwoot.getConversationLabels.mock.invocationCallOrder[0];
    const primeiraEscrita = ctx.chatwoot.addConversationLabels.mock.invocationCallOrder[0];
    const segundaLeitura = ctx.chatwoot.getConversationLabels.mock.invocationCallOrder[1];
    expect(primeiraLeitura).toBeLessThan(primeiraEscrita);
    expect(primeiraEscrita).toBeLessThan(segundaLeitura);
  });

  it("anonimizada: pesquisa com conversationId nulo nao recebe nenhum efeito", async () => {
    const ctx = montar({ pesquisas: [pesquisaPadrao({ conversationId: null })] });

    const resultado = await ctx.service.responder(TOKEN, 4);
    expect(resultado.tipo).toBe("OK");
    await assentar(ctx.service);

    expect(ctx.chatwoot.postConversationNote).not.toHaveBeenCalled();
    expect(ctx.chatwoot.updateContactCustomAttributes).not.toHaveBeenCalled();
    expect(ctx.chatwoot.addConversationLabels).not.toHaveBeenCalled();
  });
});
