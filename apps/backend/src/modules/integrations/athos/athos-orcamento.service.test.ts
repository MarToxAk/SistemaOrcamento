import { AthosOrcamentoService, CriarOrcamentoInput, OrcamentoAthosError } from "./athos-orcamento.service";

// Seguranca (Fase 44): NUNCA conecta ao Athos real. pg e mockado por completo e o host de teste e localhost.
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn(), end: jest.fn().mockResolvedValue(undefined) };
  return { Pool: jest.fn(() => mPool), __mClient: mClient, __mPool: mPool };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
const mClient = pgMock.__mClient as { query: jest.Mock; release: jest.Mock };
const mPool = pgMock.__mPool as { connect: jest.Mock };

// ---------------------------------------------------------------------------
// Helpers do pg falso
// ---------------------------------------------------------------------------

/** Classifica o texto SQL emitido (padrao da Fase 43). Texto desconhecido vira OUTRO:<sql> e quebra a sequencia. */
function tipo(sql: string): string {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/^BEGIN/i.test(s)) return "BEGIN";
  if (/^COMMIT/i.test(s)) return "COMMIT";
  if (/^ROLLBACK/i.test(s)) return "ROLLBACK";
  if (/^SET TRANSACTION READ ONLY/i.test(s)) return "SET_RO";
  if (/^SET LOCAL statement_timeout/i.test(s)) return "SET_TIMEOUT";
  if (/^SELECT .*funcionario_usuario/i.test(s)) return "LER_CONFIG";
  if (/^SELECT .* FROM produto p/i.test(s)) return "LER_PRODUTOS";
  if (/^INSERT INTO orcamento \(/i.test(s)) return "INS_ORC";
  if (/^INSERT INTO orcamento_item/i.test(s)) return "INS_ITEM";
  if (/^DELETE FROM orcamento_forma_pagamento/i.test(s)) return "DEL_PAG";
  if (/^INSERT INTO orcamento_forma_pagamento/i.test(s)) return "INS_PAG";
  return `OUTRO:${s}`;
}

function tipos(): string[] {
  return mClient.query.mock.calls.map((c: unknown[]) => tipo(c[0] as string));
}

function chamadas(t: string): unknown[][] {
  return mClient.query.mock.calls.filter((c: unknown[]) => tipo(c[0] as string) === t);
}

function params(t: string, n = 0): unknown[] {
  return chamadas(t)[n][1] as unknown[];
}

function textosSql(): string[] {
  return mClient.query.mock.calls.map((c: unknown[]) => c[0] as string);
}

function ehEscrita(sql: string): boolean {
  return /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql);
}

interface ProdutoFake {
  idproduto: number;
  descricaoproduto: string | null;
  statusproduto: boolean | null;
  vende: boolean | null;
  preco: string | null;
  permitefracionar: boolean | null;
  valorcustounitario: string | null;
  descontomaximo?: string | null;
}

function produto(id: number, extra: Partial<ProdutoFake> = {}): ProdutoFake {
  return {
    idproduto: id,
    descricaoproduto: `Produto ${id}`,
    statusproduto: true,
    vende: true,
    preco: "2.000",
    permitefracionar: true,
    valorcustounitario: "1.000",
    ...extra,
  };
}

interface OpcoesPg {
  produtos?: ProdutoFake[];
  config?: Partial<{
    funcionario_ok: boolean;
    vendedor_ok: boolean;
    terminal_ok: boolean;
    pix_ok: boolean;
    cliente_ok: boolean;
    permitedescontode: string | null;
  }>;
  falharEm?: string;
  codigo?: string;
  mensagem?: string;
  conexaoFalha?: boolean;
}

/** Dois produtos padrao: 101 a "2.000" e 102 a "3.300" (7.30 para 2 x 101 + 1 x 102). */
const PRODUTOS_PADRAO = [produto(101, { preco: "2.000" }), produto(102, { preco: "3.300" })];

