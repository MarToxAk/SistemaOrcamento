import {
  BAIXA_MAX_POR_CICLO,
  BAIXA_MAX_TENTATIVAS_AUTO,
  CobrancaBaixaAthosRetryJob,
} from "./cobranca-baixa-athos-retry.job";

// Prisma e orquestrador falsos: nenhum banco, nenhum Athos (D-07).

function montar(env: Record<string, string | undefined> = {}) {
  const job = Object.create(CobrancaBaixaAthosRetryJob.prototype) as CobrancaBaixaAthosRetryJob;
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const prisma = { cobrancaBoleto: { findMany: jest.fn().mockResolvedValue([]) } };
  const baixaAthos = { executarAposPagamento: jest.fn().mockResolvedValue({ status: "baixado" }) };
  (job as any).logger = logger;
  (job as any).prisma = prisma;
  (job as any).baixaAthos = baixaAthos;
  (job as any).config = { get: jest.fn((k: string) => env[k]) };
  (job as any).running = false;
  return { job, logger, prisma, baixaAthos };
}

describe("CobrancaBaixaAthosRetryJob", () => {
  it("J1. consulta apenas pago com falha/pendente e menos de 5 tentativas, ordenado por ultima tentativa (nulos primeiro), take 50", async () => {
    const { job, prisma } = montar();
    await job.retentarBaixasPendentes();
    const args = prisma.cobrancaBoleto.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      status: "pago",
      athosBaixaStatus: { in: ["falha", "pendente"] },
      athosBaixaTentativas: { lt: 5 },
    });
    expect(args.orderBy).toEqual({ athosBaixaUltimaEm: { sort: "asc", nulls: "first" } });
    expect(args.take).toBe(50);
    expect(BAIXA_MAX_TENTATIVAS_AUTO).toBe(5);
    expect(BAIXA_MAX_POR_CICLO).toBe(50);
  });

  it("J2. a lista de athosBaixaStatus nunca contem null nem baixado (boletos antigos jamais sao tocados)", async () => {
    const { job, prisma } = montar();
    await job.retentarBaixasPendentes();
    const lista = prisma.cobrancaBoleto.findMany.mock.calls[0][0].where.athosBaixaStatus.in as unknown[];
    expect(lista).not.toContain(null);
    expect(lista).not.toContain(undefined);
    expect(lista).not.toContain("baixado");
    expect(lista).not.toContain("ja_baixado");
    expect(lista).not.toContain("estornado");
    expect([...lista].sort()).toEqual(["falha", "pendente"]);
    // e o filtro nunca inclui chave que aceite nulo
    expect(prisma.cobrancaBoleto.findMany.mock.calls[0][0].where.athosBaixaStatus).not.toHaveProperty("not");
  });

  it("J3. ATHOS_BAIXA_AUTO=false -> sem consulta e retorno zerado; outros valores ligam", async () => {
    const off = montar({ ATHOS_BAIXA_AUTO: "false" });
    await expect(off.job.retentarBaixasPendentes()).resolves.toEqual({ verificados: 0, baixados: 0, falhas: 0 });
    expect(off.prisma.cobrancaBoleto.findMany).not.toHaveBeenCalled();

    for (const v of [undefined, "", "true", "0", "FALSE"]) {
      const on = montar({ ATHOS_BAIXA_AUTO: v });
      await on.job.retentarBaixasPendentes();
      expect(on.prisma.cobrancaBoleto.findMany).toHaveBeenCalledTimes(1);
    }
  });

  it("J4. chama executarAposPagamento(id, { origem: retentativa }) por boleto e conta baixados e falhas", async () => {
    const { job, prisma, baixaAthos } = montar();
    prisma.cobrancaBoleto.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    baixaAthos.executarAposPagamento
      .mockResolvedValueOnce({ status: "baixado" })
      .mockResolvedValueOnce({ status: "ja_baixado" })
      .mockResolvedValueOnce({ status: "falha", codigo: "ERRO_BANCO" })
      .mockResolvedValueOnce({ status: "ignorado" });
    const r = await job.retentarBaixasPendentes();
    expect(baixaAthos.executarAposPagamento).toHaveBeenCalledTimes(4);
    expect(baixaAthos.executarAposPagamento).toHaveBeenNthCalledWith(1, 1, { origem: "retentativa" });
    expect(baixaAthos.executarAposPagamento).toHaveBeenNthCalledWith(4, 4, { origem: "retentativa" });
    expect(r).toEqual({ verificados: 4, baixados: 2, falhas: 1 });
  });

  it("J5. falha de um boleto (status falha ou excecao) nao interrompe o lote", async () => {
    const { job, prisma, baixaAthos, logger } = montar();
    prisma.cobrancaBoleto.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    baixaAthos.executarAposPagamento
      .mockResolvedValueOnce({ status: "falha", codigo: "PERMISSAO_NEGADA" })
      .mockRejectedValueOnce(new Error("explodiu"))
      .mockResolvedValueOnce({ status: "baixado" });
    const r = await job.retentarBaixasPendentes();
    expect(baixaAthos.executarAposPagamento).toHaveBeenCalledTimes(3);
    expect(r).toEqual({ verificados: 3, baixados: 1, falhas: 2 });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("J6. ciclo em andamento -> segundo disparo zerado sem consultar; running volta a false mesmo com erro", async () => {
    const a = montar();
    (a.job as any).running = true;
    await expect(a.job.retentarBaixasPendentes()).resolves.toEqual({ verificados: 0, baixados: 0, falhas: 0 });
    expect(a.prisma.cobrancaBoleto.findMany).not.toHaveBeenCalled();
    expect(a.logger.warn).toHaveBeenCalled();

    const b = montar();
    b.prisma.cobrancaBoleto.findMany.mockRejectedValue(new Error("db fora"));
    await expect(b.job.retentarBaixasPendentes()).rejects.toThrow("db fora");
    expect((b.job as any).running).toBe(false);
    await expect(b.job.retentarBaixasPendentes()).rejects.toThrow("db fora");
  });

  it("J7. teto de 50 por ciclo gera warn", async () => {
    const { job, prisma, logger } = montar();
    prisma.cobrancaBoleto.findMany.mockResolvedValue(Array.from({ length: 50 }, (_, i) => ({ id: i + 1 })));
    await job.retentarBaixasPendentes();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0][0])).toContain("50");

    const b = montar();
    b.prisma.cobrancaBoleto.findMany.mockResolvedValue([{ id: 1 }]);
    await b.job.retentarBaixasPendentes();
    expect(b.logger.warn).not.toHaveBeenCalled();
  });
});
