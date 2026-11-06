import { AthosContaReceberBaixaService } from "../integrations/athos/athos-conta-receber-baixa.service";
import { CobrancaBaixaAthosService } from "./cobranca-baixa-athos.service";
import { CobrancaService } from "./cobranca.service";

// D-07: este teste NUNCA toca o Athos real. pg e axios sao mockados por completo.
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn() };
  return { Pool: jest.fn(() => mPool), __mClient: mClient, __mPool: mPool };
});
jest.mock("axios");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const axios = require("axios");

const mClient = pgMock.__mClient as { query: jest.Mock; release: jest.Mock };

function somarDias(base: Date, dias: number): string {
  const d = new Date(base.getTime() + dias * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Classifica o texto SQL emitido para facilitar as asserções de ordem. */
function classificar(sql: string): string {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/^BEGIN/i.test(s)) return "BEGIN";
  if (/^COMMIT/i.test(s)) return "COMMIT";
  if (/^ROLLBACK/i.test(s)) return "ROLLBACK";
  if (/^SET TRANSACTION/i.test(s)) return "SET";
  if (/^SELECT .* FROM conta_receber/i.test(s)) return "LER_TITULOS";
  if (/^SELECT .* FROM cliente /i.test(s)) return "LER_CLIENTE";
  if (/^INSERT INTO conta_recebida/i.test(s)) return "INS_CONTA_RECEBIDA";
  if (/^INSERT INTO livro_registro_io/i.test(s)) return "INS_LIVRO";
  if (/^INSERT INTO log/i.test(s)) return "INS_LOG";
  if (/^UPDATE conta_receber/i.test(s)) return "UPD_CONTA_RECEBER";
  if (/^UPDATE boleto/i.test(s)) return "UPD_BOLETO";
  if (/^UPDATE cliente/i.test(s)) return "UPD_CLIENTE";
  return `OUTRO:${s.slice(0, 40)}`;
}

function montarCenario(opts?: { falharEm?: string }) {
  const vencimento = somarDias(new Date(), 5);
  mClient.query.mockReset();
  mClient.release.mockReset();
  mClient.query.mockImplementation(async (sql: string) => {
    const tipo = classificar(sql);
    if (opts?.falharEm === tipo) {
      const err = new Error("permission denied") as Error & { code: string };
      err.code = "42501";
      throw err;
    }
    switch (tipo) {
      case "LER_TITULOS":
        return {
          rows: [
            {
              idcontareceber: 1363,
              idcliente: 2641,
              numerotitulo: "34366-1",
              valor: "29.00",
              datavencimento: vencimento,
              statusconta: "AVC",
            },
          ],
        };
      case "LER_CLIENTE":
        return { rows: [{ nome_cliente: "COLEGIO OBJETIVO" }] };
      case "INS_CONTA_RECEBIDA":
        return { rows: [{ idcontarecebida: 5001 }] };
      default:
        return { rows: [] };
    }
  });

  const get = jest.fn(async (url: string) => {
    if (url.startsWith("/v1/notification/")) {
      return { data: { data: { charge: { charge_id: 9001, status: "paid" } } } };
    }
    if (url.startsWith("/v1/charge/")) {
      return { data: { data: { status: "paid" } } };
    }
    throw new Error(`url inesperada ${url}`);
  });
  const post = jest.fn(async () => ({ data: { access_token: "tok" } }));
  axios.create = jest.fn(() => ({ post, get }));

  const prisma = {
    cobrancaBoleto: {
      findFirst: jest.fn().mockResolvedValue({ id: 7, status: "pendente", txidEfi: "9001", idclienteAthos: 2641 }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        id: 7,
        status: "pago",
        idclienteAthos: 2641,
        titulos: [{ idcontareceber: 1363, valor: "29.00" }],
      }),
    },
    cobrancaBaixaAthosLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const config = {
    get: jest.fn((chave: string) => {
      if (chave === "EFI_CLIENT_ID") return "id-ficticio";
      if (chave === "EFI_CLIENT_SECRET") return "segredo-ficticio";
      return undefined;
    }),
  };

  const baixaService = new AthosContaReceberBaixaService();
  const orquestrador = new CobrancaBaixaAthosService(prisma as any, baixaService, config as any);
  const orqLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (orquestrador as any).logger = orqLogger;

  const service = Object.create(CobrancaService.prototype) as CobrancaService;
  const svcLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (service as any).logger = svcLogger;
  (service as any).prisma = prisma;
  (service as any).config = config;
  (service as any).baixaAthos = orquestrador;

  return { service, prisma, orqLogger, svcLogger };
}

describe("tracer: webhook EFI paid -> gancho -> servico Athos -> SQL de Baixar Contas", () => {
  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos_mock";
    process.env.ATHOS_PG_USER = "usuario_mock";
    process.env.ATHOS_PG_PASS = "senha_mock";
    process.env.ATHOS_PG_PORT = "5432";
  });

  it("T1. webhook paid com 1 titulo em dia -> uma unica transacao com a sequencia exata de SQL", async () => {
    const { service, prisma } = montarCenario();

    await expect(service.processarNotificacaoEFI("tok-notificacao")).resolves.toBeUndefined();

    // plano 43-03: alem do pago, o orquestrador grava data/valor da EFI e o resultado da baixa (athosBaixa*)
    const gravacoesPago = prisma.cobrancaBoleto.update.mock.calls.filter((c: any[]) => c[0].data.status === "pago");
    expect(gravacoesPago).toHaveLength(1);
    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: "pago" } });

    // pago foi gravado ANTES de qualquer query ao pg
    const ordemUpdate = prisma.cobrancaBoleto.update.mock.invocationCallOrder[0];
    const ordemPrimeiraQuery = mClient.query.mock.invocationCallOrder[0];
    expect(ordemUpdate).toBeLessThan(ordemPrimeiraQuery);

    const tipos = mClient.query.mock.calls.map((c: unknown[]) => classificar(c[0] as string));
    expect(tipos).toEqual([
      "BEGIN",
      "LER_TITULOS",
      "LER_CLIENTE",
      "INS_CONTA_RECEBIDA",
      "INS_LIVRO",
      "UPD_CONTA_RECEBER",
      "UPD_BOLETO",
      "UPD_CLIENTE",
      "COMMIT",
    ]);
    expect(tipos).not.toContain("ROLLBACK");
    expect(mClient.release).toHaveBeenCalledTimes(1);

    const porTipo = (t: string) => mClient.query.mock.calls.find((c: unknown[]) => classificar(c[0] as string) === t)!;
    const contaRecebida = porTipo("INS_CONTA_RECEBIDA");
    expect(contaRecebida[0]).toContain("RETURNING idcontarecebida");
    expect(contaRecebida[1]).toContain("29.00");
    expect(contaRecebida[1]).toContain(1); // idfuncionario
    expect(contaRecebida[1]).toContain(10); // forma de pagamento

    const livro = porTipo("INS_LIVRO");
    expect(livro[1]).toEqual(
      expect.arrayContaining([2, "Rec. Titulo 34366-1 - Cliente: COLEGIO OBJETIVO", "29.00", 5001]),
    );

    expect(porTipo("UPD_CONTA_RECEBER")[0]).toContain("statusconta = 'REC'");
  });

  it("T2. falha do pg no meio nao desfaz o pago nem propaga", async () => {
    const { service, prisma, orqLogger } = montarCenario({ falharEm: "INS_LIVRO" });

    await expect(service.processarNotificacaoEFI("tok-notificacao")).resolves.toBeUndefined();

    // plano 43-03: alem do pago, o orquestrador grava data/valor da EFI e o resultado da baixa (athosBaixa*)
    const gravacoesPago = prisma.cobrancaBoleto.update.mock.calls.filter((c: any[]) => c[0].data.status === "pago");
    expect(gravacoesPago).toHaveLength(1);
    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: "pago" } });

    const tipos = mClient.query.mock.calls.map((c: unknown[]) => classificar(c[0] as string));
    expect(tipos).toContain("ROLLBACK");
    expect(tipos).not.toContain("COMMIT");
    expect(mClient.release).toHaveBeenCalledTimes(1);
    expect(orqLogger.error).toHaveBeenCalled();
  });
});
