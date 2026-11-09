import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { AthosOrcamentoService, CriarOrcamentoInput, OrcamentoAthosError } from "./athos-orcamento.service";
import { CreateAthosOrcamentoDto } from "./dto/create-athos-orcamento.dto";

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
  if (/^SELECT .* FROM produto p LEFT JOIN/i.test(s)) return "BUSCA_PRODUTOS";
  if (/^SELECT .* FROM produto p/i.test(s)) return "LER_PRODUTOS";
  if (/^SELECT .* FROM orcamento_item i JOIN/i.test(s)) return "LER_ITENS";
  if (/^SELECT .* FROM orcamento_forma_pagamento ofp/i.test(s)) return "LER_PAGS";
  if (/^SELECT .* FROM orcamento WHERE/i.test(s)) return "LER_ORC";
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
  /** Linhas devolvidas pela busca de produtos (44-04). */
  busca?: Array<Record<string, unknown>>;
  /** Cabecalho, itens e pagamentos devolvidos pelas leituras de orcamento (44-04). */
  orcamento?: {
    cab?: Array<Record<string, unknown>>;
    itens?: Array<Record<string, unknown>>;
    pags?: Array<Record<string, unknown>>;
  };
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
    if (t === "BUSCA_PRODUTOS") return { rows: opts.busca ?? [] };
    if (t === "LER_ORC") return { rows: opts.orcamento?.cab ?? [] };
    if (t === "LER_ITENS") return { rows: opts.orcamento?.itens ?? [] };
    if (t === "LER_PAGS") return { rows: opts.orcamento?.pags ?? [] };
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

/** Cabecalho de orcamento no formato devolvido pelo pg (numeric como texto). */
const LINHA_CAB = {
  idorcamento: 25866,
  senhabalcao: 25866,
  idcliente: null,
  idvendedor: 1,
  idfuncionariousuario: 1,
  idterminal: 1,
  data: "2026-11-09",
  hora: "10:15:30",
  valor: "12.500",
  desconto: "10.000",
  descontors: "1.250",
  statusorcamento: null,
  statusimpressao: false,
  cancelado: false,
  obs: "[IA] ref:abc123",
};

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

    // R8 (44-04): as leituras (busca por token, busca numerica e leitura do orcamento) tambem passam na varredura.
    prepararPg();
    await service.buscarProdutos("caneta bic");
    emitidos.push(...textosSql());
    prepararPg();
    await service.buscarProdutos("29246");
    emitidos.push(...textosSql());
    prepararPg({ orcamento: { cab: [LINHA_CAB] } });
    await service.buscarOrcamento(25866);
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
      /escape\s+'/i,
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

// ---------------------------------------------------------------------------
// Descontos (D-02, D-04). Valores esperados sao literais em texto, nunca recalculados com float.
// ---------------------------------------------------------------------------

