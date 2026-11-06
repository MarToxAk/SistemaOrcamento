import {
  AthosContaReceberBaixaService,
  BaixaAthosError,
  BaixarTitulosInput,
  formatarValorAthos,
  hojeSaoPaulo,
  montarDescricaoLivro,
  montarRegexCartaoPreferencial,
  sanitizarTextoAthos,
} from "./athos-conta-receber-baixa.service";
import { CONF_FINANCEIRO_COLUNAS } from "./athos-baixa-encargos.util";

// D-07: NUNCA conecta ao Athos real. pg e mockado por completo.
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn() };
  return { Pool: jest.fn(() => mPool), __mClient: mClient, __mPool: mPool };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
const mClient = pgMock.__mClient as { query: jest.Mock; release: jest.Mock };
const mPool = pgMock.__mPool as { connect: jest.Mock };

const HOJE = "2026-11-06";
const CONSTANTES = { idFormaPagamento: 10, idLivroRegistro: 2, idFuncionario: 1 };

interface LinhaFake {
  idcontareceber: number;
  idcliente: number;
  numerotitulo: string;
  valor: string;
  datavencimento: string;
  statusconta: string;
}

function linha(id: number, extra: Partial<LinhaFake> = {}): LinhaFake {
  return {
    idcontareceber: id,
    idcliente: 2641,
    numerotitulo: `T-${id}`,
    valor: "29.00",
    datavencimento: "2026-11-20",
    statusconta: "AVC",
    ...extra,
  };
}

function tipo(sql: string): string {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/^BEGIN/i.test(s)) return "BEGIN";
  if (/^COMMIT/i.test(s)) return "COMMIT";
  if (/^ROLLBACK/i.test(s)) return "ROLLBACK";
  if (/^SET TRANSACTION/i.test(s)) return "SET";
  if (/^SELECT .* FROM conf_financeiro/i.test(s)) return "LER_CONF";
  if (/^SELECT .* FROM conta_receber/i.test(s)) return "LER_TITULOS";
  if (/^SELECT .* FROM cliente /i.test(s)) return "LER_CLIENTE";
  if (/^INSERT INTO conta_recebida/i.test(s)) return "INS_CR";
  if (/^INSERT INTO livro_registro_io/i.test(s)) return "INS_LIVRO";
  if (/^INSERT INTO log/i.test(s)) return "INS_LOG";
  if (/^UPDATE conta_receber/i.test(s)) return "UPD_CONTA";
  if (/^UPDATE boleto/i.test(s)) return "UPD_BOLETO";
  if (/^UPDATE cliente/i.test(s)) return "UPD_CLIENTE";
  return `OUTRO:${s}`;
}

function tipos(): string[] {
  return mClient.query.mock.calls.map((c: unknown[]) => tipo(c[0] as string));
}

function chamadas(t: string): unknown[][] {
  return mClient.query.mock.calls.filter((c: unknown[]) => tipo(c[0] as string) === t);
}

function ehEscrita(sql: string): boolean {
  return /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql);
}

// Configuracao ASSUMIDA (1% ao mes, sem carencia): dados reais de conf_financeiro nao foram coletados.
const CONF_FAKE = { taxajurosmes: "1", carenciadias: "0" };

function prepararPg(
  linhas: LinhaFake[],
  opts: { falharEm?: string; codigo?: string; nome?: string; conf?: Record<string, unknown> | null } = {},
) {
  let seq = 5000;
  mClient.query.mockReset();
  mClient.release.mockReset();
  mClient.query.mockImplementation(async (sql: string) => {
    const t = tipo(sql);
    if (opts.falharEm === t) {
      const err = new Error("erro simulado") as Error & { code: string };
      err.code = opts.codigo ?? "XX000";
      throw err;
    }
    switch (t) {
      case "LER_TITULOS":
        return { rows: linhas };
      case "LER_CONF":
        return { rows: opts.conf === null ? [] : [opts.conf ?? CONF_FAKE] };
      case "LER_CLIENTE":
        return { rows: [{ nome_cliente: opts.nome ?? "COLEGIO OBJETIVO" }] };
      case "INS_CR":
        seq += 1;
        return { rows: [{ idcontarecebida: seq }] };
      default:
        return { rows: [] };
    }
  });
}

function entrada(ids: number[], extra: Partial<BaixarTitulosInput> = {}): BaixarTitulosInput {
  return {
    idclienteAthos: 2641,
    titulos: ids.map((id) => ({ idcontareceber: id, valorEsperado: 29 })),
    dataPagamento: HOJE,
    hoje: HOJE,
    constantes: CONSTANTES,
    ...extra,
  };
}

async function codigoDoErro(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(BaixaAthosError);
    return (e as BaixaAthosError).codigo;
  }
  throw new Error("esperava BaixaAthosError");
}

function nenhumaEscrita() {
  const escritas = mClient.query.mock.calls.filter((c: unknown[]) => ehEscrita(c[0] as string));
  expect(escritas).toHaveLength(0);
}

