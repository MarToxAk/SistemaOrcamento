import { AthosService } from "./athos.service";
import { PrismaService } from "../../database/prisma.service";

// Fase 46 (plano 46-01): leitura de orcamentos reais do Athos com PG FALSO (nunca conecta ao
// Athos original). O fake e roteado pelo texto do SQL e devolve numericos como STRING com tres
// casas, como o driver pg faz com colunas numeric.

type AthosFake = {
  cabecalho: Record<string, unknown>;
  itens: Array<Record<string, unknown>>;
  produtos: Array<Record<string, unknown>>;
};

const mockAthosFake: AthosFake = { cabecalho: {}, itens: [], produtos: [] };

const mockColunasPorTabela: Record<string, string[]> = {
  orcamento: ["idorcamento", "idcliente", "valor", "desconto", "descontors", "valoracrescimo", "dataorcamento"],
  orcamento_item: [
    "iditemorcamento",
    "idorcamento",
    "idproduto",
    "sequenciaitem",
    "quantidadeitem",
    "valoritem",
    "valordesconto",
    "orcamentodesconto",
    "orcamentovalorfinalitem",
  ],
  produto: ["idproduto", "descricaoproduto"],
};

jest.mock("pg", () => {
  const route = (sql: string, params?: unknown[]) => {
    if (sql.includes("information_schema.columns")) {
      const tabela = String(params?.[0] ?? (sql.includes("'orcamento'") ? "orcamento" : ""));
      return { rows: (mockColunasPorTabela[tabela] ?? []).map((column_name) => ({ column_name })) };
    }
    if (sql.includes('FROM "orcamento_item"')) return { rows: mockAthosFake.itens };
    if (sql.includes('FROM "orcamento"')) return { rows: [mockAthosFake.cabecalho] };
    if (sql.includes('FROM "produto"')) return { rows: mockAthosFake.produtos };
    return { rows: [] };
  };
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => route(sql, params)),
    release: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  };
  const pool = { connect: jest.fn().mockResolvedValue(client), on: jest.fn() };
  return { Pool: jest.fn(() => pool), Client: jest.fn(() => client) };
});

const n3 = (valor: number) => valor.toFixed(3);

type Cabecalho = { numero: number; valor: number; descontors?: number; desconto?: number; valoracrescimo?: number };
type Item = {
  id?: number;
  quantidade: number;
  valoritem: number;
  valordesconto?: number;
  orcamentodesconto?: number;
  final: number;
};

function prepararAthos(cabecalho: Cabecalho, itens: Item[]) {
  mockAthosFake.cabecalho = {
    idorcamento: cabecalho.numero,
    valor: n3(cabecalho.valor),
    descontors: n3(cabecalho.descontors ?? 0),
    desconto: n3(cabecalho.desconto ?? 0),
    valoracrescimo: n3(cabecalho.valoracrescimo ?? 0),
    idcliente: null,
  };
  mockAthosFake.itens = itens.map((item, idx) => ({
    iditemorcamento: item.id ?? 500 + idx,
    idorcamento: cabecalho.numero,
    idproduto: 1000 + idx,
    sequenciaitem: idx + 1,
    quantidadeitem: n3(item.quantidade),
    valoritem: n3(item.valoritem),
    valordesconto: n3(item.valordesconto ?? 0),
    orcamentodesconto: n3(item.orcamentodesconto ?? 0),
    orcamentovalorfinalitem: n3(item.final),
  }));
  mockAthosFake.produtos = itens.map((_, idx) => ({ idproduto: 1000 + idx, descricaoproduto: `Produto ${idx + 1}` }));
}

