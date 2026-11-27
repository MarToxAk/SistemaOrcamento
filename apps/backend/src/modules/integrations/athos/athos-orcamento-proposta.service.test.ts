import * as servicoModulo from "./athos-orcamento.service";
import { AthosOrcamentoService, CriarOrcamentoPropostaInput, OrcamentoAthosError } from "./athos-orcamento.service";

// Seguranca (Fases 44/55): NUNCA conecta ao Athos real. pg e mockado por completo e o host de teste e localhost.
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

/** Classifica o texto SQL emitido. Texto desconhecido vira OUTRO:<sql> e quebra a sequencia. */
function tipo(sql: string): string {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/^BEGIN/i.test(s)) return "BEGIN";
  if (/^COMMIT/i.test(s)) return "COMMIT";
  if (/^ROLLBACK/i.test(s)) return "ROLLBACK";
  if (/^SET TRANSACTION READ ONLY/i.test(s)) return "SET_RO";
  if (/^SET LOCAL statement_timeout/i.test(s)) return "SET_TIMEOUT";
  if (/^SELECT .*funcionario_usuario/i.test(s)) return "LER_CONFIG";
  if (/^SELECT .* FROM produto p WHERE/i.test(s)) return "LER_PRODUTOS_PROPOSTA";
  if (/^SELECT .* FROM orcamento WHERE obs LIKE/i.test(s)) return "BUSCA_REF";
  if (/^SELECT .* FROM orcamento WHERE idorcamento/i.test(s)) return "LER_DATA_HORA";
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
  permitefracionar: boolean | null;
}

function produto(id: number, extra: Partial<ProdutoFake> = {}): ProdutoFake {
  return {
    idproduto: id,
    descricaoproduto: `Produto ${id}`,
    statusproduto: true,
    vende: true,
    permitefracionar: true,
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
  }>;
  /** Linha devolvida pela busca de orfao por ref (idempotencia). */
  orfao?: Record<string, unknown> | null;
  falharEm?: string;
  codigo?: string;
  mensagem?: string;
  conexaoFalha?: boolean;
}

const PRODUTOS_PADRAO = [produto(101), produto(102)];

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
    if (t === "LER_PRODUTOS_PROPOSTA") {
      const ids = ((p?.[0] as number[]) ?? []).map(Number);
      return { rows: produtos.filter((x) => ids.includes(x.idproduto)) };
    }
    if (t === "BUSCA_REF") return { rows: opts.orfao ? [opts.orfao] : [] };
    if (t === "INS_ORC") return { rows: [{ idorcamento: 25866, senhabalcao: 25870 }] };
    if (t === "LER_DATA_HORA") return { rows: [{ data: "2026-11-27", hora: "10:15:30" }] };
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

const ENV_ORIGINAL = { ...process.env };
const REF = "0123456789ab";

function entrada(extra: Partial<CriarOrcamentoPropostaInput> = {}): CriarOrcamentoPropostaInput {
  return {
    idcliente: 77,
    ref: REF,
    itens: [{ idproduto: 101, quantidade: "2.000", precoUnitario: "2.90", custoUnitario: "1.500" }],
    ...extra,
  };
}

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL };
  process.env.NODE_ENV = "test";
  process.env.ATHOS_PG_HOST = "localhost";
  process.env.ATHOS_PG_DB = "athos";
  process.env.ATHOS_PG_USER = "u";
  process.env.ATHOS_PG_PASS = "p";
  process.env.ATHOS_ORCAMENTO_ID_FUNCIONARIO = "1";
  process.env.ATHOS_ORCAMENTO_ID_VENDEDOR = "1";
  process.env.ATHOS_ORCAMENTO_ID_TERMINAL = "1";
  process.env.ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO = "5";
  process.env.PROPOSTA_ESCRITA_ATIVA = "true";
  delete process.env.ATHOS_ORCAMENTO_ESCRITA;
  prepararPg();
});

afterAll(() => {
  process.env = ENV_ORIGINAL;
});

