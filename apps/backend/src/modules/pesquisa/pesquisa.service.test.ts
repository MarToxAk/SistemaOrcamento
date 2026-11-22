/**
 * Fase 52 (plano 52-03): emissao de cupom, elegibilidade de recompensa e bloco do fechamento.
 * Prisma em memoria, PesquisaConfigService falso, Chatwoot e automacao falsos.
 */
import { Logger } from "@nestjs/common";

import type { PesquisaConfigView } from "./pesquisa-config.service";
import { validarTextoMensagem } from "./pesquisa-regras";
import { PesquisaService } from "./pesquisa.service";

type Linha = Record<string, any>;

const TOKEN = "a".repeat(48);
const TELEFONE = "5512996484918";
const DIA = 86_400_000;

const CONFIG_BASE: PesquisaConfigView = {
  ativo: true,
  percentualDesconto: 10,
  tetoDesconto: 5,
  compraMinima: 30,
  validadeCupomDias: 30,
  validadeLinkDias: 7,
  intervaloDias: 90,
  tetoMensal: 300,
  prefixoCupom: "BC",
  linkGoogle: "https://g.page/r/abc/review",
  varianteVisual: "ESTRELAS",
  textoFechamento:
    "Ganhe {percentual} de desconto, até {teto}, com compra mínima de {compra_minima}. {link} Não quer receber? Responda SAIR.",
  textoSemRecompensa: "Obrigado! {link} Não quer receber? Responda SAIR.",
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
    conversationUuid: null,
    contactId: 9n,
    telefone: TELEFONE,
    variante: "ESTRELAS",
    status: "ENVIADA",
    chatwootCsat: "NAO_APLICAVEL",
    nota: null,
    comentario: null,
    respondidaEm: null,
    revogadaEm: null,
    expiraEm: new Date(Date.now() + DIA),
    criadaEm: new Date(Date.now() - DIA),
    ...extra,
  };
}

function casa(linha: Linha, where: Linha): boolean {
  return Object.entries(where).every(([campo, cond]) => {
    const valor = linha[campo];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const condicao = cond as Record<string, unknown>;
      if ("gte" in condicao) {
        if (valor === null || valor === undefined) return false;
        const a = valor instanceof Date ? valor.getTime() : valor;
        const b = condicao.gte instanceof Date ? condicao.gte.getTime() : condicao.gte;
        return a >= (b as number);
      }
      if ("lt" in condicao) {
        if (valor === null || valor === undefined) return false;
        const a = valor instanceof Date ? valor.getTime() : valor;
        const b = condicao.lt instanceof Date ? condicao.lt.getTime() : condicao.lt;
        return a < (b as number);
      }
      if ("gt" in condicao) {
        if (valor === null || valor === undefined) return false;
        const a = valor instanceof Date ? valor.getTime() : valor;
        const b = condicao.gt instanceof Date ? condicao.gt.getTime() : condicao.gt;
        return a > (b as number);
      }
      if ("in" in condicao) return (condicao.in as unknown[]).includes(valor);
      throw new Error(`operador nao suportado no mock: ${JSON.stringify(Object.keys(condicao))}`);
    }
    return valor === cond;
  });
}

type Opcoes = {
  config?: Partial<PesquisaConfigView>;
  pesquisa?: Linha;
  cupons?: Linha[];
  gasto?: string | null;
  corPrimaria?: string;
};

