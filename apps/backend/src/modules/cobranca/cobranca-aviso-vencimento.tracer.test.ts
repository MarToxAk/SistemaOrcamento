import "reflect-metadata";

import * as nodemailer from "nodemailer";

import { hojeSaoPaulo } from "../integrations/athos/athos-conta-receber-baixa.service";
import { somarDias } from "./cobranca-aviso-vencimento.util";
import { CobrancaAvisoVencimentoJob } from "./cobranca-aviso-vencimento.job";
import { CobrancaAvisoVencimentoService } from "./cobranca-aviso-vencimento.service";
import { EmailEnvioService } from "./email-envio.service";

// Tracer da Fase 45: job -> servico -> util -> EmailEnvioService -> SMTP + registros.
// Nenhum banco, nenhum Athos e nenhum SMTP real: Prisma em memoria, nodemailer e athosService mockados.
jest.mock("nodemailer");

const CONFIG: Record<string, string> = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_USER: "u@g.com",
  SMTP_PASS: "p",
  SMTP_FROM: "F <u@g.com>",
  APP_BASE_URL: "https://app.exemplo.com",
  EMPRESA_NOME: "Bom Custo",
};

interface LinhaAviso {
  id: number;
  cobrancaBoletoId: number;
  tipo: string;
  status: string;
  [k: string]: unknown;
}

