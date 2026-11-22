/**
 * Fase 52 (plano 52-12): PesquisaRevogacaoService — revogacao de uma pesquisa.
 *
 * Prisma em memoria (cliente base e cliente da transacao compartilham o mesmo estado). Os testes
 * ponta a ponta (publica/INDISPONIVEL e a corrida revogar x responder) instanciam o PesquisaService
 * REAL sobre esse estado: e a prova de que o token pode ser invalidado sob demanda e de que a rota
 * publica responde com o MESMO corpo generico de um token inexistente.
 */
import "reflect-metadata";

import { Logger, NotFoundException } from "@nestjs/common";

import {
  agendarEnvioFechamento,
  cancelarTodosEnviosFechamento,
  enviosFechamentoPendentes,
} from "../integrations/chatwoot/chatwoot-etiquetas";
import { type PesquisaConfigView } from "./pesquisa-config.service";
import { PesquisaRevogacaoService } from "./pesquisa-revogacao.service";
import { PesquisaService } from "./pesquisa.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

const AGORA = new Date("2026-11-22T15:00:00Z");
const TELEFONE = "5512996484918";
const PESQUISA_ID = "8f14e45f-ceea-467f-a1d3-6e0b3a7c1f22";
const OUTRO_ID = "b5b6e5f0-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
const TOKEN = "a".repeat(48);
const TOKEN_INEXISTENTE = "0".repeat(48);
const CODIGO_CUPOM = "BC-ABC234";

const CONFIG: PesquisaConfigView = {
  ativo: true,
  percentualDesconto: 10,
  tetoDesconto: 5,
  compraMinima: 30,
  validadeCupomDias: 30,
  validadeLinkDias: 7,
  intervaloDias: 90,
  tetoMensal: 300,
  prefixoCupom: "BC",
  linkGoogle: null,
  varianteVisual: "ESTRELAS",
  textoFechamento: "a {link}",
  textoSemRecompensa: "b {link}",
  textoPosResposta: "c {codigo}",
  textoConviteGoogle: "d {link_google}",
  paginaTitulo: "t",
  paginaSubtitulo: "s",
  paginaObrigadoSemRecompensa: "o",
  paginaGoogleTitulo: "g",
  paginaGoogleCorpo: "c",
  atualizadoEm: null,
  atualizadoPor: null,
};

function pesquisa(extra: Linha = {}): Linha {
  return {
    id: PESQUISA_ID,
    token: TOKEN,
    conversationId: null,
    conversationUuid: null,
    contactId: null,
    telefone: TELEFONE,
    customerId: null,
    variante: "ESTRELAS",
    status: "ENVIADA",
    chatwootCsat: "NAO_APLICAVEL",
    nota: null,
    comentario: null,
    envioConviteStatus: "PENDENTE",
    envioConviteReservadoEm: null,
    tentativasEnvio: 0,
    criadaEm: new Date("2026-11-20T12:00:00Z"),
    enviadaEm: new Date("2026-11-20T12:01:00Z"),
    expiraEm: new Date("2026-11-27T12:00:00Z"),
    respondidaEm: null,
    anonimizadaEm: null,
    revogadaEm: null,
    ...extra,
  };
}

function cupom(extra: Linha = {}): Linha {
  return {
    id: "cup-1",
    codigo: CODIGO_CUPOM,
    pesquisaId: PESQUISA_ID,
    telefone: TELEFONE,
    percentual: 10,
    teto: 5,
    compraMinima: 30,
    status: "EMITIDO",
    envioCupomStatus: "PENDENTE",
    envioCupomReservadoEm: null,
    validadeAte: new Date("2026-12-20T15:00:00Z"),
    criadoEm: new Date("2026-11-20T12:00:00Z"),
    valorCompra: null,
    descontoAplicado: null,
    usadoEm: null,
    usadoPor: null,
    ...extra,
  };
}

