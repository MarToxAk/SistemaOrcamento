import { CobrancaReconciliationJob } from "./cobranca-reconciliation.job";

describe("CobrancaReconciliationJob", () => {
  let job: CobrancaReconciliationJob;

  beforeEach(() => {
    job = Object.create(CobrancaReconciliationJob.prototype);
    (job as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (job as any).prisma = { cobrancaBoleto: { findMany: jest.fn() } };
    (job as any).cobrancaService = { verificarPagamentoBoleto: jest.fn() };
    (job as any).config = { get: jest.fn().mockReturnValue(undefined) };
    (job as any).running = false;
  });

  it("consulta apenas boletos com status pendente", async () => {
    (job as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([]);

    await job.reconciliarBoletosPendentes();

    const args = (job as any).prisma.cobrancaBoleto.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: "pendente" });
  });

  it("chama verificarPagamentoBoleto uma vez por boleto pendente", async () => {
    (job as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    (job as any).cobrancaService.verificarPagamentoBoleto.mockResolvedValue({
      status: "pendente",
      atualizado: false,
    });

    await job.reconciliarBoletosPendentes();

    expect((job as any).cobrancaService.verificarPagamentoBoleto).toHaveBeenCalledTimes(3);
    expect((job as any).cobrancaService.verificarPagamentoBoleto).toHaveBeenNthCalledWith(1, 1);
    expect((job as any).cobrancaService.verificarPagamentoBoleto).toHaveBeenNthCalledWith(2, 2);
    expect((job as any).cobrancaService.verificarPagamentoBoleto).toHaveBeenNthCalledWith(3, 3);
  });

  it("isola a falha de um boleto e segue o lote (D-04)", async () => {
    (job as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    (job as any).cobrancaService.verificarPagamentoBoleto
      .mockResolvedValueOnce({ status: "pendente", atualizado: false })
      .mockRejectedValueOnce(new Error("EFI indisponivel"))
      .mockResolvedValueOnce({ status: "pendente", atualizado: false });

    const resultado = await job.reconciliarBoletosPendentes();

    expect((job as any).cobrancaService.verificarPagamentoBoleto).toHaveBeenCalledTimes(3);
    expect((job as any).logger.error).toHaveBeenCalledTimes(1);
    expect(resultado.falhas).toBe(1);
  });

  it("conta os boletos efetivamente atualizados", async () => {
    (job as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    (job as any).cobrancaService.verificarPagamentoBoleto
      .mockResolvedValueOnce({ status: "pago", atualizado: true })
      .mockResolvedValueOnce({ status: "pendente", atualizado: false });

    const resultado = await job.reconciliarBoletosPendentes();

    expect(resultado.atualizados).toBe(1);
  });

  it("nao inicia um segundo ciclo enquanto o anterior esta em andamento", async () => {
    (job as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([{ id: 1 }]);
    let releaseFirst: () => void = () => {};
    const pending = new Promise((resolve) => {
      releaseFirst = () => resolve({ status: "pendente", atualizado: false });
    });
    (job as any).cobrancaService.verificarPagamentoBoleto.mockReturnValue(pending);

    const primeiraChamada = job.reconciliarBoletosPendentes();
    const segundaChamada = job.reconciliarBoletosPendentes();

    await segundaChamada;
    releaseFirst();
    await primeiraChamada;

    expect((job as any).prisma.cobrancaBoleto.findMany).toHaveBeenCalledTimes(1);
  });

  it("libera o guard mesmo quando findMany rejeita", async () => {
    (job as any).prisma.cobrancaBoleto.findMany.mockRejectedValueOnce(new Error("DB fora do ar"));

    await expect(job.reconciliarBoletosPendentes()).rejects.toThrow("DB fora do ar");

    (job as any).prisma.cobrancaBoleto.findMany.mockResolvedValueOnce([]);
    await job.reconciliarBoletosPendentes();

    expect((job as any).prisma.cobrancaBoleto.findMany).toHaveBeenCalledTimes(2);
  });

  it("nao consulta a EFI quando o job esta desligado por ambiente", async () => {
    (job as any).config.get.mockReturnValue("false");

    const resultado = await job.reconciliarBoletosPendentes();

    expect((job as any).prisma.cobrancaBoleto.findMany).not.toHaveBeenCalled();
    expect((job as any).cobrancaService.verificarPagamentoBoleto).not.toHaveBeenCalled();
    expect(resultado).toEqual({ verificados: 0, atualizados: 0, falhas: 0 });
  });

  it("respeita o teto de boletos por ciclo", async () => {
    (job as any).prisma.cobrancaBoleto.findMany.mockResolvedValue([]);

    await job.reconciliarBoletosPendentes();

    const args = (job as any).prisma.cobrancaBoleto.findMany.mock.calls[0][0];
    expect(args.take).toBe(300);
  });
});