function montar(boletos: Array<Record<string, unknown>>, env: Record<string, string>) {
  const sendMail = jest.fn().mockResolvedValue({ messageId: "x" });
  (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

  const linhas: LinhaAviso[] = [];
  let seq = 0;

  const findMany = jest.fn(async () =>
    boletos.map((b) => ({
      ...b,
      avisos: linhas
        .filter((l) => l.cobrancaBoletoId === b.id)
        .map((l) => ({ id: l.id, tipo: l.tipo, status: l.status, tentativas: l.tentativas ?? 0 })),
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
  const prisma = {
    cobrancaBoleto: { findMany },
    cobrancaAvisoVencimento: {
      create,
      update,
      findUnique: jest.fn(
        async ({ where }: { where: { cobrancaBoletoId_tipo: { cobrancaBoletoId: number; tipo: string } } }) =>
          linhas.find(
            (l) =>
              l.cobrancaBoletoId === where.cobrancaBoletoId_tipo.cobrancaBoletoId &&
              l.tipo === where.cobrancaBoletoId_tipo.tipo,
          ) ?? null,
      ),
    },
    cobrancaEmailEnvio: {
      create: jest.fn(async ({ data }: { data: object }) => ({ id: 1, ...data })),
    },
    cobrancaEmailCcPadrao: {
      findUnique: jest.fn().mockResolvedValue({ idclienteAthos: 10, emails: ["socio@x.com"] }),
    },
  };

  const emailEnvio = Object.create(EmailEnvioService.prototype) as EmailEnvioService;
  Object.assign(emailEnvio, {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    config: { get: (k: string) => CONFIG[k] },
    prisma,
    cobrancaService: {
      downloadBoletoPdf: jest
        .fn()
        .mockResolvedValue({ pdfBuffer: Buffer.from("pdf"), nomeArquivo: "boleto.pdf" }),
    },
    athosService: {
      buscarDadosClienteContasReceber: jest.fn().mockResolvedValue({
        nome_cliente: "ACME LTDA",
        emailcobrancacliente: "cob@x.com",
        emailcliente: "c@x.com",
      }),
    },
  });

  const servico = Object.create(CobrancaAvisoVencimentoService.prototype) as CobrancaAvisoVencimentoService;
  Object.assign(servico, {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    prisma,
    emailEnvio,
  });

  const job = Object.create(CobrancaAvisoVencimentoJob.prototype) as CobrancaAvisoVencimentoJob;
  Object.assign(job, {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    config: { get: (k: string) => env[k] },
    avisos: servico,
    running: false,
  });

  return { job, sendMail, linhas, prisma, findMany, create };
}

function boleto(id: number, dias: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    idclienteAthos: 10,
    status: "pendente",
    valor: 150,
    expireAt: somarDias(hojeSaoPaulo(), dias),
    linkBoleto: `https://download.sejaefi.com.br/boleto-${id}.pdf`,
    athosBaixaStatus: null,
    ...extra,
  };
}

describe("Aviso de vencimento - tracer ponta a ponta (Fase 45)", () => {
  it("T1 caminho feliz D-1: 1 e-mail com CC, link e PDF; linha enviado e historico gravados", async () => {
    const { job, sendMail, linhas, prisma, findMany } = montar([boleto(7, 1)], {
      COBRANCA_AVISO_ATIVO: "true",
    });

    const r = await job.executar();

    expect(r).toEqual(expect.objectContaining({ enviados: 1, candidatos: 1, dryRun: false }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("cob@x.com");
    expect(mail.cc).toEqual(["socio@x.com"]);
    expect(mail.from).toBe("F <u@g.com>");
    expect(mail.subject).toContain("Lembrete: seu boleto vence amanhã");
    expect(mail.attachments).toEqual([expect.objectContaining({ filename: "boleto.pdf" })]);
    expect(mail.html).toContain("https://download.sejaefi.com.br/boleto-7.pdf");

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toEqual(
      expect.objectContaining({
        cobrancaBoletoId: 7,
        tipo: "D-1",
        status: "enviado",
        destinatario: "cob@x.com",
        cc: ["socio@x.com"],
        tentativas: 1,
      }),
    );
    expect(linhas[0].enviadoEm).toBeInstanceOf(Date);

    expect(prisma.cobrancaEmailEnvio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cobrancaBoletoId: 7,
        status: "enviado",
        nfseEmitidaIds: [],
        nfeNumeros: [],
      }),
    });

    const hoje = hojeSaoPaulo();
    const where = (findMany.mock.calls[0] as unknown[])[0] as {
      where: { status: string; expireAt: unknown; OR: unknown[] };
    };
    expect(where.where.status).toBe("pendente");
    expect(where.where.expireAt).toEqual({ gte: somarDias(hoje, -20), lte: somarDias(hoje, 3) });
    expect(where.where.OR).toContainEqual({ athosBaixaStatus: null });
  });

  it("T2 segunda execucao no mesmo dia nao reenvia", async () => {
    const { job, sendMail, linhas } = montar([boleto(7, 1)], { COBRANCA_AVISO_ATIVO: "true" });

    await job.executar();
    const segundo = await job.executar();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(segundo).toEqual(expect.objectContaining({ enviados: 0, jaProcessados: 1 }));
    expect(linhas).toHaveLength(1);
  });

  it.each([[undefined], ["false"], ["TRUE"]])(
    "T3 kill switch: COBRANCA_AVISO_ATIVO=%s nao consulta nem envia",
    async (valor) => {
      const env: Record<string, string> = {};
      if (valor !== undefined) env.COBRANCA_AVISO_ATIVO = valor;
      const { job, sendMail, findMany } = montar([boleto(7, 1)], env);

      await expect(job.executar()).resolves.toBeNull();

      expect(findMany).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    },
  );

  it("T4 fora das janelas e nao elegivel: nada e enviado nem reservado", async () => {
    const { job, sendMail, create } = montar(
      [
        boleto(1, 0),
        boleto(2, 5),
        boleto(3, -21),
        boleto(4, 1, { status: "pago" }),
        boleto(5, 1, { athosBaixaStatus: "baixado" }),
      ],
      { COBRANCA_AVISO_ATIVO: "true" },
    );

    const r = await job.executar();

    expect(r).toEqual(expect.objectContaining({ enviados: 0, itens: [] }));
    expect(sendMail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("T5 dry-run: nada e reservado nem enviado; previa com e-mail mascarado", async () => {
    const { job, sendMail, create } = montar([boleto(7, 1)], {
      COBRANCA_AVISO_ATIVO: "true",
      COBRANCA_AVISO_DRY_RUN: "true",
    });

    const r = await job.executar();

    expect(sendMail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(r?.dryRun).toBe(true);
    expect(r?.itens).toEqual([
      {
        cobrancaBoletoId: 7,
        idclienteAthos: 10,
        tipo: "D-1",
        diasParaVencer: 1,
        desfecho: "previa_enviaria",
        destinatarioMascarado: "co***@x.com",
        ccQuantidade: 1,
      },
    ]);
  });
});
