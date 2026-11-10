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

  it("marca nfseStatus=completa quando todos os titulos do boleto tem NFS-e emitida", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({
        id: 1,
        idclienteAthos: 10,
        titulos: [{ idcontareceber: 100 }, { idcontareceber: 101 }],
      }),
    ]);
    (service as any).athosService.buscarNomesClientes.mockResolvedValue([
      { idcliente: 10, nome_cliente: "Cliente A" },
    ]);
    (service as any).prisma.nfseEmitidaTitulo.findMany.mockResolvedValue([
      { idcontareceber: 100, nfseEmitidaId: 1, nfseEmitida: { numeroNfse: "1", linkNfse: null } },
      { idcontareceber: 101, nfseEmitidaId: 2, nfseEmitida: { numeroNfse: "2", linkNfse: null } },
    ]);

    const result = await service.buscarBoletosDashboard();

    expect(result[0].nfseStatus).toBe("completa");
  });

  it("marca nfseStatus=parcial quando apenas parte dos titulos tem NFS-e emitida", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({
        id: 1,
        idclienteAthos: 10,
        titulos: [{ idcontareceber: 100 }, { idcontareceber: 101 }],
      }),
    ]);
    (service as any).athosService.buscarNomesClientes.mockResolvedValue([
      { idcliente: 10, nome_cliente: "Cliente A" },
    ]);
    (service as any).prisma.nfseEmitidaTitulo.findMany.mockResolvedValue([
      { idcontareceber: 100, nfseEmitidaId: 1, nfseEmitida: { numeroNfse: "1", linkNfse: null } },
    ]);

    const result = await service.buscarBoletosDashboard();

    expect(result[0].nfseStatus).toBe("parcial");
  });

  it("marca nfseStatus=pendente quando nenhum titulo tem NFS-e emitida, e tambem quando o boleto nao tem titulo algum", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({
        id: 1,
        idclienteAthos: 10,
        titulos: [{ idcontareceber: 100 }],
      }),
      boleto({
        id: 2,
        idclienteAthos: 10,
        titulos: [],
      }),
    ]);
    (service as any).athosService.buscarNomesClientes.mockResolvedValue([
      { idcliente: 10, nome_cliente: "Cliente A" },
    ]);
    (service as any).prisma.nfseEmitidaTitulo.findMany.mockResolvedValue([]);

    const result = await service.buscarBoletosDashboard();

    expect(result.find((r) => r.id === 1)?.nfseStatus).toBe("pendente");
    expect(result.find((r) => r.id === 2)?.nfseStatus).toBe("pendente");
  });

  it("consulta o estado de NFS-e uma unica vez para todos os boletos", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({ id: 1, idclienteAthos: 10, titulos: [{ idcontareceber: 100 }] }),
      boleto({ id: 2, idclienteAthos: 10, titulos: [{ idcontareceber: 101 }] }),
      boleto({ id: 3, idclienteAthos: 10, titulos: [{ idcontareceber: 102 }] }),
    ]);
    (service as any).athosService.buscarNomesClientes.mockResolvedValue([
      { idcliente: 10, nome_cliente: "Cliente A" },
    ]);
    (service as any).prisma.nfseEmitidaTitulo.findMany.mockResolvedValue([]);

    await service.buscarBoletosDashboard();

    expect((service as any).prisma.nfseEmitidaTitulo.findMany).toHaveBeenCalledTimes(1);
    const args = (service as any).prisma.nfseEmitidaTitulo.findMany.mock.calls[0][0];
    expect(new Set(args.where.idcontareceber.in)).toEqual(new Set([100, 101, 102]));
  });
});

