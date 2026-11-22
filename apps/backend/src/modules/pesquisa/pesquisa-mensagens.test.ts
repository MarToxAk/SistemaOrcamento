/**
 * Fase 52 (plano 52-05): efeitos da resposta no Chatwoot, mensagens de WhatsApp, supressao e
 * re-tentativa. Prisma em memoria, PesquisaConfigService falso, Chatwoot e automacao falsos,
 * timers falsos. Nenhuma escrita real.
 */
import { Logger } from "@nestjs/common";

import { aguardarFilaEtiquetas, cancelarTodosEnviosFechamento, enviosFechamentoPendentes } from "../integrations/chatwoot/chatwoot-etiquetas";
import type { PesquisaConfigView } from "./pesquisa-config.service";
import { montarVariaveisMensagem } from "./pesquisa-efeitos";
import { renderizarTexto } from "./pesquisa-regras";
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
      const operadores = ["in", "not", "lt", "lte", "gt", "gte"].filter((chave) => chave in c);
      if (operadores.length === 0) throw new Error(`operador nao suportado no mock: ${JSON.stringify(Object.keys(c))}`);
      for (const operador of operadores) {
        if (operador === "in" && !(c.in as unknown[]).includes(valor)) return false;
        if (operador === "not" && valor === c.not) return false;
        if (operador === "lt" && !(valor !== null && valor !== undefined && numero(valor) < numero(c.lt))) return false;
        if (operador === "lte" && !(valor !== null && valor !== undefined && numero(valor) <= numero(c.lte))) return false;
        if (operador === "gt" && !(valor !== null && valor !== undefined && numero(valor) > numero(c.gt))) return false;
        if (operador === "gte" && !(valor !== null && valor !== undefined && numero(valor) >= numero(c.gte))) return false;
      }
      return true;
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

