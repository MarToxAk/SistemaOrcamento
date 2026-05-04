"""Phase 19: implementa buscarClientes no AthosService + endpoint no AthosController + testes."""
import pathlib, sys

ROOT = pathlib.Path(__file__).parent.parent

# ---------------------------------------------------------------------------
# Patch 1: athos.service.ts — import + novo método
# ---------------------------------------------------------------------------
SERVICE = ROOT / "apps/backend/src/modules/integrations/athos/athos.service.ts"
content = SERVICE.read_text(encoding="utf-8")

# 1a) Adicionar BadRequestException ao import
OLD_IMPORT = "import { Injectable, InternalServerErrorException, Logger, NotFoundException }"
NEW_IMPORT = "import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException }"
if NEW_IMPORT not in content:
    content = content.replace(OLD_IMPORT, NEW_IMPORT)

# 1b) Inserir método buscarClientes antes do último }
BUSCAR_CLIENTES_METHOD = r"""
  async buscarClientes(params: {
    nome?: string;
    documento?: string;
    idcliente?: number | string;
    page?: number;
    take?: number;
  }): Promise<{
    total: number;
    page: number;
    take: number;
    items: Array<{
      idcliente: number;
      tipoPessoa: "fisico" | "juridico";
      nome: string;
      documento: string | null;
      endereco: {
        logradouro: string;
        numero: string;
        bairro: string;
        cep: string;
        codigoMunicipio: string;
        uf: string;
      } | null;
    }>;
  }> {
    const take = Math.min(Math.max(1, Number(params.take ?? 20) || 20), 50);
    const page = Math.max(1, Number(params.page ?? 1) || 1);
    const offset = (page - 1) * take;

    const nomeFilter = params.nome?.trim();
    const documentoFilter = params.documento?.replace(/\D/g, "") || undefined;
    const idclienteFilter = params.idcliente != null ? Number(params.idcliente) : undefined;

    const hasFiltro =
      (nomeFilter && nomeFilter.length >= 3) ||
      (documentoFilter && documentoFilter.length > 0) ||
      (idclienteFilter != null && Number.isFinite(idclienteFilter) && idclienteFilter > 0);

    if (!hasFiltro) {
      throw new BadRequestException(
        "Informe ao menos um filtro: nome (min 3 caracteres), documento (CPF/CNPJ) ou idcliente.",
      );
    }

    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const conditions: string[] = [];
      const qParams: (string | number)[] = [];
      let idx = 1;

      if (idclienteFilter != null && Number.isFinite(idclienteFilter) && idclienteFilter > 0) {
        conditions.push(`c.idcliente = $${idx++}`);
        qParams.push(idclienteFilter);
      } else {
        if (documentoFilter) {
          conditions.push(
            `(REGEXP_REPLACE(COALESCE(cf.cpf, ''), '[^0-9]', '', 'g') = $${idx} OR REGEXP_REPLACE(COALESCE(cj.cnpj, ''), '[^0-9]', '', 'g') = $${idx})`,
          );
          qParams.push(documentoFilter);
          idx++;
        }
        if (nomeFilter && nomeFilter.length >= 3) {
          conditions.push(
            `(cf.nome ILIKE $${idx} OR cj.nomefantasia ILIKE $${idx} OR cj.razaosocial ILIKE $${idx})`,
          );
          qParams.push(`%${nomeFilter}%`);
          idx++;
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const baseJoins = `
        FROM cliente c
        LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
        LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
        LEFT JOIN LATERAL (
          SELECT tipologradouro, logradouro, numero, bairro, cep, codigocidade, uf
          FROM cliente_endereco
          WHERE idcliente = c.idcliente
          ORDER BY idenderecocliente
          LIMIT 1
        ) ce ON true
        ${whereClause}
      `;

      const countResult = await client.query(`SELECT COUNT(*) AS total ${baseJoins}`, qParams);
      const total = Number(countResult.rows[0]?.total ?? 0);

      const dataResult = await client.query(
        `SELECT
          c.idcliente,
          cf.nome AS nome_fisico,
          cj.nomefantasia,
          cj.razaosocial,
          cf.cpf,
          cj.cnpj,
          ce.tipologradouro,
          ce.logradouro,
          ce.numero AS end_numero,
          ce.bairro,
          ce.cep,
          ce.codigocidade,
          ce.uf
        ${baseJoins}
        ORDER BY c.idcliente
        LIMIT $${idx} OFFSET $${idx + 1}`,
        [...qParams, take, offset],
      );

      const items = (dataResult.rows as Row[]).map((row) => {
        const isFisico = !!pickString(row, ["nome_fisico"]);
        const nome = isFisico
          ? pickString(row, ["nome_fisico"])
          : pickString(row, ["nomefantasia", "razaosocial"]);
        const documento = isFisico
          ? pickString(row, ["cpf"]).replace(/\D/g, "") || null
          : pickString(row, ["cnpj"]).replace(/\D/g, "") || null;

        let endereco: {
          logradouro: string;
          numero: string;
          bairro: string;
          cep: string;
          codigoMunicipio: string;
          uf: string;
        } | null = null;
        const logradouro = pickString(row, ["logradouro"]);
        if (logradouro) {
          const tipo = pickString(row, ["tipologradouro"]);
          endereco = {
            logradouro: tipo ? `${tipo} ${logradouro}` : logradouro,
            numero: pickString(row, ["end_numero"]) || "S/N",
            bairro: pickString(row, ["bairro"]) || "Centro",
            cep: pickString(row, ["cep"]).replace(/\D/g, ""),
            codigoMunicipio: pickString(row, ["codigocidade"]) || "3520400",
            uf: pickString(row, ["uf"]) || "SP",
          };
        }

        return {
          idcliente: Number(row["idcliente"]),
          tipoPessoa: (isFisico ? "fisico" : "juridico") as "fisico" | "juridico",
          nome,
          documento,
          endereco,
        };
      });

      return { total, page, take, items };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(
        `Falha ao buscar clientes no Athos: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new InternalServerErrorException("Erro ao buscar clientes no Athos. Tente novamente.");
    } finally {
      client.release();
    }
  }
"""

