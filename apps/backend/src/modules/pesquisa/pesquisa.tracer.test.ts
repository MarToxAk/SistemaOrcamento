/**
 * Fase 52 (plano 52-01): tracer ponta a ponta da pesquisa de satisfacao.
 * fechamento da conversa -> mensagem com UM link -> GET publico -> POST da nota -> PUT no CSAT nativo do Chatwoot.
 *
 * Nenhum envio real: axios sempre falso, Prisma em memoria, ChatwootService e ChatwootAutomationService REAIS.
 */
import "reflect-metadata";

import { HttpException, Logger } from "@nestjs/common";
import axios from "axios";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { ChatwootAutomationService } from "../integrations/chatwoot/chatwoot-automation.service";
import {
  aguardarFilaEtiquetas,
  cancelarTodosEnviosFechamento,
} from "../integrations/chatwoot/chatwoot-etiquetas";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import { IS_PUBLIC_KEY } from "../security/security.constants";
import { PesquisaConfigService } from "./pesquisa-config.service";
import { PesquisaPublicController, ResponderPesquisaDto } from "./pesquisa-public.controller";
import {
  LIMITES_PESQUISA_PUBLICA,
  LimitadorJanela,
  chaveInternaValida,
  formatarPercentual,
  formatarReais,
  gerarToken,
  normalizarTelefone,
  renderizarTexto,
  resolverIpCliente,
  sortearVariante,
} from "./pesquisa-regras";
import { PesquisaService } from "./pesquisa.service";

jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

const axiosMock = axios as unknown as { get: jest.Mock; post: jest.Mock; put: jest.Mock };

const TELEFONE_BRUTO = "+5512996484918";
const TELEFONE_NORMALIZADO = "5512996484918";
const REGEX_LINK = /https:\/\/app\.exemplo\.test\/pesquisa\/([0-9a-f]{48})/g;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

const CONFIG_PADRAO: Linha = {
  id: "default",
  ativo: true,
  percentualDesconto: "10",
  tetoDesconto: "5",
  compraMinima: "30",
  validadeCupomDias: 30,
  validadeLinkDias: 7,
  intervaloDias: 90,
  tetoMensal: "300",
  prefixoCupom: "BC",
  linkGoogle: null,
  varianteVisual: "ESTRELAS",
  textoFechamento: "Responda: {link}",
  textoSemRecompensa: "Responda: {link}",
  textoPosResposta: "Cupom {codigo}",
  textoConviteGoogle: "Avalie: {link_google}",
  paginaTitulo: "Como foi seu atendimento?",
  paginaSubtitulo: "Leva menos de 1 minuto.",
  paginaObrigadoSemRecompensa: "Obrigado por responder.",
  paginaGoogleTitulo: "Quer compartilhar sua experiencia?",
  paginaGoogleCorpo: "Sua avaliacao ajuda outros clientes.",
};

type Opcoes = {
  config?: Linha | null;
  telefone?: string | null;
  suprimido?: boolean;
  semInbox?: boolean;
  csatNativo?: boolean;
  inboxFalha?: boolean;
  inputCsatFalha?: boolean;
};

function casa(linha: Linha, where: Linha): boolean {
  return Object.entries(where).every(([campo, cond]) => {
    const valor = linha[campo];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      if ("gt" in cond) {
        if (valor === null || valor === undefined) return false;
        return valor instanceof Date ? valor.getTime() > (cond.gt as Date).getTime() : valor > cond.gt;
      }
      if ("in" in cond) return (cond.in as unknown[]).includes(valor);
      throw new Error(`operador nao suportado no mock: ${JSON.stringify(Object.keys(cond))}`);
    }
    return valor === cond;
  });
}