function casa(linha: Linha, where: Linha | undefined): boolean {
  if (!where) return true;
  for (const [campo, cond] of Object.entries(where)) {
    if (campo === "OR") {
      if (!(cond as Linha[]).some((sub) => casa(linha, sub))) return false;
      continue;
    }
    const valor = linha[campo];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("gt" in c) {
        if (valor == null || new Date(valor).getTime() <= new Date(c.gt as Date).getTime()) return false;
      }
      if ("gte" in c) {
        if (valor == null || new Date(valor).getTime() < new Date(c.gte as Date).getTime()) return false;
      }
      if ("lt" in c) {
        if (valor == null || new Date(valor).getTime() >= new Date(c.lt as Date).getTime()) return false;
      }
      if ("in" in c) {
        if (!(c.in as unknown[]).includes(valor)) return false;
      }
      continue;
    }
    if (valor !== cond) return false;
  }
  return true;
}

/** Projecao minima do `select` do Prisma (campos simples e uma relacao com select). */
function projetar(linha: Linha, select: Linha): Linha {
  const saida: Linha = {};
  for (const [campo, valor] of Object.entries(select)) {
    if (valor === true) {
      saida[campo] = linha[campo];
    } else if (valor && typeof valor === "object" && (valor as Linha).select) {
      saida[campo] = linha[campo] ? projetar(linha[campo] as Linha, (valor as Linha).select) : null;
    } else {
      saida[campo] = linha[campo];
    }
  }
  return saida;
}

type Hook = (dados: Linha) => Promise<void>;
type Opcoes = {
  pesquisas?: Linha[];
  cupons?: Linha[];
};

function montar(opcoes: Opcoes = {}) {
  const pesquisas: Linha[] = (opcoes.pesquisas ?? []).map((p) => ({ ...p }));
  const cupons: Linha[] = (opcoes.cupons ?? []).map((c) => ({ ...c }));
  let seq = 0;
  let antesDeInserirCupom: Hook | null = null;
  let depoisDeInserirCupom: Hook | null = null;

  const cupomDa = (pesquisaId: string): Linha | null => cupons.find((c) => c.pesquisaId === pesquisaId) ?? null;

  const cliente = () => ({
    pesquisaConfig: {
      findUnique: jest.fn(async () => ({ ...CONFIG })),
      create: jest.fn(async ({ data }: Linha) => ({ ...CONFIG, ...data })),
    },
    pesquisaSupressao: {
      findUnique: jest.fn(async () => null),
    },
    pesquisaSatisfacao: {
      findUnique: jest.fn(async ({ where, select }: Linha) => {
        const achada = pesquisas.find((p) => casa(p, where));
        if (!achada) return null;
        const relacao = cupomDa(achada.id);
        const completa: Linha = { ...achada, cupom: relacao ? { ...relacao } : null };
        return select ? projetar(completa, select) : completa;
      }),
      findFirst: jest.fn(async ({ where }: Linha) => {
        const achadas = pesquisas.filter((p) => casa(p, where));
        const ultima = achadas[achadas.length - 1];
        return ultima ? { ...ultima } : null;
      }),
      create: jest.fn(async ({ data }: Linha) => {
        seq += 1;
        const linha: Linha = {
          id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
          status: "CRIADA",
          chatwootCsat: "AGUARDANDO_MENSAGEM",
          nota: null,
          comentario: null,
          respondidaEm: null,
          revogadaEm: null,
          enviadaEm: null,
          anonimizadaEm: null,
          envioConviteStatus: "PENDENTE",
          tentativasEnvio: 0,
          criadaEm: new Date(),
          ...data,
        };
        pesquisas.push(linha);
        return { ...linha };
      }),
      update: jest.fn(async ({ where, data }: Linha) => {
        const linha = pesquisas.find((p) => casa(p, where));
        if (!linha) throw new Error("pesquisa inexistente");
        Object.assign(linha, data);
        return { ...linha };
      }),
      updateMany: jest.fn(async ({ where, data }: Linha) => {
        const alvo = pesquisas.filter((p) => casa(p, where));
        alvo.forEach((p) => Object.assign(p, data));
        return { count: alvo.length };
      }),
      count: jest.fn(async ({ where }: Linha) => pesquisas.filter((p) => casa(p, where)).length),
    },
    cupomRecompensa: {
      findUnique: jest.fn(async ({ where }: Linha) => {
        const achado = cupons.find((c) => casa(c, where));
        return achado ? { ...achado } : null;
      }),
      findMany: jest.fn(async ({ where }: Linha) => cupons.filter((c) => casa(c, where)).map((c) => ({ ...c }))),
      create: jest.fn(async ({ data }: Linha) => {
        if (antesDeInserirCupom) await antesDeInserirCupom(data);
        const linha: Linha = { id: `cup-${cupons.length + 1}`, status: "EMITIDO", envioCupomStatus: "PENDENTE", ...data };
        cupons.push(linha);
        if (depoisDeInserirCupom) await depoisDeInserirCupom(linha);
        return { ...linha };
      }),
      updateMany: jest.fn(async ({ where, data }: Linha) => {
        const alvo = cupons.filter((c) => casa(c, where));
        alvo.forEach((c) => Object.assign(c, data));
        return { count: alvo.length };
      }),
      count: jest.fn(async ({ where }: Linha) => cupons.filter((c) => casa(c, where)).length),
      aggregate: jest.fn(async () => ({ _sum: { descontoAplicado: null } })),
    },
    quote: { findFirst: jest.fn(async () => null), count: jest.fn(async () => 0) },
  });

  const base = cliente();
  const tx = cliente();
  let fila: Promise<unknown> = Promise.resolve();
  const prisma = {
    ...base,
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => {
      const execucao = fila.then(() => fn(tx));
      fila = execucao.catch(() => undefined);
      return execucao;
    }),
  };

  const service = new PesquisaRevogacaoService(prisma as never);
  return {
    prisma,
    tx,
    service,
    pesquisas,
    cupons,
    definirAntesDeInserirCupom: (fn: Hook | null) => {
      antesDeInserirCupom = fn;
    },
    definirDepoisDeInserirCupom: (fn: Hook | null) => {
      depoisDeInserirCupom = fn;
    },
  };
}

