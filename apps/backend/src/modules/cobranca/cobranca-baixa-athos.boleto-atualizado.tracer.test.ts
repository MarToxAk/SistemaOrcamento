import {
  AthosContaReceberBaixaService,
  formatarValorAthos,
  hojeSaoPaulo,
} from "../integrations/athos/athos-conta-receber-baixa.service";
import { CobrancaBaixaAthosService } from "./cobranca-baixa-athos.service";
import { somarDias } from "./cobranca-aviso-vencimento.util";

// D-07: este teste NUNCA toca o Athos real. pg e mockado por completo.
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn() };
  return { Pool: jest.fn(() => mPool), __mClient: mClient, __mPool: mPool };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
const mClient = pgMock.__mClient as { query: jest.Mock; release: jest.Mock };

/** Classifica o texto SQL emitido para facilitar as asserções de ordem. */
function classificar(sql: string): string {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/^BEGIN/i.test(s)) return "BEGIN";
  if (/^COMMIT/i.test(s)) return "COMMIT";
  if (/^ROLLBACK/i.test(s)) return "ROLLBACK";
  if (/^SET TRANSACTION/i.test(s)) return "SET";
  if (/FROM conf_financeiro/i.test(s)) return "LER_CONF";
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

function montarCenario() {
  const hoje = hojeSaoPaulo();
  const vencimentoOriginal = somarDias(hoje, -8);
  mClient.query.mockReset();
  mClient.release.mockReset();
  mClient.query.mockImplementation(async (sql: string) => {
    const tipo = classificar(sql);
    switch (tipo) {
      case "LER_TITULOS":
        return {
          rows: [
            {
              idcontareceber: 1363,
              idcliente: 2641,
              numerotitulo: "34366-1",
              valor: "1000.00",
              datavencimento: vencimentoOriginal,
              statusconta: "VEN",
            },
          ],
        };
      case "LER_CONF":
        // se fosse usado, mudaria o resultado (taxa 1 / carencia 5 recusaria o valor)
        return { rows: [{ taxajurosmes: "1", carenciadias: "5" }] };
      case "LER_CLIENTE":
        return { rows: [{ nome_cliente: "COLEGIO OBJETIVO" }] };
      case "INS_CONTA_RECEBIDA":
        return { rows: [{ idcontarecebida: 5001 }] };
      default:
        return { rows: [] };
    }
  });

  const prisma = {
    cobrancaBoleto: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        id: 42,
        status: "pago",
        idclienteAthos: 2641,
        boletoOrigemId: 41,
        expireAt: hoje,
        taxaJurosMesPosVencimento: "0.9900",
        multaPercentualPosVencimento: "2.0000",
        athosBaixaStatus: null,
        titulos: [
          {
            idcontareceber: 1363,
            valor: "1000.00",
            juros: "2.64",
            multa: "20.00",
            diasAtraso: 8,
            vencimentoOriginal,
          },
        ],
      }),
    },
    cobrancaBaixaAthosLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const config = { get: jest.fn(() => undefined) };

  const baixaService = new AthosContaReceberBaixaService();
  const orquestrador = new CobrancaBaixaAthosService(prisma as any, baixaService, config as any);
  (orquestrador as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { orquestrador, prisma, hoje };
}

describe("tracer: boleto atualizado pago -> orquestrador -> servico Athos -> conta_recebida (D-09)", () => {
  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos_mock";
    process.env.ATHOS_PG_USER = "usuario_mock";
    process.env.ATHOS_PG_PASS = "senha_mock";
    process.env.ATHOS_PG_PORT = "5432";
  });

  it("A1. paid_value 102264 baixa o titulo original com juros 2,64 / multa 20,00 / atraso 8, sem ler conf_financeiro", async () => {
    const { orquestrador, prisma, hoje } = montarCenario();

    const r: any = await orquestrador.executarAposPagamento(42, {
      origem: "webhook",
      payloadEfi: { payment: { paid_at: `${hoje} 10:00:00`, paid_value: 102264 } },
    });

    expect(r.status).toBe("baixado");
    expect(r.detalhe.modo).toBe("com_encargos");
    expect(r.detalhe.titulos[0]).toMatchObject({ juros: 2.64, multa: 20, atraso: 8, valorPago: 1022.64 });

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
    expect(tipos).not.toContain("LER_CONF");

    const ins = mClient.query.mock.calls.find((c: unknown[]) => classificar(c[0] as string) === "INS_CONTA_RECEBIDA")!;
    expect(ins[1]).toEqual([
      1363,
      formatarValorAthos(1022.64),
      `${hoje} 00:00:00`,
      formatarValorAthos(2.64),
      8,
      1, // idfuncionario (padrao)
      10, // forma de pagamento (padrao)
      formatarValorAthos(20),
    ]);

    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ athosBaixaStatus: "baixado" }) }),
    );
  });

  it("A2. pagou so o principal (100000) -> falha VALOR_INCOMPATIVEL, sem INSERT, com ROLLBACK", async () => {
    const { orquestrador, prisma, hoje } = montarCenario();

    const r: any = await orquestrador.executarAposPagamento(42, {
      origem: "webhook",
      payloadEfi: { payment: { paid_at: `${hoje} 10:00:00`, paid_value: 100000 } },
    });

    expect(r.status).toBe("falha");
    expect(r.codigo).toBe("VALOR_INCOMPATIVEL");

    const tipos = mClient.query.mock.calls.map((c: unknown[]) => classificar(c[0] as string));
    expect(tipos).not.toContain("INS_CONTA_RECEBIDA");
    expect(tipos).not.toContain("COMMIT");
    expect(tipos).toContain("ROLLBACK");

    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ athosBaixaStatus: "falha", athosBaixaErroCodigo: "VALOR_INCOMPATIVEL" }),
      }),
    );
  });
});
