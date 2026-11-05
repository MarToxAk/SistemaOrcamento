import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";
import * as nodemailer from "nodemailer";

import { EnviarEmailCobrancaDto } from "./dto/enviar-email-cobranca.dto";
import { SalvarCcPadraoDto } from "./dto/salvar-cc-padrao.dto";
import { EmailEnvioService, normalizarListaCc } from "./email-envio.service";

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
    cobrancaEmailCcPadrao: {
      findUnique: jest.fn(),
      upsert: jest.fn(async ({ create }: any) => ({ ...create })),
    },
  };
  (service as any).cobrancaService = {
    downloadBoletoPdf: jest
      .fn()
      .mockResolvedValue({ pdfBuffer: Buffer.from("b"), nomeArquivo: "boleto.pdf" }),
    baixarDanfsePdf: jest.fn().mockResolvedValue({
      pdfBuffer: Buffer.from("n"),
      nomeArquivo: "nfse.pdf",
      xml: "<NFSe/>",
      xmlNomeArquivo: "nfse.xml",
    }),
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
  it("1. anexa boleto + 2 NFS-e (PDF+XML) + 2 NF-e (PDF+XML) e grava o log", async () => {
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
    // boleto(1) + 2 NFS-e x (PDF+XML) + 2 NF-e x (PDF+XML) = 1 + 4 + 4
    expect(mail.attachments).toHaveLength(9);

    const nfsePdfs = mail.attachments.filter((a: any) => a.filename === "nfse.pdf");
    expect(nfsePdfs).toHaveLength(2);
    const nfseXmls = mail.attachments.filter(
      (a: any) => a.filename === "nfse.xml" && a.contentType === "application/xml",
    );
    expect(nfseXmls).toHaveLength(2);
    expect(nfseXmls[0].content).toBe("<NFSe/>");

    const nfePdfs = mail.attachments.filter((a: any) => /^NF-e-\d+\.pdf$/.test(a.filename));
    expect(nfePdfs.map((a: any) => a.filename)).toEqual(["NF-e-440.pdf", "NF-e-441.pdf"]);
    expect(nfePdfs.every((a: any) => a.content.subarray(0, 4).toString() === "%PDF")).toBe(true);

    const nfeXmls = mail.attachments.filter((a: any) => /^NF-e-\d+\.xml$/.test(a.filename));
    expect(nfeXmls.map((a: any) => a.filename)).toEqual(["NF-e-440.xml", "NF-e-441.xml"]);
    expect(nfeXmls.every((a: any) => a.content === "<NFe/>")).toBe(true);

    const gerarDanfe = (service as any).danfePdfService.gerarDanfe as jest.Mock;
    expect(gerarDanfe).toHaveBeenCalledTimes(2);
    expect(gerarDanfe).toHaveBeenCalledWith({ xml: "<NFe/>", cancelada: false });

    const token = out.token;
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    // Links do frontend (proxy) — nunca expor o backend direto ao cliente final.
    expect(mail.html).toContain(`https://app.exemplo.com/cobranca/pixel/${token}`);
    expect(mail.html).toContain(`https://app.exemplo.com/cobranca/confirmar/${token}`);
    expect(mail.html).toContain("<img");
    expect(mail.html).toContain("ACME LTDA");

    const createArg = (service as any).prisma.cobrancaEmailEnvio.create.mock.calls[0][0].data;
    expect(createArg.status).toBe("enviado");
    expect(createArg.token).toMatch(/^[0-9a-f]{48}$/);
    expect(createArg.nfeNumeros).toEqual(["440", "441"]);
    expect(createArg.nfseEmitidaIds).toEqual([20, 21]);

    expect(out.anexos).toHaveLength(9);
  });

  it("1b. render DANFE falha p/ uma NF-e -> fallback XML cru; sucesso p/ a outra anexa PDF+XML", async () => {
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
    // boleto(1) + NF-e 440 fallback (so xml, 1) + NF-e 441 sucesso (pdf+xml, 2)
    expect(mail.attachments).toHaveLength(4);

    const nfeXmls = mail.attachments.filter((a: any) => /^NF-e-\d+\.xml$/.test(a.filename));
    expect(nfeXmls.map((a: any) => a.filename)).toEqual(["NF-e-440.xml", "NF-e-441.xml"]);
    expect(nfeXmls.every((a: any) => a.content === "<NFe/>")).toBe(true);

    const nfePdfs = mail.attachments.filter((a: any) => /^NF-e-\d+\.pdf$/.test(a.filename));
    expect(nfePdfs).toHaveLength(1);
    expect(nfePdfs[0].filename).toBe("NF-e-441.pdf");

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

  it("5. sem NF-e Athos -> anexos so boleto + NFS-e (PDF+XML); nfeNumeros vazio", async () => {
    const { service, sendMail } = makeService();
    (service as any).athosService.buscarNotasFiscaisXmlPorTitulos.mockResolvedValue([]);
    await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      nfseEmitidaIds: [20],
    });
    // boleto(1) + NFS-e 20 (PDF+XML, 2)
    expect(sendMail.mock.calls[0][0].attachments).toHaveLength(3);
    const createArg = (service as any).prisma.cobrancaEmailEnvio.create.mock.calls[0][0].data;
    expect(createArg.nfeNumeros).toEqual([]);
  });
});