function pesquisadorDe(prisma: unknown): PesquisaService {
  const configPesquisa = { obter: jest.fn(async () => ({ ...CONFIG })) };
  const configService = { get: jest.fn(() => undefined) };
  return new PesquisaService(
    prisma as never,
    {} as never,
    configService as never,
    {} as never,
    configPesquisa as never,
  );
}

async function capturar(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
    return null;
  } catch (err) {
    return err;
  }
}

let logs: string[] = [];

function espiarLogs(): void {
  logs = [];
  for (const nivel of ["log", "warn", "error"] as const) {
    jest.spyOn(Logger.prototype, nivel).mockImplementation((...args: unknown[]) => {
      logs.push(`${nivel}: ${args.map((a) => String(a)).join(" ")}`);
    });
  }
}

describe("PesquisaRevogacaoService.revogar", () => {
  beforeEach(() => {
    cancelarTodosEnviosFechamento();
    espiarLogs();
  });

  afterEach(() => {
    cancelarTodosEnviosFechamento();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("revogar pesquisa respondida com cupom EMITIDO grava revogadaEm, cancela o cupom e devolve os flags", async () => {
    const { service, tx } = montar({
      pesquisas: [pesquisa({ respondidaEm: AGORA, nota: 5 })],
      cupons: [cupom()],
    });

    const resultado = await service.revogar(PESQUISA_ID, AGORA);

    expect(resultado).toEqual({
      pesquisaId: PESQUISA_ID,
      jaRevogada: false,
      cupomCancelado: true,
      cupomJaUsado: false,
    });
    expect(tx.pesquisaSatisfacao.updateMany).toHaveBeenCalledWith({
      where: { id: PESQUISA_ID, revogadaEm: null },
      data: { revogadaEm: AGORA },
    });
    expect(tx.cupomRecompensa.updateMany).toHaveBeenCalledWith({
      where: { pesquisaId: PESQUISA_ID, status: "EMITIDO" },
      data: { status: "CANCELADO" },
    });
  });

  it("cupom USADO nunca e alterado: devolve cupomJaUsado e cupomCancelado falso", async () => {
    const { service, tx } = montar({
      pesquisas: [pesquisa({ respondidaEm: AGORA, nota: 2 })],
      cupons: [cupom({ status: "USADO", usadoEm: AGORA })],
    });

    const resultado = await service.revogar(PESQUISA_ID, AGORA);

    expect(resultado.cupomJaUsado).toBe(true);
    expect(resultado.cupomCancelado).toBe(false);
    expect(tx.cupomRecompensa.updateMany).toHaveBeenCalledWith({
      where: { pesquisaId: PESQUISA_ID, status: "EMITIDO" },
      data: { status: "CANCELADO" },
    });
  });

  it("cupom EXPIRADO tambem nao e cancelado nem contado como usado", async () => {
    const { service } = montar({
      pesquisas: [pesquisa({ respondidaEm: AGORA, nota: 3 })],
      cupons: [cupom({ status: "EXPIRADO" })],
    });

    const resultado = await service.revogar(PESQUISA_ID, AGORA);

    expect(resultado.cupomJaUsado).toBe(false);
    expect(resultado.cupomCancelado).toBe(false);
  });

  it("pesquisa sem cupom devolve cupomCancelado e cupomJaUsado falsos", async () => {
    const { service } = montar({ pesquisas: [pesquisa({ respondidaEm: AGORA, nota: 5 })] });

    const resultado = await service.revogar(PESQUISA_ID, AGORA);

    expect(resultado).toEqual({
      pesquisaId: PESQUISA_ID,
      jaRevogada: false,
      cupomCancelado: false,
      cupomJaUsado: false,
    });
  });

  it("revogar e idempotente: a segunda chamada devolve jaRevogada sem sobrescrever revogadaEm", async () => {
    const { service, tx, pesquisas } = montar({
      pesquisas: [pesquisa({ respondidaEm: AGORA, nota: 5 })],
      cupons: [cupom()],
    });
    await service.revogar(PESQUISA_ID, AGORA);
    const depois = new Date(AGORA.getTime() + 1000);

    const resultado = await service.revogar(PESQUISA_ID, depois);

    expect(resultado.jaRevogada).toBe(true);
    expect(resultado.cupomCancelado).toBe(false);
    // o updateMany com revogadaEm: null nao encontra mais a linha (contagem 0)
    expect(tx.pesquisaSatisfacao.updateMany).toHaveBeenLastCalledWith({
      where: { id: PESQUISA_ID, revogadaEm: null },
      data: { revogadaEm: depois },
    });
    expect((pesquisas[0].revogadaEm as Date).getTime()).toBe(AGORA.getTime());
  });

  it("id fora do formato UUID devolve 404 sem consultar o banco", async () => {
    const { service, prisma, tx } = montar({ pesquisas: [pesquisa()] });

    for (const invalido of ["abc", "", "1"]) {
      const erro = await capturar(service.revogar(invalido, AGORA));
      expect(erro).toBeInstanceOf(NotFoundException);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.pesquisaSatisfacao.findUnique).not.toHaveBeenCalled();
  });

  it("UUID valido inexistente devolve 404 depois de consultar o banco", async () => {
    const { service, tx } = montar({ pesquisas: [pesquisa()] });

    const erro = await capturar(service.revogar(OUTRO_ID, AGORA));

    expect(erro).toBeInstanceOf(NotFoundException);
    expect(tx.pesquisaSatisfacao.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.pesquisaSatisfacao.updateMany).not.toHaveBeenCalled();
  });

  it("revogar cancela o convite do Google agendado com a chave convite:<id> e nada sai depois", async () => {
    jest.useFakeTimers();
    const { service } = montar({ pesquisas: [pesquisa({ respondidaEm: AGORA, nota: 5 })] });
    const enviar = jest.fn(async () => undefined);
    agendarEnvioFechamento(`convite:${PESQUISA_ID}`, 60_000, enviar);
    expect(enviosFechamentoPendentes()).toBe(1);

    await service.revogar(PESQUISA_ID, AGORA);

    expect(enviosFechamentoPendentes()).toBe(0);
    await jest.advanceTimersByTimeAsync(200_000);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("publica/INDISPONIVEL: apos revogar, a rota publica responde o mesmo corpo de um token inexistente", async () => {
    const { service, prisma, pesquisas } = montar({ pesquisas: [pesquisa()] });
    const pesquisador = pesquisadorDe(prisma);

    expect(await pesquisador.obterPublica(TOKEN)).toMatchObject({ estado: "ABERTA" });

    await service.revogar(PESQUISA_ID, AGORA);

    const depois = await pesquisador.obterPublica(TOKEN);
    expect(depois).toEqual({ estado: "INDISPONIVEL" });
    expect(depois).toEqual(await pesquisador.obterPublica(TOKEN_INEXISTENTE));

    const resposta = await pesquisador.responder(TOKEN, 5);
    expect(resposta).toEqual({ tipo: "INDISPONIVEL" });
    expect(pesquisas[0].nota).toBeNull();
  });

  it("publica/INDISPONIVEL: pesquisa ja RESPONDIDA passa a INDISPONIVEL apos a revogacao", async () => {
    const { service, prisma } = montar({ pesquisas: [pesquisa({ respondidaEm: AGORA, nota: 5 })] });
    const pesquisador = pesquisadorDe(prisma);

    expect(await pesquisador.obterPublica(TOKEN)).toMatchObject({ estado: "RESPONDIDA" });

    await service.revogar(PESQUISA_ID, AGORA);

    expect(await pesquisador.obterPublica(TOKEN)).toEqual({ estado: "INDISPONIVEL" });
    expect(await pesquisador.responder(TOKEN, 4)).toEqual({ tipo: "INDISPONIVEL" });
  });

  it("corrida revogar x responder: revogacao entre a nota e o cupom deixa o cupom CANCELADO", async () => {
    const ctx = montar({ pesquisas: [pesquisa()] });
    const pesquisador = pesquisadorDe(ctx.prisma);
    ctx.definirAntesDeInserirCupom(async () => {
      await ctx.service.revogar(PESQUISA_ID, AGORA);
    });

    const resultado = await pesquisador.responder(TOKEN, 4);
    await pesquisador.aguardarEfeitos();

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo === "OK") expect(resultado.resposta.cupom).toBeNull();
    expect(ctx.cupons).toHaveLength(1);
    expect(ctx.cupons[0].status).toBe("CANCELADO");
    expect(ctx.pesquisas[0].revogadaEm).toBeInstanceOf(Date);
  });

  it("corrida revogar x responder: revogacao depois do create tambem termina com o cupom CANCELADO", async () => {
    const ctx = montar({ pesquisas: [pesquisa()] });
    const pesquisador = pesquisadorDe(ctx.prisma);
    ctx.definirDepoisDeInserirCupom(async () => {
      await ctx.service.revogar(PESQUISA_ID, AGORA);
    });

    const resultado = await pesquisador.responder(TOKEN, 4);
    await pesquisador.aguardarEfeitos();

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo === "OK") expect(resultado.resposta.cupom).toBeNull();
    expect(ctx.cupons[0].status).toBe("CANCELADO");
    expect(ctx.pesquisas[0].revogadaEm).toBeInstanceOf(Date);
  });

  it("logs da revogacao trazem o pesquisaId e nunca telefone, token ou codigo do cupom", async () => {
    const { service } = montar({
      pesquisas: [pesquisa({ respondidaEm: AGORA, nota: 5 })],
      cupons: [cupom()],
    });

    await service.revogar(PESQUISA_ID, AGORA);

    const registro = logs.find((linha) => linha.includes("Revogacao da pesquisa"));
    expect(registro).toBeDefined();
    expect(registro).toContain(PESQUISA_ID);
    for (const linha of logs) {
      expect(linha).not.toContain(TELEFONE);
      expect(linha).not.toContain(TOKEN);
      expect(linha).not.toContain(CODIGO_CUPOM);
    }
  });
});
