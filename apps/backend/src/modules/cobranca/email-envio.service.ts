import { randomBytes } from "node:crypto";

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

import { AthosService } from "../integrations/athos/athos.service";
import { PrismaService } from "../database/prisma.service";
import { CobrancaService } from "./cobranca.service";

// GIF89a transparente 1x1 canonico = 43 bytes (o acceptance do PLAN espera size_download=43).
// A string do PLAN (...AAIBRAA7) decodifica para 42 bytes; usamos a variante de 43 bytes.
const GIF_1X1_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EnviarInput {
  idclienteAthos: number;
  cobrancaBoletoId?: number;
  nfseEmitidaIds?: number[];
  destinatario?: string;
}

interface Anexo {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

@Injectable()
export class EmailEnvioService {
  private readonly logger = new Logger(EmailEnvioService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cobrancaService: CobrancaService,
    private readonly athosService: AthosService,
  ) {}

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new InternalServerErrorException(`Variável de ambiente ${key} não configurada.`);
    }
    return value;
  }

  private buildTransport(): nodemailer.Transporter {
    const host = this.config.get<string>("SMTP_HOST")?.trim();
    const port = this.config.get<string>("SMTP_PORT")?.trim();
    const user = this.config.get<string>("SMTP_USER")?.trim();
    const pass = this.config.get<string>("SMTP_PASS")?.trim();
    if (!host || !port || !user || !pass) {
      throw new InternalServerErrorException("Variavel de ambiente SMTP_* nao configurada.");
    }
    return nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass },
    });
  }

  async enviarBoletoENotas(input: EnviarInput): Promise<{
    id: number;
    token: string;
    destinatario: string;
    status: string;
    anexos: string[];
  }> {
    const nfseIdsUnicos = [...new Set(input.nfseEmitidaIds ?? [])];
    if (!input.cobrancaBoletoId && nfseIdsUnicos.length === 0) {
      throw new BadRequestException("Selecione ao menos um documento (boleto ou NFS-e).");
    }

    // Nome do cliente vem SEMPRE do Athos (mesmo com destinatario digitado).
    const cliente = await this.athosService.buscarDadosClienteContasReceber(input.idclienteAthos);
    const nomeCliente = cliente?.nome_cliente ?? "Cliente";

    const destinatario =
      input.destinatario?.trim() || cliente?.emailcobrancacliente || cliente?.emailcliente || "";
    if (!destinatario || !EMAIL_RE.test(destinatario)) {
      throw new BadRequestException("Cliente sem e-mail cadastrado; informe o destinatario.");
    }

    const attachments: Anexo[] = [];

    if (input.cobrancaBoletoId) {
      const boletoPdf = await this.cobrancaService.downloadBoletoPdf(input.cobrancaBoletoId);
      attachments.push({ filename: boletoPdf.nomeArquivo, content: boletoPdf.pdfBuffer });
    }

    for (const id of nfseIdsUnicos) {
      const danfse = await this.cobrancaService.baixarDanfsePdf(id);
      attachments.push({ filename: danfse.nomeArquivo, content: danfse.pdfBuffer });
    }

    let nfeNumeros: string[] = [];
    if (input.cobrancaBoletoId) {
      const boleto = await this.prisma.cobrancaBoleto.findUnique({
        where: { id: input.cobrancaBoletoId },
        include: { titulos: { select: { idcontareceber: true } } },
      });
      const idcontas = boleto?.titulos.map((t) => t.idcontareceber) ?? [];
      const notasXml = idcontas.length
        ? await this.athosService.buscarNotasFiscaisXmlPorTitulos(idcontas)
        : [];
      for (const { numero, xml } of notasXml) {
        attachments.push({
          filename: `NF-e-${numero}.xml`,
          content: xml,
          contentType: "application/xml",
        });
      }
      nfeNumeros = notasXml.map((n) => n.numero);
    }

    const anexos = attachments.map((a) => a.filename);

    const token = randomBytes(24).toString("hex");
    const base = this.getRequiredConfig("APP_BASE_URL").replace(/\/+$/, "");
    const pixelUrl = `${base}/api/cobranca/email/${token}/pixel.gif`;
    const confirmUrl = `${base}/api/cobranca/email/${token}/confirmar`;

    const empresaNome = this.config.get<string>("EMPRESA_NOME") ?? "Bom Custo";
    const empresaTelefones = this.config.get<string>("EMPRESA_TELEFONES")?.trim();
    const empresaEmail = this.config.get<string>("EMPRESA_EMAIL")?.trim();
    const assunto = `Boleto e nota fiscal — ${empresaNome}`;

    const nNfse = nfseIdsUnicos.length;
    const mNfe = nfeNumeros.length;
    const listaAnexosFrase = `Serão anexados: boleto (PDF) + ${nNfse} NFS-e (PDF) + ${mNfe} NF-e (XML)`;

    const rodapeLinhas = [empresaNome, empresaTelefones, empresaEmail].filter(Boolean);
    const rodapeHtml = rodapeLinhas.map((l) => `<div>${l}</div>`).join("");
    const rodapeText = rodapeLinhas.join("\n");

    const html = `<!doctype html><meta charset="utf-8">
<div style="font-family:system-ui,Arial,sans-serif;max-width:32rem;margin:0 auto;color:#212529">
  <p>Ola, ${nomeCliente},</p>
  <p>${listaAnexosFrase}.</p>
  <p style="margin:1.5rem 0">
    <a href="${confirmUrl}" style="background:#198754;color:#fff;padding:.6rem 1.2rem;border-radius:.375rem;text-decoration:none;display:inline-block">Confirmar recebimento</a>
  </p>
  <p style="font-size:.85rem;color:#6c757d">Se o botao nao funcionar, copie e cole no navegador:<br>${confirmUrl}</p>
  <hr style="border:none;border-top:1px solid #dee2e6;margin:1.5rem 0">
  <div style="font-size:.85rem;color:#6c757d">${rodapeHtml}</div>
  <img src="${pixelUrl}" width="1" height="1" alt="" style="display:none">
</div>`;

    const text = `Ola, ${nomeCliente},

${listaAnexosFrase}.

Confirmar recebimento: ${confirmUrl}

${rodapeText}`;

    const transport = this.buildTransport();
    try {
      await transport.sendMail({
        from: this.config.get<string>("SMTP_FROM"),
        to: destinatario,
        subject: assunto,
        html,
        text,
        attachments,
      });
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail para ${destinatario}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new InternalServerErrorException("Falha ao enviar o e-mail.");
    }

    const row = await this.prisma.cobrancaEmailEnvio.create({
      data: {
        token,
        idclienteAthos: input.idclienteAthos,
        destinatario,
        assunto,
        status: "enviado",
        cobrancaBoletoId: input.cobrancaBoletoId ?? null,
        nfseEmitidaIds: [...nfseIdsUnicos],
        nfeNumeros,
      },
    });

    return { id: row.id, token, destinatario, status: row.status, anexos };
  }

  async registrarAbertura(token: string): Promise<Buffer> {
    try {
      const row = await this.prisma.cobrancaEmailEnvio.findUnique({ where: { token } });
      if (row && row.abertoEm == null) {
        await this.prisma.cobrancaEmailEnvio.update({
          where: { token },
          data: {
            abertoEm: new Date(),
            ...(row.status === "enviado" ? { status: "aberto" } : {}),
          },
        });
      }
    } catch (err) {
      this.logger.warn(
        `registrarAbertura: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Sempre retorna o gif 1x1 (nao vazar existencia do token).
    return Buffer.from(GIF_1X1_BASE64, "base64");
  }

  async registrarConfirmacao(token: string): Promise<{ found: boolean }> {
    const row = await this.prisma.cobrancaEmailEnvio.findUnique({ where: { token } });
    if (!row) return { found: false };
    await this.prisma.cobrancaEmailEnvio.update({
      where: { token },
      data: {
        confirmadoEm: row.confirmadoEm ?? new Date(),
        status: "confirmado",
        abertoEm: row.abertoEm ?? new Date(),
      },
    });
    return { found: true };
  }
}
