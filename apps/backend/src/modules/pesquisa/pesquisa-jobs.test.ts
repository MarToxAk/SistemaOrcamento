/**
 * Fase 52 (plano 52-06): jobs de re-tentativa e de retencao, e a trava advisory entre processos.
 * Prisma falso, servicos falsos e ConfigService falso: nenhum banco, nenhuma rede.
 */
import "reflect-metadata";

import { PesquisaRetencaoJob } from "./pesquisa-retencao.job";
import { PesquisaRetryJob } from "./pesquisa-retry.job";
import { CHAVE_TRAVA_RETENCAO, CHAVE_TRAVA_RETRY, comTravaAdvisory } from "./pesquisa-trava";
import { PesquisaModule } from "./pesquisa.module";
import { PesquisaWebhookController } from "./pesquisa-webhook.controller";
import { PesquisaService } from "./pesquisa.service";

const TELEFONE = "5512996484918";

const REENVIO = { candidatos: 2, cupons: 1, convites: 1, csat: 0, falhas: 0 };

/** Trava obtida: executa o callback com um tx cujo $queryRaw devolve `valor`. */
function prismaComTrava(valor: unknown = true) {
  const $queryRaw = jest.fn(async (..._args: unknown[]) => [{ trava: valor }]);
  const $transaction = jest.fn(async (fn: (tx: { $queryRaw: typeof $queryRaw }) => Promise<unknown>) =>
    fn({ $queryRaw }),
  );
  return { prisma: { $transaction }, $transaction, $queryRaw };
}

/** Outro processo esta executando: a transacao nem roda o callback. */
function prismaSemTrava() {
  const $transaction = jest.fn(async () => ({ executou: false }));
  return { prisma: { $transaction }, $transaction };
}

function montarRetry(opcoes: {
  ativo?: boolean;
  expirados?: number;
  erro?: string;
  prisma?: unknown;
} = {}) {
  const job = Object.create(PesquisaRetryJob.prototype) as PesquisaRetryJob;
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const pesquisa = {
    marcarCuponsExpirados: jest.fn(async () => opcoes.expirados ?? 3),
    reenviarPendentes: jest.fn(async () => REENVIO),
  };
  if (opcoes.erro) pesquisa.marcarCuponsExpirados.mockRejectedValueOnce(new Error(opcoes.erro));
  const configPesquisa = { obter: jest.fn(async () => ({ ativo: opcoes.ativo ?? false })) };
  (job as any).logger = logger;
  (job as any).pesquisa = pesquisa;
  (job as any).configPesquisa = configPesquisa;
  (job as any).prisma = opcoes.prisma ?? prismaComTrava().prisma;
  (job as any).running = false;
  return { job, logger, pesquisa, configPesquisa };
}

function montarRetencao(opcoes: {
  ativa?: string;
  meses?: string;
  resultado?: { pesquisas: number; cupons: number };
  erro?: string;
  prisma?: unknown;
} = {}) {
  const job = Object.create(PesquisaRetencaoJob.prototype) as PesquisaRetencaoJob;
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const env: Record<string, string | undefined> = {
    PESQUISA_RETENCAO_ATIVA: opcoes.ativa,
    PESQUISA_RETENCAO_MESES: opcoes.meses,
  };
  const pesquisa = {
    anonimizarAntigos: jest.fn(async () => opcoes.resultado ?? { pesquisas: 4, cupons: 2 }),
  };
  if (opcoes.erro) pesquisa.anonimizarAntigos.mockRejectedValueOnce(new Error(opcoes.erro));
  const config = { get: jest.fn((chave: string) => env[chave]) };
  (job as any).logger = logger;
  (job as any).pesquisa = pesquisa;
  (job as any).config = config;
  (job as any).prisma = opcoes.prisma ?? prismaComTrava().prisma;
  (job as any).running = false;
  return { job, logger, pesquisa, config };
}

