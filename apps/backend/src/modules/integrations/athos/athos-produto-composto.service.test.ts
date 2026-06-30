import { Test, TestingModule } from "@nestjs/testing";
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AthosProdutoCompostoService } from "./athos-produto-composto.service";

// Mock do módulo pg — deve vir antes dos imports do serviço
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn() };
  return { Pool: jest.fn(() => mPool) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");

describe("AthosProdutoCompostoService", () => {
  let service: AthosProdutoCompostoService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosProdutoCompostoService],
    }).compile();
    service = module.get<AthosProdutoCompostoService>(AthosProdutoCompostoService);
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // listarPorMaster
  // ---------------------------------------------------------------------------

  describe("listarPorMaster", () => {
    it("COMP-01-404: lanca NotFoundException quando idprodutomaster nao existe", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      // master check returns empty
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.listarPorMaster(999)).rejects.toThrow(NotFoundException);
      expect(client.release).toHaveBeenCalled();
    });

    it("COMP-01-empty: retorna [] quando master existe mas nao tem componentes", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // master exists
        .mockResolvedValueOnce({ rows: [] }); // no components

      const result = await service.listarPorMaster(42);
      expect(result).toEqual([]);
    });

    it("COMP-01-list: retorna lista enriquecida ordenada por idprodutocomposto", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      const mockRow = {
        idprodutocomposto: 1,
        idprodutodetail: 10,
        descricaoproduto: "Papel A4",
        statusproduto: true,
        quantidade: "5",
      };
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rows: [mockRow] });

      const result = await service.listarPorMaster(42);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockRow);
    });

    it("COMP-01-inactive: inclui componentes com statusproduto=false (D-04)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              idprodutocomposto: 2,
              idprodutodetail: 20,
              statusproduto: false,
              descricaoproduto: "Produto Inativo",
              quantidade: "3",
            },
          ],
        });

      const result = await service.listarPorMaster(42);
      expect(result).toHaveLength(1);
      expect(result[0].statusproduto).toBe(false);
    });

    it("COMP-01-leftjoin: SQL usa LEFT JOIN (nao INNER JOIN)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.listarPorMaster(42);

      const sqls: string[] = client.query.mock.calls.map(([sql]: [string]) =>
        String(sql).toUpperCase(),
      );
      const joinSql = sqls.find((s) => s.includes("LEFT JOIN"));
      expect(joinSql).toBeDefined();
    });

    it("propaga erro quando pool.connect falha", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));

      await expect(service.listarPorMaster(1)).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // adicionarComponente
  // ---------------------------------------------------------------------------

  /**
   * Helper: cria um novo client mock e conecta ao pool.
   * Retorna o client para que os testes sequenciem os mockResolvedValueOnce.
   */
  function makeClient() {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);
    return client;
  }

  /**
   * Sequencia os mocks para o caminho de sucesso completo.
   *
   * Ordem das queries em adicionarComponente:
   *   1. BEGIN
   *   2. validarFkExiste master  (SELECT 1 FROM "produto" WHERE "idproduto" = $1)
   *   3. validarFkExiste detail  (SELECT 1 FROM "produto" WHERE "idproduto" = $1)
   *   4. SELECT statusproduto    (status do detail)
   *   5. SELECT duplicata        (produto_composto WHERE master+detail)
   *   6. SELECT count total      (componentes do master)
   *   7. INSERT RETURNING        (nova linha produto_composto)
   *   8. UPDATE flag             (apenas se ehPrimeiro)
   *   9. COMMIT
   */
  function setupSuccessPath(
    client: { query: jest.Mock; release: jest.Mock },
    opts: { total: number; idprodutocomposto?: number },
  ) {
    const id = opts.idprodutocomposto ?? 7;
    const total = opts.total;

    client.query
      .mockResolvedValueOnce({ rows: [] }) // 1. BEGIN
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // 2. validarFkExiste master
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // 3. validarFkExiste detail
      .mockResolvedValueOnce({ rows: [{ statusproduto: true }] }) // 4. SELECT statusproduto
      .mockResolvedValueOnce({ rows: [] }) // 5. SELECT duplicata (nao existe)
      .mockResolvedValueOnce({ rows: [{ total }] }) // 6. SELECT count
      .mockResolvedValueOnce({ rows: [{ idprodutocomposto: id }] }) // 7. INSERT RETURNING
      .mockResolvedValueOnce({ rows: [] }) // 8. UPDATE flag (ehPrimeiro) OU COMMIT se nao primeiro
      .mockResolvedValueOnce({ rows: [] }); // 9. COMMIT (ou extra se nao primeiro)
  }

  describe("adicionarComponente", () => {
    // ------------------------------------------------------------------
    // Cenario: sucesso primeiro componente (ehPrimeiro = true)
    // ------------------------------------------------------------------
    it("COMP-02-success-primeiro: retorna { idprodutocomposto } e dispara UPDATE usaprodutocomposto=true", async () => {
      const client = makeClient();
      setupSuccessPath(client, { total: 0, idprodutocomposto: 7 });

      const result = await service.adicionarComponente(42, {
        idprodutodetail: 10,
        quantidade: 2,
      });

      expect(result).toEqual({ idprodutocomposto: 7 });

      // Verificar que alguma query chamada contem "usaprodutocomposto"
      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql));
      const flagQuery = allSqls.find((s) => s.includes("usaprodutocomposto"));
      expect(flagQuery).toBeDefined();

      expect(client.release).toHaveBeenCalled();
    });

    // ------------------------------------------------------------------
    // Cenario: sucesso N-esimo componente (ehPrimeiro = false)
    // ------------------------------------------------------------------
    it("COMP-02-success-nesimo: retorna { idprodutocomposto } sem disparar UPDATE de flag", async () => {
      const client = makeClient();

      // Para N-esimo: total = 2, sem UPDATE de flag
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste master
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste detail
        .mockResolvedValueOnce({ rows: [{ statusproduto: true }] }) // statusproduto
        .mockResolvedValueOnce({ rows: [] }) // duplicata
        .mockResolvedValueOnce({ rows: [{ total: 2 }] }) // count (N-esimo)
        .mockResolvedValueOnce({ rows: [{ idprodutocomposto: 99 }] }) // INSERT RETURNING
        .mockResolvedValueOnce({ rows: [] }); // COMMIT (sem UPDATE de flag)

      const result = await service.adicionarComponente(42, {
        idprodutodetail: 10,
        quantidade: 1.5,
      });

      expect(result).toEqual({ idprodutocomposto: 99 });

      // Verificar que NENHUMA query contem "usaprodutocomposto"
      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql));
      const flagQuery = allSqls.find((s) => s.includes("usaprodutocomposto"));
      expect(flagQuery).toBeUndefined();

      expect(client.release).toHaveBeenCalled();
    });

    // ------------------------------------------------------------------
    // INSERT usa RETURNING e nao usa MAX
    // ------------------------------------------------------------------
    it("COMP-06-returning: SQL do INSERT contem RETURNING e nao contem MAX(", async () => {
      const client = makeClient();
      setupSuccessPath(client, { total: 0, idprodutocomposto: 5 });

      await service.adicionarComponente(42, { idprodutodetail: 11, quantidade: 1 });

      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql));
      const insertSql = allSqls.find((s) => s.toUpperCase().includes("INSERT"));
      expect(insertSql).toBeDefined();
      expect(insertSql!.toUpperCase()).toContain("RETURNING");
      expect(insertSql!.toUpperCase()).not.toContain("MAX(");
    });

    // ------------------------------------------------------------------
    // Guarda: auto-referencia (master == detail)
    // ------------------------------------------------------------------
    it("COMP-02-autoref: rejeita com UnprocessableEntityException sem tocar INSERT", async () => {
      const client = makeClient();
      // Nenhuma query deve ser chamada (guarda antes do BEGIN)

      await expect(
        service.adicionarComponente(42, { idprodutodetail: 42, quantidade: 1 }),
      ).rejects.toThrow(UnprocessableEntityException);

      // Nenhum INSERT chamado
      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql));
      const insertSql = allSqls.find((s) => s.toUpperCase().includes("INSERT"));
      expect(insertSql).toBeUndefined();
    });

    // ------------------------------------------------------------------
    // Guarda: master inexistente
    // ------------------------------------------------------------------
    it("COMP-02-master-nao-encontrado: rejeita com UnprocessableEntityException", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // validarFkExiste master -> NOT FOUND
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        service.adicionarComponente(999, { idprodutodetail: 10, quantidade: 1 }),
      ).rejects.toThrow(UnprocessableEntityException);

      // ROLLBACK deve ter sido chamado
      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql));
      expect(allSqls.some((s) => s === "ROLLBACK")).toBe(true);
      expect(client.release).toHaveBeenCalled();
    });

    // ------------------------------------------------------------------
    // Guarda: detail inexistente
    // ------------------------------------------------------------------
    it("COMP-02-detail-nao-encontrado: rejeita com UnprocessableEntityException", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste master -> OK
        .mockResolvedValueOnce({ rows: [] }) // validarFkExiste detail -> NOT FOUND
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        service.adicionarComponente(42, { idprodutodetail: 999, quantidade: 1 }),
      ).rejects.toThrow(UnprocessableEntityException);

      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql));
      expect(allSqls.some((s) => s === "ROLLBACK")).toBe(true);
      expect(client.release).toHaveBeenCalled();
    });

    // ------------------------------------------------------------------
    // Guarda: detail inativo (statusproduto=false)
    // ------------------------------------------------------------------
    it("COMP-02-detail-inativo: rejeita com UnprocessableEntityException quando statusproduto=false", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste master
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste detail
        .mockResolvedValueOnce({ rows: [{ statusproduto: false }] }) // statusproduto=false -> INATIVO
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        service.adicionarComponente(42, { idprodutodetail: 20, quantidade: 1 }),
      ).rejects.toThrow(UnprocessableEntityException);

      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql));
      expect(allSqls.some((s) => s === "ROLLBACK")).toBe(true);
      expect(client.release).toHaveBeenCalled();
    });

    // ------------------------------------------------------------------
    // Guarda: par duplicado (SELECT duplicata retorna linha)
    // ------------------------------------------------------------------
    it("COMP-02-duplicata: rejeita com ConflictException quando par ja existe", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste master
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste detail
        .mockResolvedValueOnce({ rows: [{ statusproduto: true }] }) // statusproduto
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // duplicata EXISTE -> conflict
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        service.adicionarComponente(42, { idprodutodetail: 10, quantidade: 1 }),
      ).rejects.toThrow(ConflictException);

      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql));
      expect(allSqls.some((s) => s === "ROLLBACK")).toBe(true);
      expect(client.release).toHaveBeenCalled();
    });

    // ------------------------------------------------------------------
    // ROLLBACK chamado em todos os caminhos de erro
    // ------------------------------------------------------------------
    it("garante client.release chamado mesmo em erro de conexao (pool.connect falha)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));

      // Sem client -> nao tem release para checar, mas o service nao deve travar
      await expect(
        service.adicionarComponente(42, { idprodutodetail: 10, quantidade: 1 }),
      ).rejects.toThrow();
    });

    // ------------------------------------------------------------------
    // Mapeamento de erro pg: 42501 -> 500 InternalServerErrorException
    // ------------------------------------------------------------------
    it("COMP-06-42501: mapeia pg 42501 para InternalServerErrorException (500) com mensagem de GRANT", async () => {
      const client = makeClient();
      const pgError = Object.assign(new Error("permission denied"), { code: "42501" });

      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste master
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste detail
        .mockResolvedValueOnce({ rows: [{ statusproduto: true }] }) // statusproduto
        .mockResolvedValueOnce({ rows: [] }) // duplicata
        .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // count
        .mockRejectedValueOnce(pgError) // INSERT -> 42501
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        service.adicionarComponente(42, { idprodutodetail: 10, quantidade: 1 }),
      ).rejects.toThrow(InternalServerErrorException);

      expect(client.release).toHaveBeenCalled();
    });

    it("COMP-06-42501-mensagem: mensagem de 42501 menciona GRANT", async () => {
      const client = makeClient();
      const pgError = Object.assign(new Error("permission denied"), { code: "42501" });

      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste master
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste detail
        .mockResolvedValueOnce({ rows: [{ statusproduto: true }] }) // statusproduto
        .mockResolvedValueOnce({ rows: [] }) // duplicata
        .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // count
        .mockRejectedValueOnce(pgError) // INSERT -> 42501
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      let thrownError: InternalServerErrorException | null = null;
      try {
        await service.adicionarComponente(42, { idprodutodetail: 10, quantidade: 1 });
      } catch (e) {
        thrownError = e as InternalServerErrorException;
      }

      expect(thrownError).toBeInstanceOf(InternalServerErrorException);
      // Mensagem deve orientar operador sobre o GRANT
      const msg = thrownError!.message;
      expect(msg.toLowerCase()).toContain("grant");
    });

    // ------------------------------------------------------------------
    // Mapeamento de erro pg: 22003 -> 422 UnprocessableEntityException
    // ------------------------------------------------------------------
    it("COMP-06-22003: mapeia pg 22003 para UnprocessableEntityException (overflow numeric)", async () => {
      const client = makeClient();
      const pgError = Object.assign(new Error("numeric field overflow"), { code: "22003" });

      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste master
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste detail
        .mockResolvedValueOnce({ rows: [{ statusproduto: true }] }) // statusproduto
        .mockResolvedValueOnce({ rows: [] }) // duplicata
        .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // count
        .mockRejectedValueOnce(pgError) // INSERT -> 22003
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        service.adicionarComponente(42, { idprodutodetail: 10, quantidade: 9999999.999 }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(client.release).toHaveBeenCalled();
    });

    // ------------------------------------------------------------------
    // Mapeamento de erro pg: 23505 -> 409 ConflictException (defensivo)
    // ------------------------------------------------------------------
    it("COMP-06-23505: mapeia pg 23505 para ConflictException (409) (defensivo)", async () => {
      const client = makeClient();
      const pgError = Object.assign(new Error("duplicate key value"), { code: "23505" });

      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste master
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // validarFkExiste detail
        .mockResolvedValueOnce({ rows: [{ statusproduto: true }] }) // statusproduto
        .mockResolvedValueOnce({ rows: [] }) // duplicata
        .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // count
        .mockRejectedValueOnce(pgError) // INSERT -> 23505 (defensivo)
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        service.adicionarComponente(42, { idprodutodetail: 10, quantidade: 1 }),
      ).rejects.toThrow(ConflictException);

      expect(client.release).toHaveBeenCalled();
    });
  });
});
