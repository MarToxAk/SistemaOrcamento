import { Test, TestingModule } from "@nestjs/testing";
import { AthosListenerService } from "./athos-listener.service";

// Mock pg Client
const mockClientOn = jest.fn();
const mockClientConnect = jest.fn();
const mockClientQuery = jest.fn();
const mockClientEnd = jest.fn();

jest.mock("pg", () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockClientConnect,
    query: mockClientQuery,
    on: mockClientOn,
    end: mockClientEnd,
  })),
}));

const mockPrisma = {
  quote: {
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockEventsService = {
  emitCaixaPayment: jest.fn(),
};

const mockQuotesService = {
  confirmarPagamentoCaixa: jest.fn(),
};

const activeServices: AthosListenerService[] = [];

function buildService(): Promise<AthosListenerService> {
  return Test.createTestingModule({
    providers: [
      AthosListenerService,
      { provide: "PrismaService", useValue: mockPrisma },
      { provide: "EventsService", useValue: mockEventsService },
      { provide: "QuotesService", useValue: mockQuotesService },
    ],
  })
    .overrideProvider(AthosListenerService)
    .useFactory({
      factory: () =>
        new AthosListenerService(
          mockPrisma as any,
          mockEventsService as any,
          mockQuotesService as any,
        ),
    })
    .compile()
    .then((m) => {
      const service = m.get(AthosListenerService);
      activeServices.push(service);
      return service;
    });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Variáveis de ambiente mínimas para o listener habilitar
  process.env.ATHOS_PG_HOST = "localhost";
  process.env.ATHOS_PG_DB = "athos";
  process.env.ATHOS_PG_USER = "user";
  process.env.ATHOS_PG_PASS = "pass";
  process.env.ATHOS_PG_PORT = "5432";

  mockClientConnect.mockResolvedValue(undefined);
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockClientEnd.mockResolvedValue(undefined);
  // Captura handlers sem disparar
  mockClientOn.mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.ATHOS_PG_HOST;
  delete process.env.ATHOS_PG_DB;
  delete process.env.ATHOS_PG_USER;
  delete process.env.ATHOS_PG_PASS;
});

afterEach(async () => {
  while (activeServices.length > 0) {
    const service = activeServices.pop();
    if (service) {
      await service.onApplicationShutdown();
    }
  }
});

describe("AthosListenerService - onApplicationBootstrap", () => {
  it("deve desativar listener quando variaveis ATHOS_PG_* estao ausentes", async () => {
    delete process.env.ATHOS_PG_HOST;
    const svc = await buildService();
    await svc.onApplicationBootstrap();
    expect(mockClientConnect).not.toHaveBeenCalled();
  });

  it("deve conectar e executar LISTEN quando variaveis estao configuradas", async () => {
    const svc = await buildService();
    await svc.onApplicationBootstrap();
    expect(mockClientConnect).toHaveBeenCalledTimes(1);
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining("LISTEN"));
  });

  it("deve registrar handler de notification e error no client", async () => {
    const svc = await buildService();
    await svc.onApplicationBootstrap();
    const registeredEvents = mockClientOn.mock.calls.map((c) => c[0] as string);
    expect(registeredEvents).toContain("notification");
    expect(registeredEvents).toContain("error");
  });
});

describe("AthosListenerService - handleNotification", () => {
  it("deve chamar persistPaymentNote e emitCaixaPayment quando caixa detectado", async () => {
    mockPrisma.quote.updateMany.mockResolvedValue({ count: 1 });
    mockQuotesService.confirmarPagamentoCaixa.mockResolvedValue(undefined);

    // Simula query retornando relacao e venda com caixa
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // LISTEN
      .mockResolvedValueOnce({ rows: [{ idvenda: 10, idorcamento: 5 }] })
      .mockResolvedValueOnce({ rows: [{ numeroordem: "001", idcaixamovimento: 99 }] });

    const svc = await buildService();
    await svc.onApplicationBootstrap();

    // Acessa método privado para teste
    await (svc as any).handleNotification();

    expect(mockPrisma.quote.updateMany).toHaveBeenCalledTimes(1);
    expect(mockEventsService.emitCaixaPayment).toHaveBeenCalledWith(
      expect.objectContaining({ idVenda: 10, numeroordem: "001" }),
    );
  });

  it("deve retornar sem chamar updateMany quando relacao_orcamento_venda vazia", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // LISTEN
      .mockResolvedValueOnce({ rows: [] }); // relacao vazia

    const svc = await buildService();
    await svc.onApplicationBootstrap();
    await (svc as any).handleNotification();

    expect(mockPrisma.quote.updateMany).not.toHaveBeenCalled();
    expect(mockEventsService.emitCaixaPayment).not.toHaveBeenCalled();
  });

  it("deve retornar sem chamar updateMany quando venda nao e pagamento no caixa", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // LISTEN
      .mockResolvedValueOnce({ rows: [{ idvenda: 10, idorcamento: 5 }] })
      .mockResolvedValueOnce({ rows: [{ numeroordem: "002", idcaixamovimento: null }] });

    const svc = await buildService();
    await svc.onApplicationBootstrap();
    await (svc as any).handleNotification();

    expect(mockPrisma.quote.updateMany).not.toHaveBeenCalled();
  });

  it("deve logar erro sem propagar quando persistPaymentNote lanca excecao", async () => {
    mockPrisma.quote.updateMany.mockRejectedValue(new Error("db error"));
    mockQuotesService.confirmarPagamentoCaixa.mockResolvedValue(undefined);

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // LISTEN
      .mockResolvedValueOnce({ rows: [{ idvenda: 10, idorcamento: 5 }] })
      .mockResolvedValueOnce({ rows: [{ numeroordem: "003", idcaixamovimento: 1 }] });

    const svc = await buildService();
    await svc.onApplicationBootstrap();

    // Não deve lançar — erro é capturado internamente
    await expect((svc as any).handleNotification()).resolves.toBeUndefined();
    // SSE deve ser emitido mesmo assim
    expect(mockEventsService.emitCaixaPayment).toHaveBeenCalled();
  });
});

describe("AthosListenerService - reconexão (CAIXA-01)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("deve chamar scheduleReconnect quando client emite error", async () => {
    const svc = await buildService();
    await svc.onApplicationBootstrap();

    const scheduleSpy = jest.spyOn(svc as any, "scheduleReconnect");

    // Dispara o handler de error registrado
    const errorHandler = mockClientOn.mock.calls.find((c) => c[0] === "error")?.[1] as (err: Error) => void;
    expect(errorHandler).toBeDefined();
    errorHandler(new Error("connection lost"));

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it("deve limpar reconnectTimer no shutdown para evitar reconexao pos-encerramento", async () => {
    const svc = await buildService();
    await svc.onApplicationBootstrap();

    // Dispara reconexão pendente
    const errorHandler = mockClientOn.mock.calls.find((c) => c[0] === "error")?.[1] as (err: Error) => void;
    errorHandler?.(new Error("dropped"));

    // Shutdown cancela o timer antes de disparar
    await svc.onApplicationShutdown();

    const connectCallsBefore = mockClientConnect.mock.calls.length;
    jest.runAllTimers();
    expect(mockClientConnect.mock.calls.length).toBe(connectCallsBefore);
  });
});

describe("AthosListenerService - onApplicationShutdown", () => {
  it("deve encerrar o client pg graciosamente", async () => {
    const svc = await buildService();
    await svc.onApplicationBootstrap();
    await svc.onApplicationShutdown();
    expect(mockClientEnd).toHaveBeenCalledTimes(1);
  });
});