describe("AthosOrcamentoService.criarOrcamentoProposta (Fase 55, plano 55-04)", () => {
  it("sequencia feliz: leituras, orfao, escritas na ordem da Fase 44 e COMMIT", async () => {
    const res = await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    expect(tipos()).toEqual([
      "BEGIN",
      "SET_TIMEOUT",
      "LER_CONFIG",
      "LER_PRODUTOS_PROPOSTA",
      "BUSCA_REF",
      "INS_ORC",
      "LER_DATA_HORA",
      "INS_ITEM",
      "DEL_PAG",
      "INS_PAG",
      "COMMIT",
    ]);
    expect(res).toEqual({
      idorcamento: 25866,
      senhabalcao: 25870,
      data: "2026-11-27",
      hora: "10:15:30",
      valorTotal: "5.80",
      recuperado: false,
    });
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("D-03: INS_ITEM grava o preco final em valoritem e orcamentodesconto 0 (preco 2.90 x 2.000)", async () => {
    await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    // [idorcamento, sequenciaitem, idproduto, quantidade, valoritem, custo, orcamentodesconto, orcamentovalorfinalitem]
    expect(params("INS_ITEM")).toEqual([25866, 1, 101, "2.000", "2.900", "1.500", "0.00", "5.80"]);
  });

  it("D-03: INS_ORC grava descontors 0.00, desconto 0.000, valor 5.80 e o obs do marcador com o ref", async () => {
    await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    // [descontors, idvendedor, idcliente, idfuncionariousuario, idterminal, valor, desconto, obs]
    expect(params("INS_ORC")).toEqual(["0.00", 1, 77, 1, 1, "5.80", "0.000", `[PROPOSTA] ref:${REF}`]);
  });

  it("INS_PAG traz uma linha com a forma configurada e o total 5.80", async () => {
    await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    expect(chamadas("INS_PAG")).toHaveLength(1);
    expect(params("DEL_PAG")).toEqual([25866]);
    expect(params("INS_PAG")).toEqual([25866, 5, "5.80", "5.80"]);
  });

  it("varios itens: total e a soma das linhas arredondadas half-up e sequenciaitem crescente", async () => {
    prepararPg({ produtos: [produto(101), produto(102, { permitefracionar: true })] });
    const res = await new AthosOrcamentoService().criarOrcamentoProposta(
      entrada({
        itens: [
          { idproduto: 101, quantidade: "1.333", precoUnitario: "3.33", custoUnitario: "2.000" },
          { idproduto: 102, quantidade: "3.000", precoUnitario: "0.01", custoUnitario: "0.005" },
        ],
      }),
    );
    // 1.333 x 3.33 = 4.43889 -> 4.44 ; 3 x 0.01 = 0.03 ; total 4.47
    expect(res.valorTotal).toBe("4.47");
    expect(params("INS_ORC")[5]).toBe("4.47");
    expect(params("INS_ITEM", 0).slice(0, 5)).toEqual([25866, 1, 101, "1.333", "3.330"]);
    expect(params("INS_ITEM", 0)[7]).toBe("4.44");
    expect(params("INS_ITEM", 1).slice(0, 5)).toEqual([25866, 2, 102, "3.000", "0.010"]);
    expect(params("INS_ITEM", 1)[5]).toBe("0.005");
    expect(params("INS_ITEM", 1)[7]).toBe("0.03");
  });

  it("nenhum limite de desconto participa: preco abaixo do cadastro nao consulta preco nem desconto", async () => {
    await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    const todo = textosSql().join("\n");
    expect(todo).not.toMatch(/precovendaproduto/i);
    expect(todo).not.toMatch(/descontomaximo/i);
    const lerProdutos = chamadas("LER_PRODUTOS_PROPOSTA")[0][0] as string;
    expect(lerProdutos).not.toMatch(/precovendaproduto|descontomaximo|permitedescontode/i);
    expect(params("LER_PRODUTOS_PROPOSTA")).toEqual([[101]]);
  });

  it("LER_CONFIG recebe funcionario, vendedor, terminal, forma de pagamento e o idcliente", async () => {
    await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    expect(params("LER_CONFIG")).toEqual([1, 1, 1, 5, 77]);
  });

  it("a busca de orfao recebe o marcador de proposta + ref + coringa final", async () => {
    await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    expect(params("BUSCA_REF")).toEqual([`[PROPOSTA] ref:${REF}%`]);
  });

  it("classificacao das escritas: somente INSERT/DELETE nas 3 tabelas de orcamento, sem CTE e sem UPDATE", async () => {
    await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    const sqls = textosSql().map((s) => s.replace(/\s+/g, " ").trim());
    expect(sqls.length).toBeGreaterThan(0);
    for (const s of sqls) {
      expect(s).not.toMatch(/^WITH\b/i);
      expect(s).not.toMatch(/\bUPDATE\b/i);
      if (/^(SELECT|BEGIN|COMMIT|ROLLBACK|SET)\b/i.test(s)) continue;
      expect(s).toMatch(/^(INSERT INTO|DELETE FROM)\s+(orcamento|orcamento_item|orcamento_forma_pagamento)\b/i);
    }
    // 1 item: INSERT orcamento + INSERT item + DELETE pagamento + INSERT pagamento.
    expect(sqls.filter((s) => /^(INSERT|DELETE)\b/i.test(s))).toHaveLength(4);
  });
});

function semConexaoNemEscrita() {
  expect(mPool.connect).not.toHaveBeenCalled();
  expect(mClient.query).not.toHaveBeenCalled();
}

function semEscritaNemCommit() {
  expect(textosSql().filter(ehEscrita)).toEqual([]);
  expect(tipos()).not.toContain("COMMIT");
}

describe("gate PROPOSTA_ESCRITA_ATIVA independente de ATHOS_ORCAMENTO_ESCRITA (D-30)", () => {
  it.each([
    ["ausente", undefined],
    ["false", "false"],
    ["TRUE (caixa errada)", "TRUE"],
    ["1", "1"],
  ])("flag %s lanca ESCRITA_DESABILITADA 503 sem conectar, mesmo com a flag da IA ligada", async (_nome, valor) => {
    if (valor === undefined) delete process.env.PROPOSTA_ESCRITA_ATIVA;
    else process.env.PROPOSTA_ESCRITA_ATIVA = valor;
    process.env.ATHOS_ORCAMENTO_ESCRITA = "true";
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(entrada()));
    expect(err.codigo).toBe("ESCRITA_DESABILITADA");
    expect(err.getStatus()).toBe(503);
    expect((err.getResponse() as { mensagem: string }).mensagem).toContain("PROPOSTA_ESCRITA_ATIVA");
    semConexaoNemEscrita();
  });

  it("flag da proposta ligada com a flag da IA ausente grava normalmente", async () => {
    delete process.env.ATHOS_ORCAMENTO_ESCRITA;
    const res = await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    expect(res.recuperado).toBe(false);
    expect(tipos()).toContain("COMMIT");
  });

  it("flag da proposta ligada com a flag da IA 'false' tambem grava", async () => {
    process.env.ATHOS_ORCAMENTO_ESCRITA = "false";
    const res = await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    expect(res.idorcamento).toBe(25866);
  });

  it("exigirEscritaPropostaAtiva lanca o mesmo erro quando a flag nao e 'true' e nao lanca quando e", () => {
    const svc = new AthosOrcamentoService();
    process.env.PROPOSTA_ESCRITA_ATIVA = "true";
    expect(() => svc.exigirEscritaPropostaAtiva()).not.toThrow();
    process.env.PROPOSTA_ESCRITA_ATIVA = "yes";
    let erro: unknown;
    try {
      svc.exigirEscritaPropostaAtiva();
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(OrcamentoAthosError);
    expect((erro as OrcamentoAthosError).codigo).toBe("ESCRITA_DESABILITADA");
    expect((erro as OrcamentoAthosError).getStatus()).toBe(503);
    expect(mPool.connect).not.toHaveBeenCalled();
  });
});

describe("validacoes puras (nenhuma conexao, nenhum INSERT)", () => {
  const item = (extra: Partial<CriarOrcamentoPropostaInput["itens"][0]> = {}) => ({
    idproduto: 101,
    quantidade: "2.000",
    precoUnitario: "2.90",
    custoUnitario: "1.500",
    ...extra,
  });

  const casos: Array<[string, () => CriarOrcamentoPropostaInput, string]> = [
    ["idcliente ausente", () => entrada({ idcliente: undefined as unknown as number }), "VALOR_INVALIDO"],
    ["idcliente zero", () => entrada({ idcliente: 0 }), "VALOR_INVALIDO"],
    ["idcliente negativo", () => entrada({ idcliente: -3 }), "VALOR_INVALIDO"],
    ["idcliente acima de int4", () => entrada({ idcliente: 2147483648 }), "VALOR_INVALIDO"],
    ["ref com 11 caracteres", () => entrada({ ref: "0123456789a" }), "VALOR_INVALIDO"],
    ["ref com 13 caracteres", () => entrada({ ref: "0123456789abc" }), "VALOR_INVALIDO"],
    ["ref com maiuscula", () => entrada({ ref: "0123456789AB" }), "VALOR_INVALIDO"],
    ["ref nao hexadecimal", () => entrada({ ref: "0123456789zz" }), "VALOR_INVALIDO"],
    ["lista vazia", () => entrada({ itens: [] }), "VALOR_INVALIDO"],
    ["mais de 200 itens", () => entrada({ itens: Array.from({ length: 201 }, () => item()) }), "VALOR_INVALIDO"],
    ["idproduto invalido", () => entrada({ itens: [item({ idproduto: 0 })] }), "VALOR_INVALIDO"],
    ["preco com 3 casas", () => entrada({ itens: [item({ precoUnitario: "2.905" })] }), "VALOR_INVALIDO"],
    ["preco zero", () => entrada({ itens: [item({ precoUnitario: "0.00" })] }), "VALOR_INVALIDO"],
    ["quantidade zero", () => entrada({ itens: [item({ quantidade: "0" })] }), "VALOR_INVALIDO"],
    ["quantidade negativa", () => entrada({ itens: [item({ quantidade: "-1" })] }), "VALOR_INVALIDO"],
    ["quantidade acima de 10000", () => entrada({ itens: [item({ quantidade: "10000.001" })] }), "VALOR_INVALIDO"],
    ["custo negativo", () => entrada({ itens: [item({ custoUnitario: "-0.5" })] }), "VALOR_INVALIDO"],
    ["custo com 4 casas", () => entrada({ itens: [item({ custoUnitario: "1.5001" })] }), "VALOR_INVALIDO"],
    [
      "linha acima do limite de numeric(9,3)",
      () => entrada({ itens: [item({ quantidade: "10000", precoUnitario: "100.00" })] }),
      "VALOR_FORA_DO_LIMITE",
    ],
    [
      "total acima do limite de numeric(9,3)",
      () => entrada({ itens: Array.from({ length: 2 }, () => item({ quantidade: "9000", precoUnitario: "60.00" })) }),
      "VALOR_FORA_DO_LIMITE",
    ],
  ];

  it.each(casos)("%s", async (_nome, montar, codigo) => {
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(montar()));
    expect(err.codigo).toBe(codigo);
    expect(err.getStatus()).toBe(422);
    semConexaoNemEscrita();
  });

  it("o erro de item traz sequenciaitem 1-based nos detalhes", async () => {
    const err = await falha(
      new AthosOrcamentoService().criarOrcamentoProposta(entrada({ itens: [item(), item({ precoUnitario: "2.905" })] })),
    );
    expect((err.getResponse() as { detalhes?: { sequenciaitem?: number } }).detalhes?.sequenciaitem).toBe(2);
  });
});

describe("validacoes dentro da transacao (sem INSERT)", () => {
  it("cliente inexistente = CLIENTE_INEXISTENTE 422", async () => {
    prepararPg({ config: { cliente_ok: false } });
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(entrada()));
    expect(err.codigo).toBe("CLIENTE_INEXISTENTE");
    expect(err.getStatus()).toBe(422);
    semEscritaNemCommit();
    expect(tipos()).toContain("ROLLBACK");
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("produto inexistente = PRODUTO_INEXISTENTE com os ids", async () => {
    prepararPg({ produtos: [produto(101)] });
    const err = await falha(
      new AthosOrcamentoService().criarOrcamentoProposta(
        entrada({
          itens: [
            { idproduto: 101, quantidade: "1", precoUnitario: "1.00", custoUnitario: "0.500" },
            { idproduto: 999, quantidade: "1", precoUnitario: "1.00", custoUnitario: "0.500" },
          ],
        }),
      ),
    );
    expect(err.codigo).toBe("PRODUTO_INEXISTENTE");
    expect((err.getResponse() as { detalhes?: { idsInexistentes?: number[] } }).detalhes?.idsInexistentes).toEqual([999]);
    semEscritaNemCommit();
  });

  it.each([
    ["inativo", { statusproduto: false }],
    ["nao vendido", { vende: false }],
  ])("produto %s = PRODUTO_INATIVO", async (_nome, extra) => {
    prepararPg({ produtos: [produto(101, extra)] });
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(entrada()));
    expect(err.codigo).toBe("PRODUTO_INATIVO");
    semEscritaNemCommit();
  });

  it("quantidade fracionada em produto que nao permite = QUANTIDADE_FRACIONADA; inteira passa", async () => {
    prepararPg({ produtos: [produto(101, { permitefracionar: false })] });
    const err = await falha(
      new AthosOrcamentoService().criarOrcamentoProposta(
        entrada({ itens: [{ idproduto: 101, quantidade: "1.500", precoUnitario: "2.90", custoUnitario: "1.000" }] }),
      ),
    );
    expect(err.codigo).toBe("QUANTIDADE_FRACIONADA");
    semEscritaNemCommit();

    prepararPg({ produtos: [produto(101, { permitefracionar: false })] });
    const ok = await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    expect(ok.recuperado).toBe(false);
  });

  it.each([
    ["funcionario_ok", "CONFIG_INVALIDA"],
    ["vendedor_ok", "CONFIG_INVALIDA"],
    ["terminal_ok", "CONFIG_INVALIDA"],
    ["pix_ok", "FORMA_PAGAMENTO_INVALIDA"],
  ])("%s falso = %s", async (campo, codigo) => {
    prepararPg({ config: { [campo]: false } });
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(entrada()));
    expect(err.codigo).toBe(codigo);
    expect(err.getStatus()).toBe(500);
    semEscritaNemCommit();
  });

  it("nenhum INSERT e emitido antes de todas as leituras e validacoes passarem", async () => {
    await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    const t = tipos();
    const primeiraEscrita = t.findIndex((x) => x === "INS_ORC");
    for (const leitura of ["LER_CONFIG", "LER_PRODUTOS_PROPOSTA", "BUSCA_REF"]) {
      expect(t.indexOf(leitura)).toBeGreaterThan(-1);
      expect(t.indexOf(leitura)).toBeLessThan(primeiraEscrita);
    }
  });
});