function montar(opcoes: Opcoes = {}) {
  let seq = 0;
  const cfg: PesquisaConfigView = { ...CONFIG_BASE, ...(opcoes.config ?? {}) };
  const pesquisas: Linha[] = [pesquisaPadrao(opcoes.pesquisa)];
  const cupons: Linha[] = [...(opcoes.cupons ?? [])];

  const prisma = {
    pesquisaSatisfacao: {
      findUnique: jest.fn(async ({ where, select }: { where: Linha; select?: Linha }) => {
        const achada = pesquisas.find((p) => casa(p, where));
        if (!achada) return null;
        if (select) {
          return Object.fromEntries(Object.keys(select).map((campo) => [campo, achada[campo]]));
        }
        return { ...achada };
      }),
      findFirst: jest.fn(async ({ where }: { where: Linha }) => {
        const achadas = pesquisas.filter((p) => casa(p, where));
        return achadas.length > 0 ? { ...achadas[achadas.length - 1] } : null;
      }),
      create: jest.fn(async ({ data }: { data: Linha }) => {
        seq += 1;
        const linha: Linha = { ...pesquisaPadrao(), id: `pes-${seq}`, ...data };
        pesquisas.push(linha);
        return { ...linha };
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
      create: jest.fn(async ({ data }: { data: Linha }) => {
        seq += 1;
        const linha: Linha = { id: `cup-${seq}`, status: "EMITIDO", criadoEm: new Date(), ...data };
        cupons.push(linha);
        return { ...linha };
      }),
      count: jest.fn(async ({ where }: { where: Linha }) => cupons.filter((c) => casa(c, where)).length),
      aggregate: jest.fn(async (_args?: Linha) => ({ _sum: { descontoAplicado: opcoes.gasto ?? null } })),
      updateMany: jest.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvo = cupons.filter((c) => casa(c, where));
        alvo.forEach((c) => Object.assign(c, data));
        return { count: alvo.length };
      }),
    },
    pesquisaSupressao: { findUnique: jest.fn(async () => null) },
  };

  const env: Record<string, string> = {
    APP_BASE_URL: "https://app.test",
    EMPRESA_NOME: "Loja Teste",
    EMPRESA_COR_PRIMARIA: opcoes.corPrimaria ?? "#112233",
  };
  const configService = { get: jest.fn((chave: string) => env[chave]) };
  const configPesquisa = {
    obter: jest.fn(async () => ({ ...cfg })),
    padroes: jest.fn(() => ({ ...cfg })),
  };
  const chatwoot = {
    submitCsatResponse: jest.fn(async () => ({ enabled: true })),
    getInbox: jest.fn(async () => null),
  };
  const automation = { registrarGanchoPesquisa: jest.fn() };

  const service = new PesquisaService(
    prisma as never,
    chatwoot as never,
    configService as never,
    automation as never,
    configPesquisa as never,
  );

  return { service, prisma, chatwoot, cfg, pesquisas, cupons };
}

function cupomExistente(extra: Linha = {}): Linha {
  return {
    id: "cup-antigo",
    codigo: "BC-OLD222",
    pesquisaId: "pes-antiga",
    telefone: TELEFONE,
    percentual: 10,
    teto: 5,
    compraMinima: 30,
    status: "EMITIDO",
    validadeAte: new Date(Date.now() + DIA),
    criadoEm: new Date(Date.now() - 30 * DIA),
    ...extra,
  };
}

const conversa = () => ({ meta: { sender: { phone_number: "+5512996484918" } } }) as never;

let logs: string[] = [];

function espiarLogs(): void {
  logs = [];
  for (const nivel of ["log", "warn", "error", "debug", "verbose"] as const) {
    jest.spyOn(Logger.prototype, nivel).mockImplementation((...args: unknown[]) => {
      logs.push(`${nivel}: ${args.map((a) => String(a)).join(" ")}`);
    });
  }
}

