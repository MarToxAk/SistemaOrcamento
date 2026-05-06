import { readFileSync, writeFileSync, statSync } from 'fs';

const path = 'apps/backend/src/modules/integrations/athos/athos.service.test.ts';
let content = readFileSync(path, 'utf8');

const newDescribe = `
describe("AthosService - buscarRelacaoOrcamentoVenda", () => {
  let service: import("./athos.service").AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const { Test: TestNg } = await import("@nestjs/testing");
    const { AthosService } = await import("./athos.service");
    const module = await TestNg.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve retornar idvenda quando row encontrado em relacao_orcamento_venda", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);
    client.query.mockResolvedValue({ rows: [{ idvenda: 42 }] });

    const result = await service.buscarRelacaoOrcamentoVenda(5);
    expect(result).toEqual({ idvenda: 42 });
    expect(client.release).toHaveBeenCalled();
  });

  it("deve retornar idvenda=null quando nenhuma row encontrada", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);
    client.query.mockResolvedValue({ rows: [] });

    const result = await service.buscarRelacaoOrcamentoVenda(99);
    expect(result).toEqual({ idvenda: null });
    expect(client.release).toHaveBeenCalled();
  });

  it("deve retornar idvenda=null sem lancar excecao quando pool.connect falha", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));

    const result = await service.buscarRelacaoOrcamentoVenda(1);
    expect(result).toEqual({ idvenda: null });
  });
});
`;

// Append to end of file
content = content.trimEnd() + '\n' + newDescribe + '\n';
writeFileSync(path, content, 'utf8');
console.log('Done. File size:', statSync(path).size);