describe("AthosOrcamentoService.criarOrcamento - descontos", () => {
  const ORC_25378: CriarOrcamentoInput = {
    itens: [
      { idproduto: 201, quantidade: 1 },
      { idproduto: 202, quantidade: 1 },
    ],
    descontoTotalRS: 2.98,
  };
  const PRODUTOS_25378 = [produto(201, { preco: "6.500" }), produto(202, { preco: "2.000" })];

  it("D1: desconto global do orcamento 25378 e rateado entre as linhas", async () => {
    prepararPg({ produtos: PRODUTOS_25378 });
    const r = await service.criarOrcamento(ORC_25378);

    const orc = params("INS_ORC");
    expect(orc[0]).toBe("2.98"); // descontors
    expect(orc[5]).toBe("8.50"); // valor
    expect(orc[6]).toBe("35.059"); // desconto

    expect(params("INS_ITEM", 0)[6]).toBe("2.28");
    expect(params("INS_ITEM", 1)[6]).toBe("0.70");
    expect(params("INS_ITEM", 0)[7]).toBe("4.22");
    expect(params("INS_ITEM", 1)[7]).toBe("1.30");
    expect(params("INS_PAG")).toEqual([25866, 5, "5.52", "5.52"]);

    expect(r.valorBruto).toBe("8.50");
    expect(r.descontoRS).toBe("2.98");
    expect(r.valorLiquido).toBe("5.52");
    expect(r.descontoPercentual).toBe("35.059");
    expect(r.itens.map((i) => i.desconto)).toEqual(["2.28", "0.70"]);
    expect(r.itens.map((i) => i.valorFinal)).toEqual(["4.22", "1.30"]);
  });

  it("D2: descontoRS por item e o desconto da linha inteira", async () => {
    prepararPg({ produtos: [produto(201, { preco: "8.390" })] });
    await service.criarOrcamento({ itens: [{ idproduto: 201, quantidade: 6, descontoRS: 0.01 }] });

    const item = params("INS_ITEM");
    expect(item[4]).toBe("8.390");
    expect(item[6]).toBe("0.01");
    expect(item[7]).toBe("50.33");
    const orc = params("INS_ORC");
    expect(orc[5]).toBe("50.34");
    expect(orc[0]).toBe("0.01");
  });

  it("D3: valorUnitario abaixo do preco vira desconto; acima substitui o preco", async () => {
    prepararPg({ produtos: [produto(201, { preco: "10.000" })] });
    await service.criarOrcamento({ itens: [{ idproduto: 201, quantidade: 3, valorUnitario: 9 }] });
    let item = params("INS_ITEM");
    expect(item[4]).toBe("10.000");
    expect(item[6]).toBe("3.00");
    expect(item[7]).toBe("27.00");

    prepararPg({ produtos: [produto(201, { preco: "10.000" })] });
    await service.criarOrcamento({ itens: [{ idproduto: 201, quantidade: 3, valorUnitario: 12 }] });
    item = params("INS_ITEM");
    expect(item[4]).toBe("12.000");
    expect(item[6]).toBe("0.00");
    expect(item[7]).toBe("36.00");
  });

  describe("D4: limites de desconto", () => {
    it("descontoRS maior que o total da linha -> DESCONTO_ACIMA_LIMITE com sequenciaitem", async () => {
      prepararPg({ produtos: [produto(201, { preco: "5.000" })] });
      const e = await falha(service.criarOrcamento({ itens: [{ idproduto: 201, quantidade: 2, descontoRS: 10.01 }] }));
      expect(e.codigo).toBe("DESCONTO_ACIMA_LIMITE");
      expect(e.getStatus()).toBe(422);
      expect((e.getResponse() as { detalhes: { sequenciaitem: number } }).detalhes.sequenciaitem).toBe(1);
      expect(tipos()).toContain("ROLLBACK");
      semEscritaNemCommit();
    });

    it("descontoTotalRS maior que a soma dos liquidos -> DESCONTO_ACIMA_LIMITE", async () => {
      prepararPg({ produtos: PRODUTOS_25378 });
      const e = await falha(service.criarOrcamento({ ...ORC_25378, descontoTotalRS: 8.51 }));
      expect(e.codigo).toBe("DESCONTO_ACIMA_LIMITE");
      expect(tipos()).toContain("ROLLBACK");
      semEscritaNemCommit();
    });

    it("limite de conf_vendas.permitedescontode: 10,01% recusa e exatamente 10% grava", async () => {
      const cem = [produto(201, { preco: "100.000" })];
      const input = (desc: number): CriarOrcamentoInput => ({ itens: [{ idproduto: 201, quantidade: 1 }], descontoTotalRS: desc });

      prepararPg({ produtos: cem, config: { permitedescontode: "10.000" } });
      const e = await falha(service.criarOrcamento(input(10.01)));
      expect(e.codigo).toBe("DESCONTO_ACIMA_LIMITE");
      expect(tipos()).toContain("ROLLBACK");
      semEscritaNemCommit();

      prepararPg({ produtos: cem, config: { permitedescontode: "10.000" } });
      const r = await service.criarOrcamento(input(10));
      expect(r.descontoPercentual).toBe("10.000");
      expect(tipos()).toContain("COMMIT");
    });

    it("permitedescontode null equivale a 100%", async () => {
      prepararPg({ produtos: [produto(201, { preco: "100.000" })], config: { permitedescontode: null } });
      const r = await service.criarOrcamento({ itens: [{ idproduto: 201, quantidade: 1 }], descontoTotalRS: 99 });
      expect(r.valorLiquido).toBe("1.00");
      expect(r.descontoPercentual).toBe("99.000");
    });
  });

  it("D5: descontomaximo do produto nao bloqueia (D-04)", async () => {
    prepararPg({ produtos: [produto(201, { preco: "10.000", descontomaximo: "0.01" })] });
    const r = await service.criarOrcamento({ itens: [{ idproduto: 201, quantidade: 1, descontoRS: 5 }] });
    expect(r.valorLiquido).toBe("5.00");
    expect(tipos()).toContain("COMMIT");
    expect(textosSql().some((x) => /descontomaximo/i.test(x))).toBe(false);
  });

  it("D6: quantidade fracionada; o valor do orcamento e a soma das linhas arredondadas", async () => {
    prepararPg({ produtos: [produto(201, { preco: "41.740" })] });
    const um = await service.criarOrcamento({ itens: [{ idproduto: 201, quantidade: 1.162 }] });
    expect(params("INS_ITEM")[3]).toBe("1.162");
    expect(um.valorBruto).toBe("48.50");
    expect(params("INS_ORC")[5]).toBe("48.50");
    expect(params("INS_ITEM")[7]).toBe("48.50");

    prepararPg({ produtos: [produto(201, { preco: "41.740" }), produto(202, { preco: "41.740" }), produto(203, { preco: "41.740" })] });
    const tres = await service.criarOrcamento({
      itens: [
        { idproduto: 201, quantidade: 1.162 },
        { idproduto: 202, quantidade: 1.35 },
        { idproduto: 203, quantidade: 2.34 },
      ],
    });
    expect(tres.itens.map((i) => i.valorTotal)).toEqual(["48.50", "56.35", "97.67"]);
    expect(params("INS_ORC")[5]).toBe("202.52");
    expect(tres.valorBruto).toBe("202.52");
  });

  it("D7: simulacao com descontos devolve os mesmos totais e itens de D1, sem INSERT", async () => {
    prepararPg({ produtos: PRODUTOS_25378 });
    const criado = await service.criarOrcamento(ORC_25378);

    prepararPg({ produtos: PRODUTOS_25378 });
    const sim = await service.criarOrcamento({ ...ORC_25378, simular: true });
    expect(sim.simulado).toBe(true);
    expect(sim.idorcamento).toBeNull();
    expect(sim.valorBruto).toBe(criado.valorBruto);
    expect(sim.descontoRS).toBe(criado.descontoRS);
    expect(sim.valorLiquido).toBe("5.52");
    expect(sim.descontoPercentual).toBe("35.059");
    expect(sim.itens).toEqual(criado.itens);
    expect(textosSql().filter(ehEscrita)).toEqual([]);
    expect(tipos()).toEqual(["BEGIN", "SET_RO", "SET_TIMEOUT", "LER_CONFIG", "LER_PRODUTOS", "ROLLBACK"]);
  });

  describe("D8: contrato do DTO", () => {
    const opcoes = { whitelist: true, forbidNonWhitelisted: true };
    const base = { itens: [{ idproduto: 1, quantidade: 1 }] };

    it("aceita os campos de desconto, cliente e simulacao validos", async () => {
      const dto = plainToInstance(CreateAthosOrcamentoDto, {
        itens: [{ idproduto: 1, quantidade: 1, valorUnitario: 9.995, descontoRS: 0.5 }],
        descontoTotalRS: 2.98,
        idcliente: 77,
        simular: true,
      });
      expect(await validate(dto, opcoes)).toEqual([]);
    });

    it("recusa valorUnitario com 4 casas", async () => {
      const dto = plainToInstance(CreateAthosOrcamentoDto, { itens: [{ idproduto: 1, quantidade: 1, valorUnitario: 1.2345 }] });
      expect((await validate(dto, opcoes)).length).toBeGreaterThan(0);
    });

    it("recusa descontoRS com 3 casas", async () => {
      const dto = plainToInstance(CreateAthosOrcamentoDto, { itens: [{ idproduto: 1, quantidade: 1, descontoRS: 1.005 }] });
      expect((await validate(dto, opcoes)).length).toBeGreaterThan(0);
    });

    it("recusa descontoTotalRS com 3 casas ou negativo", async () => {
      expect((await validate(plainToInstance(CreateAthosOrcamentoDto, { ...base, descontoTotalRS: 1.005 }), opcoes)).length).toBeGreaterThan(0);
      expect((await validate(plainToInstance(CreateAthosOrcamentoDto, { ...base, descontoTotalRS: -1 }), opcoes)).length).toBeGreaterThan(0);
    });

    it("recusa idformapagamento no corpo (D-04: a IA nao escolhe forma de pagamento)", async () => {
      const dto = plainToInstance(CreateAthosOrcamentoDto, { ...base, idformapagamento: 5 });
      expect((await validate(dto, opcoes)).length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// R1..R8 - leituras para a IA (44-04): busca de produtos e GET do orcamento
// ---------------------------------------------------------------------------

describe("AthosOrcamentoService.buscarProdutos", () => {
  it("R1 tokens: um unico SELECT com um bloco ILIKE por token ligados por AND, limite 20", async () => {
    await service.buscarProdutos("caneta  bic");

    expect(tipos()).toEqual(["BEGIN", "SET_RO", "SET_TIMEOUT", "BUSCA_PRODUTOS", "ROLLBACK"]);
    expect(chamadas("BUSCA_PRODUTOS")).toHaveLength(1);
    const [sql, p] = chamadas("BUSCA_PRODUTOS")[0] as [string, unknown[]];
    expect(p).toEqual(expect.arrayContaining(["%caneta%", "%bic%", 20]));
    expect((sql.match(/ILIKE/g) ?? []).length).toBe(6);
    expect(sql).toMatch(/\)\s+AND\s+\(/);
    expect(sql).toContain("p.statusproduto = true");
    expect(sql).toContain("COALESCE(p.vendeproduto, true)");
    expect(sql).not.toMatch(/p\.idproduto\s*=/);
    expect(textosSql().filter(ehEscrita)).toEqual([]);
  });

  it("R2 numerico: q numerico compara tambem o idproduto; acima de int4 nao compara e nao falha", async () => {
    await service.buscarProdutos("29246");
    const [sql, p] = chamadas("BUSCA_PRODUTOS")[0] as [string, unknown[]];
    expect(p).toEqual(expect.arrayContaining([29246, "29246"]));
    expect(sql).toMatch(/p\.idproduto\s*=/);

    prepararPg();
    await expect(service.buscarProdutos("99999999999")).resolves.toEqual([]);
    const [sql2, p2] = chamadas("BUSCA_PRODUTOS")[0] as [string, unknown[]];
    expect(sql2).not.toMatch(/p\.idproduto\s*=/);
    expect(p2).not.toContain(99999999999);
  });

  it("R3 escape: barra, percentual e sublinhado escapados no VALOR; nenhum SQL contem ESCAPE", async () => {
    await service.buscarProdutos("50%_off\\");
    const [, p] = chamadas("BUSCA_PRODUTOS")[0] as [string, unknown[]];
    expect(p).toContain("%50\\%\\_off\\\\%");
    for (const sql of textosSql()) expect(sql).not.toMatch(/escape/i);
  });

  it("R4 limite: 100 vira 50; 0 ou ausente vira 20; no maximo 5 tokens", async () => {
    await service.buscarProdutos("a", 100);
    expect(params("BUSCA_PRODUTOS")).toContain(50);

    prepararPg();
    await service.buscarProdutos("a", 0);
    expect(params("BUSCA_PRODUTOS")).toContain(20);

    prepararPg();
    await service.buscarProdutos("a");
    expect(params("BUSCA_PRODUTOS")).toContain(20);

    prepararPg();
    await service.buscarProdutos("t1 t2 t3 t4 t5 t6 t7");
    const p = params("BUSCA_PRODUTOS");
    expect(p).toEqual(expect.arrayContaining(["%t1%", "%t2%", "%t3%", "%t4%", "%t5%"]));
    expect(p).not.toContain("%t6%");
  });

  it("R5 mapeamento: preco como texto, promocao null vira false, sem campo de custo", async () => {
    prepararPg({
      busca: [
        {
          idproduto: 29246,
          descricaoproduto: "CANETA BIC AZUL",
          marca: "BIC",
          referencia: "REF1",
          codigobarra1: "789",
          preco: "68.000",
          empromocao: null,
          estoqueloja: "0",
          estoquedeposito: "12.500",
          permitefracionar: false,
          descontomaximo: "0.01",
          unidade: "UN",
        },
        {
          idproduto: 2,
          descricaoproduto: "SEM PRECO",
          marca: null,
          referencia: null,
          codigobarra1: null,
          preco: null,
          empromocao: true,
          estoqueloja: "1",
          estoquedeposito: "0",
          permitefracionar: true,
          descontomaximo: "0",
          unidade: null,
        },
      ],
    });
    const r = await service.buscarProdutos("caneta");
    expect(r[0]).toEqual({
      idproduto: 29246,
      descricao: "CANETA BIC AZUL",
      marca: "BIC",
      referencia: "REF1",
      codigoBarra: "789",
      preco: "68.000",
      emPromocao: false,
      estoqueLoja: "0",
      estoqueDeposito: "12.500",
      permiteFracionar: false,
      descontoMaximo: "0.01",
      unidade: "UN",
    });
    expect(r[1].preco).toBeNull();
    expect(r[1].emPromocao).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/custo/i);
    expect(chamadas("BUSCA_PRODUTOS")[0][0]).not.toMatch(/valorcusto/i);
  });
});

describe("AthosOrcamentoService.buscarOrcamento", () => {
  it("R6 leitura: 3 SELECTs com o mesmo $1, status e valor liquido em milesimos", async () => {
    prepararPg({
      orcamento: {
        cab: [LINHA_CAB],
        itens: [
          {
            sequenciaitem: 1,
            idproduto: 101,
            descricaoproduto: "Produto 101",
            quantidadeitem: "1.500",
            valoritem: "8.333",
            orcamentodesconto: "0.00",
            orcamentovalorfinalitem: "12.50",
          },
        ],
        pags: [{ idformapagamento: 5, descricao: "PIX", valor: "11.250", valorrecebido: "11.250", idcondicaopagamento: 0 }],
      },
    });
    const r = await service.buscarOrcamento(25866);

    expect(tipos()).toEqual(["BEGIN", "SET_RO", "SET_TIMEOUT", "LER_ORC", "LER_ITENS", "LER_PAGS", "ROLLBACK"]);
    for (const t of ["LER_ORC", "LER_ITENS", "LER_PAGS"]) expect(params(t)).toEqual([25866]);
    expect(r.status).toBe("aberto");
    expect(r.valorBruto).toBe("12.500");
    expect(r.descontoRS).toBe("1.250");
    expect(r.descontoPercentual).toBe("10.000");
    expect(r.valorLiquido).toBe("11.250");
    expect(r.data).toBe("2026-11-09");
    expect(r.itens).toEqual([
      {
        sequenciaitem: 1,
        idproduto: 101,
        descricao: "Produto 101",
        quantidade: "1.500",
        valorUnitario: "8.333",
        desconto: "0.00",
        valorFinal: "12.50",
      },
    ]);
    expect(r.pagamentos).toEqual([
      { idformapagamento: 5, descricao: "PIX", valor: "11.250", valorRecebido: "11.250", idcondicaopagamento: 0 },
    ]);

    prepararPg({ orcamento: { cab: [{ ...LINHA_CAB, statusorcamento: true }] } });
    expect((await service.buscarOrcamento(25866)).status).toBe("convertido");
    prepararPg({ orcamento: { cab: [{ ...LINHA_CAB, statusorcamento: false }] } });
    expect((await service.buscarOrcamento(25866)).status).toBe("outro");
  });

  it("R6b inexistente: 404 ORCAMENTO_INEXISTENTE; id fora de int4 nao consulta o pg", async () => {
    prepararPg({ orcamento: { cab: [] } });
    const e = await falha(service.buscarOrcamento(25866));
    expect(e.codigo).toBe("ORCAMENTO_INEXISTENTE");
    expect(e.getStatus()).toBe(404);
    expect(tipos()).not.toContain("COMMIT");

    for (const id of [0, 2147483648, -1, 1.5]) {
      prepararPg();
      const err = await falha(service.buscarOrcamento(id));
      expect(err.codigo).toBe("ORCAMENTO_INEXISTENTE");
      expect(err.getStatus()).toBe(404);
      expect(mClient.query).not.toHaveBeenCalled();
      expect(mPool.connect).not.toHaveBeenCalled();
    }
  });
});

describe("AthosOrcamentoService - leituras sem flag e sem autor", () => {
  it("R7: funcionam sem ATHOS_ORCAMENTO_ESCRITA e ATHOS_ORCAMENTO_ID_*; host real e bloqueado sem conexao", async () => {
    delete process.env.ATHOS_ORCAMENTO_ESCRITA;
    delete process.env.ATHOS_ORCAMENTO_ID_FUNCIONARIO;
    delete process.env.ATHOS_ORCAMENTO_ID_VENDEDOR;
    delete process.env.ATHOS_ORCAMENTO_ID_TERMINAL;
    prepararPg({ orcamento: { cab: [LINHA_CAB] } });
    await expect(service.buscarProdutos("caneta")).resolves.toEqual([]);
    await expect(service.buscarOrcamento(25866)).resolves.toMatchObject({ idorcamento: 25866 });

    process.env.ATHOS_PG_HOST = "db.empresa.exemplo";
    prepararPg();
    service = new AthosOrcamentoService();
    expect((await falha(service.buscarProdutos("caneta"))).codigo).toBe("AMBIENTE_TESTE_HOST_REAL");
    expect((await falha(service.buscarOrcamento(25866))).codigo).toBe("AMBIENTE_TESTE_HOST_REAL");
    expect(mPool.connect).not.toHaveBeenCalled();
  });

  it("R7b: falha de conexao vira ATHOS_INDISPONIVEL 503 e o erro do pg nao vaza", async () => {
    prepararPg({ conexaoFalha: true });
    const e = await falha(service.buscarProdutos("caneta"));
    expect(e.codigo).toBe("ATHOS_INDISPONIVEL");
    expect(e.getStatus()).toBe(503);

    prepararPg({ falharEm: "BUSCA_PRODUTOS", mensagem: "segredo interno de SQL" });
    const e2 = await falha(service.buscarProdutos("caneta"));
    expect(e2.codigo).toBe("ERRO_BANCO");
    expect(JSON.stringify(e2.getResponse())).not.toContain("segredo");
    expect(mClient.release).toHaveBeenCalled();
  });
});
