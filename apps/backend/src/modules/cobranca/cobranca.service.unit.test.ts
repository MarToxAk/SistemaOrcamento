import { CobrancaService } from "./cobranca.service";

describe("montarItensEfiPorVendaItem", () => {
  let service: CobrancaService;
  beforeEach(() => {
    service = Object.create(CobrancaService.prototype);
    // Injeta logger stub para evitar erros de "logger is undefined"
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).prisma = {
      nfseEmitidaTitulo: { findMany: jest.fn() },
    };
    (service as any).athosService = {
      buscarTodasNfesParaTitulos: jest.fn(),
      buscarItensVenda: jest.fn(),
      buscarValorTotalVenda: jest.fn(),
    };
  });

  it("deve gerar 1 item por nota fiscal com valor correto (NFS-e + 2×NF-e)", async () => {
    // Cenário: 3 títulos → NFS-e #171 (serviço R$184,25), NF-e #420 (produto R$405,00), NF-e #440 (produto R$30,00)
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
    // Sem itens de venda → o split usa a lógica de fallback por tipo de nota
    ((service as any).athosService.buscarItensVenda as jest.Mock).mockResolvedValue([]);
    ((service as any).athosService.buscarValorTotalVenda as jest.Mock).mockResolvedValue(0);

    const totalValor = 184.25 + 405.00 + 30.00; // 619,25
    const itemMap = await service["montarItensEfiPorVendaItem"](titulos, totalValor);
    const itens = Array.from(itemMap.values());

    // Cada nota fiscal deve aparecer como item separado com seu valor em centavos
    expect(itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Nota fiscal de serviço #171", valueCentavos: 18425 }),
        expect.objectContaining({ name: "Nota fiscal de produto #420", valueCentavos: 40500 }),
        expect.objectContaining({ name: "Nota fiscal de produto #440", valueCentavos: 3000 }),
      ]),
    );

    // Σ deve ser exatamente o total (sem arredondamento perdido)
    const soma = itens.reduce((acc, i) => acc + i.valueCentavos, 0);
    expect(soma).toBe(Math.round(totalValor * 100)); // 61925
  });

  it("deve gerar item único quando título tem apenas NFS-e", async () => {
    const titulos = [{ idcontareceber: 10, idvenda: 1, valor: 100.00 }];

    ((service as any).prisma.nfseEmitidaTitulo.findMany as jest.Mock).mockResolvedValue([
      { idcontareceber: 10, nfseEmitida: { numeroNfse: "999", valorServico: 100.00 } },
    ]);
    ((service as any).athosService.buscarTodasNfesParaTitulos as jest.Mock).mockResolvedValue([]);
    ((service as any).athosService.buscarItensVenda as jest.Mock).mockResolvedValue([]);
    ((service as any).athosService.buscarValorTotalVenda as jest.Mock).mockResolvedValue(0);

    const itemMap = await service["montarItensEfiPorVendaItem"](titulos, 100.00);
    const itens = Array.from(itemMap.values());

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ name: "Nota fiscal de serviço #999", valueCentavos: 10000 });
  });

  it("deve gerar item único quando título tem apenas NF-e", async () => {
    const titulos = [{ idcontareceber: 20, idvenda: 2, valor: 250.00 }];

    ((service as any).prisma.nfseEmitidaTitulo.findMany as jest.Mock).mockResolvedValue([]);
    ((service as any).athosService.buscarTodasNfesParaTitulos as jest.Mock).mockResolvedValue([
      { idcontareceber: 20, numero: "555" },
    ]);
    ((service as any).athosService.buscarItensVenda as jest.Mock).mockResolvedValue([]);
    ((service as any).athosService.buscarValorTotalVenda as jest.Mock).mockResolvedValue(0);

    const itemMap = await service["montarItensEfiPorVendaItem"](titulos, 250.00);
    const itens = Array.from(itemMap.values());

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ name: "Nota fiscal de produto #555", valueCentavos: 25000 });
  });

  it("deve dividir via venda_item.tipoFisico quando há itens de venda", async () => {
    // venda tem: 1 item serviço R$50 + 1 item produto R$50 → título de R$100
    // → esperado: NFS-e #200 = R$50, NF-e #300 = R$50
    const titulos = [{ idcontareceber: 30, idvenda: 5, valor: 100.00 }];

    ((service as any).prisma.nfseEmitidaTitulo.findMany as jest.Mock).mockResolvedValue([
      { idcontareceber: 30, nfseEmitida: { numeroNfse: "200", valorServico: 50.00 } },
    ]);
    ((service as any).athosService.buscarTodasNfesParaTitulos as jest.Mock).mockResolvedValue([
      { idcontareceber: 30, numero: "300" },
    ]);
    ((service as any).athosService.buscarItensVenda as jest.Mock).mockResolvedValue([
      { nome: "Serviço X", quantidade: 1, valor: 50.00, tipoFisico: false, sequencia: 1 },
      { nome: "Produto Y", quantidade: 1, valor: 50.00, tipoFisico: true,  sequencia: 2 },
    ]);
    ((service as any).athosService.buscarValorTotalVenda as jest.Mock).mockResolvedValue(100.00);

    const itemMap = await service["montarItensEfiPorVendaItem"](titulos, 100.00);
    const itens = Array.from(itemMap.values());

    expect(itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Nota fiscal de serviço #200", valueCentavos: 5000 }),
        expect.objectContaining({ name: "Nota fiscal de produto #300", valueCentavos: 5000 }),
      ]),
    );

    const soma = itens.reduce((acc, i) => acc + i.valueCentavos, 0);
    expect(soma).toBe(10000);
  });
});
