import "reflect-metadata";

import { CobrancaAvisoVencimentoJob } from "./cobranca-aviso-vencimento.job";

// Servico e ConfigService falsos: nenhum banco, nenhum Athos, nenhum e-mail (D-07).

const RESULTADO = {
  hoje: "2026-11-10",
  dryRun: false,
  candidatos: 3,
  enviados: 2,
  semEmail: 1,
  jaProcessados: 0,
  erros: 0,
  lookupFalhou: 0,
  itens: [],
};

function montar(env: Record<string, string | undefined> = {}) {
  const job = Object.create(CobrancaAvisoVencimentoJob.prototype) as CobrancaAvisoVencimentoJob;
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const avisos = { processarCiclo: jest.fn().mockResolvedValue(RESULTADO) };
  (job as any).logger = logger;
  (job as any).avisos = avisos;
  (job as any).config = { get: jest.fn((k: string) => env[k]) };
  (job as any).running = false;
  return { job, logger, avisos };
}

describe("CobrancaAvisoVencimentoJob (plano 45-03)", () => {
  describe("J1. kill switch exato", () => {
    it.each([undefined, "", "false", "1", "TRUE", " true"])(
      "COBRANCA_AVISO_ATIVO=%p deixa o ciclo desligado",
      async (valor) => {
        const { job, logger, avisos } = montar({ COBRANCA_AVISO_ATIVO: valor });
        await expect(job.executar()).resolves.toBeNull();
        expect(avisos.processarCiclo).not.toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("desligado"));
      },
    );

    it("COBRANCA_AVISO_ATIVO=true executa o ciclo uma vez e devolve o resultado", async () => {
      const { job, avisos } = montar({ COBRANCA_AVISO_ATIVO: "true" });
      await expect(job.executar()).resolves.toEqual(RESULTADO);
      expect(avisos.processarCiclo).toHaveBeenCalledTimes(1);
      expect(avisos.processarCiclo).toHaveBeenCalledWith({ dryRun: false });
    });
  });

  describe("J2. dry-run", () => {
    it("DRY_RUN=true repassa dryRun true", async () => {
      const { job, avisos } = montar({ COBRANCA_AVISO_ATIVO: "true", COBRANCA_AVISO_DRY_RUN: "true" });
      await job.executar();
      expect(avisos.processarCiclo).toHaveBeenCalledWith({ dryRun: true });
    });

    it.each(["TRUE", "1", undefined])("DRY_RUN=%p repassa dryRun false", async (valor) => {
      const { job, avisos } = montar({ COBRANCA_AVISO_ATIVO: "true", COBRANCA_AVISO_DRY_RUN: valor });
      await job.executar();
      expect(avisos.processarCiclo).toHaveBeenCalledWith({ dryRun: false });
    });

    it("DRY_RUN=true com ATIVO ausente nao executa nada (interruptor mestre unico)", async () => {
      const { job, avisos } = montar({ COBRANCA_AVISO_DRY_RUN: "true" });
      await expect(job.executar()).resolves.toBeNull();
      expect(avisos.processarCiclo).not.toHaveBeenCalled();
    });
  });

  it("J3. nao sobrepoe ciclos e libera a guarda ao terminar", async () => {
    const { job, logger, avisos } = montar({ COBRANCA_AVISO_ATIVO: "true" });
    let liberar!: (r: typeof RESULTADO) => void;
    avisos.processarCiclo.mockImplementationOnce(
      () =>
        new Promise<typeof RESULTADO>((resolve) => {
          liberar = resolve;
        }),
    );

    const primeira = job.executar();
    await expect(job.executar()).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(avisos.processarCiclo).toHaveBeenCalledTimes(1);

    liberar(RESULTADO);
    await expect(primeira).resolves.toEqual(RESULTADO);
    expect((job as any).running).toBe(false);

    await expect(job.executar()).resolves.toEqual(RESULTADO);
    expect(avisos.processarCiclo).toHaveBeenCalledTimes(2);
  });

  it("J4. falha do ciclo nao rejeita, registra erro e libera a guarda", async () => {
    const { job, logger, avisos } = montar({ COBRANCA_AVISO_ATIVO: "true" });
    avisos.processarCiclo.mockRejectedValueOnce(new Error("boom cliente@exemplo.com"));

    await expect(job.executar()).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(1);
    // o log de erro nao vaza a mensagem do erro (pode conter e-mail)
    expect(String(logger.error.mock.calls[0][0])).not.toContain("cliente@exemplo.com");
    expect((job as any).running).toBe(false);
  });

  it("J5. cron as 08:00 e 14:00 em America/Sao_Paulo com nome fixo", () => {
    const meta = Reflect.getMetadata("SCHEDULE_CRON_OPTIONS", CobrancaAvisoVencimentoJob.prototype.executar);
    expect(meta).toBeDefined();
    expect(meta.cronTime).toBe("0 8,14 * * *");
    expect(meta.timeZone).toBe("America/Sao_Paulo");
    expect(meta.name).toBe("cobranca-aviso-vencimento");
  });

  it("log de resumo traz so contagens (sem e-mails)", async () => {
    const { job, logger } = montar({ COBRANCA_AVISO_ATIVO: "true" });
    await job.executar();
    const textos = logger.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(textos).toContain("candidatos=3");
    expect(textos).toContain("enviados=2");
    expect(textos).not.toContain("@");
  });
});
