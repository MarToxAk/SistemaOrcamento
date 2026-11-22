/**
 * Fase 52 (plano 52-07): PesquisaResultadosService — painel de resultados (D-25, UI-D13).
 * Prisma em memoria (pesquisas com cupom e cupons soltos), config falsa e gasto do mes mockado.
 */
import { type PesquisaConfigView } from "./pesquisa-config.service";
import { PesquisaResultadosService } from "./pesquisa-resultados.service";

type Linha = Record<string, any>;

const AGORA = new Date("2026-11-22T15:00:00Z");
const TELEFONE = "5512996484918";
const DIA = 86_400_000;

const CONFIG: PesquisaConfigView = {
  ativo: true,
  percentualDesconto: 10,
  tetoDesconto: 5,
  compraMinima: 30,
  validadeCupomDias: 30,
  validadeLinkDias: 7,
  intervaloDias: 90,
  tetoMensal: 300,
  prefixoCupom: "BOX",
  linkGoogle: null,
  varianteVisual: "AB",
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

function respondida(extra: Linha = {}): Linha {
  return {
    id: "pes-1",
    nota: 5,
    comentario: null,
    variante: "ESTRELAS",
    telefone: TELEFONE,
    status: "RESPONDIDA",
    enviadaEm: new Date("2026-11-10T12:00:00Z"),
    respondidaEm: new Date("2026-11-10T13:00:00Z"),
    revogadaEm: null,
    cupom: null,
    ...extra,
  };
}

type Opcoes = {
  pesquisas?: Linha[];
  cupons?: Linha[];
  gastoCentavos?: number;
  baseUrl?: string;
  accountId?: string;
  config?: Partial<PesquisaConfigView>;
};

function montar(opcoes: Opcoes = {}) {
  const cfg: PesquisaConfigView = { ...CONFIG, ...(opcoes.config ?? {}) };
  const prisma = {
    pesquisaSatisfacao: { findMany: jest.fn(async () => (opcoes.pesquisas ?? []).map((p) => ({ ...p }))) },
    cupomRecompensa: { findMany: jest.fn(async () => (opcoes.cupons ?? []).map((c) => ({ ...c }))) },
  };
  const configPesquisa = { obter: jest.fn(async () => ({ ...cfg })) };
  const pesquisa = { gastoDoMesCentavos: jest.fn(async () => opcoes.gastoCentavos ?? 0) };
  const env: Record<string, string | undefined> = {
    CHATWOOT_BASE_URL: opcoes.baseUrl,
    CHATWOOT_ACCOUNT_ID: opcoes.accountId,
  };
  const configService = { get: jest.fn((chave: string) => env[chave]) };

  const service = new PesquisaResultadosService(
    prisma as never,
    configPesquisa as never,
    pesquisa as never,
    configService as never,
  );
  return { service, prisma };
}

describe("PesquisaResultadosService.resultados", () => {
  it("nota media e distribuicao de 1 a 5 com percentuais que somam 100", async () => {
    const { service } = montar({
      pesquisas: [respondida({ id: "p5", nota: 5 }), respondida({ id: "p4a", nota: 4 }), respondida({ id: "p4b", nota: 4 }), respondida({ id: "p1", nota: 1 })],
    });

    const r = await service.resultados("mes", AGORA);

    expect(r.notaMedia).toBe(3.5);
    expect(r.totalRespostas).toBe(4);
    expect(r.distribuicao).toEqual([
      { nota: 1, total: 1, percentual: 25 },
      { nota: 2, total: 0, percentual: 0 },
      { nota: 3, total: 0, percentual: 0 },
      { nota: 4, total: 2, percentual: 50 },
      { nota: 5, total: 1, percentual: 25 },
    ]);
    expect(r.distribuicao.reduce((soma, d) => soma + d.percentual, 0)).toBe(100);
  });

  it("sem respostas: notaMedia null, total 0, distribuicao zerada e taxa null sem enviadas", async () => {
    const { service } = montar();

    const r = await service.resultados("mes", AGORA);

    expect(r.notaMedia).toBeNull();
    expect(r.totalRespostas).toBe(0);
    expect(r.distribuicao.every((d) => d.total === 0 && d.percentual === 0)).toBe(true);
    expect(r.taxaResposta).toEqual({ respondidas: 0, enviadas: 0, percentual: null });
  });

  it("taxa de resposta em n de N: 3 respondidas de 10 enviadas; pesquisas so CRIADAS nao entram", async () => {
    const { service } = montar({
      pesquisas: [
        ...Array.from({ length: 7 }, (_, i) => respondida({ id: `e-${i}`, status: "ENVIADA", respondidaEm: null, nota: null })),
        ...Array.from({ length: 3 }, (_, i) => respondida({ id: `r-${i}`, nota: 4 })),
        respondida({ id: "criada", status: "CRIADA", enviadaEm: null, respondidaEm: null, nota: null }),
      ],
    });

    const r = await service.resultados("mes", AGORA);

    expect(r.taxaResposta).toEqual({ respondidas: 3, enviadas: 10, percentual: 30 });
  });

  it("comparativo por variante e amostraPequena verdadeiro abaixo de 30 respostas", async () => {
    const { service } = montar({
      pesquisas: [
        respondida({ id: "e1", variante: "ESTRELAS", nota: 5 }),
        respondida({ id: "e2", variante: "ESTRELAS", nota: 4 }),
        respondida({ id: "c1", variante: "CARINHAS", nota: 3 }),
      ],
    });

    const r = await service.resultados("mes", AGORA);

    const estrelas = r.variantes.find((v) => v.variante === "ESTRELAS")!;
    const carinhas = r.variantes.find((v) => v.variante === "CARINHAS")!;
    expect(estrelas).toMatchObject({ respostas: 2, notaMedia: 4.5, enviadas: 2, taxaResposta: 100 });
    expect(carinhas).toMatchObject({ respostas: 1, notaMedia: 3, enviadas: 1, taxaResposta: 100 });
    expect(r.amostraPequena).toBe(true);
  });

  it("amostraPequena falso quando as duas variantes tem 30 respostas ou mais", async () => {
    const { service } = montar({
      pesquisas: [
        ...Array.from({ length: 30 }, (_, i) => respondida({ id: `e-${i}`, variante: "ESTRELAS", nota: 5 })),
        ...Array.from({ length: 30 }, (_, i) => respondida({ id: `c-${i}`, variante: "CARINHAS", nota: 4 })),
      ],
    });

    const r = await service.resultados("mes", AGORA);

    expect(r.amostraPequena).toBe(false);
    expect(r.variantes.map((v) => v.respostas)).toEqual([30, 30]);
  });

  it("cupons emitidos, usados e vencidos no periodo", async () => {
    const { service } = montar({
      cupons: [
        { status: "USADO", criadoEm: new Date("2026-11-05T10:00:00Z"), validadeAte: new Date("2026-12-05T10:00:00Z"), usadoEm: new Date("2026-11-20T10:00:00Z"), descontoAplicado: 3 },
        { status: "EXPIRADO", criadoEm: new Date("2026-11-06T10:00:00Z"), validadeAte: new Date("2026-11-01T10:00:00Z"), usadoEm: null, descontoAplicado: null },
        { status: "EMITIDO", criadoEm: new Date("2026-11-07T10:00:00Z"), validadeAte: new Date("2026-11-01T10:00:00Z"), usadoEm: null, descontoAplicado: null },
        { status: "EMITIDO", criadoEm: new Date("2026-11-08T10:00:00Z"), validadeAte: new Date("2026-12-20T10:00:00Z"), usadoEm: null, descontoAplicado: null },
      ],
    });

    const r = await service.resultados("mes", AGORA);

    expect(r.cupons).toEqual({ emitidos: 4, usados: 1, vencidos: 2 });
  });

  it("gasto do mes atual independe do periodo: 0, 299,99, 300,00 e 412,00 contra teto de 300,00", async () => {
    const casos: Array<[number, { valor: number; percentual: number; atingido: boolean }]> = [
      [0, { valor: 0, percentual: 0, atingido: false }],
      [29999, { valor: 299.99, percentual: 100, atingido: false }],
      [30000, { valor: 300, percentual: 100, atingido: true }],
      [41200, { valor: 412, percentual: 100, atingido: true }],
    ];

    for (const [gastoCentavos, esperado] of casos) {
      const { service } = montar({ gastoCentavos });
      const r = await service.resultados("tudo", AGORA);
      expect(r.gastoMes).toEqual({ ...esperado, teto: 300 });
    }
  });

  it("periodos: mes usa a janela de Sao Paulo, 30d os ultimos 30 dias e tudo sem filtro", async () => {
    const pesquisas = [
      respondida({ id: "a", respondidaEm: new Date(AGORA.getTime() - 1 * DIA) }),
      respondida({ id: "b", respondidaEm: new Date(AGORA.getTime() - 15 * DIA) }),
      respondida({ id: "d", respondidaEm: new Date(AGORA.getTime() - 25 * DIA) }),
      respondida({ id: "c", respondidaEm: new Date(AGORA.getTime() - 40 * DIA) }),
    ];

    expect((await montar({ pesquisas }).service.resultados("mes", AGORA)).totalRespostas).toBe(2);
    expect((await montar({ pesquisas }).service.resultados("30d", AGORA)).totalRespostas).toBe(3);
    expect((await montar({ pesquisas }).service.resultados("tudo", AGORA)).totalRespostas).toBe(4);
  });

  it("ultimas: no maximo 20, mais recentes primeiro, telefone mascarado, revogada e situacao do cupom", async () => {
    const pesquisas = Array.from({ length: 25 }, (_, i) =>
      respondida({
        id: `p-${i}`,
        nota: 5,
        respondidaEm: new Date(AGORA.getTime() - i * 60_000),
        enviadaEm: new Date(AGORA.getTime() - i * 60_000 - 3_600_000),
        revogadaEm: i === 1 ? new Date("2026-11-22T14:00:00Z") : null,
        cupom:
          i === 2
            ? { status: "CANCELADO", validadeAte: new Date("2026-12-20T15:00:00Z"), usadoEm: null, descontoAplicado: null }
            : i === 3
              ? { status: "USADO", validadeAte: new Date("2026-12-20T15:00:00Z"), usadoEm: new Date("2026-11-21T15:00:00Z"), descontoAplicado: 3 }
              : null,
      }),
    );

    const r = await montar({ pesquisas }).service.resultados("mes", AGORA);

    expect(r.ultimas).toHaveLength(20);
    expect(r.ultimas[0].id).toBe("p-0");
    expect(r.ultimas[1].revogada).toBe(true);
    expect(r.ultimas[0].revogada).toBe(false);
    expect(r.ultimas[0].cupom).toEqual({ situacao: "SEM_CUPOM" });
    expect(r.ultimas[2].cupom).toEqual({ situacao: "CANCELADO" });
    expect(r.ultimas[3].cupom).toEqual({ situacao: "USADO" });
    expect(r.ultimas[0].telefoneMascarado).toMatch(/^\(\d{2}\) \*{5}-\d{4}$/);
    expect(r.ultimas[0]).not.toHaveProperty("telefone");
    const serializado = JSON.stringify(r.ultimas);
    expect(serializado).not.toContain(TELEFONE);
    expect(serializado).not.toContain("conversationId");
    expect(serializado).not.toContain("token");
  });

  it("relatorioChatwootUrl vem das envs e e null quando falta uma delas", async () => {
    const comUrl = await montar({ baseUrl: "https://chat.example.com/", accountId: "7" }).service.resultados("mes", AGORA);
    expect(comUrl.relatorioChatwootUrl).toBe("https://chat.example.com/app/accounts/7/reports/csat");

    const semConta = await montar({ baseUrl: "https://chat.example.com" }).service.resultados("mes", AGORA);
    expect(semConta.relatorioChatwootUrl).toBeNull();

    const semBase = await montar({ accountId: "7" }).service.resultados("mes", AGORA);
    expect(semBase.relatorioChatwootUrl).toBeNull();
  });
});
