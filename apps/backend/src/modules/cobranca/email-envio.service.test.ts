import { BadRequestException } from "@nestjs/common";
import * as nodemailer from "nodemailer";

import { EmailEnvioService } from "./email-envio.service";

jest.mock("nodemailer");

const CONFIG: Record<string, string> = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_USER: "u@g.com",
  SMTP_PASS: "p",
  SMTP_FROM: "F <u@g.com>",
  APP_BASE_URL: "https://app.exemplo.com",
  EMPRESA_NOME: "Bom Custo",
  EMPRESA_TELEFONES: "",
  EMPRESA_EMAIL: "",
};

function makeService() {
  const sendMail = jest.fn().mockResolvedValue({ messageId: "x" });
  (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

  const service = Object.create(EmailEnvioService.prototype) as EmailEnvioService;
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (service as any).config = { get: (k: string) => CONFIG[k] };
  (service as any).prisma = {
    cobrancaBoleto: {
      findUnique: jest.fn().mockResolvedValue({
        id: 10,
        titulos: [{ idcontareceber: 501 }, { idcontareceber: 502 }],
      }),
    },
    cobrancaEmailEnvio: {
      create: jest.fn(async ({ data }: any) => ({ id: 1, ...data })),
      findUnique: jest.fn(),
      update: jest.fn(async (a: any) => a),
    },
  };
  (service as any).cobrancaService = {
    downloadBoletoPdf: jest
      .fn()
      .mockResolvedValue({ pdfBuffer: Buffer.from("b"), nomeArquivo: "boleto.pdf" }),
    baixarDanfsePdf: jest
      .fn()
      .mockResolvedValue({ pdfBuffer: Buffer.from("n"), nomeArquivo: "nfse.pdf" }),
  };
  (service as any).athosService = {
    buscarDadosClienteContasReceber: jest.fn().mockResolvedValue({
      nome_cliente: "ACME LTDA",
      emailcobrancacliente: "cob@x.com",
      emailcliente: "c@x.com",
    }),
    buscarNotasFiscaisXmlPorTitulos: jest.fn().mockResolvedValue([
      { numero: "440", xml: "<NFe/>", cancelada: false },
      { numero: "441", xml: "<NFe/>", cancelada: false },
    ]),
  };
  (service as any).danfePdfService = {
    gerarDanfe: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake-danfe")),
  };
  return { service, sendMail };
}

describe("EmailEnvioService.enviarBoletoENotas", () => {
  it("1. anexa boleto + 2 NFS-e + 2 NF-e PDF e grava o log", async () => {
    const { service, sendMail } = makeService();

    const out = await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      nfseEmitidaIds: [20, 21],
      destinatario: "cli@x.com",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("cli@x.com");
    expect(mail.from).toBe("F <u@g.com>");
    expect(mail.attachments).toHaveLength(5);

    const pdfs = mail.attachments.filter((a: any) => a.contentType === "application/pdf");
    expect(pdfs).toHaveLength(2);
    expect(pdfs.map((a: any) => a.filename)).toEqual(["NF-e-440.pdf", "NF-e-441.pdf"]);
    expect(pdfs.every((a: any) => a.content.subarray(0, 4).toString() === "%PDF")).toBe(true);

    const gerarDanfe = (service as any).danfePdfService.gerarDanfe as jest.Mock;
    expect(gerarDanfe).toHaveBeenCalledTimes(2);
    expect(gerarDanfe).toHaveBeenCalledWith({ xml: "<NFe/>", cancelada: false });

    const token = out.token;
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(mail.html).toContain(`https://app.exemplo.com/api/cobranca/email/${token}`);
    expect(mail.html).toContain("<img");
    expect(mail.html).toContain("ACME LTDA");

    const createArg = (service as any).prisma.cobrancaEmailEnvio.create.mock.calls[0][0].data;
    expect(createArg.status).toBe("enviado");
    expect(createArg.token).toMatch(/^[0-9a-f]{48}$/);
    expect(createArg.nfeNumeros).toEqual(["440", "441"]);
    expect(createArg.nfseEmitidaIds).toEqual([20, 21]);

    expect(out.anexos).toHaveLength(5);
  });

  it("1b. render DANFE falha p/ uma NF-e -> fallback XML cru; e-mail sai normal", async () => {
    const { service, sendMail } = makeService();
    (service as any).danfePdfService.gerarDanfe
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(Buffer.from("%PDF-1.4 ok"));

    await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      destinatario: "cli@x.com",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];

    const xmlFallback = mail.attachments.filter((a: any) => a.contentType === "application/xml");
    expect(xmlFallback).toHaveLength(1);
    expect(xmlFallback[0].filename).toBe("NF-e-440.xml");
    expect(xmlFallback[0].content).toBe("<NFe/>");

    const pdfs = mail.attachments.filter((a: any) => a.contentType === "application/pdf");
    expect(pdfs).toHaveLength(1);
    expect(pdfs[0].filename).toBe("NF-e-441.pdf");

    const createArg = (service as any).prisma.cobrancaEmailEnvio.create.mock.calls[0][0].data;
    expect(createArg.nfeNumeros).toEqual(["440", "441"]);
  });

  it("2. sem destinatario usa emailcobrancacliente do Athos", async () => {
    const { service, sendMail } = makeService();
    await service.enviarBoletoENotas({ idclienteAthos: 1, cobrancaBoletoId: 10 });
    expect(sendMail.mock.calls[0][0].to).toBe("cob@x.com");
  });

  it("3. cliente sem dados no Athos e sem destinatario -> BadRequestException", async () => {
    const { service, sendMail } = makeService();
    (service as any).athosService.buscarDadosClienteContasReceber.mockResolvedValue(null);
    await expect(
      service.enviarBoletoENotas({ idclienteAthos: 1, cobrancaBoletoId: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("4. sem boleto e sem NFS-e -> BadRequestException", async () => {
    const { service, sendMail } = makeService();
    await expect(service.enviarBoletoENotas({ idclienteAthos: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("5. sem NF-e Athos -> anexos so boleto + NFS-e; nfeNumeros vazio", async () => {
    const { service, sendMail } = makeService();
    (service as any).athosService.buscarNotasFiscaisXmlPorTitulos.mockResolvedValue([]);
    await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      nfseEmitidaIds: [20],
    });
    expect(sendMail.mock.calls[0][0].attachments).toHaveLength(2);
    const createArg = (service as any).prisma.cobrancaEmailEnvio.create.mock.calls[0][0].data;
    expect(createArg.nfeNumeros).toEqual([]);
  });
});

describe("EmailEnvioService.registrarAbertura", () => {
  it("6. grava abertoEm/status na 1a chamada e nao regrava na 2a", async () => {
    const { service } = makeService();
    const findUnique = (service as any).prisma.cobrancaEmailEnvio.findUnique as jest.Mock;
    const update = (service as any).prisma.cobrancaEmailEnvio.update as jest.Mock;

    findUnique.mockResolvedValueOnce({ id: 1, token: "tok", status: "enviado", abertoEm: null });
    const gif1 = await service.registrarAbertura("tok");
    expect(gif1).toHaveLength(43);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.abertoEm).toBeInstanceOf(Date);
    expect(update.mock.calls[0][0].data.status).toBe("aberto");

    update.mockClear();
    findUnique.mockResolvedValueOnce({
      id: 1,
      token: "tok",
      status: "aberto",
      abertoEm: new Date(),
    });
    const gif2 = await service.registrarAbertura("tok");
    expect(gif2).toHaveLength(43);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("EmailEnvioService.registrarConfirmacao", () => {
  it("7. confirma row existente e ignora token desconhecido", async () => {
    const { service } = makeService();
    const findUnique = (service as any).prisma.cobrancaEmailEnvio.findUnique as jest.Mock;
    const update = (service as any).prisma.cobrancaEmailEnvio.update as jest.Mock;

    findUnique.mockResolvedValueOnce({
      id: 1,
      token: "tok",
      status: "aberto",
      abertoEm: new Date(),
      confirmadoEm: null,
    });
    const r1 = await service.registrarConfirmacao("tok");
    expect(r1).toEqual({ found: true });
    expect(update.mock.calls[0][0].data.status).toBe("confirmado");
    expect(update.mock.calls[0][0].data.confirmadoEm).toBeInstanceOf(Date);

    update.mockClear();
    findUnique.mockResolvedValueOnce(null);
    const r2 = await service.registrarConfirmacao("desconhecido");
    expect(r2).toEqual({ found: false });
    expect(update).not.toHaveBeenCalled();
  });
});
