import { randomBytes } from "node:crypto";

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

import { AthosService } from "../integrations/athos/athos.service";
import { DanfePdfService } from "../integrations/nfse/danfe-pdf.service";
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
    private readonly danfePdfService: DanfePdfService,
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
    // Um item por documento (nao por arquivo) — usado so para montar a lista legivel no corpo do e-mail.
    const documentosResumo: { label: string; formatos: string[] }[] = [];

    if (input.cobrancaBoletoId) {
      const boletoPdf = await this.cobrancaService.downloadBoletoPdf(input.cobrancaBoletoId);
      attachments.push({ filename: boletoPdf.nomeArquivo, content: boletoPdf.pdfBuffer });
      documentosResumo.push({ label: "Boleto", formatos: ["PDF"] });
    }

    for (const id of nfseIdsUnicos) {
      const danfse = await this.cobrancaService.baixarDanfsePdf(id);
      attachments.push({
        filename: danfse.nomeArquivo,
        content: danfse.pdfBuffer,
        contentType: "application/pdf",
      });
      const formatos = ["PDF"];
      // Anexa o XML junto ao PDF sempre que a origem tiver o XML assinado disponível
      // (padrão Nacional). Notas antigas iiBrasil só têm o PDF do provedor — sem XML de origem.
      if (danfse.xml && danfse.xmlNomeArquivo) {
        attachments.push({
          filename: danfse.xmlNomeArquivo,
          content: danfse.xml,
          contentType: "application/xml",
        });
        formatos.push("XML");
      }
      const numeroNfse = danfse.nomeArquivo.match(/^NFSe-(.+)\.pdf$/)?.[1];
      documentosResumo.push({
        label: numeroNfse ? `Nota Fiscal de Serviço nº ${numeroNfse}` : "Nota Fiscal de Serviço",
        formatos,
      });
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
      for (const { numero, xml, cancelada } of notasXml) {
        try {
          const pdf = await this.danfePdfService.gerarDanfe({ xml, cancelada });
          attachments.push({
            filename: `NF-e-${numero}.pdf`,
            content: pdf,
            contentType: "application/pdf",
          });
          // Anexa o XML junto ao PDF (o XML é o documento fiscal; o PDF é so a representação).
          attachments.push({
            filename: `NF-e-${numero}.xml`,
            content: xml,
            contentType: "application/xml",
          });
          documentosResumo.push({ label: `Nota Fiscal (NF-e) nº ${numero}`, formatos: ["PDF", "XML"] });
        } catch (err) {
          this.logger.warn(
            `DANFE render falhou p/ NF-e ${numero}: ${err instanceof Error ? err.message : String(err)}; anexando XML cru.`,
          );
          documentosResumo.push({ label: `Nota Fiscal (NF-e) nº ${numero}`, formatos: ["XML"] });
          attachments.push({
            filename: `NF-e-${numero}.xml`,
            content: xml,
            contentType: "application/xml",
          });
        }
      }
      nfeNumeros = notasXml.map((n) => n.numero);
    }

    const anexos = attachments.map((a) => a.filename);

    const token = randomBytes(24).toString("hex");
    // APP_BASE_URL e o dominio publico do FRONTEND (mesmo usado no link de
    // aprovacao de orcamento, quotes.service.ts) — o cliente final e o
    // cliente de e-mail dele nunca devem acessar o backend diretamente.
    // As rotas /cobranca/confirmar/[token] e /cobranca/pixel/[token] no
    // frontend fazem o proxy para o backend real (backendFetch, server-side).
    const base = this.getRequiredConfig("APP_BASE_URL").replace(/\/+$/, "");
    const pixelUrl = `${base}/cobranca/pixel/${token}`;
    const confirmUrl = `${base}/cobranca/confirmar/${token}`;

    // White-label: nada de marca fixa aqui — nome/cor/logo vêm sempre das EMPRESA_* (multi-tenant).
    const empresaNome = this.config.get<string>("EMPRESA_NOME") ?? "Bom Custo";
    const empresaTelefones = this.config.get<string>("EMPRESA_TELEFONES")?.trim();
    const empresaEmail = this.config.get<string>("EMPRESA_EMAIL")?.trim();
    const empresaLogoUrl = this.config.get<string>("EMPRESA_LOGO_URL")?.trim();
    const empresaCor = this.config.get<string>("EMPRESA_COR_PRIMARIA") ?? "#0d6efd";
    const assunto = `Financeiro ${empresaNome} — Boleto e Nota Fiscal`;

    const html = this.montarCorpoHtml({
      nomeCliente,
      empresaNome,
      empresaTelefones,
      empresaEmail,
      empresaLogoUrl,
      empresaCor,
      documentosResumo,
      confirmUrl,
      pixelUrl,
    });
    const text = this.montarCorpoTexto({
      nomeCliente,
      empresaNome,
      empresaTelefones,
      empresaEmail,
      documentosResumo,
      confirmUrl,
    });

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

  /**
   * Debug: renderiza o DANFE (PDF) de uma NF-e por tras de um boleto, sem
   * disparar e-mail. Reaproveita exatamente o caminho do envio
   * (titulos do boleto -> buscarNotasFiscaisXmlPorTitulos). Se `numero`
   * for omitido, renderiza a 1a NF-e do boleto.
   */
  async previewDanfePdf(
    cobrancaBoletoId: number,
    numero?: string,
  ): Promise<{ pdfBuffer: Buffer; nomeArquivo: string }> {
    const boleto = await this.prisma.cobrancaBoleto.findUnique({
      where: { id: cobrancaBoletoId },
      include: { titulos: { select: { idcontareceber: true } } },
    });
    const idcontas = boleto?.titulos.map((t) => t.idcontareceber) ?? [];
    const notas = idcontas.length
      ? await this.athosService.buscarNotasFiscaisXmlPorTitulos(idcontas)
      : [];
    const alvo = numero?.trim() ? notas.find((n) => n.numero === numero.trim()) : notas[0];
    if (!alvo) {
      throw new NotFoundException("NF-e nao encontrada para esse boleto/numero.");
    }
    const pdfBuffer = await this.danfePdfService.gerarDanfe({
      xml: alvo.xml,
      cancelada: alvo.cancelada,
    });
    return { pdfBuffer, nomeArquivo: `NF-e-${alvo.numero}.pdf` };
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

  /**
   * Corpo HTML do e-mail de cobrança. White-label: layout genérico em tabelas
   * (compatível com clientes de e-mail que ignoram flex/grid), sem cor/marca
   * fixa — usa EMPRESA_NOME/EMPRESA_COR_PRIMARIA/EMPRESA_LOGO_URL do tenant.
   */
  private montarCorpoHtml(input: {
    nomeCliente: string;
    empresaNome: string;
    empresaTelefones?: string;
    empresaEmail?: string;
    empresaLogoUrl?: string;
    empresaCor: string;
    documentosResumo: { label: string; formatos: string[] }[];
    confirmUrl: string;
    pixelUrl: string;
  }): string {
    const esc = escapeHtml;
    const cor = /^#[0-9a-f]{3,8}$/i.test(input.empresaCor) ? input.empresaCor : "#0d6efd";

    const cabecalhoHtml = input.empresaLogoUrl
      ? `<img src="${esc(input.empresaLogoUrl)}" alt="${esc(input.empresaNome)}" height="40" style="display:block;max-height:40px;width:auto;border:0">`
      : `<span style="font-size:18px;font-weight:700;color:#212529">${esc(input.empresaNome)}</span>`;

    const documentosHtml = input.documentosResumo
      .map(
        (d, i) => `
      <tr>
        <td style="padding:0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="4" style="background:${cor};font-size:0;line-height:0">&nbsp;</td>
              <td style="padding:12px 16px;${i < input.documentosResumo.length - 1 ? "border-bottom:1px solid #e9e9e9" : ""}">
                <div style="font-size:14px;font-weight:600;color:#212529">${esc(d.label)}</div>
                <div style="font-size:12px;color:#6c757d;margin-top:2px">${esc(d.formatos.join(" + "))}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
      )
      .join("");

    const rodapeLinhas = [input.empresaTelefones, input.empresaEmail].filter(Boolean) as string[];
    const rodapeHtml = rodapeLinhas.map((l) => `<div>${esc(l)}</div>`).join("");

    return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e9e9e9">
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #e9e9e9">${cabecalhoHtml}</td>
        </tr>
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${cor};font-weight:700">Cobrança</p>
            <h1 style="margin:0 0 16px;font-size:20px;color:#212529">Olá, ${esc(input.nomeCliente)}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#495057">
              Segue em anexo a sua cobrança da <strong>${esc(input.empresaNome)}</strong>. Confira os documentos abaixo e clique no botão para confirmar o recebimento.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;margin:0 0 28px;overflow:hidden">
              ${documentosHtml}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 8px">
              <tr><td style="border-radius:8px;background:${cor}">
                <a href="${esc(input.confirmUrl)}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">Confirmar recebimento</a>
              </td></tr>
            </table>
            <p style="margin:8px 0 0;font-size:12px;color:#adb5bd;text-align:center">
              Se o botão não funcionar, copie e cole no navegador:<br>
              <a href="${esc(input.confirmUrl)}" style="color:${cor}">${esc(input.confirmUrl)}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#f8f9fa;border-top:1px solid #e9e9e9;text-align:center">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#212529">${esc(input.empresaNome)}</p>
            <div style="font-size:12px;color:#6c757d">${rodapeHtml}</div>
            <p style="margin:12px 0 0;font-size:11px;color:#adb5bd">Este é um e-mail automático — em caso de dúvida, responda diretamente esta mensagem.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
  <img src="${esc(input.pixelUrl)}" width="1" height="1" alt="" style="display:none">
</body>
</html>`;
  }

  /** Corpo em texto puro (fallback para clientes de e-mail sem HTML). */
  private montarCorpoTexto(input: {
    nomeCliente: string;
    empresaNome: string;
    empresaTelefones?: string;
    empresaEmail?: string;
    documentosResumo: { label: string; formatos: string[] }[];
    confirmUrl: string;
  }): string {
    const listaDocumentos = input.documentosResumo
      .map((d) => `- ${d.label} (${d.formatos.join(" + ")})`)
      .join("\n");
    const rodapeText = [input.empresaTelefones, input.empresaEmail].filter(Boolean).join("\n");

    return `Olá, ${input.nomeCliente},

Segue em anexo a sua cobrança da ${input.empresaNome}:

${listaDocumentos}

Confirmar recebimento: ${input.confirmUrl}

${input.empresaNome}
${rodapeText}`;
  }
}

/** Escapa texto para uso seguro dentro de HTML (nome de cliente/empresa vem de dados externos). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