describe("PesquisaService - recompensa (Fase 52, plano 52-03)", () => {
  beforeEach(() => espiarLogs());
  afterEach(() => jest.restoreAllMocks());

  it("cupom: qualquer nota (1 e 5) emite um cupom com o snapshot da config", async () => {
    for (const nota of [1, 5]) {
      const { service, cupons, pesquisas } = montar();
      const resultado = await service.responder(TOKEN, nota);
      expect(resultado.tipo).toBe("OK");
      if (resultado.tipo !== "OK") throw new Error("esperado OK");

      expect(resultado.resposta.cupom).not.toBeNull();
      expect(resultado.resposta.cupom).toMatchObject({ percentual: 10, teto: 5, compraMinima: 30 });
      expect(resultado.resposta.cupom?.codigo).toMatch(/^BC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);

      expect(cupons).toHaveLength(1);
      const gravado = cupons[0];
      expect(gravado).toMatchObject({
        pesquisaId: "pes-1",
        telefone: TELEFONE,
        percentual: 10,
        teto: 5,
        compraMinima: 30,
        status: "EMITIDO",
        envioCupomStatus: "PENDENTE",
      });
      const validade = (gravado.validadeAte as Date).getTime();
      const respondida = (pesquisas[0].respondidaEm as Date).getTime();
      expect(validade - respondida).toBe(30 * DIA);
    }
  });

  it("cupom: percentual, teto e compra minima sao copiados da config no momento da emissao", async () => {
    const { service, cupons, cfg } = montar({
      config: { percentualDesconto: 20, tetoDesconto: 8, compraMinima: 40 },
    });
    await service.responder(TOKEN, 4);

    expect(cupons[0]).toMatchObject({ percentual: 20, teto: 8, compraMinima: 40 });
    cfg.percentualDesconto = 5;
    expect(cupons[0].percentual).toBe(20);
  });

  it("cupom unico por pesquisa: P2002 em pesquisaId devolve o cupom existente sem criar outro", async () => {
    const existente = cupomExistente({ pesquisaId: "pes-1", codigo: "BC-KEEP22" });
    const { service, prisma, cupons } = montar({ config: { intervaloDias: 0 }, cupons: [existente] });
    prisma.cupomRecompensa.findUnique.mockResolvedValueOnce(null);
    prisma.cupomRecompensa.create.mockRejectedValueOnce(
      Object.assign(new Error("duplicado"), { code: "P2002", meta: { target: ["pesquisaId"] } }),
    );

    const resultado = await service.responder(TOKEN, 4);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom?.codigo).toBe("BC-KEEP22");
    expect(prisma.cupomRecompensa.create).toHaveBeenCalledTimes(1);
    expect(cupons).toHaveLength(1);
  });

  it("cupom unico por pesquisa: P2002 em pesquisaId com cupom nao EMITIDO nao devolve o cupom (IN-01)", async () => {
    const existente = cupomExistente({ pesquisaId: "pes-1", codigo: "BC-CANC22", status: "CANCELADO" });
    const { service, prisma } = montar({ config: { intervaloDias: 0 }, cupons: [existente] });
    prisma.cupomRecompensa.findUnique.mockResolvedValueOnce(null);
    prisma.cupomRecompensa.create.mockRejectedValueOnce(
      Object.assign(new Error("duplicado"), { code: "P2002", meta: { target: ["pesquisaId"] } }),
    );

    const resultado = await service.responder(TOKEN, 4);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).toBeNull();
  });

  it("cupom unico por pesquisa: colisao de codigo tenta de novo ate 5 vezes e devolve cupom nulo", async () => {
    const { service, prisma } = montar({ config: { intervaloDias: 0 } });
    prisma.cupomRecompensa.create.mockRejectedValue(
      Object.assign(new Error("codigo repetido"), { code: "P2002", meta: { target: ["codigo"] } }),
    );

    const resultado = await service.responder(TOKEN, 4);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).toBeNull();
    expect(prisma.cupomRecompensa.create).toHaveBeenCalledTimes(5);
    expect(logs.some((l) => l.includes("pesquisaId=pes-1"))).toBe(true);
  });

  it("intervalo: cupom do mesmo telefone nos ultimos 90 dias bloqueia a emissao", async () => {
    const { service, prisma } = montar({ cupons: [cupomExistente()] });
    const resultado = await service.responder(TOKEN, 5);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).toBeNull();
    expect(prisma.cupomRecompensa.create).not.toHaveBeenCalled();
  });

  it("intervalo: zero desliga a regra e emite mesmo com cupom recente", async () => {
    const { service, cupons } = montar({ config: { intervaloDias: 0 }, cupons: [cupomExistente()] });
    const resultado = await service.responder(TOKEN, 5);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).not.toBeNull();
    expect(cupons).toHaveLength(2);
  });

  it("intervalo: cupom de 91 dias atras nao bloqueia", async () => {
    const { service } = montar({
      cupons: [cupomExistente({ criadoEm: new Date(Date.now() - 91 * DIA) })],
    });
    const resultado = await service.responder(TOKEN, 5);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).not.toBeNull();
  });

  it("teto: gasto do mes no teto bloqueia e um centavo abaixo emite", async () => {
    const noTeto = montar({ gasto: "300.00" });
    const bloqueada = await noTeto.service.responder(TOKEN, 5);
    expect(bloqueada.tipo).toBe("OK");
    if (bloqueada.tipo !== "OK") throw new Error("esperado OK");
    expect(bloqueada.resposta.cupom).toBeNull();
    expect(noTeto.prisma.cupomRecompensa.create).not.toHaveBeenCalled();

    const abaixo = montar({ gasto: "299.99" });
    const liberada = await abaixo.service.responder(TOKEN, 5);
    expect(liberada.tipo).toBe("OK");
    if (liberada.tipo !== "OK") throw new Error("esperado OK");
    expect(liberada.resposta.cupom).not.toBeNull();
  });

  it("teto: aggregate conta so USADO com usadoEm dentro da janela do mes e nulo vale zero", async () => {
    const { service, prisma } = montar({ gasto: null });
    const resultado = await service.responder(TOKEN, 5);

    const chamada = prisma.cupomRecompensa.aggregate.mock.calls[0][0] as Linha;
    expect(chamada.where.status).toBe("USADO");
    expect(chamada.where.usadoEm.gte).toBeInstanceOf(Date);
    expect((chamada.where.usadoEm.lt as Date).getTime()).toBeGreaterThan(
      (chamada.where.usadoEm.gte as Date).getTime(),
    );
    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).not.toBeNull();
  });

  it("teto: fechamento com recompensa bloqueada usa o texto sem promessa", async () => {
    const { service } = montar({ gasto: "300.00" });
    const bloco = await service.prepararFechamento({
      conversationId: "42",
      customerId: null,
      conversa: conversa(),
    });

    expect(bloco).not.toBeNull();
    expect(bloco?.bloco).toContain("Obrigado!");
    expect(bloco?.bloco).not.toContain("Ganhe");
    expect(bloco?.bloco).toContain("https://app.test/pesquisa/");
  });

  it("teto: fechamento com recompensa disponivel resolve percentual, teto e compra minima", async () => {
    const { service } = montar({ gasto: null });
    const bloco = await service.prepararFechamento({
      conversationId: "42",
      customerId: null,
      conversa: conversa(),
    });

    expect(bloco).not.toBeNull();
    expect(bloco?.bloco).toContain("Ganhe 10% de desconto");
    expect(bloco?.bloco).toContain("R$ 5,00");
    expect(bloco?.bloco).toContain("R$ 30,00");
    expect(bloco?.bloco).not.toMatch(/[{}]/);
  });

  it("T52-13a (tracer): fechamento com {LINK} em caixa alta envia o link real", async () => {
    const { service } = montar({ config: { textoFechamento: "Responda: {LINK}" } });
    const bloco = await service.prepararFechamento({
      conversationId: "42",
      customerId: null,
      conversa: conversa(),
    });

    expect(bloco).not.toBeNull();
    expect(bloco?.bloco).toContain("https://app.test/pesquisa/");
    expect(bloco?.bloco).not.toMatch(/[{}]/);
    expect(validarTextoMensagem("fechamento", "Responda: {LINK}")).toBeNull();
  });

  it("best-effort: falha ao criar o cupom nao desfaz a nota e nao vaza telefone nem codigo", async () => {
    const { service, prisma, pesquisas } = montar();
    prisma.cupomRecompensa.create.mockRejectedValue(new Error("db fora"));

    const resultado = await service.responder(TOKEN, 3);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).toBeNull();
    expect(pesquisas[0]).toMatchObject({ nota: 3, status: "RESPONDIDA" });
    expect(logs.some((l) => l.startsWith("warn") && l.includes("db fora"))).toBe(true);
    for (const linha of logs) {
      expect(linha).not.toContain(TELEFONE);
      expect(linha).not.toMatch(/BC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}/);
    }
  });

  it("corrida: revogacao depois do create cancela o cupom e devolve cupom nulo", async () => {
    const { service, prisma, pesquisas } = montar({ config: { intervaloDias: 0 } });
    prisma.cupomRecompensa.create.mockImplementationOnce(async ({ data }: { data: Linha }) => {
      pesquisas[0].revogadaEm = new Date();
      return { id: "cup-novo", status: "EMITIDO", criadoEm: new Date(), ...data };
    });

    const resultado = await service.responder(TOKEN, 4);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).toBeNull();
    expect(pesquisas[0].nota).toBe(4);
    expect(prisma.cupomRecompensa.updateMany).toHaveBeenCalledWith({
      where: { id: "cup-novo", status: "EMITIDO" },
      data: { status: "CANCELADO" },
    });
  });

  it("corrida: sem revogacao nenhum cupom e cancelado e o cupom e devolvido", async () => {
    const { service, prisma } = montar({ config: { intervaloDias: 0 } });
    const resultado = await service.responder(TOKEN, 4);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).not.toBeNull();
    expect(prisma.cupomRecompensa.updateMany).not.toHaveBeenCalled();
  });

  it("corrida: falha ao cancelar o cupom de pesquisa revogada vira warn e cupom nulo", async () => {
    const { service, prisma, pesquisas } = montar({ config: { intervaloDias: 0 } });
    prisma.cupomRecompensa.create.mockImplementationOnce(async ({ data }: { data: Linha }) => {
      pesquisas[0].revogadaEm = new Date();
      return { id: "cup-novo", status: "EMITIDO", criadoEm: new Date(), ...data };
    });
    prisma.cupomRecompensa.updateMany.mockRejectedValueOnce(new Error("cancel falhou"));

    const resultado = await service.responder(TOKEN, 4);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).toBeNull();
    expect(logs.some((l) => l.startsWith("warn") && l.includes("cancel falhou"))).toBe(true);
  });

  it("telefone nulo: sem cupom, sem create e sem excecao", async () => {
    const { service, prisma } = montar({ pesquisa: { telefone: null } });
    const resultado = await service.responder(TOKEN, 5);

    expect(resultado.tipo).toBe("OK");
    if (resultado.tipo !== "OK") throw new Error("esperado OK");
    expect(resultado.resposta.cupom).toBeNull();
    expect(prisma.cupomRecompensa.create).not.toHaveBeenCalled();
  });

  it("ativo: desligado nao monta bloco nem emite cupom", async () => {
    const { service, prisma } = montar({ config: { ativo: false } });

    const bloco = await service.prepararFechamento({
      conversationId: "42",
      customerId: null,
      conversa: conversa(),
    });
    const resultado = await service.responder(TOKEN, 5);

    expect(bloco).toBeNull();
    expect(resultado.tipo).toBe("INDISPONIVEL");
    expect(prisma.pesquisaSatisfacao.create).not.toHaveBeenCalled();
    expect(prisma.cupomRecompensa.create).not.toHaveBeenCalled();
  });

  it("cor: cor clara cai no fallback e o aviso sai uma vez por processo", async () => {
    const { service } = montar({ corPrimaria: "#ffe066" });

    expect(await service.obterPublica(TOKEN)).toMatchObject({ corPrimaria: "#0d6efd" });
    expect(await service.obterPublica(TOKEN)).toMatchObject({ corPrimaria: "#0d6efd" });
    expect(logs.filter((l) => l.includes("Cor primaria")).length).toBe(1);
  });

  it("cor: cor escura e mantida e nao gera aviso", async () => {
    const { service } = montar({ corPrimaria: "#0a58ca" });

    expect(await service.obterPublica(TOKEN)).toMatchObject({ corPrimaria: "#0a58ca" });
    expect(logs.some((l) => l.includes("Cor primaria"))).toBe(false);
  });
});
