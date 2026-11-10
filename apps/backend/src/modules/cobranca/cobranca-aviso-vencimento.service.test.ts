import "reflect-metadata";

import {
  AVISO_INTERVALO_ENVIO_MS,
  AVISO_MAX_CANDIDATOS,
  AVISO_MAX_ENVIOS_POR_CICLO,
  CobrancaAvisoVencimentoService,
} from "./cobranca-aviso-vencimento.service";

// Orquestrador do aviso (Fase 45, plano 02): Prisma em memoria e EmailEnvioService falso.
// Nenhum banco, Athos ou SMTP real; datas fixas via processarCiclo({ agora }).

interface LinhaAviso {
  id: number;
  cobrancaBoletoId: number;
  tipo: string;
  status: string;
  tentativas: number;
  [k: string]: unknown;
}

type Boleto = Record<string, unknown> & { id: number };

const DEST_OK = {
  lookup: "ok" as const,
  nomeCliente: "ACME",
  destinatario: "cob@x.com",
  cc: ["socio@x.com"],
};

const AGORA = new Date("2026-11-10T15:00:00Z"); // hoje (Sao Paulo) = 2026-11-10

function boleto(id: number, expireAt: string | null, extra: Record<string, unknown> = {}): Boleto {
  return {
    id,
    idclienteAthos: 10,
    status: "pendente",
    valor: 150,
    expireAt,
    linkBoleto: `https://download.sejaefi.com.br/boleto-${id}.pdf`,
    athosBaixaStatus: null,
    ...extra,
  };
}

function montar(
  boletos: Boleto[],
  opts: {
    linhas?: Array<Partial<LinhaAviso> & { cobrancaBoletoId: number; tipo: string; status: string }>;
    resolver?: jest.Mock;
    updateManyCount?: number;
    avisosNaConsulta?: boolean;
  } = {},
) {
  const linhas: LinhaAviso[] = [];
  let seq = 100;
  for (const l of opts.linhas ?? []) {
    seq += 1;
    linhas.push({ id: seq, tentativas: 1, ...l });
  }

  // Quando avisosNaConsulta === false simula a corrida: a consulta nao ve a linha que o create encontra.
  const findMany = jest.fn(async () =>
    boletos.map((b) => ({
      ...b,
      avisos:
        opts.avisosNaConsulta === false
          ? []
          : linhas
              .filter((l) => l.cobrancaBoletoId === b.id)
              .map((l) => ({ id: l.id, tipo: l.tipo, status: l.status, tentativas: l.tentativas })),
    })),
  );
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (linhas.some((l) => l.cobrancaBoletoId === data.cobrancaBoletoId && l.tipo === data.tipo)) {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }
    seq += 1;
    const linha = { id: seq, ...data } as LinhaAviso;
    linhas.push(linha);
    return linha;
  });
  const update = jest.fn(async ({ where, data }: { where: { id: number }; data: object }) => {
    const linha = linhas.find((l) => l.id === where.id);
    if (!linha) throw new Error("linha inexistente");
    Object.assign(linha, data);
    return linha;
  });
  const updateMany = jest.fn(
    async ({ where, data }: { where: { id: number; status: string }; data: Record<string, unknown> }) => {
      if (opts.updateManyCount === 0) return { count: 0 };
      const linha = linhas.find((l) => l.id === where.id && l.status === where.status);
      if (!linha) return { count: 0 };
      const { tentativas, ...resto } = data;
      Object.assign(linha, resto);
      if (tentativas && typeof tentativas === "object" && "increment" in tentativas) {
        linha.tentativas += (tentativas as { increment: number }).increment;
      }
      return { count: 1 };
    },
  );
  const findUnique = jest.fn(
    async ({ where }: { where: { cobrancaBoletoId_tipo: { cobrancaBoletoId: number; tipo: string } } }) =>
      linhas.find(
        (l) =>
          l.cobrancaBoletoId === where.cobrancaBoletoId_tipo.cobrancaBoletoId &&
          l.tipo === where.cobrancaBoletoId_tipo.tipo,
      ) ?? null,
  );
  const prisma = {
    cobrancaBoleto: { findMany },
    cobrancaAvisoVencimento: { create, update, updateMany, findUnique },
  };

  const resolverDestinatariosAviso = opts.resolver ?? jest.fn().mockResolvedValue(DEST_OK);
  const enviarAvisoVencimento = jest
    .fn()
    .mockResolvedValue({ id: 1, token: "t", assunto: "a", anexouPdf: true });
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const aguardar = jest.fn().mockResolvedValue(undefined);

  const servico = Object.create(CobrancaAvisoVencimentoService.prototype) as CobrancaAvisoVencimentoService;
  Object.assign(servico, {
    logger,
    prisma,
    emailEnvio: { resolverDestinatariosAviso, enviarAvisoVencimento },
    aguardar,
  });

  return {
    servico,
    linhas,
    prisma,
    findMany,
    create,
    update,
    updateMany,
    findUnique,
    resolverDestinatariosAviso,
    enviarAvisoVencimento,
    logger,
    aguardar,
  };
}

function textosDeLog(logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock }): string {
  return [logger.log, logger.warn, logger.error]
    .flatMap((fn) => fn.mock.calls.map((c) => c.map(String).join(" ")))
    .join("\n");
}