describe("AthosService.buscarOrcamentoPorNumero - itens com desconto/acrescimo (pg falso, fase 46)", () => {
  let correcoes: Array<Record<string, unknown>>;
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "athos-falso.invalid";
    process.env.ATHOS_PG_DB = "athos_falso";
    process.env.ATHOS_PG_USER = "usuario_falso";
    process.env.ATHOS_PG_PASS = "senha_falsa";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(() => {
    correcoes = [];
    const prisma = {
      orcamentoItemCorrecao: { findMany: jest.fn(async () => correcoes) },
    } as unknown as PrismaService;
    service = new AthosService(prisma);
  });

  async function ler(numero: string) {
    const { mapped } = await service.buscarOrcamentoPorNumero(numero);
    return mapped;
  }

  it("L1 25822: qtd 13, 1,00, valordesconto 13,00 -> valor 2,00, desconto 13,00, total 13,00", async () => {
    prepararAthos({ numero: 25822, valor: 13 }, [{ quantidade: 13, valoritem: 1, valordesconto: 13, final: 13 }]);
    const mapped = await ler("25822");
    const item = (mapped.itensDetalhados as any[])[0];
    expect(item.valor).toBe(2);
    expect(item.desconto).toBe(13);
    expect(item.total).toBe(13);
    expect(mapped.totais).toMatchObject({ valor: 13, descontors: 0, liquido: 13 });
  });

  it("L2 25877: qtd 200, 0,65, valordesconto 60,00 -> valor 0,95, desconto 60,00, total 130,00", async () => {
    prepararAthos({ numero: 25877, valor: 130 }, [{ quantidade: 200, valoritem: 0.65, valordesconto: 60, final: 130 }]);
    const item = ((await ler("25877")).itensDetalhados as any[])[0];
    expect(item.valor).toBe(0.95);
    expect(item.desconto).toBe(60);
    expect(item.total).toBe(130);
  });

  it("L3 25952: desconto geral rateado, cabecalho BRUTO -> item 5,30 / 58,30 / 524,70 e mapped.totais completo", async () => {
    prepararAthos(
      { numero: 25952, valor: 583, descontors: 58.3, desconto: 10 },
      [{ quantidade: 110, valoritem: 5.3, orcamentodesconto: 58.3, final: 524.7 }],
    );
    const mapped = await ler("25952");
    const item = (mapped.itensDetalhados as any[])[0];
    expect(item.valor).toBe(5.3);
    expect(item.desconto).toBe(58.3);
    expect(item.total).toBe(524.7);
    expect(mapped.totais).toEqual({ valor: 583, descontors: 58.3, descontoPercentual: 10, valoracrescimo: 0, liquido: 524.7 });
  });

  it("L4 25900 aumento de preco: 5,00 (tabela 1,00) nao gera desconto; 1,00 -> 1,50 qtd 4 total 6,00", async () => {
    prepararAthos({ numero: 25900, valor: 5 }, [{ quantidade: 1, valoritem: 5, final: 5 }]);
    const a = ((await ler("25900")).itensDetalhados as any[])[0];
    expect(a.valor).toBe(5);
    expect(a.desconto).toBe(0);
    expect(a.total).toBe(5);

    prepararAthos({ numero: 25901, valor: 6 }, [{ quantidade: 4, valoritem: 1.5, final: 6 }]);
    const b = ((await ler("25901")).itensDetalhados as any[])[0];
    expect(b.valor).toBe(1.5);
    expect(b.desconto).toBe(0);
    expect(b.total).toBe(6);
  });

  it("L5 acrescimo: valor 100,00 + valoracrescimo 7,50 -> totais.valoracrescimo 7,5 e liquido 107,5", async () => {
    prepararAthos({ numero: 26000, valor: 100, descontors: 0, valoracrescimo: 7.5 }, [
      { quantidade: 1, valoritem: 100, final: 100 },
    ]);
    const mapped = await ler("26000");
    expect(mapped.totais.valoracrescimo).toBe(7.5);
    expect(mapped.totais.liquido).toBe(107.5);
  });

  it("L6 D-04 desconto maior que a linha: total da linha travado em 0 (nunca negativo)", async () => {
    prepararAthos({ numero: 26001, valor: 10 }, [{ quantidade: 1, valoritem: 10, orcamentodesconto: 15, final: 0 }]);
    const item = ((await ler("26001")).itensDetalhados as any[])[0];
    expect(item.total).toBe(0);
    expect(item.total).not.toBeLessThan(0);
  });

  it("L7 final armazenado 0 com calculo positivo: resolveItemTotal usa o calculado", async () => {
    prepararAthos({ numero: 26002, valor: 6 }, [{ quantidade: 2, valoritem: 3, final: 0 }]);
    const item = ((await ler("26002")).itensDetalhados as any[])[0];
    expect(item.total).toBe(6);
  });

  it("L8 correcao manual: valor/desconto/total vem da correcao e corrigido e true (applyItemCorrecao intacto)", async () => {
    prepararAthos({ numero: 26003, valor: 130 }, [
      { id: 777, quantidade: 200, valoritem: 0.65, valordesconto: 60, final: 130 },
    ]);
    correcoes = [{ idItemOrcamento: "777", valorItem: 1, valorDesconto: 10, valorFinalItem: 190 }];
    const item = ((await ler("26003")).itensDetalhados as any[])[0];
    expect(item.corrigido).toBe(true);
    expect(item.valor).toBe(1);
    expect(item.desconto).toBe(10);
    expect(item.total).toBe(190);
  });
});
