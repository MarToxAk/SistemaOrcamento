import { CobrancaService } from "./cobranca.service";

describe("montarItensEfiPorVendaItem", () => {
  let service: CobrancaService;

  beforeEach(() => {
    service = Object.create(CobrancaService.prototype);
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).prisma = {
      nfseEmitidaTitulo: { findMany: jest.fn() },
    };
    (service as any).athosService = {
      buscarTodasNfesParaTitulos: jest.fn(),
      buscarItensVenda: jest.fn(),
      // buscarValorTotalVenda nao e mais chamado -- valorTotal calculado dos itens
    };
  });

  /**
   * CENARIO DO BUG REAL -- cliente 2708:
   * 6 titulos, sendo um deles (867) com AMBOS NFS-e #171 E NF-e #440.
   * venda_item desse titulo tem 1 item servico (R$23,25) + 1 item produto (R$30,00).
   * Bug anterior: buscarValorTotalVenda falhava -> prodCent=0 -> NF-e #440 sumia.
   */
  it("deve gerar 3 itens (NFS-e #171, NF-e #440, NF-e #420) para o cenario real do cliente 2708", async () => {
    const titulos = [
      { idcontareceber: 865, idvenda: 19846, valor: 56.70 },  // NFS-e #171 pura
      { idcontareceber: 867, idvenda: 19848, valor: 53.25 },  // NFS-e #171 + NF-e #440 (misto)
      { idcontareceber: 876, idvenda: 20003, valor: 62.00 },  // NF-e #420 pura
      { idcontareceber: 890, idvenda: 20448, valor: 343.00 }, // NF-e #420 pura
      { idcontareceber: 891, idvenda: 20498, valor: 52.20 },  // NFS-e #171 pura
      { idcontareceber: 928, idvenda: 21641, valor: 52.10 },  // NFS-e #171 pura
    ];

    ((service as any).prisma.nfseEmitidaTitulo.findMany as jest.Mock).mockResolvedValue([
      { idcontareceber: 865, nfseEmitida: { numeroNfse: "171", valorServico: 184.25 } },
      { idcontareceber: 867, nfseEmitida: { numeroNfse: "171", valorServico: 184.25 } },
      { idcontareceber: 891, nfseEmitida: { numeroNfse: "171", valorServico: 184.25 } },
      { idcontareceber: 928, nfseEmitida: { numeroNfse: "171", valorServico: 184.25 } },
    ]);

    ((service as any).athosService.buscarTodasNfesParaTitulos as jest.Mock).mockResolvedValue([
      { idcontareceber: 867, numero: "440", valorNota: 0 },
      { idcontareceber: 876, numero: "420", valorNota: 0 },
      { idcontareceber: 890, numero: "420", valorNota: 0 },
    ]);

    ((service as any).athosService.buscarItensVenda as jest.Mock).mockImplementation((idv: number) => {
      if (idv === 19846) return Promise.resolve([{ nome: "Servico", quantidade: 1, valor: 56.70,  tipoFisico: false, sequencia: 1 }]);
      if (idv === 19848) return Promise.resolve([
        { nome: "Servico", quantidade: 1, valor: 23.25, tipoFisico: false, sequencia: 1 },
        { nome: "Produto", quantidade: 1, valor: 30.00, tipoFisico: true,  sequencia: 2 },
      ]);
      if (idv === 20003) return Promise.resolve([{ nome: "Produto", quantidade: 1, valor: 62.00,  tipoFisico: true,  sequencia: 1 }]);
      if (idv === 20448) return Promise.resolve([{ nome: "Produto", quantidade: 1, valor: 343.00, tipoFisico: true,  sequencia: 1 }]);
      if (idv === 20498) return Promise.resolve([{ nome: "Servico", quantidade: 1, valor: 52.20,  tipoFisico: false, sequencia: 1 }]);
      if (idv === 21641) return Promise.resolve([{ nome: "Servico", quantidade: 1, valor: 52.10,  tipoFisico: false, sequencia: 1 }]);
      return Promise.resolve([]);
    });

    const totalValor = 56.70 + 53.25 + 62.00 + 343.00 + 52.20 + 52.10; // 619.25
    const itemMap = await service["montarItensEfiPorVendaItem"](titulos, totalValor);
    const itens = Array.from(itemMap.values());

    expect(itens).toHaveLength(3);

    expect(itens).toEqual(
      expect.arrayContaining([
        // NFS-e #171: 23.25 (867) + 56.70 (865) + 52.20 (891) + 52.10 (928) = 184.25
        expect.objectContaining({ name: "NFS-e #171", valueCentavos: 18425 }),
        // NF-e #440: 30.00 (867) -- produto do titulo misto
        expect.objectContaining({ name: "NF-e #440", valueCentavos: 3000 }),
        // NF-e #420: 62.00 (876) + 343.00 (890) = 405.00
        expect.objectContaining({ name: "NF-e #420", valueCentavos: 40500 }),
      ]),
    );

    const soma = itens.reduce((acc, i) => acc + i.valueCentavos, 0);
    expect(soma).toBe(Math.round(totalValor * 100)); // 61925
  });

  it("deve gerar 1 item por nota fiscal com valor correto (NFS-e + 2xNF-e -- fallback sem venda_item)", async () => {
    const titulos = [
      { idcontareceber: 1, idvenda: 10, valor: 184.25 }, // NFS-e #171
      { idcontareceber: 2, idvenda: 20, valor: 405.00 }, // NF-e #420
      { idcontareceber: 3, idvenda: 30, valor: 30.00 },  // NF-e #440
    ];

    ((service as any).prisma.nfseEmitidaTitulo.findMany as jest.Mock).mockResolvedValue([
      { idcontareceber: 1, nfseEmitida: { numeroNfse: "171", valorServico: 184.25 } },
    ]);
    ((service as any).athosService.buscarTodasNfesParaTitulos as jest.Mock).mockResolvedValue([
      { idcontareceber: 2, numero: "420" },
      { idcontareceber: 3, numero: "440" },
    ]);
    ((service as any).athosService.buscarItensVenda as jest.Mock).mockResolvedValue([]);

    const totalValor = 184.25 + 405.00 + 30.00;
    const itemMap = await service["montarItensEfiPorVendaItem"](titulos, totalValor);
    const itens = Array.from(itemMap.values());

    expect(itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "NFS-e #171", valueCentavos: 18425 }),
        expect.objectContaining({ name: "NF-e #420", valueCentavos: 40500 }),
        expect.objectContaining({ name: "NF-e #440", valueCentavos: 3000 }),
      ]),
    );

    const soma = itens.reduce((acc, i) => acc + i.valueCentavos, 0);
    expect(soma).toBe(Math.round(totalValor * 100));
  });

  it("deve gerar item unico quando titulo tem apenas NFS-e", async () => {
    const titulos = [{ idcontareceber: 10, idvenda: 1, valor: 100.00 }];

    ((service as any).prisma.nfseEmitidaTitulo.findMany as jest.Mock).mockResolvedValue([
      { idcontareceber: 10, nfseEmitida: { numeroNfse: "999", valorServico: 100.00 } },
    ]);
    ((service as any).athosService.buscarTodasNfesParaTitulos as jest.Mock).mockResolvedValue([]);
    ((service as any).athosService.buscarItensVenda as jest.Mock).mockResolvedValue([]);

    const itemMap = await service["montarItensEfiPorVendaItem"](titulos, 100.00);
    const itens = Array.from(itemMap.values());

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ name: "NFS-e #999", valueCentavos: 10000 });
  });

  it("deve gerar item unico quando titulo tem apenas NF-e", async () => {
    const titulos = [{ idcontareceber: 20, idvenda: 2, valor: 250.00 }];

    ((service as any).prisma.nfseEmitidaTitulo.findMany as jest.Mock).mockResolvedValue([]);
    ((service as any).athosService.buscarTodasNfesParaTitulos as jest.Mock).mockResolvedValue([
      { idcontareceber: 20, numero: "555" },
    ]);
    ((service as any).athosService.buscarItensVenda as jest.Mock).mockResolvedValue([]);

    const itemMap = await service["montarItensEfiPorVendaItem"](titulos, 250.00);
    const itens = Array.from(itemMap.values());

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ name: "NF-e #555", valueCentavos: 25000 });
  });

  it("deve dividir via venda_item.tipoFisico quando ha itens de venda", async () => {
    const titulos = [{ idcontareceber: 30, idvenda: 5, valor: 100.00 }];

    ((service as any).prisma.nfseEmitidaTitulo.findMany as jest.Mock).mockResolvedValue([
      { idcontareceber: 30, nfseEmitida: { numeroNfse: "200", valorServico: 50.00 } },
    ]);
    ((service as any).athosService.buscarTodasNfesParaTitulos as jest.Mock).mockResolvedValue([
      { idcontareceber: 30, numero: "300" },
    ]);
    ((service as any).athosService.buscarItensVenda as jest.Mock).mockResolvedValue([
      { nome: "Servico X", quantidade: 1, valor: 50.00, tipoFisico: false, sequencia: 1 },
      { nome: "Produto Y", quantidade: 1, valor: 50.00, tipoFisico: true,  sequencia: 2 },
    ]);

    const itemMap = await service["montarItensEfiPorVendaItem"](titulos, 100.00);
    const itens = Array.from(itemMap.values());

    expect(itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "NFS-e #200", valueCentavos: 5000 }),
        expect.objectContaining({ name: "NF-e #300", valueCentavos: 5000 }),
      ]),
    );

    const soma = itens.reduce((acc, i) => acc + i.valueCentavos, 0);
    expect(soma).toBe(10000);
  });
});