function montarServicoAnonimizacao() {
  const updateManyPesquisa = jest.fn(async () => ({ count: 4 }));
  const updateManyCupom = jest.fn(async () => ({ count: 2 }));
  const deleteManyPesquisa = jest.fn();
  const deleteManyCupom = jest.fn();
  const deleteManySupressao = jest.fn();
  const prisma = {
    pesquisaSatisfacao: { updateMany: updateManyPesquisa, deleteMany: deleteManyPesquisa },
    cupomRecompensa: { updateMany: updateManyCupom, deleteMany: deleteManyCupom },
    pesquisaSupressao: { deleteMany: deleteManySupressao, findUnique: jest.fn() },
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new PesquisaService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  (service as any).logger = logger;
  return { service, prisma, updateManyPesquisa, updateManyCupom, deleteManyPesquisa, deleteManyCupom, deleteManySupressao, logger };
}

describe("PesquisaRetryJob (retry)", () => {
  it("retry: com a pesquisa inativa nao reenvia e ainda marca os cupons vencidos", async () => {
    const { job, pesquisa } = montarRetry({ ativo: false, expirados: 3 });
    await expect(job.executar()).resolves.toEqual({ expirados: 3, reenvio: null });
    expect(pesquisa.marcarCuponsExpirados).toHaveBeenCalledTimes(1);
    expect(pesquisa.reenviarPendentes).not.toHaveBeenCalled();
  });

  it("retry: com a pesquisa ativa chama reenviarPendentes e devolve as contagens", async () => {
    const { job, pesquisa } = montarRetry({ ativo: true, expirados: 1 });
    await expect(job.executar()).resolves.toEqual({ expirados: 1, reenvio: REENVIO });
    expect(pesquisa.marcarCuponsExpirados).toHaveBeenCalledTimes(1);
    expect(pesquisa.reenviarPendentes).toHaveBeenCalledTimes(1);
  });

  it("guarda: ciclo de retry sobreposto devolve null sem chamar nada", async () => {
    const { job, logger, pesquisa } = montarRetry({ ativo: true });
    (job as any).running = true;
    await expect(job.executar()).resolves.toBeNull();
    expect(pesquisa.marcarCuponsExpirados).not.toHaveBeenCalled();
    expect(pesquisa.reenviarPendentes).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("retry: erro do servico vira log sem o texto do erro e devolve null liberando a guarda", async () => {
    const { job, logger, pesquisa } = montarRetry({ ativo: true, erro: `falhou ${TELEFONE}` });
    await expect(job.executar()).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(1);
    const textos = logger.error.mock.calls.map((c) => String(c[0])).join("\n");
    expect(textos).not.toContain(TELEFONE);
    expect((job as any).running).toBe(false);
    expect(pesquisa.reenviarPendentes).not.toHaveBeenCalled();
  });

  it("retry: cron a cada 10 minutos com nome e fuso fixos", () => {
    const meta = Reflect.getMetadata("SCHEDULE_CRON_OPTIONS", PesquisaRetryJob.prototype.executar);
    expect(meta).toBeDefined();
    expect(meta.cronTime).toBe("*/10 * * * *");
    expect(meta.name).toBe("pesquisa-retry");
    expect(meta.timeZone).toBe("America/Sao_Paulo");
  });

  it("trava: retry com outro processo executando devolve null e nao chama os servicos", async () => {
    const { job, logger, pesquisa } = montarRetry({ ativo: true, prisma: prismaSemTrava().prisma });
    await expect(job.executar()).resolves.toBeNull();
    expect(pesquisa.marcarCuponsExpirados).not.toHaveBeenCalled();
    expect(pesquisa.reenviarPendentes).not.toHaveBeenCalled();
    expect(String(logger.warn.mock.calls[0][0])).toContain("outro processo");
  });
});

describe("PesquisaRetencaoJob (killswitch e retencao)", () => {
  it("killswitch: PESQUISA_RETENCAO_ATIVA ausente mantem a retencao desligada", async () => {
    const { job, logger, pesquisa } = montarRetencao({ ativa: undefined });
    await expect(job.executar()).resolves.toBeNull();
    expect(pesquisa.anonimizarAntigos).not.toHaveBeenCalled();
    expect(String(logger.log.mock.calls[0][0])).toContain("desligada");
  });

  it("killswitch: PESQUISA_RETENCAO_ATIVA vazia mantem a retencao desligada", async () => {
    const { job, pesquisa } = montarRetencao({ ativa: "" });
    await expect(job.executar()).resolves.toBeNull();
    expect(pesquisa.anonimizarAntigos).not.toHaveBeenCalled();
  });

  it('killswitch: PESQUISA_RETENCAO_ATIVA "false" mantem a retencao desligada', async () => {
    const { job, pesquisa } = montarRetencao({ ativa: "false" });
    await expect(job.executar()).resolves.toBeNull();
    expect(pesquisa.anonimizarAntigos).not.toHaveBeenCalled();
  });

  it('killswitch: PESQUISA_RETENCAO_ATIVA "TRUE" nao liga a retencao', async () => {
    const { job, pesquisa } = montarRetencao({ ativa: "TRUE" });
    await expect(job.executar()).resolves.toBeNull();
    expect(pesquisa.anonimizarAntigos).not.toHaveBeenCalled();
  });

  it('killswitch: PESQUISA_RETENCAO_ATIVA "1" nao liga a retencao', async () => {
    const { job, pesquisa } = montarRetencao({ ativa: "1" });
    await expect(job.executar()).resolves.toBeNull();
    expect(pesquisa.anonimizarAntigos).not.toHaveBeenCalled();
  });

  it('killswitch: PESQUISA_RETENCAO_ATIVA " true" nao liga a retencao', async () => {
    const { job, pesquisa } = montarRetencao({ ativa: " true" });
    await expect(job.executar()).resolves.toBeNull();
    expect(pesquisa.anonimizarAntigos).not.toHaveBeenCalled();
  });

  it('killswitch: PESQUISA_RETENCAO_ATIVA "true" liga o ciclo', async () => {
    const { job, pesquisa } = montarRetencao({ ativa: "true" });
    await expect(job.executar()).resolves.toEqual({ pesquisas: 4, cupons: 2 });
    expect(pesquisa.anonimizarAntigos).toHaveBeenCalledTimes(1);
  });

  it("retencao: PESQUISA_RETENCAO_MESES 18 chega ao servico como 18", async () => {
    const { job, pesquisa } = montarRetencao({ ativa: "true", meses: "18" });
    await job.executar();
    expect(pesquisa.anonimizarAntigos).toHaveBeenCalledWith(18);
  });

  it("retencao: PESQUISA_RETENCAO_MESES invalido (abc) volta ao padrao de 12", async () => {
    const { job, pesquisa } = montarRetencao({ ativa: "true", meses: "abc" });
    await job.executar();
    expect(pesquisa.anonimizarAntigos).toHaveBeenCalledWith(12);
  });

  it("retencao: PESQUISA_RETENCAO_MESES zero volta ao padrao de 12", async () => {
    const { job, pesquisa } = montarRetencao({ ativa: "true", meses: "0" });
    await job.executar();
    expect(pesquisa.anonimizarAntigos).toHaveBeenCalledWith(12);
  });

  it("retencao: PESQUISA_RETENCAO_MESES negativo volta ao padrao de 12", async () => {
    const { job, pesquisa } = montarRetencao({ ativa: "true", meses: "-3" });
    await job.executar();
    expect(pesquisa.anonimizarAntigos).toHaveBeenCalledWith(12);
  });

  it("guarda: ciclo de retencao sobreposto devolve null sem tocar o banco", async () => {
    const trava = prismaComTrava();
    const { job, logger, pesquisa } = montarRetencao({ ativa: "true", prisma: trava.prisma });
    (job as any).running = true;
    await expect(job.executar()).resolves.toBeNull();
    expect(trava.$transaction).not.toHaveBeenCalled();
    expect(pesquisa.anonimizarAntigos).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("retencao: erro na anonimizacao devolve null liberando a guarda", async () => {
    const { job, logger } = montarRetencao({ ativa: "true", erro: `falhou ${TELEFONE}` });
    await expect(job.executar()).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect((job as any).running).toBe(false);
    expect(logger.error.mock.calls.map((c) => String(c[0])).join("\n")).not.toContain(TELEFONE);
  });

  it("retencao: cron diario as 03:30 com nome e fuso fixos", () => {
    const meta = Reflect.getMetadata("SCHEDULE_CRON_OPTIONS", PesquisaRetencaoJob.prototype.executar);
    expect(meta).toBeDefined();
    expect(meta.cronTime).toBe("30 3 * * *");
    expect(meta.name).toBe("pesquisa-retencao");
    expect(meta.timeZone).toBe("America/Sao_Paulo");
  });

  it("trava: retencao com outro processo executando devolve null sem anonimizar", async () => {
    const { job, logger, pesquisa } = montarRetencao({ ativa: "true", prisma: prismaSemTrava().prisma });
    await expect(job.executar()).resolves.toBeNull();
    expect(pesquisa.anonimizarAntigos).not.toHaveBeenCalled();
    expect(String(logger.warn.mock.calls[0][0])).toContain("outro processo");
  });

  it("trava: o killswitch da retencao e avaliado antes de abrir a transacao", async () => {
    const trava = prismaComTrava();
    const { job } = montarRetencao({ ativa: "false", prisma: trava.prisma });
    await expect(job.executar()).resolves.toBeNull();
    expect(trava.$transaction).not.toHaveBeenCalled();
  });
});

describe("comTravaAdvisory (trava)", () => {
  it("trava: com a trava obtida executa fn uma vez e devolve o resultado", async () => {
    const { prisma, $transaction } = prismaComTrava(true);
    const fn = jest.fn(async () => "ok");
    await expect(comTravaAdvisory(prisma as never, CHAVE_TRAVA_RETRY, fn)).resolves.toEqual({
      executou: true,
      resultado: "ok",
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("trava: com trava falsa nao executa fn", async () => {
    const { prisma } = prismaComTrava(false);
    const fn = jest.fn(async () => "ok");
    await expect(comTravaAdvisory(prisma as never, CHAVE_TRAVA_RETRY, fn)).resolves.toEqual({ executou: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it("trava: lista vazia nao executa fn", async () => {
    const $queryRaw = jest.fn(async () => []);
    const prisma = { $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({ $queryRaw })) };
    const fn = jest.fn(async () => "ok");
    await expect(comTravaAdvisory(prisma as never, CHAVE_TRAVA_RETENCAO, fn)).resolves.toEqual({ executou: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it("trava: valor nao booleano nao executa fn", async () => {
    const { prisma } = prismaComTrava("sim");
    const fn = jest.fn(async () => "ok");
    await expect(comTravaAdvisory(prisma as never, CHAVE_TRAVA_RETENCAO, fn)).resolves.toEqual({ executou: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it("trava: a transacao recebe timeout de 15 minutos e maxWait de 10 segundos", async () => {
    const { prisma, $transaction } = prismaComTrava(true);
    await comTravaAdvisory(prisma as never, CHAVE_TRAVA_RETRY, async () => "ok");
    expect(($transaction.mock.calls[0] as unknown[])[1]).toEqual({ timeout: 900_000, maxWait: 10_000 });
  });

  it("trava: a chave do retry (520101) vai para a consulta", async () => {
    const { prisma, $queryRaw } = prismaComTrava(true);
    await comTravaAdvisory(prisma as never, CHAVE_TRAVA_RETRY, async () => "ok");
    expect(CHAVE_TRAVA_RETRY).toBe(520101);
    expect($queryRaw.mock.calls[0][1]).toBe(520101);
  });

  it("trava: a chave da retencao (520102) vai para a consulta", async () => {
    const { prisma, $queryRaw } = prismaComTrava(true);
    await comTravaAdvisory(prisma as never, CHAVE_TRAVA_RETENCAO, async () => "ok");
    expect(CHAVE_TRAVA_RETENCAO).toBe(520102);
    expect($queryRaw.mock.calls[0][1]).toBe(520102);
  });

  it("trava: erro de fn propaga e a transacao e revertida", async () => {
    const { prisma } = prismaComTrava(true);
    await expect(
      comTravaAdvisory(prisma as never, CHAVE_TRAVA_RETRY, async () => {
        throw new Error("falha no ciclo");
      }),
    ).rejects.toThrow("falha no ciclo");
  });

  it("trava: erro do $transaction propaga", async () => {
    const prisma = { $transaction: jest.fn(async () => Promise.reject(new Error("transacao caiu"))) };
    await expect(comTravaAdvisory(prisma as never, CHAVE_TRAVA_RETRY, async () => "ok")).rejects.toThrow(
      "transacao caiu",
    );
  });
});

describe("PesquisaService.anonimizarAntigos (anonimiza)", () => {
  it("anonimiza: o updateMany da pesquisa grava NULL nos campos pessoais e mantem os agregados", async () => {
    const { service, updateManyPesquisa } = montarServicoAnonimizacao();
    const agora = new Date("2026-11-15T00:00:00Z");
    await expect(service.anonimizarAntigos(12, agora)).resolves.toEqual({ pesquisas: 4, cupons: 2 });
    const chamada = (updateManyPesquisa.mock.calls as unknown[][])[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(chamada.data).toEqual({
      telefone: null,
      conversationId: null,
      comentario: null,
      contactId: null,
      conversationUuid: null,
      customerId: null,
      anonimizadaEm: agora,
    });
    expect(chamada.where).toEqual({
      criadaEm: { lt: new Date("2025-11-15T00:00:00Z") },
      anonimizadaEm: null,
    });
    expect(Object.values(chamada.data)).not.toContain("");
    expect(chamada.data).not.toHaveProperty("nota");
    expect(chamada.data).not.toHaveProperty("variante");
    expect(chamada.data).not.toHaveProperty("descontoAplicado");
  });

  it("anonimiza: cupons ligados perdem o telefone", async () => {
    const { service, updateManyCupom } = montarServicoAnonimizacao();
    const agora = new Date("2026-11-15T00:00:00Z");
    await service.anonimizarAntigos(12, agora);
    const chamada = (updateManyCupom.mock.calls as unknown[][])[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(chamada.where).toEqual({ criadoEm: { lt: new Date("2025-11-15T00:00:00Z") }, telefone: { not: null } });
    expect(chamada.data).toEqual({ telefone: null });
  });

  it("anonimiza: nunca apaga linhas nem toca a supressao", async () => {
    const { service, deleteManyPesquisa, deleteManyCupom, deleteManySupressao } = montarServicoAnonimizacao();
    await service.anonimizarAntigos(12, new Date("2026-11-15T00:00:00Z"));
    expect(deleteManyPesquisa).not.toHaveBeenCalled();
    expect(deleteManyCupom).not.toHaveBeenCalled();
    expect(deleteManySupressao).not.toHaveBeenCalled();
  });

  it("anonimiza: meses zero lanca RangeError sem consultar o banco", async () => {
    const { service, updateManyPesquisa, updateManyCupom } = montarServicoAnonimizacao();
    await expect(service.anonimizarAntigos(0)).rejects.toBeInstanceOf(RangeError);
    expect(updateManyPesquisa).not.toHaveBeenCalled();
    expect(updateManyCupom).not.toHaveBeenCalled();
  });

  it("anonimiza: meses negativo lanca RangeError sem consultar o banco", async () => {
    const { service, updateManyPesquisa } = montarServicoAnonimizacao();
    await expect(service.anonimizarAntigos(-3)).rejects.toBeInstanceOf(RangeError);
    expect(updateManyPesquisa).not.toHaveBeenCalled();
  });

  it("anonimiza: o log traz so as contagens", async () => {
    const { service, logger } = montarServicoAnonimizacao();
    await service.anonimizarAntigos(12, new Date("2026-11-15T00:00:00Z"));
    const textos = logger.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(textos).toContain("pesquisas=4");
    expect(textos).toContain("cupons=2");
    expect(textos).not.toContain(TELEFONE);
  });
});

describe("PesquisaModule (modulo)", () => {
  it("modulo: registra o PesquisaWebhookController e os dois jobs", () => {
    const controllers = (Reflect.getMetadata("controllers", PesquisaModule) ?? []) as unknown[];
    const providers = (Reflect.getMetadata("providers", PesquisaModule) ?? []) as unknown[];
    expect(controllers).toContain(PesquisaWebhookController);
    expect(providers).toContain(PesquisaRetryJob);
    expect(providers).toContain(PesquisaRetencaoJob);
  });
});