function montar(opcoes: Opcoes = {}) {
  const pesquisas: Linha[] = [];
  let seq = 0;
  const estado: { config: Linha | null } = {
    config: opcoes.config === null ? null : { ...CONFIG_PADRAO, ...(opcoes.config ?? {}) },
  };

  const prisma = {
    pesquisaConfig: {
      findUnique: jest.fn(async () => (estado.config ? { ...estado.config } : null)),
      create: jest.fn(async ({ data }: { data: Linha }) => {
        estado.config = { atualizadoEm: new Date(), atualizadoPor: null, ...data };
        return { ...estado.config };
      }),
    },
    pesquisaSupressao: {
      findUnique: jest.fn(async ({ where }: { where: { telefone: string } }) =>
        opcoes.suprimido && where.telefone === TELEFONE_NORMALIZADO ? { telefone: where.telefone } : null,
      ),
    },
    pesquisaSatisfacao: {
      findUnique: jest.fn(async ({ where }: { where: Linha }) => {
        const achada = pesquisas.find((p) => casa(p, where));
        return achada ? { ...achada } : null;
      }),
      findFirst: jest.fn(async ({ where }: { where: Linha }) => {
        const achadas = pesquisas.filter((p) => casa(p, where));
        const ultima = achadas[achadas.length - 1];
        return ultima ? { ...ultima } : null;
      }),
      create: jest.fn(async ({ data }: { data: Linha }) => {
        seq += 1;
        const linha: Linha = {
          id: `pes-${seq}`,
          status: "CRIADA",
          chatwootCsat: "AGUARDANDO_MENSAGEM",
          nota: null,
          comentario: null,
          respondidaEm: null,
          revogadaEm: null,
          enviadaEm: null,
          anonimizadaEm: null,
          criadaEm: new Date(),
          ...data,
        };
        pesquisas.push(linha);
        return { ...linha };
      }),
      update: jest.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
        const linha = pesquisas.find((p) => casa(p, where));
        if (!linha) throw new Error("pesquisa inexistente");
        Object.assign(linha, data);
        return { ...linha };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvo = pesquisas.filter((p) => casa(p, where));
        alvo.forEach((p) => Object.assign(p, data));
        return { count: alvo.length };
      }),
      count: jest.fn(async ({ where }: { where: Linha }) => pesquisas.filter((p) => casa(p, where)).length),
    },
    chatwootAutomationConfig: {
      findUnique: jest.fn(async () => ({
        id: "default",
        promptFechamento: "Ola {{saudacao}}",
        mensagemPedidoPendente: "Pedido pendente",
      })),
    },
    chatwootMensagemEnviada: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => undefined),
    },
    // Plano 52-03: sem cupom no tracer (a emissao tem suite propria); o create falha de proposito
    // para a resposta continuar devolvendo `cupom: null` sem quebrar a nota (best-effort, D-10).
    cupomRecompensa: {
      findUnique: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      aggregate: jest.fn(async () => ({ _sum: { descontoAplicado: null } })),
      create: jest.fn(async () => {
        throw new Error("cupom fora do escopo do tracer");
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    quote: { findFirst: jest.fn(async () => null), count: jest.fn(async () => 0) },
  };

  const env: Record<string, string> = {
    CHATWOOT_BASE_URL: "https://chat.exemplo.test",
    CHATWOOT_ACCOUNT_ID: "7",
    CHATWOOT_API_TOKEN: "token-chatwoot",
    APP_BASE_URL: "https://app.exemplo.test",
    EMPRESA_NOME: "Papelaria Exemplo",
    EMPRESA_COR_PRIMARIA: "#112233",
    INTERNAL_API_KEY: "chave-ok",
  };
  const configService = { get: jest.fn((chave: string) => env[chave]) };

  const conversa: Linha = {
    status: "resolved",
    uuid: "uuid-123",
    inbox_id: 1,
    messages: [],
    meta: {
      sender: {
        id: 9,
        ...(opcoes.telefone === undefined
          ? { phone_number: TELEFONE_BRUTO }
          : opcoes.telefone === null
            ? { phone_number: null }
            : { phone_number: opcoes.telefone }),
      },
    },
  };
  if (opcoes.semInbox) delete conversa.inbox_id;

  axiosMock.get.mockReset();
  axiosMock.post.mockReset();
  axiosMock.put.mockReset();
  axiosMock.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/conversations/42")) return { data: conversa };
    if (url.endsWith("/conversations/42/messages")) return { data: { payload: [] } };
    if (/\/inboxes\/1$/.test(url)) {
      if (opcoes.inboxFalha) throw new Error("inbox 500");
      return { data: { csat_survey_enabled: opcoes.csatNativo ?? false } };
    }
    throw new Error(`GET inesperado ${url}`);
  });
  axiosMock.post.mockImplementation(async (url: string, body: Linha) => {
    if (url.endsWith("/conversations/42/messages")) {
      if (body.content_type === "input_csat") {
        if (opcoes.inputCsatFalha) throw new Error("csat 500");
        return { data: { id: 900 } };
      }
      return { data: { id: 800 } };
    }
    if (url.endsWith("/conversations/42/labels")) return { data: {} };
    throw new Error(`POST inesperado ${url}`);
  });
  axiosMock.put.mockResolvedValue({ data: {} });

  const chatwoot = new ChatwootService(configService as never);
  const automation = new ChatwootAutomationService(prisma as never, chatwoot, configService as never);
  jest
    .spyOn(automation as unknown as { chamarIA: () => Promise<unknown> }, "chamarIA")
    .mockResolvedValue({ output: [{ content: [{ text: "Obrigado pelo contato" }] }] });
  const service = new PesquisaService(
    prisma as never,
    chatwoot,
    configService as never,
    automation,
    new PesquisaConfigService(prisma as never, configService as never),
  );
  service.onModuleInit();
  const controller = new PesquisaPublicController(service, configService as never);

  const postsMensagem = () =>
    axiosMock.post.mock.calls.filter(([url]) => String(url).endsWith("/conversations/42/messages"));
  const publica = () => postsMensagem().find(([, body]) => (body as Linha).private === false);
  const inputsCsat = () => postsMensagem().filter(([, body]) => (body as Linha).content_type === "input_csat");
  // Plano 52-05: o contato tambem e atualizado por PUT; as assercoes do tracer valem para o CSAT.
  const putsCsat = () => axiosMock.put.mock.calls.filter(([url]) => String(url).includes("/csat_survey/"));

  return { prisma, pesquisas, estado, automation, service, controller, publica, inputsCsat, postsMensagem, putsCsat };
}