MARKER = "  async buscarClientes("
if MARKER not in content:
    last_brace = content.rfind("\n}")
    if last_brace == -1:
        print("ERRO: não encontrou } final em athos.service.ts", file=sys.stderr)
        sys.exit(1)
    content = content[:last_brace] + "\n" + BUSCAR_CLIENTES_METHOD + "\n}"

SERVICE.write_text(content, encoding="utf-8")
print(f"[OK] {SERVICE} atualizado")

# ---------------------------------------------------------------------------
# Patch 2: athos.controller.ts — import Query + endpoint GET /athos/clientes
# ---------------------------------------------------------------------------
CONTROLLER = ROOT / "apps/backend/src/modules/integrations/athos/athos.controller.ts"
ctrl = CONTROLLER.read_text(encoding="utf-8")

# 2a) Adicionar Query ao import
OLD_CTRL_IMPORT = 'import { Controller, Get, Headers, UnauthorizedException }'
NEW_CTRL_IMPORT = 'import { Controller, Get, Headers, Query, UnauthorizedException }'
if NEW_CTRL_IMPORT not in ctrl:
    ctrl = ctrl.replace(OLD_CTRL_IMPORT, NEW_CTRL_IMPORT)

# 2b) Adicionar endpoint antes do } final da classe
CLIENTES_ENDPOINT = r"""
  @Get("clientes")
  async buscarClientes(
    @Query("nome") nome?: string,
    @Query("documento") documento?: string,
    @Query("idcliente") idcliente?: string,
    @Query("page") page?: string,
    @Query("take") take?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    const requiredToken = process.env.ATHOS_API_TOKEN;
    if (requiredToken) {
      const provided =
        xApiToken ||
        (authorization && authorization.startsWith("Bearer ") ? authorization.slice(7) : authorization) ||
        undefined;
      if (!provided || provided !== requiredToken) {
        throw new UnauthorizedException("Token inválido ou ausente");
      }
    }

    return this.athosService.buscarClientes({
      nome,
      documento,
      idcliente: idcliente ? Number(idcliente) : undefined,
      page: page ? Number(page) : undefined,
      take: take ? Number(take) : undefined,
    });
  }
"""

