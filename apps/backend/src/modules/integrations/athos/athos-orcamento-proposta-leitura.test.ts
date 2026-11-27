import { AthosOrcamentoService, OrcamentoAthosError } from "./athos-orcamento.service";

// Seguranca (Fase 55): NUNCA conecta ao Athos real. pg e mockado por completo e o host de teste e localhost.
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn(), end: jest.fn().mockResolvedValue(undefined) };
  return { Pool: jest.fn(() => mPool), __mClient: mClient, __mPool: mPool };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
const mClient = pgMock.__mClient as { query: jest.Mock; release: jest.Mock };

function sqls(): string[] {
  return mClient.query.mock.calls.map((c: unknown[]) => String(c[0]).replace(/\s+/g, " ").trim());
}

function selectEmitido(): { sql: string; params: unknown[] } {
  const c = mClient.query.mock.calls.find((x: unknown[]) => /^\s*SELECT/i.test(String(x[0])));
  if (!c) throw new Error("nenhum SELECT emitido");
  return { sql: String(c[0]).replace(/\s+/g, " ").trim(), params: (c[1] as unknown[]) ?? [] };
}

function linha(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idproduto: 7,
    descricaoproduto: "CADERNO UNIVERSITARIO",
    descricaocurta: "Caderno",
    marca: "Tilibra",
    referencia: "REF-7",
    codigobarra1: "789",
    preco: "3.456",
    empromocao: false,
    estoqueloja: "10.000",
    estoquedeposito: null,
    permitefracionar: false,
    unidade: "UN",
    valorcustounitario: "1.234",
    ...extra,
  };
}

function prepararPg(rows: Record<string, unknown>[]): void {
  mClient.query.mockReset();
  mClient.query.mockImplementation(async (sql: string) => {
    if (/^\s*SELECT/i.test(sql)) return { rows, rowCount: rows.length };
    return { rows: [], rowCount: 0 };
  });
}

describe("AthosOrcamentoService leituras para a proposta (Fase 55)", () => {
  const env = { ...process.env };
  let service: AthosOrcamentoService;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "u";
    process.env.ATHOS_PG_PASS = "p";
    service = new AthosOrcamentoService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    process.env = { ...env };
  });

  it("emite SQL com COALESCE por termo do custo e preco base precovendaproduto", async () => {
    prepararPg([linha()]);
    await service.buscarProdutosProposta("caderno");
    const { sql } = selectEmitido();
    expect(sql).toContain("COALESCE(p.imposto, 0)");
    expect(sql).toContain("COALESCE(p.ipi, 0)");
    expect(sql).toContain("COALESCE(p.frete, 0)");
    expect(sql).toContain("COALESCE(p.outroimposto, 0)");
    expect(sql).toContain("precovendaproduto(p.idproduto)");
    expect(sql).not.toMatch(/\bLATERAL\b|\bFILTER\b|jsonb|ON CONFLICT/i);
  });

  it("executa em transacao somente leitura sem nenhuma escrita", async () => {
    prepararPg([linha()]);
    await service.buscarProdutosProposta("caderno");
    await service.obterProdutoProposta(7);
    const todos = sqls();
    expect(todos[0]).toBe("BEGIN");
    expect(todos[1]).toBe("SET TRANSACTION READ ONLY");
    expect(todos[2]).toMatch(/^SET LOCAL statement_timeout/);
    expect(todos[3]).toMatch(/^SELECT/);
    expect(todos[4]).toBe("ROLLBACK");
    expect(todos.some((s) => /^(INSERT|UPDATE|DELETE)\b/i.test(s))).toBe(false);
    expect(todos.some((s) => /^COMMIT/i.test(s))).toBe(false);
  });

  it("q numerico acrescenta o parametro de idproduto", async () => {
    prepararPg([linha()]);
    await service.buscarProdutosProposta("123");
    const { sql, params } = selectEmitido();
    expect(params).toContain(123);
    expect(sql).toMatch(/p\.idproduto = \$\d+/);
  });

  it("q nao numerico nao acrescenta idproduto exato", async () => {
    prepararPg([linha()]);
    await service.buscarProdutosProposta("caderno azul");
    const { sql } = selectEmitido();
    expect(sql).not.toMatch(/p\.idproduto = \$\d+/);
  });

  it("limite acima de 50 vira 50 e o padrao e 20", async () => {
    prepararPg([linha()]);
    await service.buscarProdutosProposta("caderno", 500);
    expect(selectEmitido().params.at(-1)).toBe(50);
    mClient.query.mockClear();
    await service.buscarProdutosProposta("caderno");
    expect(selectEmitido().params.at(-1)).toBe(20);
  });

  it("q vazio lanca VALOR_INVALIDO 400", async () => {
    prepararPg([]);
    await expect(service.buscarProdutosProposta("   ")).rejects.toMatchObject({ codigo: "VALOR_INVALIDO" });
    await expect(service.buscarProdutosProposta("")).rejects.toBeInstanceOf(OrcamentoAthosError);
    expect(mClient.query).not.toHaveBeenCalled();
  });

  it("obterProdutoProposta devolve null para linha ausente e para id invalido", async () => {
    prepararPg([]);
    await expect(service.obterProdutoProposta(999)).resolves.toBeNull();
    mClient.query.mockClear();
    await expect(service.obterProdutoProposta(0)).resolves.toBeNull();
    await expect(service.obterProdutoProposta(Number.NaN)).resolves.toBeNull();
    expect(mClient.query).not.toHaveBeenCalled();
  });

  it("mapeia custoUnitario e descricaoCurta como texto", async () => {
    prepararPg([linha()]);
    const r = await service.obterProdutoProposta(7);
    expect(r).toEqual({
      idproduto: 7,
      descricao: "CADERNO UNIVERSITARIO",
      descricaoCurta: "Caderno",
      marca: "Tilibra",
      referencia: "REF-7",
      codigoBarra: "789",
      preco: "3.456",
      emPromocao: false,
      estoqueLoja: "10.000",
      estoqueDeposito: "0",
      permiteFracionar: false,
      unidade: "UN",
      custoUnitario: "1.234",
    });
    expect(typeof r?.custoUnitario).toBe("string");
  });

  it("preco nulo e descricaocurta nula viram null", async () => {
    prepararPg([linha({ preco: null, descricaocurta: null, valorcustounitario: null })]);
    const r = await service.obterProdutoProposta(7);
    expect(r?.preco).toBeNull();
    expect(r?.descricaoCurta).toBeNull();
    expect(r?.custoUnitario).toBe("0");
  });
});