type Ctx = ReturnType<typeof montar>;

async function fechar(ctx: Ctx): Promise<void> {
  await ctx.automation.handleConversationResolved({ id: 42, contact_inbox: { inbox_id: 1 } });
  await aguardarFilaEtiquetas();
  await jest.advanceTimersByTimeAsync(200_000);
  await ctx.service.aguardarEfeitos();
}

function tokenDaMensagem(ctx: Ctx): string {
  // A mensagem publica MAIS RECENTE (em fechamentos repetidos vale o ultimo link enviado).
  const publicas = ctx.postsMensagem().filter(([, body]) => (body as Linha).private === false);
  const conteudo = String((publicas[publicas.length - 1][1] as Linha).content);
  const achados = [...conteudo.matchAll(REGEX_LINK)];
  expect(achados).toHaveLength(1);
  return achados[0][1];
}

async function capturar(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (err) {
    return err;
  }
  throw new Error("era esperado um erro");
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

describe("Pesquisa de satisfacao - tracer (Fase 52, plano 52-01)", () => {
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

  it("T1 (tracer): fechamento com link, GET publico, POST da nota e PUT no CSAT nativo", async () => {
    const ctx = montar();
    await fechar(ctx);

    const mensagem = String((ctx.publica()?.[1] as Linha).content);
    expect(mensagem.startsWith("Obrigado pelo contato\n\nResponda: https://app.exemplo.test/pesquisa/")).toBe(true);
    const token = tokenDaMensagem(ctx);

    // Ordem: mensagem publica, registro da mensagem, e SO ENTAO a input_csat privada.
    const idxPublica = axiosMock.post.mock.calls.findIndex(
      ([url, body]) => String(url).endsWith("/messages") && (body as Linha).private === false,
    );
    const idxInput = axiosMock.post.mock.calls.findIndex(
      ([, body]) => (body as Linha).content_type === "input_csat",
    );
    const ordemPublica = axiosMock.post.mock.invocationCallOrder[idxPublica];
    const ordemRegistro = ctx.prisma.chatwootMensagemEnviada.create.mock.invocationCallOrder[0];
    const ordemInput = axiosMock.post.mock.invocationCallOrder[idxInput];
    expect(ordemPublica).toBeLessThan(ordemRegistro);
    expect(ordemRegistro).toBeLessThan(ordemInput);

    const inputBody = axiosMock.post.mock.calls[idxInput][1] as Linha;
    expect(inputBody.private).toBe(true);
    expect(inputBody.content_type).toBe("input_csat");
    expect(inputBody.message_type).toBe("outgoing");

    expect(ctx.pesquisas).toHaveLength(1);
    const gravada = ctx.pesquisas[0];
    expect(gravada.telefone).toBe(TELEFONE_NORMALIZADO);
    expect(gravada.variante).toBe("ESTRELAS");
    expect(gravada.status).toBe("ENVIADA");
    expect(gravada.chatwootCsat).toBe("MENSAGEM_OK");
    expect(gravada.conversationUuid).toBe("uuid-123");
    expect(gravada.conversationId).toBe(42n);
    expect((gravada.expiraEm as Date).getTime() - (gravada.criadaEm as Date).getTime()).toBe(7 * 86_400_000);

    const view = await ctx.controller.obter(token);
    expect(view).toMatchObject({ estado: "ABERTA", variante: "ESTRELAS", corPrimaria: "#112233" });

    const resposta = await ctx.controller.responder(token, { nota: 4, comentario: "ok" });
    expect(resposta).toMatchObject({ estado: "RESPONDIDA", cupom: null });
    await ctx.service.aguardarEfeitos();

    expect(ctx.putsCsat()).toHaveLength(1);
    const [urlPut, corpoPut, opcoesPut] = ctx.putsCsat()[0];
    expect(urlPut).toBe("https://chat.exemplo.test/public/api/v1/csat_survey/uuid-123");
    expect(corpoPut).toEqual({
      message: { submitted_values: { csat_survey_response: { rating: 4, feedback_message: "ok" } } },
    });
    expect(opcoesPut).not.toHaveProperty("headers");
    expect(ctx.pesquisas[0]).toMatchObject({ nota: 4, comentario: "ok", status: "RESPONDIDA", chatwootCsat: "OK" });

    // T-52-03: nenhum log carrega o token, o telefone nem o texto da mensagem.
    for (const linha of logs) {
      expect(linha).not.toContain(token);
      expect(linha).not.toContain(TELEFONE_NORMALIZADO);
      expect(linha).not.toContain("Obrigado pelo contato");
    }
  });

  it("T2 (kill-switch): sem config a primeira leitura cria a linha padrao com ativo false e o fechamento sai como na fase 51", async () => {
    const semConfig = montar({ config: null });
    await fechar(semConfig);

    expect(semConfig.prisma.pesquisaConfig.create).toHaveBeenCalledTimes(1);
    expect(semConfig.prisma.pesquisaConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: "default", ativo: false }),
    });
    expect(semConfig.estado.config?.ativo).toBe(false);
    expect((semConfig.publica()?.[1] as Linha).content).toBe("Obrigado pelo contato");
    expect(semConfig.prisma.pesquisaSatisfacao.create).not.toHaveBeenCalled();
    expect(semConfig.inputsCsat()).toHaveLength(0);
    cancelarTodosEnviosFechamento();

    const desativada = montar({ config: { ativo: false } });
    await fechar(desativada);

    expect(desativada.prisma.pesquisaConfig.create).not.toHaveBeenCalled();
    expect((desativada.publica()?.[1] as Linha).content).toBe("Obrigado pelo contato");
    expect(desativada.prisma.pesquisaSatisfacao.create).not.toHaveBeenCalled();
    expect(desativada.inputsCsat()).toHaveLength(0);
    expect(await desativada.controller.obter("a".repeat(48))).toEqual({ estado: "INDISPONIVEL" });
  });

  it("T3 (resposta unica): duas respostas simultaneas dao uma 200 e uma 409", async () => {
    const ctx = montar();
    await fechar(ctx);
    const token = tokenDaMensagem(ctx);

    const resultados = await Promise.allSettled([
      ctx.controller.responder(token, { nota: 5 }),
      ctx.controller.responder(token, { nota: 3 }),
    ]);

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const recusadas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(recusadas).toHaveLength(1);
    const erro = recusadas[0].reason as HttpException;
    expect(erro).toBeInstanceOf(HttpException);
    expect(erro.getStatus()).toBe(409);
    expect(erro.getResponse()).toMatchObject({ estado: "RESPONDIDA" });
    await ctx.service.aguardarEfeitos();
    expect(ctx.putsCsat()).toHaveLength(1);
  });

  it("T4 (best-effort): falha da input_csat e do PUT nunca bloqueia nem vaza segredo", async () => {
    const falhaMensagem = montar({ inputCsatFalha: true });
    await fechar(falhaMensagem);
    expect(falhaMensagem.publica()).toBeDefined();
    expect(falhaMensagem.pesquisas[0].chatwootCsat).toBe("MENSAGEM_FALHA");
    expect(logs.some((l) => l.startsWith("warn") && l.includes("csat 500"))).toBe(true);
    const tokenA = tokenDaMensagem(falhaMensagem);
    // Sem input_csat o PUT nao e chamado e a resposta do cliente segue normal.
    await expect(falhaMensagem.controller.responder(tokenA, { nota: 2 })).resolves.toMatchObject({
      estado: "RESPONDIDA",
    });
    await falhaMensagem.service.aguardarEfeitos();
    expect(falhaMensagem.putsCsat()).toHaveLength(0);
    expect(falhaMensagem.pesquisas[0].chatwootCsat).toBe("MENSAGEM_FALHA");
    cancelarTodosEnviosFechamento();

    const falhaPut = montar();
    await fechar(falhaPut);
    const tokenB = tokenDaMensagem(falhaPut);
    axiosMock.put.mockRejectedValue(new Error("put 500"));
    await expect(falhaPut.controller.responder(tokenB, { nota: 5 })).resolves.toMatchObject({
      estado: "RESPONDIDA",
    });
    await falhaPut.service.aguardarEfeitos();
    expect(falhaPut.pesquisas[0].chatwootCsat).toBe("RESPOSTA_FALHA");
    expect(logs.some((l) => l.startsWith("warn") && l.includes("put 500"))).toBe(true);
    for (const linha of logs) {
      expect(linha).not.toContain(tokenA);
      expect(linha).not.toContain(tokenB);
    }
  });

  it("T5 (D-28): a segunda pesquisa da conversa nasce NAO_APLICAVEL e nao chama o PUT", async () => {
    const ctx = montar();
    ctx.pesquisas.push({
      id: "pes-anterior",
      token: "c".repeat(48),
      conversationId: 42n,
      conversationUuid: "uuid-123",
      telefone: TELEFONE_NORMALIZADO,
      variante: "ESTRELAS",
      status: "RESPONDIDA",
      chatwootCsat: "OK",
      respondidaEm: new Date(Date.now() - 1000),
      revogadaEm: null,
      expiraEm: new Date(Date.now() + 86_400_000),
      criadaEm: new Date(Date.now() - 2000),
    });

    await fechar(ctx);

    expect(ctx.pesquisas).toHaveLength(2);
    expect(ctx.pesquisas[1].chatwootCsat).toBe("NAO_APLICAVEL");
    expect(ctx.inputsCsat()).toHaveLength(0);

    const token = tokenDaMensagem(ctx);
    await ctx.controller.responder(token, { nota: 5 });
    await ctx.service.aguardarEfeitos();
    expect(ctx.putsCsat()).toHaveLength(0);
  });

  it("T5b (D-28): pesquisa anterior ainda com input_csat pendente (MENSAGEM_FALHA/AGUARDANDO_MENSAGEM) tambem faz a nova nascer NAO_APLICAVEL", async () => {
    for (const estadoAnterior of ["MENSAGEM_FALHA", "AGUARDANDO_MENSAGEM"]) {
      const ctx = montar();
      ctx.pesquisas.push({
        id: "pes-anterior",
        token: "d".repeat(48),
        conversationId: 42n,
        conversationUuid: "uuid-123",
        telefone: TELEFONE_NORMALIZADO,
        variante: "ESTRELAS",
        status: "RESPONDIDA",
        chatwootCsat: estadoAnterior,
        respondidaEm: new Date(Date.now() - 1000),
        revogadaEm: null,
        expiraEm: new Date(Date.now() + 86_400_000),
        criadaEm: new Date(Date.now() - 2000),
      });

      await fechar(ctx);

      expect(ctx.pesquisas).toHaveLength(2);
      expect(ctx.pesquisas[1].chatwootCsat).toBe("NAO_APLICAVEL");
      expect(ctx.inputsCsat()).toHaveLength(0);
      cancelarTodosEnviosFechamento();
    }
  });

  it("T6 (generico): token invalido, inexistente, expirado, revogado e config desativada dao o mesmo corpo", async () => {
    const ctx = montar();
    await fechar(ctx);
    const token = tokenDaMensagem(ctx);
    const generico = { estado: "INDISPONIVEL" };

    for (const invalido of [token.slice(0, 47), "A".repeat(48), "g".repeat(48), "b".repeat(48)]) {
      expect(await ctx.controller.obter(invalido)).toEqual(generico);
    }
    const consultasAntes = ctx.prisma.pesquisaSatisfacao.findUnique.mock.calls.length;
    await ctx.controller.obter("zz");
    expect(ctx.prisma.pesquisaSatisfacao.findUnique.mock.calls.length).toBe(consultasAntes);

    const original = { ...ctx.pesquisas[0] };

    ctx.pesquisas[0].expiraEm = new Date(Date.now() - 1000);
    const expirada = await ctx.controller.obter(token);
    const erroExpirada = (await capturar(ctx.controller.responder(token, { nota: 3 }))) as HttpException;
    expect(erroExpirada.getStatus()).toBe(404);
    expect(erroExpirada.getResponse()).toEqual(generico);
    ctx.pesquisas[0].expiraEm = original.expiraEm;

    ctx.pesquisas[0].revogadaEm = new Date();
    const revogada = await ctx.controller.obter(token);
    const erroRevogada = (await capturar(ctx.controller.responder(token, { nota: 3 }))) as HttpException;
    expect(erroRevogada.getStatus()).toBe(404);
    expect(erroRevogada.getResponse()).toEqual(generico);
    ctx.pesquisas[0].revogadaEm = null;

    ctx.estado.config = { ...CONFIG_PADRAO, ativo: false };
    const desativada = await ctx.controller.obter(token);

    for (const view of [expirada, revogada, desativada]) {
      expect(JSON.stringify(view)).toBe(JSON.stringify(generico));
    }
  });

  it("T7 (telefone): sem telefone valido ou suprimido nao ha pesquisa nem bloco, e o log nao traz o numero", async () => {
    for (const opcoes of [
      { telefone: null },
      { telefone: "123" },
      { telefone: TELEFONE_BRUTO, suprimido: true },
    ] as Opcoes[]) {
      const ctx = montar(opcoes);
      await fechar(ctx);

      expect((ctx.publica()?.[1] as Linha).content).toBe("Obrigado pelo contato");
      expect(ctx.prisma.pesquisaSatisfacao.create).not.toHaveBeenCalled();
      expect(ctx.inputsCsat()).toHaveLength(0);
      cancelarTodosEnviosFechamento();
    }
    expect(logs.some((l) => l.includes("motivo=sem_telefone"))).toBe(true);
    expect(logs.some((l) => l.includes("motivo=optout"))).toBe(true);
    for (const linha of logs) {
      expect(linha).not.toContain(TELEFONE_NORMALIZADO);
    }
  });

  it("T8 (D-48): fechar duas vezes com a pesquisa aberta reaproveita o mesmo token", async () => {
    const ctx = montar();
    await fechar(ctx);
    const primeiro = tokenDaMensagem(ctx);
    await fechar(ctx);

    expect(ctx.prisma.pesquisaSatisfacao.create).toHaveBeenCalledTimes(1);
    const publicas = ctx.postsMensagem().filter(([, body]) => (body as Linha).private === false);
    expect(publicas).toHaveLength(2);
    for (const [, body] of publicas) {
      expect([...String((body as Linha).content).matchAll(REGEX_LINK)].map((m) => m[1])).toEqual([primeiro]);
    }
    expect(ctx.inputsCsat()).toHaveLength(1);
  });

  it("T9 (variante): AB sorteia 50/50 e CARINHAS fixo grava CARINHAS", async () => {
    const aleatorio = jest.spyOn(Math, "random");

    aleatorio.mockReturnValue(0.2);
    const a = montar({ config: { varianteVisual: "AB" } });
    await fechar(a);
    expect(a.pesquisas[0].variante).toBe("ESTRELAS");
    cancelarTodosEnviosFechamento();

    aleatorio.mockReturnValue(0.8);
    const b = montar({ config: { varianteVisual: "AB" } });
    await fechar(b);
    expect(b.pesquisas[0].variante).toBe("CARINHAS");
    // recarregar o link mostra sempre a mesma variante
    const token = tokenDaMensagem(b);
    expect(await b.controller.obter(token)).toMatchObject({ variante: "CARINHAS" });
    expect(await b.controller.obter(token)).toMatchObject({ variante: "CARINHAS" });
    cancelarTodosEnviosFechamento();

    aleatorio.mockReturnValue(0.2);
    const c = montar({ config: { varianteVisual: "CARINHAS" } });
    await fechar(c);
    expect(c.pesquisas[0].variante).toBe("CARINHAS");
  });

  it("T12 (revogada, D-02): link revogado fica indisponivel e nunca e reaproveitado", async () => {
    const ctx = montar();
    await fechar(ctx);
    const token = tokenDaMensagem(ctx);
    const inexistente = await ctx.controller.obter("d".repeat(48));

    ctx.pesquisas[0].revogadaEm = new Date();
    expect(await ctx.controller.obter(token)).toEqual(inexistente);
    const updatesAntes = ctx.prisma.pesquisaSatisfacao.updateMany.mock.calls.length;
    await expect(ctx.service.responder(token, 4)).resolves.toEqual({ tipo: "INDISPONIVEL" });
    expect(ctx.prisma.pesquisaSatisfacao.updateMany.mock.calls.length).toBe(updatesAntes);

    // Pesquisa ja respondida e depois revogada deixa de devolver RESPONDIDA.
    ctx.pesquisas[0].revogadaEm = null;
    await ctx.controller.responder(token, { nota: 5 });
    await ctx.service.aguardarEfeitos();
    expect(await ctx.controller.obter(token)).toMatchObject({ estado: "RESPONDIDA" });
    ctx.pesquisas[0].revogadaEm = new Date();
    expect(await ctx.controller.obter(token)).toEqual(inexistente);

    // Um novo fechamento NAO reaproveita a revogada: cria outra com outro token.
    ctx.pesquisas[0].respondidaEm = null;
    ctx.pesquisas[0].status = "ENVIADA";
    await fechar(ctx);
    expect(ctx.prisma.pesquisaSatisfacao.create).toHaveBeenCalledTimes(2);
    expect(tokenDaMensagem(ctx)).not.toBe(token);
  });

  it("T13 (dupla despedida): falha ao registrar a mensagem nao impede o gancho; falha do gancho nao perde o registro", async () => {
    const falhaRegistro = montar();
    falhaRegistro.prisma.chatwootMensagemEnviada.create.mockRejectedValue(new Error("db fora"));
    const gancho = jest.spyOn(falhaRegistro.service, "aoFechamentoEnviado");
    await fechar(falhaRegistro);
    expect(logs.some((l) => l.startsWith("warn") && l.includes("db fora"))).toBe(true);
    expect(gancho).toHaveBeenCalledTimes(1);
    expect(falhaRegistro.pesquisas[0].status).toBe("ENVIADA");
    expect(falhaRegistro.inputsCsat()).toHaveLength(1);
    cancelarTodosEnviosFechamento();

    const falhaGancho = montar();
    const quebrado = jest.spyOn(falhaGancho.service, "aoFechamentoEnviado").mockRejectedValue(new Error("boom"));
    await fechar(falhaGancho);
    expect(falhaGancho.prisma.chatwootMensagemEnviada.create).toHaveBeenCalledTimes(1);
    expect(falhaGancho.prisma.chatwootMensagemEnviada.create.mock.invocationCallOrder[0]).toBeLessThan(
      quebrado.mock.invocationCallOrder[0],
    );
    expect(logs.some((l) => l.startsWith("warn") && l.includes("boom"))).toBe(true);
  });

  it("T14 (CSAT nativo ligado): a pesquisa nasce NAO_APLICAVEL; falha na leitura da inbox segue como desligado", async () => {
    const ligado = montar({ csatNativo: true });
    await fechar(ligado);
    expect(ligado.pesquisas[0].chatwootCsat).toBe("NAO_APLICAVEL");
    expect(ligado.inputsCsat()).toHaveLength(0);
    expect(String((ligado.publica()?.[1] as Linha).content)).toMatch(REGEX_LINK);
    expect(logs.some((l) => l.startsWith("warn") && l.includes("inbox 1"))).toBe(true);
    cancelarTodosEnviosFechamento();

    logs.length = 0;
    const falha = montar({ inboxFalha: true });
    await fechar(falha);
    expect(falha.pesquisas[0].chatwootCsat).toBe("MENSAGEM_OK");
    expect(falha.inputsCsat()).toHaveLength(1);
    expect(logs.some((l) => l.startsWith("warn") && l.includes("inbox 500"))).toBe(true);
    cancelarTodosEnviosFechamento();

    logs.length = 0;
    const semInbox = montar({ semInbox: true });
    await fechar(semInbox);
    expect(semInbox.pesquisas[0].chatwootCsat).toBe("MENSAGEM_OK");
    expect(axiosMock.get.mock.calls.some(([url]) => /\/inboxes\//.test(String(url)))).toBe(false);
    expect(logs.some((l) => l.startsWith("warn") && l.includes("inbox_id_ausente"))).toBe(true);
  });
});