function prepararPg(opts: OpcoesPg = {}) {
  const produtos = opts.produtos ?? PRODUTOS_PADRAO;
  mClient.query.mockReset();
  mClient.release.mockReset();
  mPool.connect.mockReset();
  if (opts.conexaoFalha) {
    mPool.connect.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
  } else {
    mPool.connect.mockResolvedValue(mClient);
  }
  mClient.query.mockImplementation(async (sql: string, p?: unknown[]) => {
    const t = tipo(sql);
    if (opts.falharEm === t) {
      const err = new Error(opts.mensagem ?? "relation orcamento_item violates something secret SQL") as Error & { code?: string };
      if (opts.codigo) err.code = opts.codigo;
      throw err;
    }
    if (t === "LER_CONFIG") {
      return {
        rows: [
          {
            funcionario_ok: true,
            vendedor_ok: true,
            terminal_ok: true,
            pix_ok: true,
            cliente_ok: true,
            permitedescontode: "100.000",
            ...opts.config,
          },
        ],
      };
    }
    if (t === "LER_PRODUTOS") {
      const ids = ((p?.[0] as number[]) ?? []).map(Number);
      return { rows: produtos.filter((x) => ids.includes(x.idproduto)) };
    }
    if (t === "INS_ORC") return { rows: [{ idorcamento: 25866, senhabalcao: 25866 }] };
    return { rows: [] };
  });
}

async function falha(p: Promise<unknown>): Promise<OrcamentoAthosError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(OrcamentoAthosError);
    return e as OrcamentoAthosError;
  }
  throw new Error("Esperava OrcamentoAthosError, mas a chamada resolveu");
}

function semEscritaNemCommit() {
  expect(textosSql().filter(ehEscrita)).toEqual([]);
  expect(tipos()).not.toContain("COMMIT");
}

const ENV_ORIGINAL = { ...process.env };

const ITENS_PADRAO: CriarOrcamentoInput = {
  itens: [
    { idproduto: 101, quantidade: 2 },
    { idproduto: 102, quantidade: 1 },
  ],
};

let service: AthosOrcamentoService;

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL };
  process.env.NODE_ENV = "test";
  process.env.ATHOS_PG_HOST = "localhost";
  process.env.ATHOS_PG_DB = "athos_fake";
  process.env.ATHOS_PG_USER = "usuario_fake";
  process.env.ATHOS_PG_PASS = "senha_fake";
  process.env.ATHOS_ORCAMENTO_ESCRITA = "true";
  process.env.ATHOS_ORCAMENTO_ID_FUNCIONARIO = "1";
  process.env.ATHOS_ORCAMENTO_ID_VENDEDOR = "1";
  process.env.ATHOS_ORCAMENTO_ID_TERMINAL = "1";
  delete process.env.ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO;
  service = new AthosOrcamentoService();
  prepararPg();
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

// ---------------------------------------------------------------------------
// S1 - sequencia exata da criacao
// ---------------------------------------------------------------------------