describe("CobrancaAvisoVencimentoService (Fase 45, plano 02)", () => {
  describe("selecao, fuso, catch-up, cache, teto e pausa", () => {
    it("S1 forma da consulta: janela de datas, OR do athosBaixaStatus, take, orderBy e select.avisos", async () => {
      const { servico, findMany } = montar([]);

      await servico.processarCiclo({ agora: AGORA });

      expect(findMany).toHaveBeenCalledTimes(1);
      const arg = (findMany.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(arg.where).toEqual({
        status: "pendente",
        expireAt: { gte: "2026-10-21", lte: "2026-11-13" },
        OR: [{ athosBaixaStatus: null }, { athosBaixaStatus: { notIn: ["baixado", "ja_baixado"] } }],
      });
      expect(arg.take).toBe(AVISO_MAX_CANDIDATOS);
      expect(arg.orderBy).toEqual([{ expireAt: "asc" }, { id: "asc" }]);
      expect((arg.select as { avisos: unknown }).avisos).toEqual({
        select: { id: true, tipo: true, status: true, tentativas: true },
      });
    });

    it("S2 fuso: 23:30 em Sao Paulo (02:30Z do dia seguinte) ainda e o dia anterior", async () => {
      const { servico, create } = montar([boleto(1, "2026-11-11")]);

      const r = await servico.processarCiclo({ agora: new Date("2026-11-11T02:30:00Z") });

      expect(r.hoje).toBe("2026-11-10");
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cobrancaBoletoId: 1, tipo: "D-1" }),
      });
    });

    it("S3 catch-up: 9 dias de atraso recebe so o A+7; 30 dias, 0 e 5 dias nao recebem nada", async () => {
      const { servico, create, enviarAvisoVencimento } = montar([
        boleto(1, "2026-11-01"), // -9
        boleto(2, "2026-10-11"), // -30
        boleto(3, "2026-11-10"), // 0
        boleto(4, "2026-11-15"), // +5
      ]);

      const r = await servico.processarCiclo({ agora: AGORA });

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cobrancaBoletoId: 1, tipo: "A+7" }),
      });
      expect(enviarAvisoVencimento).toHaveBeenCalledTimes(1);
      expect(r.enviados).toBe(1);
      expect(r.itens).toHaveLength(1);
    });

    it("S4 cache por cliente: o cadastro de cada cliente e lido uma unica vez por ciclo", async () => {
      const { servico, resolverDestinatariosAviso } = montar([
        boleto(1, "2026-11-11", { idclienteAthos: 10 }),
        boleto(2, "2026-11-11", { idclienteAthos: 10 }),
        boleto(3, "2026-11-11", { idclienteAthos: 10 }),
        boleto(4, "2026-11-11", { idclienteAthos: 20 }),
      ]);

      await servico.processarCiclo({ agora: AGORA });

      expect(resolverDestinatariosAviso).toHaveBeenCalledTimes(2);
      expect(resolverDestinatariosAviso).toHaveBeenCalledWith(10);
      expect(resolverDestinatariosAviso).toHaveBeenCalledWith(20);
    });

    it("S5 teto: no maximo AVISO_MAX_ENVIOS_POR_CICLO envios; o excedente nao e reservado", async () => {
      const total = AVISO_MAX_ENVIOS_POR_CICLO + 1;
      const boletos = Array.from({ length: total }, (_, i) =>
        boleto(i + 1, "2026-11-11", { idclienteAthos: 1000 + i }),
      );
      const { servico, enviarAvisoVencimento, create, logger } = montar(boletos);

      const r = await servico.processarCiclo({ agora: AGORA });

      expect(enviarAvisoVencimento).toHaveBeenCalledTimes(AVISO_MAX_ENVIOS_POR_CICLO);
      expect(r.enviados).toBe(AVISO_MAX_ENVIOS_POR_CICLO);
      expect(create).toHaveBeenCalledTimes(AVISO_MAX_ENVIOS_POR_CICLO);
      expect(create).not.toHaveBeenCalledWith({
        data: expect.objectContaining({ cobrancaBoletoId: total }),
      });
      const avisos = logger.warn.mock.calls.map((c) => String(c[0]));
      expect(avisos.some((t) => t.includes("teto"))).toBe(true);
    });

    it("S6 pausa entre envios: aguardar(AVISO_INTERVALO_ENVIO_MS) no ciclo real e nunca no dry-run", async () => {
      const boletos = [
        boleto(1, "2026-11-11", { idclienteAthos: 1 }),
        boleto(2, "2026-11-11", { idclienteAthos: 2 }),
        boleto(3, "2026-11-11", { idclienteAthos: 3 }),
      ];
      const real = montar(boletos);
      await real.servico.processarCiclo({ agora: AGORA });
      expect(real.enviarAvisoVencimento).toHaveBeenCalledTimes(3);
      expect(real.aguardar.mock.calls.length).toBeGreaterThanOrEqual(2);
      for (const c of real.aguardar.mock.calls) expect(c[0]).toBe(AVISO_INTERVALO_ENVIO_MS);

      const dry = montar(boletos);
      await dry.servico.processarCiclo({ agora: AGORA, dryRun: true });
      expect(dry.aguardar).not.toHaveBeenCalled();
    });

    it("S7 defesa no laco: pago, ja baixado ou sem expireAt nao resolvem, reservam nem enviam", async () => {
      const { servico, resolverDestinatariosAviso, create, enviarAvisoVencimento } = montar([
        boleto(1, "2026-11-11", { status: "pago" }),
        boleto(2, "2026-11-11", { athosBaixaStatus: "ja_baixado" }),
        boleto(3, null),
      ]);

      const r = await servico.processarCiclo({ agora: AGORA });

      expect(resolverDestinatariosAviso).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(enviarAvisoVencimento).not.toHaveBeenCalled();
      expect(r.itens).toEqual([]);
    });
  });
});