describe("Pesquisa de satisfacao - rota publica e regras puras (Fase 52, plano 52-01)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function montarController(extra?: ConstructorParameters<typeof PesquisaPublicController>[2]) {
    const service = {
      obterPublica: jest.fn(async () => ({ estado: "INDISPONIVEL" })),
      responder: jest.fn(async () => ({ tipo: "INDISPONIVEL" })),
    };
    const config = { get: jest.fn((chave: string) => (chave === "INTERNAL_API_KEY" ? "chave-ok" : undefined)) };
    const controller = new PesquisaPublicController(service as never, config as never, extra);
    return { controller, service };
  }

  const req = (headers: Record<string, string>, ipSocket = "10.0.0.1") => ({
    headers,
    socket: { remoteAddress: ipSocket },
  });

  it("T10 (limite por token e metadado): a quarta chamada ao mesmo token recebe 429; classe publica e sem throttler global", async () => {
    const { controller, service } = montarController({ porToken: new LimitadorJanela(3, 60_000) });
    const token = gerarToken();

    for (let i = 0; i < 3; i += 1) await controller.obter(token, req({}));
    const erro = (await capturar(controller.obter(token, req({})))) as HttpException;
    expect(erro.getStatus()).toBe(429);
    expect(erro.getResponse()).toEqual({ estado: "LIMITE" });
    expect(service.obterPublica).toHaveBeenCalledTimes(3);

    expect(Reflect.getMetadata("THROTTLER:SKIPdefault", PesquisaPublicController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PesquisaPublicController)).toBe(true);
  });

  it("T11 (DTO): nota fora de 1..5, nao inteira ou textual e comentario longo falham", async () => {
    const erros = async (corpo: object) => (await validate(plainToInstance(ResponderPesquisaDto, corpo))).length;

    for (const nota of [0, 6, 3.5, "4"]) expect(await erros({ nota })).toBeGreaterThan(0);
    expect(await erros({ nota: 3, comentario: "x".repeat(501) })).toBeGreaterThan(0);
    expect(await erros({ nota: 1 })).toBe(0);
    expect(await erros({ nota: 5 })).toBe(0);
    expect(await erros({ nota: 5, comentario: "x".repeat(500) })).toBe(0);
  });

  it("T15a (limites por IP real e por socket): x-client-ip so vale com a chave interna valida e IP valido", async () => {
    expect(LIMITES_PESQUISA_PUBLICA.porIpReal).toEqual({ max: 60, janelaMs: 60_000 });
    expect(LIMITES_PESQUISA_PUBLICA.porIpSocketCompartilhado).toEqual({ max: 20, janelaMs: 60_000 });

    // chave valida + IP valido: balde proprio de 60 por minuto, outro IP nao e afetado.
    const real = montarController();
    const cabecalho = { "x-internal-api-key": "chave-ok", "x-client-ip": "203.0.113.9" };
    for (let i = 0; i < 60; i += 1) await real.controller.obter(gerarToken(), req(cabecalho));
    const recusada = (await capturar(real.controller.obter(gerarToken(), req(cabecalho)))) as HttpException;
    expect(recusada.getStatus()).toBe(429);
    expect(recusada.getResponse()).toEqual({ estado: "LIMITE" });
    await expect(
      real.controller.obter(gerarToken(), req({ ...cabecalho, "x-client-ip": "203.0.113.10" })),
    ).resolves.toEqual({ estado: "INDISPONIVEL" });

    // chave errada ou ausente: o cabecalho e ignorado e vale o balde compartilhado de 20 do socket.
    const chavesInvalidas: Array<Record<string, string>> = [{ "x-internal-api-key": "errada" }, {}];
    for (const chave of chavesInvalidas) {
      const { controller } = montarController();
      for (let i = 0; i < 20; i += 1) {
        await controller.obter(gerarToken(), req({ ...chave, "x-client-ip": `203.0.113.${i + 1}` }));
      }
      const erro = (await capturar(
        controller.obter(gerarToken(), req({ ...chave, "x-client-ip": "198.51.100.77" })),
      )) as HttpException;
      expect(erro.getStatus()).toBe(429);
    }

    // IP encaminhado que nao e IP, mesmo com chave valida, tambem cai no balde do socket.
    for (const falso of ["abc", "1.2.3.4, 5.6.7.8"]) {
      const { controller } = montarController();
      for (let i = 0; i < 20; i += 1) {
        await controller.obter(gerarToken(), req({ "x-internal-api-key": "chave-ok", "x-client-ip": falso }));
      }
      const erro = (await capturar(
        controller.obter(gerarToken(), req({ "x-internal-api-key": "chave-ok", "x-client-ip": falso })),
      )) as HttpException;
      expect(erro.getStatus()).toBe(429);
    }
  });

  it("T15b (teto da rota): a 301a requisicao recebe 429 sem chamar o servico; IP recusado nao consome o teto", async () => {
    expect(LIMITES_PESQUISA_PUBLICA.tetoDaRota).toEqual({ max: 300, janelaMs: 60_000 });

    const { controller, service } = montarController();
    for (let i = 0; i < 300; i += 1) {
      const cabecalho = { "x-internal-api-key": "chave-ok", "x-client-ip": `10.${i >> 8}.${i & 255}.1` };
      await controller.obter(gerarToken(), req(cabecalho));
    }
    expect(service.obterPublica).toHaveBeenCalledTimes(300);
    const erro = (await capturar(
      controller.obter(gerarToken(), req({ "x-internal-api-key": "chave-ok", "x-client-ip": "172.16.0.1" })),
    )) as HttpException;
    expect(erro.getStatus()).toBe(429);
    expect(service.obterPublica).toHaveBeenCalledTimes(300);

    // Um IP recusado no passo 1 nao chega ao teto.
    const teto = new LimitadorJanela(300, 60_000);
    const espiao = jest.spyOn(teto, "permitir");
    const outro = montarController({ tetoDaRota: teto });
    const cab = { "x-internal-api-key": "chave-ok", "x-client-ip": "203.0.113.50" };
    for (let i = 0; i < 61; i += 1) {
      try {
        await outro.controller.obter(gerarToken(), req(cab));
      } catch {
        // a partir da 61a o IP e recusado (429); isso e esperado
      }
    }
    expect(espiao).toHaveBeenCalledTimes(60);
  });

  it("T15c (puros): resolverIpCliente, chaveInternaValida, normalizarTelefone e demais regras", () => {
    expect(resolverIpCliente({ ipSocket: "10.0.0.1", ipEncaminhado: "203.0.113.9", chaveValida: true })).toEqual({
      ip: "203.0.113.9",
      confiavel: true,
    });
    expect(resolverIpCliente({ ipSocket: "10.0.0.1", ipEncaminhado: "203.0.113.9", chaveValida: false })).toEqual({
      ip: "10.0.0.1",
      confiavel: false,
    });
    expect(resolverIpCliente({ ipEncaminhado: "abc", chaveValida: true })).toEqual({
      ip: "desconhecido",
      confiavel: false,
    });
    expect(chaveInternaValida("segredo", "segredo")).toBe(true);
    expect(chaveInternaValida("segredo", "segredO")).toBe(false);
    expect(chaveInternaValida("curta", "muito-mais-longa")).toBe(false);
    expect(chaveInternaValida(undefined, "x")).toBe(false);
    expect(chaveInternaValida("x", undefined)).toBe(false);

    expect(normalizarTelefone("+55 (12) 99648-4918")).toBe("5512996484918");
    expect(normalizarTelefone("12996484918")).toBe("5512996484918");
    expect(normalizarTelefone("1233334444")).toBe("551233334444");
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone("+44 20 7946 0958")).toBeNull();

    expect(sortearVariante("AB", () => 0.2)).toBe("ESTRELAS");
    expect(sortearVariante("AB", () => 0.8)).toBe("CARINHAS");
    expect(sortearVariante("CARINHAS")).toBe("CARINHAS");
    expect(sortearVariante("qualquer")).toBe("ESTRELAS");

    expect(renderizarTexto("a {x} b {y} {z}", { x: "1", y: "2" })).toBe("a 1 b 2 ");
    expect(formatarReais(2)).toBe("R$ 2,00");
    expect(formatarReais("1234.5")).toBe("R$ 1.234,50");
    expect(formatarPercentual("10")).toBe("10%");
    expect(formatarPercentual(7.5)).toBe("7,5%");
    expect(gerarToken()).toMatch(/^[0-9a-f]{48}$/);
  });

  it("T15d (LimitadorJanela): janela fixa por chave que reabre depois do prazo", () => {
    let agora = 1_000_000;
    const limitador = new LimitadorJanela(2, 1000, () => agora);
    expect(limitador.permitir("a")).toBe(true);
    expect(limitador.permitir("a")).toBe(true);
    expect(limitador.permitir("a")).toBe(false);
    expect(limitador.permitir("b")).toBe(true);
    agora += 1000;
    expect(limitador.permitir("a")).toBe(true);
  });
});