describe("EmailEnvioService.enviarBoletoENotas - CC (Fase 42)", () => {
  it("8. cc com 2 e-mails validos -> sendMail recebe cc na ordem informada e o retorno inclui cc", async () => {
    const { service, sendMail } = makeService();
    const out = await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      destinatario: "cli@x.com",
      cc: ["a@x.com", "b@x.com"],
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("cli@x.com");
    expect(mail.cc).toEqual(["a@x.com", "b@x.com"]);
    expect(out.cc).toEqual(["a@x.com", "b@x.com"]);
  });

  it("9. remove duplicados case-insensitive e o principal, mantendo a grafia da 1a ocorrencia", async () => {
    const { service, sendMail } = makeService();
    await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      destinatario: "cli@x.com",
      cc: ["A@x.com", "a@x.com", " CLI@X.COM ", "b@x.com"],
    });
    expect(sendMail.mock.calls[0][0].cc).toEqual(["A@x.com", "b@x.com"]);
  });

  it("10. sem destinatario no input, remove do cc o principal resolvido do Athos", async () => {
    const { service, sendMail } = makeService();
    await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      cc: ["COB@x.com", "z@x.com"],
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("cob@x.com");
    expect(mail.cc).toEqual(["z@x.com"]);
  });

  it("11. sem cc -> sem cabecalho Cc nem Bcc, mesmo com EMPRESA_EMAIL configurado (D-04)", async () => {
    const { service, sendMail } = makeService();
    (service as any).config = {
      get: (k: string) => ({ ...CONFIG, EMPRESA_EMAIL: "financeiro@empresa.com" })[k],
    };
    const out = await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      destinatario: "cli@x.com",
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.cc).toBeUndefined();
    expect(mail.bcc).toBeUndefined();
    expect(out.cc).toEqual([]);
  });

  it("12. cc com item invalido -> BadRequestException e sendMail nao chamado", async () => {
    const { service, sendMail } = makeService();
    await expect(
      service.enviarBoletoENotas({
        idclienteAthos: 1,
        cobrancaBoletoId: 10,
        destinatario: "cli@x.com",
        cc: ["ok@x.com", "invalido"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendMail).not.toHaveBeenCalled();
    expect((service as any).cobrancaService.downloadBoletoPdf).not.toHaveBeenCalled();
  });

  it("12b. cc com CRLF, virgula, <> ou aspas -> BadRequestException e sendMail nao chamado (WR-04)", async () => {
    const perigosos = [
      "x@y.com\r\nBcc: a@b.com",
      "\"a\r\nBcc: x\"@y.com",
      "a@y.com\nBcc: b@c.com",
      "a,b@x.com",
      "a@x.com,b@x.com",
      "<a@b.com>",
      "\"a,b\"@x.com",
      "a b@x.com",
      "a\u0000b@x.com",
    ];
    for (const ruim of perigosos) {
      const { service, sendMail } = makeService();
      await expect(
        service.enviarBoletoENotas({
          idclienteAthos: 1,
          cobrancaBoletoId: 10,
          destinatario: "cli@x.com",
          cc: [ruim],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sendMail).not.toHaveBeenCalled();
    }
  });

  it("12c. normalizarListaCc isolada (sem DTO) rejeita CRLF, virgula e <> mas aceita enderecos comuns (WR-04)", () => {
    for (const ruim of ["x@y.com\r\nBcc: a@b.com", "a,b@x.com", "<a@b.com>", "\"a b\"@x.com"]) {
      expect(() => normalizarListaCc([ruim])).toThrow(BadRequestException);
    }
    expect(normalizarListaCc(["nome.sobrenome+tag@sub.dominio.com.br", "o'brien@x.com"])).toEqual([
      "nome.sobrenome+tag@sub.dominio.com.br",
      "o'brien@x.com",
    ]);
  });

  it("13. mais de 10 e-mails distintos apos normalizacao -> BadRequestException e sendMail nao chamado", async () => {
    const { service, sendMail } = makeService();
    const cc = Array.from({ length: 11 }, (_, i) => `u${i}@x.com`);
    await expect(
      service.enviarBoletoENotas({
        idclienteAthos: 1,
        cobrancaBoletoId: 10,
        destinatario: "cli@x.com",
        cc,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("14. contrato HTTP (tracer): ValidationPipe aceita cc valido e o DTO chega ao sendMail com cc", async () => {
    const { service, sendMail } = makeService();
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const dto = (await pipe.transform(
      { idclienteAthos: 1, cobrancaBoletoId: 10, destinatario: "cli@x.com", cc: ["a@x.com"] },
      { type: "body", metatype: EnviarEmailCobrancaDto, data: "" },
    )) as EnviarEmailCobrancaDto;
    await service.enviarBoletoENotas(dto);
    expect(sendMail.mock.calls[0][0].cc).toEqual(["a@x.com"]);
  });

  it("15. contrato HTTP: ValidationPipe rejeita cc com item invalido e cc com 11 itens", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const meta = { type: "body" as const, metatype: EnviarEmailCobrancaDto, data: "" };
    await expect(
      pipe.transform({ idclienteAthos: 1, cobrancaBoletoId: 10, cc: ["ok@x.com", "invalido"] }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
    const onze = Array.from({ length: 11 }, (_, i) => `u${i}@x.com`);
    await expect(
      pipe.transform({ idclienteAthos: 1, cobrancaBoletoId: 10, cc: onze }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("16. grava em CobrancaEmailEnvio o cc normalizado", async () => {
    const { service } = makeService();
    await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      destinatario: "cli@x.com",
      cc: ["a@x.com", "A@x.com", "cli@x.com"],
    });
    const data = (service as any).prisma.cobrancaEmailEnvio.create.mock.calls[0][0].data;
    expect(data.cc).toEqual(["a@x.com"]);
  });

  it("17. sem cc grava cc como lista vazia", async () => {
    const { service } = makeService();
    await service.enviarBoletoENotas({
      idclienteAthos: 1,
      cobrancaBoletoId: 10,
      destinatario: "cli@x.com",
    });
    const data = (service as any).prisma.cobrancaEmailEnvio.create.mock.calls[0][0].data;
    expect(data.cc).toEqual([]);
  });
});

describe("EmailEnvioService lista fixa de CC por cliente (D-06)", () => {
  it("18. buscarCcPadrao com registro -> devolve os e-mails salvos", async () => {
    const { service } = makeService();
    const findUnique = (service as any).prisma.cobrancaEmailCcPadrao.findUnique as jest.Mock;
    findUnique.mockResolvedValueOnce({ idclienteAthos: 7, emails: ["a@x.com"] });
    const out = await service.buscarCcPadrao(7);
    expect(out).toEqual({ idclienteAthos: 7, emails: ["a@x.com"] });
    expect(findUnique).toHaveBeenCalledWith({ where: { idclienteAthos: 7 } });
  });

  it("19. buscarCcPadrao sem registro -> emails vazio", async () => {
    const { service } = makeService();
    (service as any).prisma.cobrancaEmailCcPadrao.findUnique.mockResolvedValueOnce(null);
    const out = await service.buscarCcPadrao(7);
    expect(out).toEqual({ idclienteAthos: 7, emails: [] });
  });

  it("20. id 0, negativo ou acima de 2^31-1 -> BadRequestException (400, nao 500) e Prisma nao chamado", async () => {
    const { service } = makeService();
    const p = (service as any).prisma.cobrancaEmailCcPadrao;
    for (const id of [0, -3, 1.5, Number.NaN, 2_147_483_648, 99_999_999_999]) {
      await expect(service.buscarCcPadrao(id)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.salvarCcPadrao(id, ["a@x.com"])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(p.findUnique).not.toHaveBeenCalled();
    expect(p.upsert).not.toHaveBeenCalled();
  });

  it("20b. id exatamente 2147483647 (limite do Int) e aceito (WR-05)", async () => {
    const { service } = makeService();
    const out = await service.buscarCcPadrao(2_147_483_647);
    expect(out.idclienteAthos).toBe(2_147_483_647);
  });

  it("21. salvarCcPadrao normaliza e faz upsert por idclienteAthos", async () => {
    const { service } = makeService();
    const upsert = (service as any).prisma.cobrancaEmailCcPadrao.upsert as jest.Mock;
    const out = await service.salvarCcPadrao(7, [" a@x.com ", "A@x.com", "b@x.com"]);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ idclienteAthos: 7 });
    expect(arg.create.emails).toEqual(["a@x.com", "b@x.com"]);
    expect(arg.update.emails).toEqual(["a@x.com", "b@x.com"]);
    expect(out).toEqual({ idclienteAthos: 7, emails: ["a@x.com", "b@x.com"] });
  });

  it("22. salvarCcPadrao com lista vazia -> upsert com emails [] (remove o padrao)", async () => {
    const { service } = makeService();
    const upsert = (service as any).prisma.cobrancaEmailCcPadrao.upsert as jest.Mock;
    const out = await service.salvarCcPadrao(7, []);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create.emails).toEqual([]);
    expect(upsert.mock.calls[0][0].update.emails).toEqual([]);
    expect(out).toEqual({ idclienteAthos: 7, emails: [] });
  });

  it("23. salvarCcPadrao com item invalido -> BadRequestException sem upsert", async () => {
    const { service } = makeService();
    const upsert = (service as any).prisma.cobrancaEmailCcPadrao.upsert as jest.Mock;
    await expect(service.salvarCcPadrao(7, ["a@x.com", "invalido"])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it("24. salvarCcPadrao com 11 e-mails distintos -> BadRequestException sem upsert", async () => {
    const { service } = makeService();
    const upsert = (service as any).prisma.cobrancaEmailCcPadrao.upsert as jest.Mock;
    const onze = Array.from({ length: 11 }, (_, i) => `u${i}@x.com`);
    await expect(service.salvarCcPadrao(7, onze)).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("25. contrato HTTP: ValidationPipe com SalvarCcPadraoDto aceita/rejeita corretamente", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const meta = { type: "body" as const, metatype: SalvarCcPadraoDto, data: "" };
    await expect(pipe.transform({ emails: ["a@x.com"] }, meta)).resolves.toMatchObject({
      emails: ["a@x.com"],
    });
    await expect(pipe.transform({ emails: [] }, meta)).resolves.toMatchObject({ emails: [] });
    await expect(pipe.transform({}, meta)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ emails: ["ok@x.com", "invalido"] }, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const onze = Array.from({ length: 11 }, (_, i) => `u${i}@x.com`);
    await expect(pipe.transform({ emails: onze }, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(pipe.transform({ emails: ["a@x.com"], extra: 1 }, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
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