CTRL_MARKER = 'async buscarClientes('
if CTRL_MARKER not in ctrl:
    last_brace = ctrl.rfind("\n}")
    ctrl = ctrl[:last_brace] + "\n" + CLIENTES_ENDPOINT + "\n}"

CONTROLLER.write_text(ctrl, encoding="utf-8")
print(f"[OK] {CONTROLLER} atualizado")

# ---------------------------------------------------------------------------
# Patch 3: athos.service.test.ts — adicionar describe para buscarClientes
# ---------------------------------------------------------------------------
TEST_FILE = ROOT / "apps/backend/src/modules/integrations/athos/athos.service.test.ts"
tests = TEST_FILE.read_text(encoding="utf-8")

TEST_BLOCK = r"""
describe("AthosService - buscarClientes", () => {
  let service: AthosService;

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
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve retornar cliente PF ao buscar por documento (CPF)", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      // COUNT
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      // SELECT data
      .mockResolvedValueOnce({
        rows: [
          {
            idcliente: 123,
            nome_fisico: "João da Silva",
            nomefantasia: null,
            razaosocial: null,
            cpf: "123.456.789-01",
            cnpj: null,
            tipologradouro: "Rua",
            logradouro: "das Flores",
            end_numero: "10",
            bairro: "Centro",
            cep: "11630-000",
            codigocidade: "3520400",
            uf: "SP",
          },
        ],
      });

    const result = await service.buscarClientes({ documento: "12345678901" });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tipoPessoa).toBe("fisico");
    expect(result.items[0].nome).toBe("João da Silva");
    expect(result.items[0].documento).toBe("12345678901");
    expect(result.items[0].endereco?.logradouro).toBe("Rua das Flores");
    expect(client.release).toHaveBeenCalled();
  });

  it("deve retornar lista paginada ao buscar por nome", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockResolvedValueOnce({ rows: [{ total: "2" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            idcliente: 10,
            nome_fisico: "Ana Souza",
            nomefantasia: null,
            razaosocial: null,
            cpf: "111.111.111-11",
            cnpj: null,
            logradouro: null,
          },
          {
            idcliente: 20,
            nome_fisico: null,
            nomefantasia: "Ana Comercio",
            razaosocial: "Ana Comercio Ltda",
            cpf: null,
            cnpj: "12.345.678/0001-90",
            logradouro: null,
          },
        ],
      });

    const result = await service.buscarClientes({ nome: "Ana", page: 1, take: 10 });

    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.take).toBe(10);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].tipoPessoa).toBe("fisico");
    expect(result.items[1].tipoPessoa).toBe("juridico");
    expect(result.items[1].documento).toBe("12345678000190");
    expect(client.release).toHaveBeenCalled();
  });

  it("deve lançar BadRequestException quando nenhum filtro significativo for fornecido", async () => {
    await expect(service.buscarClientes({})).rejects.toThrow();
    await expect(service.buscarClientes({ nome: "ab" })).rejects.toThrow();
  });

  it("deve limitar take ao máximo de 50", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.buscarClientes({ idcliente: 1, take: 999 });

    expect(result.take).toBe(50);
    expect(client.release).toHaveBeenCalled();
  });
});
"""

if 'describe("AthosService - buscarClientes"' not in tests:
    tests = tests.rstrip() + "\n" + TEST_BLOCK

TEST_FILE.write_text(tests, encoding="utf-8")
print(f"[OK] {TEST_FILE} atualizado")
print("Fase 19 implementada com sucesso.")