describe("AthosContaReceberBaixaService", () => {
  const envOriginal = { ...process.env };
  let service: AthosContaReceberBaixaService;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos_mock";
    process.env.ATHOS_PG_USER = "usuario_mock";
    process.env.ATHOS_PG_PASS = "senha_mock";
    process.env.ATHOS_PG_PORT = "5432";
    mPool.connect.mockClear();
    mPool.connect.mockResolvedValue(mClient);
    service = new AthosContaReceberBaixaService();
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  it("1. titulo ja REC e ignorado", async () => {
    prepararPg([linha(1, { statusconta: "REC" })]);
    const r = await service.baixarTitulos(entrada([1]));
    expect(r.resultado).toBe("ja_baixado");
    expect(r.titulos[0].acao).toBe("ja_baixado");
    nenhumaEscrita();
    expect(tipos()[tipos().length - 1]).toBe("ROLLBACK");
    expect(tipos()).not.toContain("COMMIT");
  });

  it("2. mistura de REC e AVC baixa so o pendente", async () => {
    prepararPg([linha(1), linha(2, { statusconta: "REC" }), linha(3, { statusconta: "VEN" })]);
    const r = await service.baixarTitulos(entrada([1, 2, 3]));
    expect(r.resultado).toBe("baixado");
    expect(chamadas("INS_CR")).toHaveLength(2);
    expect(chamadas("INS_LIVRO")).toHaveLength(2);
    expect(chamadas("UPD_CLIENTE")).toHaveLength(1);
    expect(r.titulos.map((t) => t.acao)).toEqual(["baixado", "ja_baixado", "baixado"]);
  });

  it("3. multi-titulo: uma transacao, valor proprio de cada titulo, soma em centavos", async () => {
    prepararPg([
      linha(1, { valor: "0.10" }),
      linha(2, { valor: "0.20", statusconta: "VEN" }),
      linha(3, { valor: "10.00" }),
    ]);
    const r = await service.baixarTitulos({
      ...entrada([1, 2, 3]),
      titulos: [
        { idcontareceber: 1, valorEsperado: 0.1 },
        { idcontareceber: 2, valorEsperado: 0.2 },
        { idcontareceber: 3, valorEsperado: 10 },
      ],
    });
    const t = tipos();
    expect(t.filter((x) => x === "BEGIN")).toHaveLength(1);
    expect(t.filter((x) => x === "INS_CR")).toHaveLength(3);
    expect(t.filter((x) => x === "INS_LIVRO")).toHaveLength(3);
    expect(t.filter((x) => x === "UPD_CONTA")).toHaveLength(3);
    expect(t.filter((x) => x === "UPD_BOLETO")).toHaveLength(3);
    expect(t.filter((x) => x === "UPD_CLIENTE")).toHaveLength(1);
    expect(t.filter((x) => x === "COMMIT")).toHaveLength(1);
    expect(chamadas("INS_CR").map((c) => (c[1] as unknown[])[1])).toEqual(["0.10", "0.20", "10.00"]);
    expect(r.valorTotal).toBe(10.3);
    expect(r.titulos.map((x) => x.idcontarecebida)).toEqual([5001, 5002, 5003]);
  });

  it("4. titulo inexistente -> TITULO_NAO_ENCONTRADO", async () => {
    prepararPg([]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([99])))).toBe("TITULO_NAO_ENCONTRADO");
    nenhumaEscrita();
    expect(tipos()).toContain("ROLLBACK");
  });

  it("5. status CAN -> STATUS_INVALIDO", async () => {
    prepararPg([linha(1, { statusconta: "CAN" })]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("STATUS_INVALIDO");
    nenhumaEscrita();
  });

  it("6. valor divergente > 0,01 -> VALOR_DIVERGENTE; diferenca de 0,01 passa", async () => {
    prepararPg([linha(1, { valor: "29.02" })]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("VALOR_DIVERGENTE");
    nenhumaEscrita();

    prepararPg([linha(1, { valor: "29.01" })]);
    const r = await service.baixarTitulos(entrada([1]));
    expect(r.resultado).toBe("baixado");
  });

  it("7. valor zero ou negativo -> TITULO_NAO_POSITIVO", async () => {
    prepararPg([linha(1, { valor: "0.00" })]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("TITULO_NAO_POSITIVO");
    nenhumaEscrita();
    prepararPg([linha(1, { valor: "-5.00" })]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("TITULO_NAO_POSITIVO");
    nenhumaEscrita();
  });

  it("8. titulo de outro cliente -> CLIENTE_DIVERGENTE", async () => {
    prepararPg([linha(1, { idcliente: 777 })]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("CLIENTE_DIVERGENTE");
    nenhumaEscrita();
  });

  it("9. validacao antes de escrever: 3o titulo invalido nao deixa gravar o 1o e o 2o", async () => {
    prepararPg([linha(1), linha(2), linha(3, { statusconta: "CAN" })]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1, 2, 3])))).toBe("STATUS_INVALIDO");
    nenhumaEscrita();
    expect(tipos()).not.toContain("COMMIT");
  });

  it("10. retroativa (D-03): data informada em datapagamento/datalancamento e linha de log", async () => {
    prepararPg([linha(1363, { datavencimento: "2026-11-20" })]);
    const r = await service.baixarTitulos(entrada([1363], { dataPagamento: "2026-11-05" }));
    expect(r.retroativa).toBe(true);
    expect((chamadas("INS_CR")[0][1] as unknown[])[2]).toBe("2026-11-05 00:00:00");
    expect((chamadas("INS_LIVRO")[0][1] as unknown[])[2]).toBe("2026-11-05");
    const logs = chamadas("INS_LOG");
    expect(logs).toHaveLength(1);
    expect((logs[0][1] as unknown[])[1]).toBe(
      "Baixou a conta com ID: 1363 com a data retroativa. Data atual: 06/11/2026 Data Informada: 05/11/2026",
    );

    prepararPg([linha(1363)]);
    const r2 = await service.baixarTitulos(entrada([1363]));
    expect(r2.retroativa).toBe(false);
    expect(chamadas("INS_LOG")).toHaveLength(0);
  });

  it("11. data futura -> DATA_PAGAMENTO_FUTURA; formato invalido -> DATA_PAGAMENTO_INVALIDA; sem conexao", async () => {
    prepararPg([linha(1)]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1], { dataPagamento: "2026-11-07" })))).toBe(
      "DATA_PAGAMENTO_FUTURA",
    );
    expect(await codigoDoErro(service.baixarTitulos(entrada([1], { dataPagamento: "06/11/2026" })))).toBe(
      "DATA_PAGAMENTO_INVALIDA",
    );
    expect(await codigoDoErro(service.baixarTitulos(entrada([1], { dataPagamento: "2026-02-31" })))).toBe(
      "DATA_PAGAMENTO_INVALIDA",
    );
    expect(mPool.connect).not.toHaveBeenCalled();
    expect(mClient.query).not.toHaveBeenCalled();
  });

  it("12. atraso: encargos do caso dourado (457,00, 10 dias -> 1,51 / 9,14 / 467,65) gravados em conta_recebida e livro", async () => {
    // Origem: 43-REFERENCIA-SQL-ATHOS.md (captura do Athos real)
    prepararPg([linha(1, { valor: "457.00", datavencimento: "2026-10-27", statusconta: "VEN" })]);
    const r = await service.baixarTitulos({
      ...entrada([1]),
      titulos: [{ idcontareceber: 1, valorEsperado: 457 }],
    });
    const cr = chamadas("INS_CR")[0][1] as unknown[];
    expect(cr[1]).toBe("467.65"); // valorpago
    expect(cr[3]).toBe("1.51"); // juros
    expect(cr[4]).toBe(10); // atraso
    expect(cr[7]).toBe("9.14"); // multa
    expect((chamadas("INS_LIVRO")[0][1] as unknown[])[4]).toBe("467.65");
    expect(r.modo).toBe("com_encargos");
    expect(r.valorTotal).toBe(467.65);
    expect(r.titulos[0]).toMatchObject({ principal: 457, juros: 1.51, multa: 9.14, atraso: 10, valorPago: 467.65 });
  });

  it("12b. segundo caso dourado (252,93, 10 dias -> 0,83 / 5,06 / 258,82)", async () => {
    prepararPg([linha(1, { valor: "252.93", datavencimento: "2026-10-27", statusconta: "VEN" })]);
    await service.baixarTitulos({ ...entrada([1]), titulos: [{ idcontareceber: 1, valorEsperado: 252.93 }] });
    const cr = chamadas("INS_CR")[0][1] as unknown[];
    expect([cr[1], cr[3], cr[4], cr[7]]).toEqual(["258.82", "0.83", 10, "5.06"]);
  });

  it("12c. multa configuravel pelas constantes (percentualMulta)", async () => {
    prepararPg([linha(1, { valor: "100.00", datavencimento: "2026-11-05", statusconta: "VEN" })]);
    await service.baixarTitulos({
      ...entrada([1]),
      titulos: [{ idcontareceber: 1, valorEsperado: 100 }],
      constantes: { ...CONSTANTES, percentualMulta: 10 },
    });
    expect((chamadas("INS_CR")[0][1] as unknown[])[7]).toBe("10.00");
  });

  it("12d. percentualMulta invalido -> CONFIG_INVALIDA sem conexao", async () => {
    prepararPg([linha(1)]);
    const codigo = await codigoDoErro(
      service.baixarTitulos(entrada([1], { constantes: { ...CONSTANTES, percentualMulta: -1 } })),
    );
    expect(codigo).toBe("CONFIG_INVALIDA");
    expect(mPool.connect).not.toHaveBeenCalled();
  });

  it("13. constantes (D-04) aparecem nos params de conta_recebida, livro e log", async () => {
    prepararPg([linha(1)]);
    await service.baixarTitulos(
      entrada([1], {
        dataPagamento: "2026-11-05",
        constantes: { idFormaPagamento: 12, idLivroRegistro: 5, idFuncionario: 9 },
      }),
    );
    const cr = chamadas("INS_CR")[0][1] as unknown[];
    expect(cr[5]).toBe(9); // funcionario
    expect(cr[6]).toBe(12); // forma
    const livro = chamadas("INS_LIVRO")[0][1] as unknown[];
    expect(livro[0]).toBe(5);
    expect(livro[1]).toBe(9);
    expect((chamadas("INS_LOG")[0][1] as unknown[])[0]).toBe(9);
  });

  it("13b. constantes invalidas -> CONFIG_INVALIDA sem conexao", async () => {
    prepararPg([linha(1)]);
    const codigo = await codigoDoErro(
      service.baixarTitulos(entrada([1], { constantes: { idFormaPagamento: 0, idLivroRegistro: 2, idFuncionario: 1 } })),
    );
    expect(codigo).toBe("CONFIG_INVALIDA");
    expect(mPool.connect).not.toHaveBeenCalled();
  });

  it("14. descricao e texto (D-09): ASCII, sem aspas nem E comercial, dentro do limite", async () => {
    const nome = "JOSE D'ARC & FILHOS LTDA - AÇOUGUE SÃO JOÃO";
    const texto = sanitizarTextoAthos(nome, 100);
    expect(texto).toBe("JOSE D ARC FILHOS LTDA - ACOUGUE SAO JOAO");
    expect(texto).not.toMatch(/['"&]/);

    const longa = montarDescricaoLivro("34366-1", "X".repeat(500), 100);
    expect(longa.length).toBeLessThanOrEqual(100);
    expect(longa.startsWith("Rec. Titulo 34366-1 - Cliente: ")).toBe(true);
    expect(() => montarDescricaoLivro(null, "Fulano")).not.toThrow();
    expect(montarDescricaoLivro(null, "Fulano")).toBe("Rec. Titulo - Cliente: Fulano");

    prepararPg([linha(1)], { nome });
    await service.baixarTitulos(entrada([1]));
    const descricao = (chamadas("INS_LIVRO")[0][1] as unknown[])[3] as string;
    expect(descricao).toBe("Rec. Titulo T-1 - Cliente: JOSE D ARC FILHOS LTDA - ACOUGUE SAO JOAO");
  });

  it("15. simulacao (D-07): BEGIN, SET TRANSACTION READ ONLY, leituras sem FOR UPDATE, ROLLBACK", async () => {
    prepararPg([linha(1), linha(2)]);
    const r = await service.baixarTitulos(entrada([1, 2], { simular: true }));
    expect(tipos()).toEqual(["BEGIN", "SET", "LER_TITULOS", "LER_CLIENTE", "ROLLBACK"]);
    expect(mClient.query.mock.calls[1][0]).toMatch(/SET TRANSACTION READ ONLY/);
    expect(mClient.query.mock.calls[2][0]).not.toMatch(/FOR UPDATE/);
    nenhumaEscrita();
    expect(r.simulado).toBe(true);
    expect(r.resultado).toBe("baixado");
    expect(r.titulos.every((t) => t.idcontarecebida === null)).toBe(true);
    expect(r.valorTotal).toBe(58);
  });

  it("15b. fora da simulacao a leitura usa FOR UPDATE", async () => {
    prepararPg([linha(1)]);
    await service.baixarTitulos(entrada([1]));
    expect(mClient.query.mock.calls[1][0]).toMatch(/FOR UPDATE/);
  });

  it("16. trava de ambiente (D-07): host real em NODE_ENV=test -> AMBIENTE_TESTE_HOST_REAL sem conectar", async () => {
    process.env.ATHOS_PG_HOST = "db.empresa.exemplo";
    prepararPg([linha(1)]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("AMBIENTE_TESTE_HOST_REAL");
    expect(mPool.connect).not.toHaveBeenCalled();
    process.env.ATHOS_PG_HOST = "localhost";
  });

  it("17. erros de pg: 42501 -> PERMISSAO_NEGADA (GRANT), 22001 -> TEXTO_LONGO, ROLLBACK sem COMMIT, release sempre", async () => {
    prepararPg([linha(1)], { falharEm: "INS_CR", codigo: "42501" });
    try {
      await service.baixarTitulos(entrada([1]));
      throw new Error("deveria falhar");
    } catch (e) {
      expect((e as BaixaAthosError).codigo).toBe("PERMISSAO_NEGADA");
      expect((e as BaixaAthosError).message).toContain("GRANT");
    }
    expect(tipos()).toContain("ROLLBACK");
    expect(tipos()).not.toContain("COMMIT");
    expect(mClient.release).toHaveBeenCalledTimes(1);

    prepararPg([linha(1)], { falharEm: "INS_LIVRO", codigo: "22001" });
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("TEXTO_LONGO");
    expect(mClient.release).toHaveBeenCalledTimes(1);

    prepararPg([linha(1)], { falharEm: "UPD_BOLETO", codigo: "XX000" });
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("ERRO_BANCO");
    expect(tipos()).toContain("ROLLBACK");
    expect(tipos()).not.toContain("COMMIT");
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("17b. falha de conexao -> ERRO_BANCO sem vazar detalhes", async () => {
    prepararPg([linha(1)]);
    mPool.connect.mockRejectedValueOnce(new Error("ECONNREFUSED senha=segredo"));
    try {
      await service.baixarTitulos(entrada([1]));
      throw new Error("deveria falhar");
    } catch (e) {
      expect((e as BaixaAthosError).codigo).toBe("ERRO_BANCO");
      expect((e as BaixaAthosError).message).not.toContain("segredo");
    }
  });

  it("17c. SQL gravado nao usa recursos de PostgreSQL > 9.0 e nao interpola valores", async () => {
    prepararPg([linha(1)], { nome: "NOME'; DROP TABLE cliente;--" });
    await service.baixarTitulos(entrada([1], { dataPagamento: "2026-11-05" }));
    for (const c of mClient.query.mock.calls) {
      const sql = c[0] as string;
      expect(sql).not.toMatch(/ON CONFLICT|jsonb|WITH\s+\w+\s+AS/i);
      expect(sql).not.toMatch(/DROP TABLE|COLEGIO|T-1/);
    }
  });

  it("19. conf_financeiro lido uma vez, na mesma transacao e antes de qualquer escrita; titulos em dia nao disparam a leitura", async () => {
    prepararPg([
      linha(1, { datavencimento: "2026-10-27", statusconta: "VEN" }),
      linha(2, { datavencimento: "2026-10-20", statusconta: "VEN" }),
    ]);
    await service.baixarTitulos(entrada([1, 2]));
    const t = tipos();
    expect(t.filter((x) => x === "LER_CONF")).toHaveLength(1);
    expect(t.indexOf("LER_CONF")).toBeGreaterThan(t.indexOf("BEGIN"));
    expect(t.indexOf("LER_CONF")).toBeGreaterThan(t.indexOf("LER_TITULOS"));
    expect(t.indexOf("LER_CONF")).toBeLessThan(t.indexOf("INS_CR"));

    prepararPg([linha(1), linha(2, { datavencimento: HOJE })]);
    await service.baixarTitulos(entrada([1, 2]));
    expect(tipos()).not.toContain("LER_CONF");
  });

  it("20. conf_financeiro sem linha ou com coluna nula/invalida -> CONFIG_ATHOS_INCOMPLETA, ROLLBACK, nenhuma escrita", async () => {
    const atrasado = linha(1, { datavencimento: "2026-10-27", statusconta: "VEN" });
    for (const conf of [null, { taxajurosmes: null, carenciadias: "0" }, { taxajurosmes: "1", carenciadias: null }, { taxajurosmes: "abc", carenciadias: "0" }, { taxajurosmes: "-1", carenciadias: "0" }]) {
      prepararPg([atrasado], { conf });
      expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("CONFIG_ATHOS_INCOMPLETA");
      nenhumaEscrita();
      expect(tipos()).toContain("ROLLBACK");
      expect(tipos()).not.toContain("COMMIT");
    }
  });

  it("21. EFI informa valor nominal em atraso: modo nominal, juros e multa zero, atraso preservado", async () => {
    prepararPg([linha(1, { valor: "457.00", datavencimento: "2026-10-27", statusconta: "VEN" })]);
    const r = await service.baixarTitulos({
      ...entrada([1]),
      titulos: [{ idcontareceber: 1, valorEsperado: 457 }],
      valorPagoEfi: 457,
    });
    expect(r.modo).toBe("nominal");
    const cr = chamadas("INS_CR")[0][1] as unknown[];
    expect([cr[1], cr[3], cr[4], cr[7]]).toEqual(["457.00", "0.00", 10, "0.00"]);
    expect((chamadas("INS_LIVRO")[0][1] as unknown[])[4]).toBe("457.00");
  });

  it("22. EFI diferente de ambos -> VALOR_INCOMPATIVEL, nenhuma escrita, ROLLBACK", async () => {
    prepararPg([linha(1, { valor: "457.00", datavencimento: "2026-10-27", statusconta: "VEN" })]);
    const codigo = await codigoDoErro(
      service.baixarTitulos({ ...entrada([1]), titulos: [{ idcontareceber: 1, valorEsperado: 457 }], valorPagoEfi: 300 }),
    );
    expect(codigo).toBe("VALOR_INCOMPATIVEL");
    nenhumaEscrita();
    expect(tipos()).toContain("ROLLBACK");
    expect(tipos()).not.toContain("COMMIT");
  });

  it("22b. em dia com EFI divergente tambem falha antes de escrever", async () => {
    prepararPg([linha(1)]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1], { valorPagoEfi: 50 })))).toBe("VALOR_INCOMPATIVEL");
    nenhumaEscrita();
  });

  it("23. titulo ja REC no lote: comparacao com a EFI ignorada (cobre titulos que o servico nao grava)", async () => {
    prepararPg([linha(1, { statusconta: "REC" }), linha(2)]);
    const r = await service.baixarTitulos(entrada([1, 2], { valorPagoEfi: 58 }));
    expect(r.resultado).toBe("baixado");
    expect(chamadas("INS_CR")).toHaveLength(1);
  });

  it("24. simulacao com atraso: calcula juros, multa e valorPago sem escrever e sem FOR UPDATE", async () => {
    prepararPg([linha(1, { valor: "457.00", datavencimento: "2026-10-27", statusconta: "VEN" })]);
    const r = await service.baixarTitulos({
      ...entrada([1], { simular: true }),
      titulos: [{ idcontareceber: 1, valorEsperado: 457 }],
    });
    nenhumaEscrita();
    expect(mClient.query.mock.calls[2][0]).not.toMatch(/FOR UPDATE/);
    expect(tipos()).toEqual(["BEGIN", "SET", "LER_TITULOS", "LER_CONF", "LER_CLIENTE", "ROLLBACK"]);
    expect(r.titulos[0]).toMatchObject({ juros: 1.51, multa: 9.14, atraso: 10, valorPago: 467.65 });
  });

  it("25. identificadores de conf_financeiro vem so de CONF_FINANCEIRO_COLUNAS", async () => {
    prepararPg([linha(1, { datavencimento: "2026-10-27", statusconta: "VEN" })]);
    await service.baixarTitulos(entrada([1]));
    const sql = (mClient.query.mock.calls.find((c: unknown[]) => tipo(c[0] as string) === "LER_CONF") as unknown[])[0] as string;
    expect(sql).toContain(CONF_FINANCEIRO_COLUNAS.taxaJurosMes);
    expect(sql).toContain(CONF_FINANCEIRO_COLUNAS.carenciaDias);
    expect(sql.replace(/\s+/g, " ")).toMatch(/FROM conf_financeiro LIMIT 1$/);
  });

  it("26. atraso dentro da carencia (regiao nao validada) -> ATRASO_REQUER_ENCARGOS sem escrever", async () => {
    prepararPg([linha(1, { datavencimento: "2026-11-01", statusconta: "VEN" })], {
      conf: { taxajurosmes: "1", carenciadias: "10" },
    });
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("ATRASO_REQUER_ENCARGOS");
    nenhumaEscrita();
    expect(tipos()).toContain("ROLLBACK");
  });

  it("18. helpers puros", () => {
    expect(hojeSaoPaulo(new Date("2026-11-07T01:30:00Z"))).toBe("2026-11-06");
    expect(hojeSaoPaulo(new Date("2026-11-07T12:00:00Z"))).toBe("2026-11-07");
    expect(formatarValorAthos(0.1 + 0.2)).toBe("0.30");
    expect(formatarValorAthos(29)).toBe("29.00");
    expect(formatarValorAthos(457.5)).toBe("457.50");
  });
});

