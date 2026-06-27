import { Test, TestingModule } from "@nestjs/testing";
import { InternalServerErrorException, UnprocessableEntityException } from "@nestjs/common";
import { AthosProdutoService } from "./athos-produto.service";
import { AthosDefaultsService } from "./athos-defaults.service";

// Mock do módulo pg — deve vir antes dos imports do serviço
jest.mock("pg", () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mPool = {
    connect: jest.fn().mockResolvedValue(mClient),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");

describe("AthosProdutoService", () => {
  let service: AthosProdutoService;
  let mockDefaultsService: { getDefaults: jest.Mock };

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
    process.env.ATHOS_SISTEMA_USUARIO_ID = "1";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDefaultsService = {
      getDefaults: jest.fn().mockResolvedValue({}),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AthosProdutoService,
        { provide: AthosDefaultsService, useValue: mockDefaultsService },
      ],
    }).compile();
    service = module.get<AthosProdutoService>(AthosProdutoService);
  });

  afterEach(() => jest.clearAllMocks());

  /**
   * Helper: extrai o valor parametrizado de uma coluna no INSERT dinamico.
   * Usa a posicao da coluna na lista para encontrar o placeholder $N e
   * retorna o valor correspondente no array de params.
   * Retorna `undefined` se a coluna nao estiver presente no INSERT.
   */
  function getInsertColValue(insertSql: string, insertParams: unknown[], col: string): unknown {
    const parts = String(insertSql).split("VALUES");
    const colsContent = parts[0].match(/\(([^)]+)\)/)![1];

    // Extrai o conteudo dos VALUES removendo os parenteses externos
    const valuesPart = parts[1].split("RETURNING")[0].trim();
    const valuesContent = valuesPart.slice(1, -1);

    const cols = colsContent.split(", ");
    const vals = valuesContent.split(", ");

    const idx = cols.indexOf(col);
    if (idx === -1) return undefined;

    const ph = vals[idx];
    const m = ph.match(/^\$(\d+)$/);
    if (!m) return ph; // literal como NOW()

    return insertParams[parseInt(m[1]) - 1];
  }

  describe("criarProduto", () => {
    it("deve retornar idproduto do RETURNING quando DTO valido", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // Sem FK opcionais informados: apenas o INSERT
      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

      const result = await service.criarProduto({ descricaoproduto: "Papel A4" });

      expect(result).toEqual({ idproduto: 42 });
      expect(client.release).toHaveBeenCalled();
    });

    it("deve gerar idproduto via RETURNING (idproduto nao enviado no payload)", async () => {
      // CPROD-02: idproduto nao deve aparecer na lista de colunas do INSERT
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 99 }] });

      await service.criarProduto({ descricaoproduto: "Papel A4" });

      // Inspecionar todas as SQLs emitidas
      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql));
      const insertSql = allSqls.find((sql) => sql.toUpperCase().includes("INSERT INTO"));
      expect(insertSql).toBeDefined();
      // A coluna idproduto NAO deve aparecer na lista de colunas (antes dos VALUES)
      // mas DEVE aparecer no RETURNING
      const colonasPart = insertSql!.split("VALUES")[0];
      expect(colonasPart).not.toMatch(/\bidproduto\b/i);
      expect(insertSql).toMatch(/RETURNING idproduto/i);
    });

    it("deve lancar UnprocessableEntityException (422) quando FK invalida", async () => {
      // CPROD-04: pre-query FK retorna rows vazio -> 422
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // Pre-query FK departamento retorna vazio
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.criarProduto({ descricaoproduto: "X", iddepartamento: 9999 }),
      ).rejects.toThrow("Departamento com id 9999 nao encontrado no Athos");

      expect(client.release).toHaveBeenCalled();
    });

    it("INSERT com idfornecedor invalido (23503) retorna 422 com campo FK na mensagem", async () => {
      // CPROD-04, Q3: catch de 23503 com constraint != FK de usuario -> 422
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      const fkError = Object.assign(new Error("violacao FK"), {
        code: "23503",
        constraint: "fk_produto_fornecedo_forneced",
      });
      client.query.mockRejectedValue(fkError);

      let caughtError: Error | undefined;
      try {
        await service.criarProduto({ descricaoproduto: "X", idfornecedor: 9999 });
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBeInstanceOf(UnprocessableEntityException);
      expect(caughtError?.message).toContain("fk_produto_fornecedo_forneced");
      expect(client.release).toHaveBeenCalled();
    });

    it("23503 da FK de usuario do sistema retorna 500 de configuracao", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      const fkError = Object.assign(new Error("violacao FK usuario"), {
        code: "23503",
        constraint: "fk_produto_relations_funciona",
      });
      client.query.mockRejectedValue(fkError);

      let caughtError: Error | undefined;
      try {
        await service.criarProduto({ descricaoproduto: "X" });
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBeInstanceOf(InternalServerErrorException);
      expect(caughtError?.message).toContain("ATHOS_SISTEMA_USUARIO_ID");
    });

    it("nunca emite DELETE ou DISABLE TRIGGER ou LOCK TABLE", async () => {
      // CPROD-03, DPROD-03, SPROD-01
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 1 }] });

      await service.criarProduto({ descricaoproduto: "Papel A4" });

      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql).toUpperCase());
      expect(allSqls.every((sql) => !sql.includes("DELETE"))).toBe(true);
      expect(allSqls.every((sql) => !sql.includes("DISABLE TRIGGER"))).toBe(true);
      expect(allSqls.every((sql) => !sql.includes("LOCK TABLE"))).toBe(true);
    });

    it("escreve apenas na tabela produto (e pre-queries de FK)", async () => {
      // SPROD-01: INSERT/UPDATE apenas em produto; pre-queries em produto_departamento/grupo/marca
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // Pre-queries FK para iddepartamento, idgrupo, idmarca + INSERT
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // FK departamento
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // FK grupo
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // FK marca
        .mockResolvedValueOnce({ rows: [{ idproduto: 55 }] }); // INSERT

      await service.criarProduto({
        descricaoproduto: "Papel A4",
        iddepartamento: 1,
        idgrupo: 2,
        idmarca: 3,
      });

      const allSqls: string[] = client.query.mock.calls.map(([sql]: [string]) => String(sql).toUpperCase());
      // Queries de write (INSERT/UPDATE) devem ter apenas tabela produto
      const writeSqls = allSqls.filter((sql) => sql.includes("INSERT") || sql.includes("UPDATE"));
      expect(writeSqls.length).toBeGreaterThan(0);
      writeSqls.forEach((sql) => {
        expect(sql).toMatch(/\bPRODUTO\b/);
      });
      // Pre-queries de SELECT devem consultar apenas produto_departamento, produto_grupo, produto_marca
      const selectSqls = allSqls.filter((sql) => sql.startsWith("SELECT"));
      selectSqls.forEach((sql) => {
        const allowedTables = ["PRODUTO_DEPARTAMENTO", "PRODUTO_GRUPO", "PRODUTO_MARCA", "PRODUTO"];
        const hasAllowedTable = allowedTables.some((t) => sql.includes(t));
        expect(hasAllowedTable).toBe(true);
      });
    });

    it("deve lancar erro quando pool.connect falha", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));

      await expect(
        service.criarProduto({ descricaoproduto: "Papel A4" }),
      ).rejects.toThrow("connection refused");
    });

    // === NOVOS CASOS — Task 1 TDD RED (DOPR/DFIS/OVRD/OBSV) ===

    it("DOPR-01: criarProduto sem statusproduto/vendeproduto -> INSERT inclui ambos = true", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      mockDefaultsService.getDefaults.mockResolvedValueOnce({});
      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

      await service.criarProduto({ descricaoproduto: "Papel A4" });

      const insertCall = client.query.mock.calls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("INSERT INTO"),
      );
      expect(insertCall).toBeDefined();
      const insertSql = String(insertCall[0]);
      const insertParams = insertCall[1] as unknown[];

      expect(getInsertColValue(insertSql, insertParams, "statusproduto")).toBe(true);
      expect(getInsertColValue(insertSql, insertParams, "vendeproduto")).toBe(true);
    });

    it("DOPR-02: criarProduto sem controlaestoque/baixarestoque/estoqueloja -> INSERT inclui os 3 defaults", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      mockDefaultsService.getDefaults.mockResolvedValueOnce({});
      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

      await service.criarProduto({ descricaoproduto: "Papel A4" });

      const insertCall = client.query.mock.calls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("INSERT INTO"),
      );
      expect(insertCall).toBeDefined();
      const insertSql = String(insertCall[0]);
      const insertParams = insertCall[1] as unknown[];

      expect(getInsertColValue(insertSql, insertParams, "controlaestoque")).toBe(true);
      expect(getInsertColValue(insertSql, insertParams, "baixarestoque")).toBe(true);
      expect(getInsertColValue(insertSql, insertParams, "estoqueloja")).toBe("10");
    });

    it("DFIS-aplicado: getDefaults retorna moda fiscal -> campos fiscais entram no INSERT", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      mockDefaultsService.getDefaults.mockResolvedValueOnce({ icms: "NAO", tributacao: "60" });
      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

      await service.criarProduto({ descricaoproduto: "Papel A4" });

      const insertCall = client.query.mock.calls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("INSERT INTO"),
      );
      expect(insertCall).toBeDefined();
      const insertSql = String(insertCall[0]);
      const insertParams = insertCall[1] as unknown[];

      expect(getInsertColValue(insertSql, insertParams, "icms")).toBe("NAO");
      expect(getInsertColValue(insertSql, insertParams, "tributacao")).toBe("60");
    });

    it("DFIS-omitido: getDefaults retorna {} -> coluna fiscal ausente do INSERT", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      mockDefaultsService.getDefaults.mockResolvedValueOnce({});
      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

      await service.criarProduto({ descricaoproduto: "Papel A4" });

      const insertCall = client.query.mock.calls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("INSERT INTO"),
      );
      expect(insertCall).toBeDefined();
      const insertSql = String(insertCall[0]);
      const insertParams = insertCall[1] as unknown[];

      // Campo fiscal sem moda nao deve aparecer no INSERT
      expect(getInsertColValue(insertSql, insertParams, "icms")).toBeUndefined();
    });

    it("D-13: getDefaults retorna {} -> criarProduto resolve normalmente sem lancar excecao", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      mockDefaultsService.getDefaults.mockResolvedValueOnce({});
      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

      const result = await service.criarProduto({ descricaoproduto: "Papel A4" });

      expect(result).toEqual({ idproduto: 42 });
    });

    it("OVRD-01/03: statusproduto=false no DTO -> INSERT grava false, nunca o default true", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      mockDefaultsService.getDefaults.mockResolvedValueOnce({});
      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

      // Operador envia statusproduto=false explicitamente — deve prevalecer sobre o default true
      await service.criarProduto({ descricaoproduto: "Papel A4", statusproduto: false });

      const insertCall = client.query.mock.calls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("INSERT INTO"),
      );
      expect(insertCall).toBeDefined();
      const insertSql = String(insertCall[0]);
      const insertParams = insertCall[1] as unknown[];

      expect(getInsertColValue(insertSql, insertParams, "statusproduto")).toBe(false);
    });

    it("OBSV-01a: log contem os campos de default aplicados na criacao", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      mockDefaultsService.getDefaults.mockResolvedValueOnce({});
      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logSpy = jest.spyOn((service as any)["logger"], "log").mockImplementation(() => {});

      await service.criarProduto({ descricaoproduto: "Papel A4" });

      // Deve haver uma chamada de log contendo "statusproduto" (default aplicado)
      const logCalls: string[] = logSpy.mock.calls.map((args) => String(args[0]));
      const defaultsLogCall = logCalls.find((msg) => msg.includes("defaults aplicados"));
      expect(defaultsLogCall).toBeDefined();
      expect(defaultsLogCall).toContain("statusproduto");
    });

    it("OBSV-01b: log diz 'nenhum default necessario' quando DTO ja preenche todos os campos de default", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      // Motor sem moda fiscal — sem defaults fiscais a aplicar
      mockDefaultsService.getDefaults.mockResolvedValueOnce({});
      client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logSpy = jest.spyOn((service as any)["logger"], "log").mockImplementation(() => {});

      // DTO preenche todos os campos de OPERATIONAL_DEFAULTS — nenhum default deve ser aplicado
      await service.criarProduto({
        descricaoproduto: "Papel A4",
        statusproduto: true,
        vendeproduto: true,
        controlaestoque: true,
        baixarestoque: true,
        estoqueloja: "10",
      });

      const logCalls: string[] = logSpy.mock.calls.map((args) => String(args[0]));
      const defaultsLogCall = logCalls.find((msg) => msg.includes("defaults aplicados") || msg.includes("nenhum default"));
      expect(defaultsLogCall).toBeDefined();
      expect(defaultsLogCall).toContain("nenhum default necessario");
    });
  });

  describe("editarProduto", () => {
    it("edita precos parciais gerando UPDATE correto (EPROD-01)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // [0] SELECT 1 (existência) → produto existe
      // [1] UPDATE → rowCount: 1
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await service.editarProduto(7, { valorvenda1: 9.9, valorvendapromocao: 8.5 });

      const allCalls = client.query.mock.calls;
      const updateCall = allCalls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("UPDATE"),
      );
      expect(updateCall).toBeDefined();
      const updateSql = String(updateCall![0]);
      expect(updateSql).toMatch(/"valorvenda1"/);
      expect(updateSql).toMatch(/"valorvendapromocao"/);
    });

    it("edita campos de cadastro parciais (EPROD-02)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await service.editarProduto(10, { descricaoproduto: "Novo", ncm: "48025590" });

      const allCalls = client.query.mock.calls;
      const updateCall = allCalls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("UPDATE"),
      );
      expect(updateCall).toBeDefined();
      const updateSql = String(updateCall![0]);
      expect(updateSql).toMatch(/"descricaoproduto"/);
      expect(updateSql).toMatch(/"ncm"/);
    });

    it("inclui idusuarioalteracao no SET sempre — com campo e com DTO vazio (EPROD-03)", async () => {
      // Caso A: DTO com um campo
      {
        const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
        const client = { query: jest.fn(), release: jest.fn() };
        pool.connect = jest.fn().mockResolvedValue(client);

        client.query
          .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
          .mockResolvedValueOnce({ rowCount: 1 });

        await service.editarProduto(5, { referencia: "REF1" });

        const allCalls = client.query.mock.calls;
        const updateCall = allCalls.find(([sql]: [string]) =>
          String(sql).toUpperCase().includes("UPDATE"),
        );
        expect(updateCall).toBeDefined();
        const updateSql = String(updateCall![0]);
        const updateParams = updateCall![1] as unknown[];
        expect(updateSql).toMatch(/idusuarioalteracao/);
        expect(updateParams).toContain(1); // ATHOS_SISTEMA_USUARIO_ID = "1"
      }

      // Caso B: DTO vazio — idusuarioalteracao ainda deve estar no SET
      {
        const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
        const client = { query: jest.fn(), release: jest.fn() };
        pool.connect = jest.fn().mockResolvedValue(client);

        client.query
          .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
          .mockResolvedValueOnce({ rowCount: 1 });

        await service.editarProduto(5, {});

        const allCalls = client.query.mock.calls;
        const updateCall = allCalls.find(([sql]: [string]) =>
          String(sql).toUpperCase().includes("UPDATE"),
        );
        expect(updateCall).toBeDefined();
        const updateSql = String(updateCall![0]);
        const updateParams = updateCall![1] as unknown[];
        expect(updateSql).toMatch(/idusuarioalteracao/);
        expect(updateParams).toContain(1);
      }
    });

    it("nunca envia dataultimaalteracao nem horaultimaalteracao (EPROD-03)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await service.editarProduto(3, { descricaoproduto: "Teste" });

      const allCalls = client.query.mock.calls;
      const updateCall = allCalls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("UPDATE"),
      );
      expect(updateCall).toBeDefined();
      const updateSql = String(updateCall![0]);
      expect(updateSql).not.toMatch(/dataultimaalteracao/i);
      expect(updateSql).not.toMatch(/horaultimaalteracao/i);
    });

    it("produto inexistente lanca NotFoundException (404) e nao emite UPDATE", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // SELECT 1 retorna rows vazio → produto não encontrado
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.editarProduto(999, { descricaoproduto: "X" }),
      ).rejects.toThrow("Produto 999 nao encontrado");

      expect(client.release).toHaveBeenCalled();

      // Nenhum UPDATE deve ter sido emitido
      const allCalls = client.query.mock.calls;
      const updateCalls = allCalls.filter(([sql]: [string]) =>
        String(sql).toUpperCase().includes("UPDATE"),
      );
      expect(updateCalls).toHaveLength(0);
    });

    it("escreve apenas na tabela produto — UPDATE com alvo produto literal (EPROD-04)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await service.editarProduto(1, { descricaoproduto: "Check" });

      const allCalls = client.query.mock.calls;
      // Queries de write (UPDATE) devem ter alvo apenas produto
      const writeCalls = allCalls.filter(([sql]: [string]) =>
        String(sql).toUpperCase().includes("UPDATE"),
      );
      expect(writeCalls.length).toBeGreaterThan(0);
      writeCalls.forEach(([sql]: [string]) => {
        expect(String(sql).toUpperCase()).toMatch(/UPDATE PRODUTO SET/);
      });
      // Nenhuma query deve conter DELETE
      const allSqls = allCalls.map(([sql]: [string]) => String(sql).toUpperCase());
      expect(allSqls.every((sql) => !sql.includes("DELETE"))).toBe(true);
    });

    it("OVRD-02/D-11: editarProduto nunca chama getDefaults (defaults exclusivos de criacao)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await service.editarProduto(7, { descricaoproduto: "Teste" });

      // editarProduto nao deve chamar getDefaults em nenhuma hipotese (D-11)
      expect(mockDefaultsService.getDefaults).toHaveBeenCalledTimes(0);
    });
  });

  describe("alterarStatusProduto", () => {
    it("deactivate seta statusproduto e vendeproduto false (DPROD-01)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // [0] SELECT 1 (existência) → produto existe
      // [1] UPDATE → rowCount: 1
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.alterarStatusProduto(7, false);

      expect(result).toEqual({ idproduto: 7, ativo: false });

      // Inspecionar o UPDATE: SQL deve conter statusproduto = $1 e vendeproduto = $1
      const allCalls = client.query.mock.calls;
      const updateCall = allCalls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("UPDATE"),
      );
      expect(updateCall).toBeDefined();
      const updateSql = String(updateCall![0]);
      const updateParams = updateCall![1] as unknown[];
      expect(updateSql).toMatch(/statusproduto = \$1/);
      expect(updateSql).toMatch(/vendeproduto = \$1/);
      // params[0] === false (ativo)
      expect(updateParams[0]).toBe(false);
    });

    it("reactivate seta statusproduto e vendeproduto true (DPROD-02)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.alterarStatusProduto(7, true);

      expect(result).toEqual({ idproduto: 7, ativo: true });

      const allCalls = client.query.mock.calls;
      const updateCall = allCalls.find(([sql]: [string]) =>
        String(sql).toUpperCase().includes("UPDATE"),
      );
      expect(updateCall).toBeDefined();
      const updateParams = updateCall![1] as unknown[];
      // params[0] === true (ativo)
      expect(updateParams[0]).toBe(true);
    });

    it("produto inexistente lanca NotFoundException (404) e nao emite UPDATE", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // SELECT 1 retorna rows vazio → produto não encontrado
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.alterarStatusProduto(999, false),
      ).rejects.toThrow("Produto 999 nao encontrado");

      // client.release deve ser chamado mesmo na exceção
      expect(client.release).toHaveBeenCalled();

      // Nenhum UPDATE deve ter sido emitido
      const allCalls = client.query.mock.calls;
      const updateCalls = allCalls.filter(([sql]: [string]) =>
        String(sql).toUpperCase().includes("UPDATE"),
      );
      expect(updateCalls).toHaveLength(0);
    });

    it("nunca emite DELETE apos deactivate e reactivate (DPROD-03)", async () => {
      // Executar deactivate
      {
        const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
        const client = { query: jest.fn(), release: jest.fn() };
        pool.connect = jest.fn().mockResolvedValue(client);

        client.query
          .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
          .mockResolvedValueOnce({ rowCount: 1 });

        await service.alterarStatusProduto(7, false);

        const allSqls = client.query.mock.calls.map(([sql]: [string]) => String(sql).toUpperCase());
        expect(allSqls.every((sql) => !sql.includes("DELETE"))).toBe(true);
      }

      // Executar reactivate
      {
        const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
        const client = { query: jest.fn(), release: jest.fn() };
        pool.connect = jest.fn().mockResolvedValue(client);

        client.query
          .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
          .mockResolvedValueOnce({ rowCount: 1 });

        await service.alterarStatusProduto(7, true);

        const allSqls = client.query.mock.calls.map(([sql]: [string]) => String(sql).toUpperCase());
        expect(allSqls.every((sql) => !sql.includes("DELETE"))).toBe(true);
      }
    });

    it("escreve apenas na tabela produto (SPROD-01)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await service.alterarStatusProduto(5, false);

      const allCalls = client.query.mock.calls;
      // O único write (UPDATE) deve ter alvo produto
      const writeCalls = allCalls.filter(([sql]: [string]) =>
        String(sql).toUpperCase().includes("UPDATE"),
      );
      expect(writeCalls.length).toBe(1);
      writeCalls.forEach(([sql]: [string]) => {
        expect(String(sql).toUpperCase()).toMatch(/UPDATE PRODUTO SET/);
      });
    });
  });
});
