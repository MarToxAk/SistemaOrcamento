import {
  AthosContaReceberBaixaService,
  BaixaAthosError,
  BaixarTitulosInput,
  formatarValorAthos,
  hojeSaoPaulo,
  montarDescricaoLivro,
  sanitizarTextoAthos,
} from "./athos-conta-receber-baixa.service";

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

function prepararPg(linhas: LinhaFake[], opts: { falharEm?: string; codigo?: string; nome?: string } = {}) {
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

  it("12. atraso -> ATRASO_REQUER_ENCARGOS sem escrever", async () => {
    prepararPg([linha(1, { datavencimento: "2026-11-01", statusconta: "VEN" })]);
    expect(await codigoDoErro(service.baixarTitulos(entrada([1])))).toBe("ATRASO_REQUER_ENCARGOS");
    nenhumaEscrita();
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

  it("18. helpers puros", () => {
    expect(hojeSaoPaulo(new Date("2026-11-07T01:30:00Z"))).toBe("2026-11-06");
    expect(hojeSaoPaulo(new Date("2026-11-07T12:00:00Z"))).toBe("2026-11-07");
    expect(formatarValorAthos(0.1 + 0.2)).toBe("0.30");
    expect(formatarValorAthos(29)).toBe("29.00");
    expect(formatarValorAthos(457.5)).toBe("457.50");
  });
});