// ===========================================================================
// Estorno ("Voltar Contas Recebidas") - Fase 43-04. pg falso; nunca o Athos real (D-07).
// ===========================================================================
describe("AthosContaReceberBaixaService.estornarBaixa", () => {
  const envOriginal = { ...process.env };
  let service: AthosContaReceberBaixaService;

  interface TitEst {
    idcontareceber: number;
    idcliente: number;
    valor: string;
    datavencimento: string;
    statusconta: string;
  }

  function tit(id: number, extra: Partial<TitEst> = {}): TitEst {
    return {
      idcontareceber: id,
      idcliente: 2641,
      valor: "457.00",
      datavencimento: "2026-10-27",
      statusconta: "REC",
      ...extra,
    };
  }

  function rec(idcontareceber: number, idcontarecebida: number, valorpago = "457.00") {
    return { idcontareceber, idcontarecebida, valorpago };
  }

  function tipoE(sql: string): string {
    const s = sql.replace(/\s+/g, " ").trim();
    if (/^BEGIN/i.test(s)) return "BEGIN";
    if (/^COMMIT/i.test(s)) return "COMMIT";
    if (/^ROLLBACK/i.test(s)) return "ROLLBACK";
    if (/^SET TRANSACTION/i.test(s)) return "SET";
    if (/^SELECT .* FROM conta_recebida /i.test(s)) return "LER_REC";
    if (/^SELECT .* FROM conta_receber /i.test(s)) return "LER_TIT";
    if (/^DELETE FROM livro_registro_io/i.test(s)) return "DEL_LIVRO";
    if (/^DELETE FROM caixa_entrada/i.test(s)) return "DEL_CAIXA_ENTRADA";
    if (/^DELETE FROM caixa_movimento_recebimento/i.test(s)) return "DEL_CAIXA_MOV";
    if (/^DELETE FROM conta_recebida/i.test(s)) return "DEL_RECEBIDA";
    if (/^DELETE FROM cliente_cartao_preferencial/i.test(s)) return "DEL_CARTAO";
    if (/^UPDATE conta_receber/i.test(s)) return "UPD_CONTA";
    if (/^INSERT INTO log/i.test(s)) return "INS_LOG";
    return `OUTRO:${s}`;
  }

  const tiposE = () => mClient.query.mock.calls.map((c: unknown[]) => tipoE(c[0] as string));
  const chamadasE = (t: string) => mClient.query.mock.calls.filter((c: unknown[]) => tipoE(c[0] as string) === t);

  function prepararEst(
    titulos: TitEst[],
    recebidas: Array<{ idcontareceber: number; idcontarecebida: number; valorpago: string }>,
    opts: { falharEm?: string; codigo?: string } = {},
  ) {
    mClient.query.mockReset();
    mClient.release.mockReset();
    mClient.query.mockImplementation(async (sql: string) => {
      const t = tipoE(sql);
      if (opts.falharEm === t) {
        const err = new Error("erro simulado") as Error & { code: string };
        err.code = opts.codigo ?? "XX000";
        throw err;
      }
      if (t === "LER_TIT") return { rows: titulos };
      if (t === "LER_REC") return { rows: recebidas };
      return { rows: [] };
    });
  }

  const entradaEst = (pares: Array<[number, number]>, extra: Record<string, unknown> = {}) => ({
    idclienteAthos: 2641,
    titulos: pares.map(([idcontareceber, idcontarecebida]) => ({ idcontareceber, idcontarecebida })),
    idFuncionario: 1,
    hoje: HOJE,
    ...extra,
  });

  function nenhumDelete() {
    const dels = mClient.query.mock.calls.filter((c: unknown[]) => /^\s*DELETE\b/i.test(c[0] as string));
    expect(dels).toHaveLength(0);
  }

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos_mock";
    process.env.ATHOS_PG_USER = "usuario_mock";
    process.env.ATHOS_PG_PASS = "senha_mock";
    process.env.ATHOS_PG_PORT = "5432";
    mPool.connect.mockClear();
    mPool.connect.mockResolvedValue(mClient);
    service = new AthosContaReceberBaixaService();
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  it("E1. estorno de 1 titulo: sequencia exata e commit", async () => {
    prepararEst([tit(1302)], [rec(1302, 1294)]);
    const r = await service.estornarBaixa(entradaEst([[1302, 1294]]));
    expect(tiposE()).toEqual([
      "BEGIN",
      "LER_TIT",
      "LER_REC",
      "DEL_LIVRO",
      "DEL_CAIXA_ENTRADA",
      "DEL_CAIXA_MOV",
      "DEL_RECEBIDA",
      "DEL_CARTAO",
      "UPD_CONTA",
      "INS_LOG",
      "COMMIT",
    ]);
    expect(tiposE()).not.toContain("ROLLBACK");
    expect(mClient.release).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ simulado: false, valorTotal: 457 });
    expect(r.titulos[0]).toMatchObject({ idcontareceber: 1302, idcontarecebida: 1294, statusFinal: "VEN" });
    // ids exatos nos DELETE por id
    expect(chamadasE("DEL_LIVRO")[0][1]).toEqual([1294]);
    expect(chamadasE("DEL_CAIXA_ENTRADA")[0][1]).toEqual([1294]);
    expect(chamadasE("DEL_CAIXA_MOV")[0][1]).toEqual([1302]);
    expect(chamadasE("DEL_RECEBIDA")[0][1]).toEqual([1302]);
    // nao toca em boleto nem cliente
    const todos = mClient.query.mock.calls.map((c: unknown[]) => c[0] as string).join("\n");
    expect(todos).not.toMatch(/boleto\s+SET/i);
    expect(todos).not.toMatch(/UPDATE\s+cliente\b/i);
  });

  it("E2. status final: vencido -> VEN; vencimento hoje ou futuro -> AVC", async () => {
    prepararEst([tit(1, { datavencimento: "2026-11-05" })], [rec(1, 11)]);
    await service.estornarBaixa(entradaEst([[1, 11]]));
    expect(chamadasE("UPD_CONTA")[0][1]).toEqual([1, "VEN"]);

    prepararEst([tit(2, { datavencimento: HOJE })], [rec(2, 12)]);
    await service.estornarBaixa(entradaEst([[2, 12]]));
    expect(chamadasE("UPD_CONTA")[0][1]).toEqual([2, "AVC"]);

    prepararEst([tit(3, { datavencimento: "2026-12-01" })], [rec(3, 13)]);
    await service.estornarBaixa(entradaEst([[3, 13]]));
    expect(chamadasE("UPD_CONTA")[0][1]).toEqual([3, "AVC"]);
  });

  it("E3. multi-titulo: uma transacao, DELETE/UPDATE por id proprio, 3 logs, total em centavos", async () => {
    prepararEst(
      [tit(10, { valor: "0.10" }), tit(11, { valor: "0.20" }), tit(12, { valor: "29.00" })],
      [rec(10, 100, "0.10"), rec(11, 101, "0.20"), rec(12, 102, "29.00")],
    );
    const r = await service.estornarBaixa(
      entradaEst([
        [10, 100],
        [11, 101],
        [12, 102],
      ]),
    );
    expect(tiposE().filter((t) => t === "BEGIN")).toHaveLength(1);
    expect(tiposE().filter((t) => t === "COMMIT")).toHaveLength(1);
    expect(chamadasE("INS_LOG")).toHaveLength(3);
    expect(chamadasE("DEL_LIVRO").map((c) => c[1])).toEqual([[100], [101], [102]]);
    expect(chamadasE("DEL_CAIXA_MOV").map((c) => c[1])).toEqual([[10], [11], [12]]);
    expect(chamadasE("UPD_CONTA").map((c) => (c[1] as unknown[])[0])).toEqual([10, 11, 12]);
    expect(r.valorTotal).toBe(29.3);
  });

  it("E4. mensagem do log com virgula decimal e somente ASCII", async () => {
    prepararEst([tit(1302)], [rec(1302, 1294)]);
    await service.estornarBaixa(entradaEst([[1302, 1294]]));
    const [params] = [chamadasE("INS_LOG")[0][1] as unknown[]];
    expect(params[0]).toBe(1);
    expect(params[1]).toBe("Voltou a conta recebida: 1302 Valor: R$ 457,00 Valor Pago: R$ 457,00");
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7E]+$/.test(params[1] as string)).toBe(true);
  });

  it("E4b. valor pago diferente do principal aparece no log (com encargos)", async () => {
    prepararEst([tit(7, { valor: "457.00" })], [rec(7, 70, "467.65")]);
    await service.estornarBaixa(entradaEst([[7, 70]]));
    expect((chamadasE("INS_LOG")[0][1] as unknown[])[1]).toBe(
      "Voltou a conta recebida: 7 Valor: R$ 457,00 Valor Pago: R$ 467,65",
    );
  });

  it("E5. regex do cartao preferencial tem fronteira numerica", async () => {
    prepararEst([tit(13)], [rec(13, 130)]);
    await service.estornarBaixa(entradaEst([[13, 130]]));
    const regex = (chamadasE("DEL_CARTAO")[0][1] as string[])[0];
    expect(regex).toBe("BAIXA CONTA RECEBER(.*[^0-9])?13([^0-9]|$)");
    expect(montarRegexCartaoPreferencial(13)).toBe(regex);
    const re = new RegExp(regex);
    expect(re.test("BAIXA CONTA RECEBER 1302")).toBe(false);
    expect(re.test("BAIXA CONTA RECEBER 913")).toBe(false);
    expect(re.test("BAIXA CONTA RECEBER 13")).toBe(true);
    expect(re.test("BAIXA CONTA RECEBER TIT 13 CLIENTE")).toBe(true);
    expect(() => montarRegexCartaoPreferencial(0)).toThrow(BaixaAthosError);
    expect(() => montarRegexCartaoPreferencial(1.5)).toThrow(BaixaAthosError);
  });

  it("E6. titulo nao REC -> STATUS_INVALIDO, nenhum DELETE, ROLLBACK", async () => {
    prepararEst([tit(1, { statusconta: "AVC" })], [rec(1, 11)]);
    expect(await codigoDoErro(service.estornarBaixa(entradaEst([[1, 11]])))).toBe("STATUS_INVALIDO");
    nenhumDelete();
    expect(tiposE()).toContain("ROLLBACK");
    expect(tiposE()).not.toContain("COMMIT");
  });

  it("E7. inexistente, outro cliente, lista vazia e id repetido", async () => {
    prepararEst([], []);
    expect(await codigoDoErro(service.estornarBaixa(entradaEst([[1, 11]])))).toBe("TITULO_NAO_ENCONTRADO");
    nenhumDelete();

    prepararEst([tit(1, { idcliente: 999 })], [rec(1, 11)]);
    expect(await codigoDoErro(service.estornarBaixa(entradaEst([[1, 11]])))).toBe("CLIENTE_DIVERGENTE");
    nenhumDelete();

    mPool.connect.mockClear();
    expect(await codigoDoErro(service.estornarBaixa(entradaEst([])))).toBe("TITULO_NAO_ENCONTRADO");
    expect(
      await codigoDoErro(
        service.estornarBaixa(
          entradaEst([
            [1, 11],
            [1, 12],
          ]),
        ),
      ),
    ).toBe("TITULO_NAO_ENCONTRADO");
    expect(mPool.connect).not.toHaveBeenCalled();
  });

  it("E8. zero, dois ou outro recebimento -> nada e apagado", async () => {
    prepararEst([tit(1)], []);
    expect(await codigoDoErro(service.estornarBaixa(entradaEst([[1, 11]])))).toBe("RECEBIMENTO_NAO_ENCONTRADO");
    nenhumDelete();

    prepararEst([tit(1)], [rec(1, 11), rec(1, 12)]);
    expect(await codigoDoErro(service.estornarBaixa(entradaEst([[1, 11]])))).toBe("RECEBIMENTO_DIVERGENTE");
    nenhumDelete();

    prepararEst([tit(1)], [rec(1, 99)]);
    expect(await codigoDoErro(service.estornarBaixa(entradaEst([[1, 11]])))).toBe("RECEBIMENTO_DIVERGENTE");
    nenhumDelete();
    expect(tiposE()).toContain("ROLLBACK");
  });

  it("E9. validacao antes de apagar: 3o titulo invalido nao deixa DELETE nos dois primeiros", async () => {
    prepararEst([tit(1), tit(2), tit(3, { statusconta: "AVC" })], [rec(1, 11), rec(2, 12), rec(3, 13)]);
    const cod = await codigoDoErro(
      service.estornarBaixa(
        entradaEst([
          [1, 11],
          [2, 12],
          [3, 13],
        ]),
      ),
    );
    expect(cod).toBe("STATUS_INVALIDO");
    nenhumDelete();
    expect(chamadasE("UPD_CONTA")).toHaveLength(0);
    expect(chamadasE("INS_LOG")).toHaveLength(0);
  });

  it("E10. simulacao: READ ONLY, sem FOR UPDATE, sem escrita, ROLLBACK", async () => {
    prepararEst([tit(1302)], [rec(1302, 1294)]);
    const r = await service.estornarBaixa(entradaEst([[1302, 1294]], { simular: true }));
    expect(tiposE()).toEqual(["BEGIN", "SET", "LER_TIT", "LER_REC", "ROLLBACK"]);
    const textos = mClient.query.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(textos.some((t) => /FOR UPDATE/i.test(t))).toBe(false);
    expect(textos.some((t) => /\b(DELETE|UPDATE|INSERT)\b/i.test(t))).toBe(false);
    expect(r.simulado).toBe(true);
    expect(r.titulos[0]).toMatchObject({ statusFinal: "VEN", principal: 457, valorPago: 457 });
    expect(r.valorTotal).toBe(457);
  });

  it("E10b. fora da simulacao a leitura de conta_receber trava com FOR UPDATE", async () => {
    prepararEst([tit(1)], [rec(1, 11)]);
    await service.estornarBaixa(entradaEst([[1, 11]]));
    const lerTit = chamadasE("LER_TIT")[0][0] as string;
    expect(lerTit).toMatch(/FOR UPDATE/i);
  });

  it("E11. erro 42501 no DELETE de conta_recebida: ROLLBACK, PERMISSAO_NEGADA com GRANT DELETE", async () => {
    prepararEst([tit(1)], [rec(1, 11)], { falharEm: "DEL_RECEBIDA", codigo: "42501" });
    let erro: BaixaAthosError | null = null;
    try {
      await service.estornarBaixa(entradaEst([[1, 11]]));
    } catch (e) {
      erro = e as BaixaAthosError;
    }
    expect(erro?.codigo).toBe("PERMISSAO_NEGADA");
    expect(erro?.message).toMatch(/GRANT DELETE/);
    expect(tiposE()).toContain("ROLLBACK");
    expect(tiposE()).not.toContain("COMMIT");
    expect(tiposE()).not.toContain("UPD_CONTA");
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("E12. trava de ambiente: host real em teste -> AMBIENTE_TESTE_HOST_REAL sem conectar", async () => {
    process.env.ATHOS_PG_HOST = "athos.exemplo.invalid";
    mPool.connect.mockClear();
    expect(await codigoDoErro(service.estornarBaixa(entradaEst([[1, 11]])))).toBe("AMBIENTE_TESTE_HOST_REAL");
    expect(mPool.connect).not.toHaveBeenCalled();
  });

  it("E13. todo DELETE tem WHERE com parametro $1", async () => {
    prepararEst([tit(1), tit(2)], [rec(1, 11), rec(2, 12)]);
    await service.estornarBaixa(
      entradaEst([
        [1, 11],
        [2, 12],
      ]),
    );
    const dels = mClient.query.mock.calls.filter((c: unknown[]) => /^\s*DELETE\b/i.test(c[0] as string));
    expect(dels).toHaveLength(10);
    for (const c of dels) {
      expect(c[0] as string).toMatch(/\bWHERE\b[^;]*\$1/i);
      expect(Array.isArray(c[1])).toBe(true);
      expect((c[1] as unknown[]).length).toBeGreaterThanOrEqual(1);
    }
  });
});
