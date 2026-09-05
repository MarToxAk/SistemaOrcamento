import { CobrancaService } from "./cobranca.service";

describe("CobrancaService.buscarBoletosDashboard", () => {
  let service: CobrancaService;

  beforeEach(() => {
    service = Object.create(CobrancaService.prototype);
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).prisma = {
      cobrancaBoleto: { findMany: jest.fn() },
      nfseEmitidaTitulo: { findMany: jest.fn() },
    };
    (service as any).athosService = {
      buscarNomesClientes: jest.fn(),
    };
  });

  function boleto(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 1,
      idclienteAthos: 10,
      status: "pendente",
      valor: 100,
      expireAt: "2026-09-10",
      linkBoleto: "http://example.com/boleto",
      criadoEm: new Date("2026-09-01T00:00:00Z"),
      titulos: [],
      ...overrides,
    };
  }

  it("resolve o nome de cada cliente em uma unica chamada em lote ao Athos", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({ id: 1, idclienteAthos: 10 }),
      boleto({ id: 2, idclienteAthos: 20 }),
      boleto({ id: 3, idclienteAthos: 10 }),
    ]);
    (service as any).athosService.buscarNomesClientes.mockResolvedValue([
      { idcliente: 10, nome_cliente: "Cliente A" },
      { idcliente: 20, nome_cliente: "Cliente B" },
    ]);

    const result = await service.buscarBoletosDashboard();

    expect((service as any).athosService.buscarNomesClientes).toHaveBeenCalledTimes(1);
    const idsChamados = (service as any).athosService.buscarNomesClientes.mock.calls[0][0] as number[];
    expect(idsChamados).toHaveLength(2);
    expect(new Set(idsChamados)).toEqual(new Set([10, 20]));

    expect(result.find((r) => r.id === 1)?.nomeCliente).toBe("Cliente A");
    expect(result.find((r) => r.id === 2)?.nomeCliente).toBe("Cliente B");
    expect(result.find((r) => r.id === 3)?.nomeCliente).toBe("Cliente A");
  });

  it("usa 'Cliente #<id>' quando o Athos nao devolve nome para aquele id", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({ id: 1, idclienteAthos: 10 }),
      boleto({ id: 2, idclienteAthos: 20 }),
    ]);
    (service as any).athosService.buscarNomesClientes.mockResolvedValue([]);

    const result = await service.buscarBoletosDashboard();

    expect(result.find((r) => r.id === 1)?.nomeCliente).toBe("Cliente #10");
    expect(result.find((r) => r.id === 2)?.nomeCliente).toBe("Cliente #20");
  });

  it("nao inclui boletos cancelados", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([]);
    (service as any).athosService.buscarNomesClientes.mockResolvedValue([]);

    await service.buscarBoletosDashboard();

    expect((service as any).prisma.cobrancaBoleto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { not: "cancelado" } } }),
    );
  });

  it("calcula diasParaVencer negativo para boleto vencido e null quando expireAt e null", async () => {
    const passado = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({ id: 1, idclienteAthos: 10, expireAt: passado }),
      boleto({ id: 2, idclienteAthos: 10, expireAt: null }),
    ]);
    (service as any).athosService.buscarNomesClientes.mockResolvedValue([
      { idcliente: 10, nome_cliente: "Cliente A" },
    ]);

    const result = await service.buscarBoletosDashboard();

    const vencido = result.find((r) => r.id === 1);
    const semData = result.find((r) => r.id === 2);
    expect(vencido?.diasParaVencer).not.toBeNull();
    expect(vencido?.diasParaVencer as number).toBeLessThan(0);
    expect(semData?.diasParaVencer).toBeNull();
  });

  it("ordena por expireAt ascendente com expireAt null por ultimo", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({ id: 1, idclienteAthos: 10, expireAt: "2026-09-20" }),
      boleto({ id: 2, idclienteAthos: 10, expireAt: null }),
      boleto({ id: 3, idclienteAthos: 10, expireAt: "2026-09-05" }),
    ]);
    (service as any).athosService.buscarNomesClientes.mockResolvedValue([
      { idcliente: 10, nome_cliente: "Cliente A" },
    ]);

    const result = await service.buscarBoletosDashboard();

    expect(result.map((r) => r.id)).toEqual([3, 1, 2]);
  });
});