describe("idempotencia por ref e recuperacao", () => {
  const ORFAO = { idorcamento: 31000, senhabalcao: 31002, data: "2026-11-20", hora: "09:30:00", valor: "5.800" };

  it("se existe orcamento com o ref devolve recuperado=true, faz ROLLBACK e nao escreve", async () => {
    prepararPg({ orfao: ORFAO });
    const res = await new AthosOrcamentoService().criarOrcamentoProposta(entrada());
    expect(res).toEqual({
      idorcamento: 31000,
      senhabalcao: 31002,
      data: "2026-11-20",
      hora: "09:30:00",
      valorTotal: "5.80",
      recuperado: true,
    });
    semEscritaNemCommit();
    expect(tipos()[tipos().length - 1]).toBe("ROLLBACK");
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("buscarOrcamentoPorRefProposta devolve a linha em transacao READ ONLY e nao exige a flag de escrita", async () => {
    prepararPg({ orfao: ORFAO });
    delete process.env.PROPOSTA_ESCRITA_ATIVA;
    const res = await new AthosOrcamentoService().buscarOrcamentoPorRefProposta(REF);
    expect(res).toEqual({ idorcamento: 31000, senhabalcao: 31002, data: "2026-11-20", hora: "09:30:00", valorTotal: "5.80" });
    expect(tipos()).toEqual(["BEGIN", "SET_RO", "SET_TIMEOUT", "BUSCA_REF", "ROLLBACK"]);
    expect(params("BUSCA_REF")).toEqual([`[PROPOSTA] ref:${REF}%`]);
    semEscritaNemCommit();
  });

  it("buscarOrcamentoPorRefProposta devolve null quando nao ha linha", async () => {
    prepararPg({ orfao: null });
    expect(await new AthosOrcamentoService().buscarOrcamentoPorRefProposta(REF)).toBeNull();
  });

  it.each(["0123", "0123456789AB", "0123456789zz", ""])("buscarOrcamentoPorRefProposta recusa ref %p sem conectar", async (ref) => {
    const err = await falha(new AthosOrcamentoService().buscarOrcamentoPorRefProposta(ref));
    expect(err.codigo).toBe("VALOR_INVALIDO");
    expect(err.getStatus()).toBe(422);
    semConexaoNemEscrita();
  });
});

describe("mapeamento de erros do pg (sem vazar a mensagem original)", () => {
  it("42501 durante o INSERT = PERMISSAO_NEGADA 500 com ROLLBACK", async () => {
    prepararPg({ falharEm: "INS_ORC", codigo: "42501" });
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(entrada()));
    expect(err.codigo).toBe("PERMISSAO_NEGADA");
    expect(err.getStatus()).toBe(500);
    expect(tipos()).toContain("ROLLBACK");
    expect(tipos()).not.toContain("COMMIT");
  });

  it("57014 = ATHOS_INDISPONIVEL 503", async () => {
    prepararPg({ falharEm: "INS_ITEM", codigo: "57014" });
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(entrada()));
    expect(err.codigo).toBe("ATHOS_INDISPONIVEL");
    expect(err.getStatus()).toBe(503);
  });

  it("qualquer outro erro = ERRO_BANCO 500 e a mensagem do pg nao aparece", async () => {
    prepararPg({ falharEm: "INS_PAG", mensagem: "relation orcamento_item violates something secret SQL" });
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(entrada()));
    expect(err.codigo).toBe("ERRO_BANCO");
    expect(err.getStatus()).toBe(500);
    expect(JSON.stringify(err.getResponse())).not.toMatch(/secret|violates|relation/i);
    expect(tipos()).toContain("ROLLBACK");
  });

  it("falha ao conectar = ATHOS_INDISPONIVEL 503 sem escrita", async () => {
    prepararPg({ conexaoFalha: true });
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(entrada()));
    expect(err.codigo).toBe("ATHOS_INDISPONIVEL");
    expect(mClient.query).not.toHaveBeenCalled();
  });

  it("host fora de localhost em NODE_ENV=test e bloqueado antes de conectar", async () => {
    process.env.ATHOS_PG_HOST = "192.168.33.198";
    const err = await falha(new AthosOrcamentoService().criarOrcamentoProposta(entrada()));
    expect(err.codigo).toBe("AMBIENTE_TESTE_HOST_REAL");
    semConexaoNemEscrita();
  });
});

describe("constantes SQL exportadas para o IT de ROLLBACK (comportamento da Fase 44 inalterado)", () => {
  it.each(["SQL_INSERIR_ORCAMENTO", "SQL_INSERIR_ITEM", "SQL_LIMPAR_PAGAMENTO", "SQL_INSERIR_PAGAMENTO"])("exporta %s", (nome) => {
    const valor = (servicoModulo as unknown as Record<string, unknown>)[nome];
    expect(typeof valor).toBe("string");
  });

  it.each(["SQL_LER_PRODUTOS_PROPOSTA", "SQL_BUSCAR_ORCAMENTO_POR_REF", "SQL_LER_DATA_HORA_ORCAMENTO"])("exporta %s sem CTE nem UPDATE", (nome) => {
    const valor = (servicoModulo as unknown as Record<string, unknown>)[nome];
    expect(typeof valor).toBe("string");
    expect(String(valor)).not.toMatch(/^\s*WITH\b|\bUPDATE\b/i);
  });
});