describe("CobrancaService.buscarBoletosDashboard - situacao de vencimento e ultimo aviso (Fase 45)", () => {
  let service: CobrancaService;

  // 2026-11-11T02:30:00Z = 23:30 de 10/11 em Sao Paulo (UTC-3)
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-11-11T02:30:00Z") });
    service = Object.create(CobrancaService.prototype);
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).prisma = {
      cobrancaBoleto: { findMany: jest.fn() },
      nfseEmitidaTitulo: { findMany: jest.fn() },
    };
    (service as any).athosService = {
      buscarNomesClientes: jest.fn().mockResolvedValue([{ idcliente: 10, nome_cliente: "Cliente A" }]),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function boleto(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 1,
      idclienteAthos: 10,
      status: "pendente",
      valor: 100,
      expireAt: "2026-11-10",
      linkBoleto: "http://example.com/boleto",
      criadoEm: new Date("2026-11-01T00:00:00Z"),
      titulos: [],
      ...overrides,
    };
  }

  it("D1 hoje em Sao Paulo: boleto que vence hoje as 23:30 de SP e vence_hoje, nao atrasado", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([boleto({ expireAt: "2026-11-10" })]);

    const result = await service.buscarBoletosDashboard();

    expect(result[0].diasParaVencer).toBe(0);
    expect(result[0].situacaoVencimento).toBe("vence_hoje");
  });

  it("D2 classificacao: janela de 1 a 3 dias, atrasado, fora da janela, nao pendente e sem data", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({ id: 1, expireAt: "2026-11-13" }),
      boleto({ id: 2, expireAt: "2026-11-11" }),
      boleto({ id: 3, expireAt: "2026-11-14" }),
      boleto({ id: 4, expireAt: "2026-11-09" }),
      boleto({ id: 5, expireAt: "2026-11-01", status: "pago" }),
      boleto({ id: 6, expireAt: null }),
    ]);

    const result = await service.buscarBoletosDashboard();
    const por = (id: number) => result.find((r) => r.id === id)!;

    expect([por(1).diasParaVencer, por(1).situacaoVencimento]).toEqual([3, "a_vencer"]);
    expect([por(2).diasParaVencer, por(2).situacaoVencimento]).toEqual([1, "a_vencer"]);
    expect([por(3).diasParaVencer, por(3).situacaoVencimento]).toEqual([4, null]);
    expect([por(4).diasParaVencer, por(4).situacaoVencimento]).toEqual([-1, "atrasado"]);
    expect(por(5).situacaoVencimento).toBeNull();
    expect([por(6).diasParaVencer, por(6).situacaoVencimento]).toEqual([null, null]);
  });

  it("D3 ultimo aviso: devolve o aviso mais recente e null quando nao ha aviso", async () => {
    const aviso = {
      tipo: "D-1",
      status: "enviado",
      enviadoEm: new Date("2026-11-09T11:00:00Z"),
      criadoEm: new Date("2026-11-09T11:00:00Z"),
    };
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({ id: 1, avisos: [aviso] }),
      boleto({ id: 2 }),
      boleto({ id: 3, avisos: [] }),
    ]);

    const result = await service.buscarBoletosDashboard();
    const por = (id: number) => result.find((r) => r.id === id)!;

    expect(por(1).ultimoAviso).toEqual(aviso);
    expect(por(2).ultimoAviso).toBeNull();
    expect(por(3).ultimoAviso).toBeNull();
  });

  it("D3b ultimo aviso sem enviadoEm: enviadoEm vira null", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({
        avisos: [{ tipo: "A+2", status: "sem_email", criadoEm: new Date("2026-11-09T11:00:00Z") }],
      }),
    ]);

    const result = await service.buscarBoletosDashboard();

    expect(result[0].ultimoAviso).toEqual({
      tipo: "A+2",
      status: "sem_email",
      enviadoEm: null,
      criadoEm: new Date("2026-11-09T11:00:00Z"),
    });
  });

  it("D4 consulta unica: avisos vem por include aninhado, sem outro modelo Prisma", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([]);

    await service.buscarBoletosDashboard();

    const prisma = (service as any).prisma;
    expect(prisma.cobrancaBoleto.findMany).toHaveBeenCalledTimes(1);
    const args = prisma.cobrancaBoleto.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: { not: "cancelado" } });
    expect(args.include.titulos).toEqual({ select: { idcontareceber: true } });
    expect(args.include.avisos).toEqual({
      orderBy: { criadoEm: "desc" },
      take: 1,
      select: { tipo: true, status: true, enviadoEm: true, criadoEm: true },
    });
    expect(Object.keys(prisma).sort()).toEqual(["cobrancaBoleto", "nfseEmitidaTitulo"]);
  });

  it("D5 contrato mantido: array ordenado por expireAt com nfseStatus e athosBaixaStatus", async () => {
    (service as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      boleto({ id: 1, expireAt: "2026-11-20" }),
      boleto({ id: 2, expireAt: "2026-11-05", athosBaixaStatus: "erro" }),
    ]);

    const result = await service.buscarBoletosDashboard();

    expect(Array.isArray(result)).toBe(true);
    expect(result.map((r) => r.id)).toEqual([2, 1]);
    expect(result[0]).toEqual(
      expect.objectContaining({ nfseStatus: "pendente", athosBaixaStatus: "erro" }),
    );
    expect(result[1].athosBaixaStatus).toBeNull();
  });
});
