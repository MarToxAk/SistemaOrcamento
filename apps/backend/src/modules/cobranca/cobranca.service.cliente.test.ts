import { CobrancaService } from "./cobranca.service";

describe("CobrancaService.buscarNfseEmitidaCliente", () => {
  let service: CobrancaService;
  let prisma: {
    nfseEmitida: { findMany: jest.Mock };
  };

  beforeEach(() => {
    service = Object.create(CobrancaService.prototype);
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    prisma = {
      nfseEmitida: { findMany: jest.fn() },
    };
    (service as any).prisma = prisma;
  });

  it("deve retornar 2 NFS-e para cliente com 2 registros, com titulos mapeados", async () => {
    const mockResult = [
      {
        id: 10,
        numeroNfse: "42",
        numeroRps: 42,
        valorServico: { toNumber: () => 250.0 } as any,
        linkNfse: "https://nfse.example.com/42",
        dataEmissao: new Date("2026-05-01T10:00:00Z"),
        titulos: [
          { idcontareceber: 1001 },
          { idcontareceber: 1002 },
        ],
      },
      {
        id: 11,
        numeroNfse: "43",
        numeroRps: 43,
        valorServico: { toNumber: () => 100.5 } as any,
        linkNfse: null,
        dataEmissao: new Date("2026-04-20T10:00:00Z"),
        titulos: [
          { idcontareceber: 1003 },
        ],
      },
    ];

    prisma.nfseEmitida.findMany.mockResolvedValue(mockResult);

    const resultado = await service.buscarNfseEmitidaCliente(999);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual({
      id: 10,
      numeroNfse: "42",
      numeroRps: 42,
      valorServico: 250.0,
      linkNfse: "https://nfse.example.com/42",
      dataEmissao: new Date("2026-05-01T10:00:00Z"),
      titulos: [1001, 1002],
    });
    expect(resultado[1]).toEqual({
      id: 11,
      numeroNfse: "43",
      numeroRps: 43,
      valorServico: 100.5,
      linkNfse: null,
      dataEmissao: new Date("2026-04-20T10:00:00Z"),
      titulos: [1003],
    });

    expect(prisma.nfseEmitida.findMany).toHaveBeenCalledWith({
      where: { idclienteAthos: 999 },
      orderBy: { dataEmissao: "desc" },
      include: { titulos: { select: { idcontareceber: true } } },
    });
  });

  it("deve retornar array vazio para cliente sem NFS-e", async () => {
    prisma.nfseEmitida.findMany.mockResolvedValue([]);

    const resultado = await service.buscarNfseEmitidaCliente(123);

    expect(resultado).toEqual([]);
    expect(prisma.nfseEmitida.findMany).toHaveBeenCalledTimes(1);
  });

  it("deve converter valorServico de Decimal para Number", async () => {
    const decimalMock = { toNumber: () => 999 } as any;
    prisma.nfseEmitida.findMany.mockResolvedValue([
      {
        id: 1,
        numeroNfse: "1",
        numeroRps: 1,
        valorServico: decimalMock,
        linkNfse: null,
        dataEmissao: new Date("2026-01-01T00:00:00Z"),
        titulos: [],
      },
    ]);

    const resultado = await service.buscarNfseEmitidaCliente(1);

    expect(typeof resultado[0].valorServico).toBe("number");
    expect(resultado[0].valorServico).toBe(999);
  });
});