describe("PesquisaService - mensagens de WhatsApp e re-tentativa (Fase 52, plano 52-05, Task 2)", () => {
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

  function textoEnviado(ctx: Ctx, indice = 0): string {
    return ctx.chatwoot.sendOutgoingMessage.mock.calls[indice][1] as string;
  }

  function respondidaEm(ms: number, extra: Linha = {}): Linha {
    return pesquisaPadrao({ respondidaEm: new Date(Date.now() - ms), nota: 5, status: "RESPONDIDA", ...extra });
  }

  it("cupom: sai na hora, com as variaveis resolvidas e sem link", async () => {
    const ctx = montar();

    const resultado = await ctx.service.responder(TOKEN, 4);
    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    await assentar(ctx.service);

    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
    const [conversationId, texto] = ctx.chatwoot.sendOutgoingMessage.mock.calls[0];
    const codigo = resultado.resposta.cupom?.codigo as string;
    expect(conversationId).toBe("42");
    expect(texto).toContain(codigo);
    expect(texto).toContain("10%");
    expect(texto).toContain("R$ 5,00");
    expect(texto).toContain("R$ 30,00");
    expect(texto).toContain("Loja Teste");
    expect(texto).not.toMatch(/https?:\/\//);
    expect(texto).not.toMatch(/[{}]/);
    expect(ctx.cupons[0].envioCupomStatus).toBe("ENVIADA");
  });

  it("T52-13c: cupom com {CODIGO} em caixa alta sai com o código real", async () => {
    const ctx = montar({
      config: {
        textoPosResposta:
          "Cupom {CODIGO} com {percentual} até {teto}, mínimo {compra_minima}, até {validade}. {nome_empresa}",
      },
    });

    const resultado = await ctx.service.responder(TOKEN, 4);
    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    await assentar(ctx.service);

    const codigo = resultado.resposta.cupom?.codigo as string;
    expect(codigo).toMatch(/^BC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);

    const texto = textoEnviado(ctx, 0);
    expect(texto).toContain(codigo);
    expect(texto).not.toMatch(/[{}]/);

    const mapa = montarVariaveisMensagem({
      linkGoogle: CONFIG_BASE.linkGoogle,
      cupom: {
        codigo: "BC-7K3Q9M",
        percentual: 10,
        teto: 5,
        compraMinima: 30,
        validadeAte: new Date("2026-12-22T03:00:00Z"),
      },
      empresaNome: "Loja Teste",
      cfg: { percentualDesconto: 10, tetoDesconto: 5, compraMinima: 30, validadeCupomDias: 30 },
    });
    expect(renderizarTexto("Cupom {CODIGO} vale.", mapa)).toBe(renderizarTexto("Cupom {codigo} vale.", mapa));
  });

  it("T52-13d: convite com {LINK_GOOGLE} em caixa alta sai com o link do Google", async () => {
    const ctx = montar({ config: { textoConviteGoogle: "Avalie a {nome_empresa}: {LINK_GOOGLE}" } });

    await ctx.service.responder(TOKEN, 4);
    await assentar(ctx.service);
    await avancar(ctx.service, 200_000);

    const texto = textoEnviado(ctx, 1);
    expect([...texto.matchAll(/https:\/\/g\.page\/r\/abc\/review/g)]).toHaveLength(1);
    expect(texto).toContain("Loja Teste");
    expect(texto).not.toMatch(/[{}]/);

    const mapa = { link_google: CONFIG_BASE.linkGoogle as string, nome_empresa: "Loja Teste" };
    expect(renderizarTexto("Avalie a {nome_empresa}: {LINK_GOOGLE}", mapa)).toBe(
      renderizarTexto("Avalie a {nome_empresa}: {link_google}", mapa),
    );
  });

  it("cupom: enabled false vira FALHA com warn e a resposta ja saiu com o cupom", async () => {
    const ctx = montar({ chatwoot: { sendOutgoingMessage: jest.fn(async () => ({ enabled: false })) } });

    const resultado = await ctx.service.responder(TOKEN, 4);
    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).not.toBeNull();
    await assentar(ctx.service);

    expect(ctx.cupons[0].envioCupomStatus).toBe("FALHA");
    expect(logs.some((l) => l.startsWith("warn") && l.includes("pesquisaId=pes-1"))).toBe(true);
    for (const linha of logs) semSegredos(linha);
  });

  it("cupom: erro HTTP do Chatwoot vira FALHA e erro sem resposta mantem ENVIANDO", async () => {
    const http = montar({
      chatwoot: {
        sendOutgoingMessage: jest.fn(async () => {
          throw Object.assign(new Error("500"), { response: { status: 500 } });
        }),
      },
    });
    await http.service.responder(TOKEN, 4);
    await assentar(http.service);
    expect(http.cupons[0].envioCupomStatus).toBe("FALHA");

    const rede = montar({
      chatwoot: {
        sendOutgoingMessage: jest.fn(async () => {
          throw new Error("timeout");
        }),
      },
    });
    await rede.service.responder(TOKEN, 4);
    await assentar(rede.service);
    expect(rede.cupons[0].envioCupomStatus).toBe("ENVIANDO");
    expect(logs.some((l) => l.startsWith("warn") && l.includes("incerto"))).toBe(true);
  });

  it("cupom: reserva com updateMany condicionado antes de enviar", async () => {
    const ctx = montar();

    await ctx.service.responder(TOKEN, 4);
    await assentar(ctx.service);

    expect(ctx.prisma.cupomRecompensa.updateMany).toHaveBeenCalledWith({
      where: {
        id: expect.any(String),
        OR: expect.arrayContaining([{ envioCupomStatus: { in: ["PENDENTE", "FALHA"] } }]),
      },
      data: { envioCupomStatus: "ENVIANDO", envioCupomReservadoEm: expect.any(Date) },
    });
    const reserva = ctx.prisma.cupomRecompensa.updateMany.mock.invocationCallOrder[0];
    const envio = ctx.chatwoot.sendOutgoingMessage.mock.invocationCallOrder[0];
    expect(reserva).toBeLessThan(envio);
  });

  it("cupom: sem reserva (contagem 0) nada e enviado", async () => {
    const ctx = montar();
    ctx.prisma.cupomRecompensa.updateMany.mockResolvedValue({ count: 0 });

    await ctx.service.responder(TOKEN, 4);
    await assentar(ctx.service);

    expect(ctx.chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
    expect(ctx.cupons[0].envioCupomStatus).toBe("PENDENTE");
  });

  it("convite: nota 1 e nota 5 agendam um envio, nada sai antes de 60 s e sai ate 180 s", async () => {
    for (const nota of [1, 5]) {
      const ctx = montar();
      await ctx.service.responder(TOKEN, nota);
      await assentar(ctx.service);

      expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
      expect(enviosFechamentoPendentes()).toBe(1);

      await avancar(ctx.service, 59_999);
      expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);

      await avancar(ctx.service, 120_001);
      expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(2);
      expect(ctx.pesquisas[0].envioConviteStatus).toBe("ENVIADA");
      cancelarTodosEnviosFechamento();
    }
  });

  it("convite: texto com um unico link, sem nada do cupom", async () => {
    const ctx = montar();
    const resultado = await ctx.service.responder(TOKEN, 4);
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    const codigo = resultado.resposta.cupom?.codigo as string;
    await assentar(ctx.service);
    await avancar(ctx.service, 200_000);

    const texto = textoEnviado(ctx, 1);
    expect(texto).toContain("https://g.page/r/abc/review");
    expect([...texto.matchAll(/https?:\/\//g)]).toHaveLength(1);
    expect(texto).toContain("Loja Teste");
    expect(texto).not.toContain(codigo);
    expect(texto).not.toContain("{codigo}");
    expect(texto.toLowerCase()).not.toContain("cupom");
  });

  it("convite: sem link na config vira NAO_APLICAVEL e nenhum timer fica pendente", async () => {
    const ctx = montar({ config: { linkGoogle: null } });

    await ctx.service.responder(TOKEN, 5);
    await assentar(ctx.service);

    expect(ctx.pesquisas[0].envioConviteStatus).toBe("NAO_APLICAVEL");
    expect(enviosFechamentoPendentes()).toBe(0);
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
  });

  it("convite: usa a config do momento do envio e respeita link removido no intervalo", async () => {
    const trocado = montar();
    await trocado.service.responder(TOKEN, 5);
    await assentar(trocado.service);
    trocado.cfg.textoConviteGoogle = "Novo convite: {link_google}";
    await avancar(trocado.service, 200_000);
    expect(textoEnviado(trocado, 1)).toContain("Novo convite: https://g.page/r/abc/review");
    cancelarTodosEnviosFechamento();

    const removido = montar();
    await removido.service.responder(TOKEN, 5);
    await assentar(removido.service);
    removido.cfg.linkGoogle = null;
    await avancar(removido.service, 200_000);
    expect(removido.pesquisas[0].envioConviteStatus).toBe("NAO_APLICAVEL");
    expect(removido.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
  });

  it("supressao: telefone no opt-out nao recebe cupom nem convite e o cupom fica na resposta", async () => {
    const ctx = montar({ suprimidos: [TELEFONE] });

    const resultado = await ctx.service.responder(TOKEN, 4);
    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).not.toBeNull();
    await assentar(ctx.service);

    expect(ctx.chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
    expect(ctx.cupons[0].envioCupomStatus).toBe("NAO_APLICAVEL");
    expect(ctx.pesquisas[0].envioConviteStatus).toBe("NAO_APLICAVEL");
  });

  it("supressao: telefone que entra no opt-out entre a resposta e o convite nao recebe o convite", async () => {
    const ctx = montar();
    await ctx.service.responder(TOKEN, 5);
    await assentar(ctx.service);

    ctx.suprimidos.add(TELEFONE);
    await avancar(ctx.service, 200_000);

    expect(ctx.pesquisas[0].envioConviteStatus).toBe("NAO_APLICAVEL");
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
  });

  it("revogada: cupom de status diferente de EMITIDO vira NAO_APLICAVEL sem enviar", async () => {
    for (const status of ["CANCELADO", "USADO", "EXPIRADO"]) {
      const ctx = montar({ cupons: [cupomPadrao({ status, criadoEm: new Date(Date.now() - MINUTO) })] });
      await ctx.service.responder(TOKEN, 4);
      await assentar(ctx.service);
      expect(ctx.chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
      expect(ctx.cupons[0].envioCupomStatus).toBe("NAO_APLICAVEL");
      cancelarTodosEnviosFechamento();
    }
  });

  it("revogada: o timer do convite que nao foi cancelado grava NAO_APLICAVEL e nao envia", async () => {
    const ctx = montar();
    await ctx.service.responder(TOKEN, 5);
    await assentar(ctx.service);

    ctx.pesquisas[0].revogadaEm = new Date();
    await avancar(ctx.service, 200_000);

    expect(ctx.pesquisas[0].envioConviteStatus).toBe("NAO_APLICAVEL");
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
  });

  it("reenvio: cupom FALHA com 10 min reenvia; com 2 min, 6 tentativas ou 3 dias e ignorado", async () => {
    const antigo = montar({
      pesquisas: [respondidaEm(10 * MINUTO)],
      cupons: [cupomPadrao({ envioCupomStatus: "FALHA", criadoEm: new Date(Date.now() - 10 * MINUTO) })],
    });
    const r1 = await antigo.service.reenviarPendentes();
    expect(r1).toMatchObject({ candidatos: 1, cupons: 1 });
    expect(antigo.cupons[0].envioCupomStatus).toBe("ENVIADA");
    cancelarTodosEnviosFechamento();

    for (const cenario of [
      { pesquisas: [respondidaEm(2 * MINUTO)], cupons: [] as Linha[] },
      { pesquisas: [respondidaEm(10 * MINUTO, { tentativasEnvio: 6 })], cupons: [] as Linha[] },
      { pesquisas: [respondidaEm(3 * DIA + 3600_000)], cupons: [] as Linha[] },
    ]) {
      const ctx = montar({
        pesquisas: cenario.pesquisas,
        cupons:
          cenario.cupons.length > 0
            ? cenario.cupons
            : [cupomPadrao({ envioCupomStatus: "FALHA", criadoEm: new Date(Date.now() - MINUTO) })],
      });
      const resultado = await ctx.service.reenviarPendentes();
      expect(resultado.candidatos).toBe(0);
      expect(ctx.chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
      cancelarTodosEnviosFechamento();
    }
  });

  it("reenvio: cupom PENDENTE antigo (timer perdido) e enviado", async () => {
    const ctx = montar({
      pesquisas: [respondidaEm(10 * MINUTO)],
      cupons: [cupomPadrao({ envioCupomStatus: "PENDENTE", criadoEm: new Date(Date.now() - 10 * MINUTO) })],
    });

    const resultado = await ctx.service.reenviarPendentes();

    expect(resultado).toMatchObject({ candidatos: 1, cupons: 1, falhas: 0 });
    expect(ctx.cupons[0].envioCupomStatus).toBe("ENVIADA");
  });

  it("reenvio: convite PENDENTE com 10 min sai sem novo atraso; telefone suprimido vira NAO_APLICAVEL", async () => {
    const ctx = montar({ pesquisas: [respondidaEm(10 * MINUTO)] });
    const resultado = await ctx.service.reenviarPendentes();
    expect(resultado).toMatchObject({ candidatos: 1, convites: 1 });
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
    expect(ctx.pesquisas[0].envioConviteStatus).toBe("ENVIADA");

    const suprimido = montar({
      pesquisas: [respondidaEm(10 * MINUTO)],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA", criadoEm: new Date(Date.now() - 10 * MINUTO) })],
      suprimidos: [TELEFONE],
    });
    await suprimido.service.reenviarPendentes();
    expect(suprimido.pesquisas[0].envioConviteStatus).toBe("NAO_APLICAVEL");
    expect(suprimido.chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
  });

  it("reenvio: ENVIANDO velho confere no Chatwoot e nao duplica a mensagem", async () => {
    const jaSaiu = montar({
      pesquisas: [respondidaEm(10 * MINUTO, { envioConviteStatus: "ENVIANDO", envioConviteReservadoEm: new Date(Date.now() - 20 * MINUTO) })],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    jaSaiu.chatwoot.listMessagesAfter.mockResolvedValue([
      { message_type: 1, content: "Avalie a Loja Teste: https://g.page/r/abc/review", created_at: Math.floor(Date.now() / 1000) },
    ]);
    const r1 = await jaSaiu.service.reenviarPendentes();
    expect(r1.convites).toBe(1);
    expect(jaSaiu.chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
    expect(jaSaiu.pesquisas[0].envioConviteStatus).toBe("ENVIADA");
    expect(jaSaiu.chatwoot.listMessagesAfter).toHaveBeenCalledWith("42");

    const naoSaiu = montar({
      pesquisas: [respondidaEm(10 * MINUTO, { envioConviteStatus: "ENVIANDO", envioConviteReservadoEm: new Date(Date.now() - 20 * MINUTO) })],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    naoSaiu.chatwoot.listMessagesAfter.mockResolvedValue([]);
    const r2 = await naoSaiu.service.reenviarPendentes();
    expect(r2.convites).toBe(1);
    expect(naoSaiu.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
    expect(naoSaiu.pesquisas[0].envioConviteStatus).toBe("ENVIADA");

    const indeterminado = montar({
      pesquisas: [respondidaEm(10 * MINUTO, { envioConviteStatus: "ENVIANDO", envioConviteReservadoEm: new Date(Date.now() - 20 * MINUTO) })],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    indeterminado.chatwoot.listMessagesAfter.mockResolvedValue(null);
    const r3 = await indeterminado.service.reenviarPendentes();
    expect(r3.falhas).toBe(1);
    expect(indeterminado.chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
    expect(indeterminado.pesquisas[0].envioConviteStatus).toBe("ENVIANDO");
    expect(indeterminado.pesquisas[0].tentativasEnvio).toBe(1);
  });

  it("reenvio: ENVIANDO com reserva de 14 minutos nao e tocado", async () => {
    const ctx = montar({
      pesquisas: [respondidaEm(10 * MINUTO, { chatwootCsat: "OK", envioConviteStatus: "ENVIANDO", envioConviteReservadoEm: new Date(Date.now() - 14 * MINUTO) })],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });

    const resultado = await ctx.service.reenviarPendentes();

    expect(resultado.candidatos).toBe(0);
    expect(ctx.chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
    expect(ctx.chatwoot.listMessagesAfter).not.toHaveBeenCalled();
  });

  it("reenvio CSAT: cria a input_csat, envia o PUT e grava OK", async () => {
    const ctx = montar({
      pesquisas: [
        respondidaEm(10 * MINUTO, {
          chatwootCsat: "MENSAGEM_FALHA",
          enviadaEm: new Date(Date.now() - DIA),
          conversationUuid: "uuid-123",
          envioConviteStatus: "ENVIADA",
        }),
      ],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    ctx.chatwoot.listMessagesAfter.mockResolvedValue([{ message_type: 2, content: "nota interna" }]);

    const resultado = await ctx.service.reenviarPendentes();

    expect(resultado).toMatchObject({ candidatos: 1, csat: 1, falhas: 0 });
    expect(ctx.chatwoot.createPrivateCsatMessage).toHaveBeenCalledWith("42", expect.any(String));
    expect(ctx.chatwoot.submitCsatResponse).toHaveBeenCalledWith("uuid-123", 5, undefined);
    expect(ctx.pesquisas[0].chatwootCsat).toBe("OK");
  });

  it("reenvio CSAT: input_csat existente e reutilizada sem criar outra", async () => {
    const ctx = montar({
      pesquisas: [
        respondidaEm(10 * MINUTO, {
          chatwootCsat: "MENSAGEM_FALHA",
          enviadaEm: new Date(Date.now() - DIA),
          conversationUuid: "uuid-123",
          envioConviteStatus: "ENVIADA",
        }),
      ],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    ctx.chatwoot.listMessagesAfter.mockResolvedValue([{ content_type: "input_csat", private: true }]);

    const resultado = await ctx.service.reenviarPendentes();

    expect(ctx.chatwoot.createPrivateCsatMessage).not.toHaveBeenCalled();
    expect(ctx.chatwoot.listMessagesAfter).toHaveBeenCalledWith("42", undefined, { incluirInternas: true });
    expect(resultado.csat).toBe(1);
    expect(ctx.pesquisas[0].chatwootCsat).toBe("OK");
  });

  it("reenvio CSAT: CSAT nativo ligado na inbox vira NAO_APLICAVEL sem criar nem enviar", async () => {
    const ctx = montar({
      pesquisas: [
        respondidaEm(10 * MINUTO, {
          chatwootCsat: "AGUARDANDO_MENSAGEM",
          enviadaEm: new Date(Date.now() - DIA),
          conversationUuid: "uuid-123",
          envioConviteStatus: "ENVIADA",
        }),
      ],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    ctx.chatwoot.getInbox.mockResolvedValue({ csat_survey_enabled: true });

    await ctx.service.reenviarPendentes();

    expect(ctx.chatwoot.createPrivateCsatMessage).not.toHaveBeenCalled();
    expect(ctx.chatwoot.submitCsatResponse).not.toHaveBeenCalled();
    expect(ctx.pesquisas[0].chatwootCsat).toBe("NAO_APLICAVEL");
    expect(logs.some((l) => l.startsWith("warn") && l.includes("inbox 1"))).toBe(true);
  });

  it("reenvio CSAT: leitura da inbox falhando segue; lista indisponivel nao cria e conta falha", async () => {
    const falhaInbox = montar({
      pesquisas: [
        respondidaEm(10 * MINUTO, {
          chatwootCsat: "AGUARDANDO_MENSAGEM",
          enviadaEm: new Date(Date.now() - DIA),
          conversationUuid: "uuid-123",
          envioConviteStatus: "ENVIADA",
        }),
      ],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    falhaInbox.chatwoot.getInbox.mockRejectedValue(new Error("inbox fora"));
    const r1 = await falhaInbox.service.reenviarPendentes();
    expect(r1.csat).toBe(1);
    expect(falhaInbox.pesquisas[0].chatwootCsat).toBe("OK");

    const semLista = montar({
      pesquisas: [
        respondidaEm(10 * MINUTO, {
          chatwootCsat: "MENSAGEM_FALHA",
          enviadaEm: new Date(Date.now() - DIA),
          conversationUuid: "uuid-123",
          envioConviteStatus: "ENVIADA",
        }),
      ],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    semLista.chatwoot.listMessagesAfter.mockRejectedValue(new Error("lista fora"));
    const r2 = await semLista.service.reenviarPendentes();
    expect(r2.falhas).toBe(1);
    expect(semLista.chatwoot.createPrivateCsatMessage).not.toHaveBeenCalled();
    expect(semLista.pesquisas[0].chatwootCsat).toBe("MENSAGEM_FALHA");
  });

  it("reenvio CSAT: RESPOSTA_FALHA so repete o PUT; criacao falhando mantem MENSAGEM_FALHA", async () => {
    const putFalhou = montar({
      pesquisas: [
        respondidaEm(10 * MINUTO, {
          chatwootCsat: "RESPOSTA_FALHA",
          enviadaEm: new Date(Date.now() - DIA),
          conversationUuid: "uuid-123",
          envioConviteStatus: "ENVIADA",
        }),
      ],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    const r1 = await putFalhou.service.reenviarPendentes();
    expect(r1.csat).toBe(1);
    expect(putFalhou.chatwoot.createPrivateCsatMessage).not.toHaveBeenCalled();
    expect(putFalhou.chatwoot.submitCsatResponse).toHaveBeenCalledTimes(1);
    expect(putFalhou.pesquisas[0].chatwootCsat).toBe("OK");

    const criacaoFalhou = montar({
      pesquisas: [
        respondidaEm(10 * MINUTO, {
          chatwootCsat: "AGUARDANDO_MENSAGEM",
          enviadaEm: new Date(Date.now() - DIA),
          conversationUuid: "uuid-123",
          envioConviteStatus: "ENVIADA",
        }),
      ],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    criacaoFalhou.chatwoot.createPrivateCsatMessage.mockRejectedValue(new Error("csat fora"));
    const r2 = await criacaoFalhou.service.reenviarPendentes();
    expect(r2.falhas).toBe(1);
    expect(criacaoFalhou.chatwoot.submitCsatResponse).not.toHaveBeenCalled();
    expect(criacaoFalhou.pesquisas[0].chatwootCsat).toBe("MENSAGEM_FALHA");
  });

  it("reenvio CSAT: MENSAGEM_OK com a nota ainda nao enviada entra na re-tentativa e repete o PUT", async () => {
    const mensagemOk = montar({
      pesquisas: [
        respondidaEm(10 * MINUTO, {
          chatwootCsat: "MENSAGEM_OK",
          enviadaEm: new Date(Date.now() - DIA),
          conversationUuid: "uuid-123",
          envioConviteStatus: "ENVIADA",
        }),
      ],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    const resultado = await mensagemOk.service.reenviarPendentes();
    expect(resultado.candidatos).toBe(1);
    expect(resultado.csat).toBe(1);
    expect(mensagemOk.chatwoot.createPrivateCsatMessage).not.toHaveBeenCalled();
    expect(mensagemOk.chatwoot.submitCsatResponse).toHaveBeenCalledTimes(1);
    expect(mensagemOk.pesquisas[0].chatwootCsat).toBe("OK");
  });

  it("reenvio CSAT: enviadaEm de 15 dias, OK e NAO_APLICAVEL sao ignorados", async () => {
    const antiga = montar({
      pesquisas: [
        respondidaEm(10 * MINUTO, {
          chatwootCsat: "MENSAGEM_FALHA",
          enviadaEm: new Date(Date.now() - 15 * DIA),
          conversationUuid: "uuid-123",
          envioConviteStatus: "ENVIADA",
        }),
      ],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
    });
    const r1 = await antiga.service.reenviarPendentes();
    expect(r1.candidatos).toBe(0);
    expect(antiga.chatwoot.submitCsatResponse).not.toHaveBeenCalled();

    for (const estado of ["OK", "NAO_APLICAVEL"]) {
      const ctx = montar({
        pesquisas: [
          respondidaEm(10 * MINUTO, {
            chatwootCsat: estado,
            enviadaEm: new Date(Date.now() - DIA),
            conversationUuid: "uuid-123",
            envioConviteStatus: "ENVIADA",
          }),
        ],
        cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" })],
      });
      const resultado = await ctx.service.reenviarPendentes();
      expect(resultado.candidatos).toBe(0);
      expect(ctx.chatwoot.submitCsatResponse).not.toHaveBeenCalled();
    }
  });

  it("reenvio: anonimizada nao entra; duas falhas contam tentativasEnvio uma vez; erro em uma nao impede as outras", async () => {
    const anonima = montar({
      pesquisas: [respondidaEm(10 * MINUTO, { conversationId: null })],
      cupons: [cupomPadrao({ envioCupomStatus: "FALHA" })],
    });
    expect((await anonima.service.reenviarPendentes()).candidatos).toBe(0);

    const duasFalhas = montar({
      pesquisas: [respondidaEm(10 * MINUTO)],
      cupons: [cupomPadrao({ envioCupomStatus: "FALHA", criadoEm: new Date(Date.now() - 10 * MINUTO) })],
      chatwoot: {
        sendOutgoingMessage: jest.fn(async () => {
          throw Object.assign(new Error("500"), { response: { status: 500 } });
        }),
      },
    });
    const r1 = await duasFalhas.service.reenviarPendentes();
    expect(r1.falhas).toBe(1);
    expect(duasFalhas.pesquisas[0].tentativasEnvio).toBe(1);

    const umaQuebra = montar({
      pesquisas: [respondidaEm(10 * MINUTO, { id: "pes-1" }), respondidaEm(10 * MINUTO, { id: "pes-2", token: TOKEN_B, telefone: TELEFONE_B })],
      cupons: [cupomPadrao({ envioCupomStatus: "ENVIADA" }), cupomPadrao({ id: "cup-2", pesquisaId: "pes-2", envioCupomStatus: "ENVIADA" })],
    });
    umaQuebra.chatwoot.sendOutgoingMessage
      .mockRejectedValueOnce(Object.assign(new Error("500"), { response: { status: 500 } }))
      .mockResolvedValueOnce({ enabled: true });
    const r2 = await umaQuebra.service.reenviarPendentes();
    expect(r2.candidatos).toBe(2);
    expect(r2.convites).toBe(1);
    expect(r2.falhas).toBe(1);
  });

  it("reenvio: dois ciclos simultaneos enviam a mesma mensagem uma unica vez (reserva)", async () => {
    const ctx = montar({
      pesquisas: [respondidaEm(10 * MINUTO, { envioConviteStatus: "ENVIADA" })],
      cupons: [cupomPadrao({ envioCupomStatus: "PENDENTE", criadoEm: new Date(Date.now() - 10 * MINUTO) })],
    });

    const agora = new Date();
    const [a, b] = await Promise.all([ctx.service.reenviarPendentes(agora), ctx.service.reenviarPendentes(agora)]);

    expect(a.cupons + b.cupons).toBe(1);
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
    expect(ctx.cupons[0].envioCupomStatus).toBe("ENVIADA");
  });

  it("expiracao: marcarCuponsExpirados passa EMITIDO vencido para EXPIRADO e devolve a contagem", async () => {
    const ctx = montar({
      pesquisas: [respondidaEm(10 * MINUTO)],
      cupons: [
        cupomPadrao({ id: "cup-1", validadeAte: new Date(Date.now() - DIA) }),
        cupomPadrao({ id: "cup-2", codigo: "BC-NOVO22", pesquisaId: "pes-2", validadeAte: new Date(Date.now() + DIA) }),
      ],
    });

    const agora = new Date();
    const total = await ctx.service.marcarCuponsExpirados(agora);

    expect(total).toBe(1);
    expect(ctx.prisma.cupomRecompensa.updateMany).toHaveBeenCalledWith({
      where: { status: "EMITIDO", validadeAte: { lt: agora } },
      data: { status: "EXPIRADO" },
    });
    expect(ctx.cupons[0].status).toBe("EXPIRADO");
    expect(ctx.cupons[1].status).toBe("EMITIDO");
  });

  it("shutdown: onModuleDestroy cancela os convites agendados", async () => {
    const ctx = montar();
    await ctx.service.responder(TOKEN, 5);
    await assentar(ctx.service);
    expect(enviosFechamentoPendentes()).toBe(1);

    await ctx.service.onModuleDestroy();

    expect(enviosFechamentoPendentes()).toBe(0);
    await avancar(ctx.service, 200_000);
    expect(ctx.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
  });
});