describe("AthosOrcamentoService.criarOrcamento - criacao", () => {
  it("S1: emite a sequencia exata de SQL e grava os parametros do Balcao", async () => {
    const r = await service.criarOrcamento(ITENS_PADRAO);

    expect(tipos()).toEqual([
      "BEGIN",
      "SET_TIMEOUT",
      "LER_CONFIG",
      "LER_PRODUTOS",
      "INS_ORC",
      "INS_ITEM",
      "INS_ITEM",
      "DEL_PAG",
      "INS_PAG",
      "COMMIT",
    ]);
    expect(tipos().filter((t) => t.startsWith("OUTRO"))).toEqual([]);
    expect(textosSql().some((s) => /\bUPDATE\b/i.test(s))).toBe(false);
    expect(mClient.release).toHaveBeenCalledTimes(1);

    const orc = params("INS_ORC");
    expect(orc[0]).toBe("0.00"); // descontors
    expect(orc[1]).toBe(1); // idvendedor
    expect(orc[2]).toBeNull(); // idcliente
    expect(orc[3]).toBe(1); // idfuncionariousuario
    expect(orc[4]).toBe(1); // idterminal
    expect(orc[5]).toBe("7.30"); // valor
    expect(orc[6]).toBe("0.000"); // desconto
    expect(String(orc[7]).startsWith("[IA]")).toBe(true);

    const i1 = params("INS_ITEM", 0);
    expect(i1[0]).toBe(25866);
    expect(i1[1]).toBe(1);
    expect(i1[3]).toBe("2.000"); // quantidade
    expect(i1[4]).toBe("2.000"); // valoritem
    expect(i1[6]).toBe("0.00"); // orcamentodesconto
    expect(i1[7]).toBe("4.00"); // orcamentovalorfinalitem
    expect(params("INS_ITEM", 1)[1]).toBe(2);

    expect(params("INS_PAG")).toEqual([25866, 5, "7.30", "7.30"]);
    expect(params("LER_PRODUTOS")[0]).toEqual([101, 102]);

    expect(r.simulado).toBe(false);
    expect(r.idorcamento).toBe(25866);
    expect(r.senhabalcao).toBe(25866);
    expect(r.valorBruto).toBe("7.30");
    expect(r.valorLiquido).toBe("7.30");
  });

  // -------------------------------------------------------------------------
  // S2/S3 - simulacao
  // -------------------------------------------------------------------------

  it("S2: simular emite READ ONLY, nao escreve e devolve os mesmos totais da criacao", async () => {
    const criado = await service.criarOrcamento(ITENS_PADRAO);

    prepararPg();
    const sim = await service.criarOrcamento({ ...ITENS_PADRAO, simular: true });

    expect(tipos()).toEqual(["BEGIN", "SET_RO", "SET_TIMEOUT", "LER_CONFIG", "LER_PRODUTOS", "ROLLBACK"]);
    expect(textosSql().filter(ehEscrita)).toEqual([]);
    expect(tipos()).not.toContain("COMMIT");
    expect(sim.simulado).toBe(true);
    expect(sim.idorcamento).toBeNull();
    expect(sim.senhabalcao).toBeNull();
    expect(sim.valorBruto).toBe(criado.valorBruto);
    expect(sim.valorLiquido).toBe(criado.valorLiquido);
    expect(sim.itens).toEqual(criado.itens);
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("S2b: SET TRANSACTION READ ONLY e a primeira instrucao depois do BEGIN", async () => {
    await service.criarOrcamento({ ...ITENS_PADRAO, simular: true });
    expect(tipos().slice(0, 2)).toEqual(["BEGIN", "SET_RO"]);
  });

  it("S3: simular funciona com ATHOS_ORCAMENTO_ESCRITA desligada", async () => {
    delete process.env.ATHOS_ORCAMENTO_ESCRITA;
    const sim = await service.criarOrcamento({ ...ITENS_PADRAO, simular: true });
    expect(sim.simulado).toBe(true);
    expect(textosSql().filter(ehEscrita)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // S4 - flag
  // -------------------------------------------------------------------------

  it.each([[undefined], ["false"], ["TRUE"], ["1"]])(
    "S4: ATHOS_ORCAMENTO_ESCRITA=%p sem simular -> ESCRITA_DESABILITADA 503 sem conexao",
    async (valor) => {
      if (valor === undefined) delete process.env.ATHOS_ORCAMENTO_ESCRITA;
      else process.env.ATHOS_ORCAMENTO_ESCRITA = valor;

      const e = await falha(service.criarOrcamento(ITENS_PADRAO));
      expect(e.codigo).toBe("ESCRITA_DESABILITADA");
      expect(e.getStatus()).toBe(503);
      expect(mPool.connect).not.toHaveBeenCalled();
    },
  );

  // -------------------------------------------------------------------------
  // S5 - trava de host
  // -------------------------------------------------------------------------

  it("S5: host real em NODE_ENV=test e bloqueado antes de conectar", async () => {
    process.env.ATHOS_PG_HOST = "db.empresa.exemplo";
    const e = await falha(service.criarOrcamento(ITENS_PADRAO));
    expect(e.codigo).toBe("AMBIENTE_TESTE_HOST_REAL");
    expect(mPool.connect).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // S6 - configuracao
  // -------------------------------------------------------------------------

  it.each([
    ["ausente", undefined],
    ["abc", "abc"],
    ["zero", "0"],
  ])("S6: ATHOS_ORCAMENTO_ID_FUNCIONARIO %s -> CONFIG_INVALIDA 500 sem conexao", async (_nome, valor) => {
    if (valor === undefined) delete process.env.ATHOS_ORCAMENTO_ID_FUNCIONARIO;
    else process.env.ATHOS_ORCAMENTO_ID_FUNCIONARIO = valor;

    const e = await falha(service.criarOrcamento(ITENS_PADRAO));
    expect(e.codigo).toBe("CONFIG_INVALIDA");
    expect(e.getStatus()).toBe(500);
    expect(mPool.connect).not.toHaveBeenCalled();
  });

  it("S6b: vendedor inexistente -> CONFIG_INVALIDA citando a variavel, com ROLLBACK e sem INSERT", async () => {
    prepararPg({ config: { vendedor_ok: false } });
    const e = await falha(service.criarOrcamento(ITENS_PADRAO));
    expect(e.codigo).toBe("CONFIG_INVALIDA");
    expect((e.getResponse() as { mensagem: string }).mensagem).toContain("ATHOS_ORCAMENTO_ID_VENDEDOR");
    expect(tipos()).toContain("ROLLBACK");
    semEscritaNemCommit();
  });

  it("S6c: forma de pagamento PIX invalida -> FORMA_PAGAMENTO_INVALIDA citando a variavel", async () => {
    prepararPg({ config: { pix_ok: false } });
    const e = await falha(service.criarOrcamento(ITENS_PADRAO));
    expect(e.codigo).toBe("FORMA_PAGAMENTO_INVALIDA");
    expect((e.getResponse() as { mensagem: string }).mensagem).toContain("ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO");
    semEscritaNemCommit();
  });

  it("S6d: ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO ausente usa 5", async () => {
    await service.criarOrcamento(ITENS_PADRAO);
    expect(params("LER_CONFIG")[3]).toBe(5);
    expect(params("INS_PAG")[1]).toBe(5);
  });

  // -------------------------------------------------------------------------
  // S7 - produtos
  // -------------------------------------------------------------------------

  it("S7: produto ausente -> PRODUTO_INEXISTENTE 422 com idsInexistentes", async () => {
    const e = await falha(service.criarOrcamento({ itens: [{ idproduto: 101, quantidade: 1 }, { idproduto: 999, quantidade: 1 }] }));
    expect(e.codigo).toBe("PRODUTO_INEXISTENTE");
    expect(e.getStatus()).toBe(422);
    expect((e.getResponse() as { detalhes: { idsInexistentes: number[] } }).detalhes.idsInexistentes).toEqual([999]);
    expect(tipos()).toContain("ROLLBACK");
    semEscritaNemCommit();
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["statusproduto false", { statusproduto: false }, "PRODUTO_INATIVO"],
    ["statusproduto null", { statusproduto: null }, "PRODUTO_INATIVO"],
    ["vende false", { vende: false }, "PRODUTO_INATIVO"],
    ["preco null", { preco: null }, "PRECO_INDISPONIVEL"],
    ["preco zero", { preco: "0.000" }, "PRECO_INDISPONIVEL"],
  ])("S7: %s -> %s", async (_nome, extra, codigo) => {
    prepararPg({ produtos: [produto(101, extra as Partial<ProdutoFake>)] });
    const e = await falha(service.criarOrcamento({ itens: [{ idproduto: 101, quantidade: 1 }] }));
    expect(e.codigo).toBe(codigo);
    expect(e.getStatus()).toBe(422);
    expect(tipos()).toContain("ROLLBACK");
    semEscritaNemCommit();
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("S7: quantidade 1.5 sem permitefracionar -> QUANTIDADE_FRACIONADA; com permitefracionar passa", async () => {
    prepararPg({ produtos: [produto(101, { permitefracionar: false })] });
    const e = await falha(service.criarOrcamento({ itens: [{ idproduto: 101, quantidade: 1.5 }] }));
    expect(e.codigo).toBe("QUANTIDADE_FRACIONADA");
    semEscritaNemCommit();

    prepararPg({ produtos: [produto(101, { permitefracionar: true })] });
    const r = await service.criarOrcamento({ itens: [{ idproduto: 101, quantidade: 1.5 }] });
    expect(r.itens[0].quantidade).toBe("1.500");
    expect(r.valorBruto).toBe("3.00");
  });

  // -------------------------------------------------------------------------
  // S8 - cliente
  // -------------------------------------------------------------------------

  it("S8: idcliente inexistente -> CLIENTE_INEXISTENTE 422 sem INSERT", async () => {
    prepararPg({ config: { cliente_ok: false } });
    const e = await falha(service.criarOrcamento({ ...ITENS_PADRAO, idcliente: 77 }));
    expect(e.codigo).toBe("CLIENTE_INEXISTENTE");
    expect(e.getStatus()).toBe(422);
    expect(tipos()).toContain("ROLLBACK");
    semEscritaNemCommit();
  });

  it("S8: idcliente existente e gravado; sem idcliente grava NULL", async () => {
    await service.criarOrcamento({ ...ITENS_PADRAO, idcliente: 77 });
    expect(params("LER_CONFIG")[4]).toBe(77);
    expect(params("INS_ORC")[2]).toBe(77);

    prepararPg();
    await service.criarOrcamento(ITENS_PADRAO);
    expect(params("LER_CONFIG")[4]).toBeNull();
    expect(params("INS_ORC")[2]).toBeNull();
  });

  // -------------------------------------------------------------------------
  // S9 - erros pg
  // -------------------------------------------------------------------------

  it.each([
    ["42501", "PERMISSAO_NEGADA", 500],
    ["22003", "VALOR_FORA_DO_LIMITE", 422],
    ["57014", "ATHOS_INDISPONIVEL", 503],
    [undefined, "ERRO_BANCO", 500],
  ])("S9: erro pg %p em INS_ITEM -> %s %i com ROLLBACK, sem COMMIT e release unico", async (code, codigo, status) => {
    prepararPg({ falharEm: "INS_ITEM", codigo: code, mensagem: "segredo-do-driver: relation orcamento_item" });
    const e = await falha(service.criarOrcamento(ITENS_PADRAO));
    expect(e.codigo).toBe(codigo);
    expect(e.getStatus()).toBe(status);
    expect(tipos()).toContain("ROLLBACK");
    expect(tipos()).not.toContain("COMMIT");
    expect(mClient.release).toHaveBeenCalledTimes(1);

    const mensagem = (e.getResponse() as { mensagem: string }).mensagem;
    expect(mensagem).not.toContain("segredo-do-driver");
    if (code === "42501") {
      expect(mensagem).toContain("orcamento_item");
      expect(mensagem).toContain("USAGE");
    }
  });

  it("S9: falha ao conectar -> ATHOS_INDISPONIVEL", async () => {
    prepararPg({ conexaoFalha: true });
    const e = await falha(service.criarOrcamento(ITENS_PADRAO));
    expect(e.codigo).toBe("ATHOS_INDISPONIVEL");
    expect(e.getStatus()).toBe(503);
  });

  // -------------------------------------------------------------------------
  // S10 - obs
  // -------------------------------------------------------------------------

  it("S10: obs sanitizada com prefixo [IA], ref opcional e limite de tamanho", async () => {
    await service.criarOrcamento({ ...ITENS_PADRAO, obs: "Orçamento p/ João & Cia" });
    expect(params("INS_ORC")[7]).toBe("[IA] Orcamento p/ Joao Cia");

    prepararPg();
    await service.criarOrcamento({ ...ITENS_PADRAO, obs: "Orçamento p/ João & Cia" }, { ref: "abc123def456" });
    expect(params("INS_ORC")[7]).toBe("[IA] ref:abc123def456 Orcamento p/ Joao Cia");

    prepararPg();
    await service.criarOrcamento(ITENS_PADRAO);
    expect(params("INS_ORC")[7]).toBe("[IA]");

    prepararPg();
    await service.criarOrcamento({ ...ITENS_PADRAO, obs: "a".repeat(1500) });
    expect(String(params("INS_ORC")[7]).length).toBeLessThanOrEqual(2000);
  });

  // -------------------------------------------------------------------------
  // S11 - compatibilidade PostgreSQL 9.0.5
  // -------------------------------------------------------------------------

  it("S11: nenhum SQL emitido (criar e simular) usa recurso ausente no PostgreSQL 9.0.5", async () => {
    await service.criarOrcamento({ ...ITENS_PADRAO, idcliente: 77 });
    const emitidos = textosSql();

    prepararPg();
    await service.criarOrcamento({ ...ITENS_PADRAO, simular: true });
    emitidos.push(...textosSql());

    expect(emitidos.length).toBeGreaterThanOrEqual(16);
    const proibidos = [
      /on\s+conflict/i,
      /\bfilter\s*\(/i,
      /json/i,
      /^\s*with\s/i,
      /\blateral\b/i,
      /generated/i,
      /lock_timeout/i,
      /unaccent/i,
      /pg_sequence_last_value/i,
      /currval/i,
      /max\s*\(\s*idorcamento/i,
    ];
    for (const sql of emitidos) {
      for (const re of proibidos) {
        expect({ sql, re: String(re), casou: re.test(sql) }).toMatchObject({ casou: false });
      }
    }
  });
});
