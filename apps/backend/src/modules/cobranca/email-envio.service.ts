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
import type { TipoAviso } from "./cobranca-aviso-vencimento.util";
import { EMAIL_CC_MAX } from "./dto/enviar-email-cobranca.dto";

// GIF89a transparente 1x1 canonico = 43 bytes (o acceptance do PLAN espera size_download=43).
// A string do PLAN (...AAIBRAA7) decodifica para 42 bytes; usamos a variante de 43 bytes.
const GIF_1X1_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
const INT32_MAX = 2_147_483_647;
// Rejeita espacos/CR/LF e demais caracteres de controle, '<' '>' ',' ';' aspas, parenteses,
// colchetes e barra invertida: nada que permita injetar cabecalho ou virar 2 destinatarios.
const EMAIL_RE =
  /^[^\s@<>,;"()[\]\\\x00-\x1f\x7f]+@[^\s@<>,;"()[\]\\\x00-\x1f\x7f]+\.[^\s@<>,;"()[\]\\\x00-\x1f\x7f]+$/;

/**
 * Normaliza a lista de CC (D-02): trim, descarta vazios, valida formato (EMAIL_RE),
 * remove duplicados case-insensitive (mantem a grafia da 1a ocorrencia), remove o
 * destinatario principal (case-insensitive) e aplica o limite EMAIL_CC_MAX.
 * Lanca BadRequestException para item invalido ou lista acima do limite.
 */
export function normalizarListaCc(
  lista: readonly string[] | undefined,
  destinatarioPrincipal?: string,
): string[] {
  const principal = destinatarioPrincipal?.trim().toLowerCase();
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const bruto of lista ?? []) {
    const email = typeof bruto === "string" ? bruto.trim() : "";
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException(`E-mail em cópia (CC) inválido: ${email}`);
    }
    const chave = email.toLowerCase();
    if (chave === principal || vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(email);
  }
  if (out.length > EMAIL_CC_MAX) {
    throw new BadRequestException(`Máximo de ${EMAIL_CC_MAX} e-mails em cópia (CC).`);
  }
  return out;
}

interface EnviarInput {
  idclienteAthos: number;
  cobrancaBoletoId?: number;
  nfseEmitidaIds?: number[];
  destinatario?: string;
  cc?: string[];
}

/** Resultado da resolucao de destinatarios do aviso (Fase 45, D-04). */
export interface DestinatariosAviso {
  /** "falha" = Athos nao respondeu (nao confundir com cliente sem e-mail). */
  lookup: "ok" | "falha";
  nomeCliente: string;
  destinatario: string | null;
  motivoSemEmail?: "vazio" | "invalido";
  cc: string[];
}

export interface EnviarAvisoVencimentoInput {
  cobrancaBoletoId: number;
  idclienteAthos: number;
  nomeCliente: string;
  destinatario: string;
  cc: string[];
  tipo: TipoAviso;
  diasParaVencer: number;
  valor: number;
  expireAt: string;
  linkBoleto: string | null;
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
    cc: string[];
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
    // Falha rapido (antes de baixar anexos) se algum CC for invalido ou exceder o limite.
    const cc = normalizarListaCc(input.cc, destinatario);

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
        ...(cc.length > 0 ? { cc } : {}),
        subject: assunto,
        html,
        text,
        attachments,
      });
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail para ${destinatario}${cc.length > 0 ? ` (+${cc.length} em cópia)` : ""}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new InternalServerErrorException("Falha ao enviar o e-mail.");
    }

    const row = await this.prisma.cobrancaEmailEnvio.create({
      data: {
        token,
        idclienteAthos: input.idclienteAthos,
        destinatario,
        cc,
        assunto,
        status: "enviado",
        cobrancaBoletoId: input.cobrancaBoletoId ?? null,
        nfseEmitidaIds: [...nfseIdsUnicos],
        nfeNumeros,
      },
    });

    return { id: row.id, token, destinatario, cc, status: row.status, anexos };
  }

  /** Lista fixa de CC do cliente (D-06). Sem registro -> lista vazia. */
  async buscarCcPadrao(
    idclienteAthos: number,
  ): Promise<{ idclienteAthos: number; emails: string[] }> {
    this.assertIdCliente(idclienteAthos);
    const row = await this.prisma.cobrancaEmailCcPadrao.findUnique({ where: { idclienteAthos } });
    return { idclienteAthos, emails: row?.emails ?? [] };
  }

  /**
   * Grava a lista fixa de CC do cliente (D-06), normalizada (D-02). Lista vazia grava []
   * (equivale a remover o padrao) — um unico caminho de escrita.
   */
  async salvarCcPadrao(
    idclienteAthos: number,
    emails: readonly string[],
  ): Promise<{ idclienteAthos: number; emails: string[] }> {
    this.assertIdCliente(idclienteAthos);
    const lista = normalizarListaCc(emails);
    const row = await this.prisma.cobrancaEmailCcPadrao.upsert({
      where: { idclienteAthos },
      create: { idclienteAthos, emails: lista },
      update: { emails: lista },
    });
    return { idclienteAthos, emails: row.emails };
  }

  private assertIdCliente(idclienteAthos: number): void {
    // A coluna idclienteAthos e Int (32 bits): acima disso o Prisma estoura e vira 500.
    if (!Number.isInteger(idclienteAthos) || idclienteAthos <= 0 || idclienteAthos > INT32_MAX) {
      throw new BadRequestException("idclienteAthos inválido.");
    }
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
   * Destinatarios do aviso de vencimento (Fase 45, D-04): principal = primeiro e-mail VALIDO entre
   * emailcobrancacliente e emailcliente (mesma regra de enviarBoletoENotas, sem cair em lixo);
   * CC = CC padrao do cliente (Fase 42) normalizado. Somente leitura (SELECT no Athos).
   */
  async resolverDestinatariosAviso(idclienteAthos: number): Promise<DestinatariosAviso> {
    const cliente = await this.athosService.buscarDadosClienteContasReceber(idclienteAthos);
    if (!cliente) {
      return { lookup: "falha", nomeCliente: "Cliente", destinatario: null, cc: [] };
    }
    const nomeCliente = cliente.nome_cliente ?? "Cliente";
    const candidatos = [cliente.emailcobrancacliente, cliente.emailcliente]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0);
    const principal = candidatos.find((v) => EMAIL_RE.test(v));
    if (!principal) {
      return {
        lookup: "ok",
        nomeCliente,
        destinatario: null,
        motivoSemEmail: candidatos.length === 0 ? "vazio" : "invalido",
        cc: [],
      };
    }
    // A lista ja e normalizada ao salvar (Fase 42); o try/catch e so defesa contra dado legado invalido:
    // CC ruim nunca deve impedir o aviso ao cliente.
    let cc: string[] = [];
    try {
      const padrao = await this.buscarCcPadrao(idclienteAthos);
      cc = normalizarListaCc(padrao.emails, principal);
    } catch (err) {
      this.logger.warn(
        `Aviso: CC padrao invalido ignorado (cliente=${idclienteAthos}): ${err instanceof Error ? err.name : "erro"}.`,
      );
    }
    return { lookup: "ok", nomeCliente, destinatario: principal, cc };
  }

  /**
   * Envia o e-mail de aviso de vencimento/atraso (Fase 45, D-04) com link do boleto e o PDF anexado.
   * Nao altera enviarBoletoENotas: reaproveita apenas transporte, branding e registro em CobrancaEmailEnvio.
   */
  async enviarAvisoVencimento(
    input: EnviarAvisoVencimentoInput,
  ): Promise<{ id: number | null; token: string; assunto: string; anexouPdf: boolean }> {
    const token = randomBytes(24).toString("hex");
    const base = this.getRequiredConfig("APP_BASE_URL").replace(/\/+$/, "");
    const pixelUrl = `${base}/cobranca/pixel/${token}`;

    const empresaNome = this.config.get<string>("EMPRESA_NOME") ?? "Bom Custo";
    const empresaTelefones = this.config.get<string>("EMPRESA_TELEFONES")?.trim();
    const empresaEmail = this.config.get<string>("EMPRESA_EMAIL")?.trim();
    const empresaLogoUrl = this.config.get<string>("EMPRESA_LOGO_URL")?.trim();
    const empresaCor = this.config.get<string>("EMPRESA_COR_PRIMARIA") ?? "#0d6efd";
    const assunto = `Financeiro ${empresaNome} — ${textoAssuntoAviso(input.tipo, input.diasParaVencer)}`;

    // Link so com http(s): qualquer outro esquema (ex.: javascript:) e tratado como ausente (T-45-02).
    const linkBoleto = input.linkBoleto && /^https?:\/\//i.test(input.linkBoleto.trim()) ? input.linkBoleto.trim() : null;
    const attachments: Anexo[] = [];
    if (linkBoleto) {
      // Best-effort: falha ao baixar o PDF nunca bloqueia o aviso (o corpo ja traz o link).
      try {
        const boletoPdf = await this.cobrancaService.downloadBoletoPdf(input.cobrancaBoletoId);
        attachments.push({
          filename: boletoPdf.nomeArquivo,
          content: boletoPdf.pdfBuffer,
          contentType: "application/pdf",
        });
      } catch (err) {
        this.logger.warn(
          `Aviso: PDF do boleto indisponivel, enviando so o link (cobrancaBoletoId=${input.cobrancaBoletoId}): ${err instanceof Error ? err.name : "erro"}.`,
        );
      }
    }
    const anexouPdf = attachments.length > 0;

    const dadosCorpo = {
      nomeCliente: input.nomeCliente,
      empresaNome,
      empresaTelefones,
      empresaEmail,
      tipo: input.tipo,
      diasParaVencer: input.diasParaVencer,
      valor: input.valor,
      expireAt: input.expireAt,
      linkBoleto,
      anexouPdf,
    };
    const html = this.montarCorpoAvisoHtml({ ...dadosCorpo, empresaLogoUrl, empresaCor, pixelUrl });
    const text = this.montarCorpoAvisoTexto(dadosCorpo);

    const transport = this.buildTransport();
    try {
      await transport.sendMail({
        from: this.config.get<string>("SMTP_FROM"),
        to: input.destinatario,
        ...(input.cc.length > 0 ? { cc: input.cc } : {}),
        subject: assunto,
        html,
        text,
        attachments,
      });
    } catch (err) {
      // Sem o endereco no log (T-45-05): so ids e tipo.
      this.logger.error(
        `Falha ao enviar aviso de vencimento cobrancaBoletoId=${input.cobrancaBoletoId} tipo=${input.tipo}: ${err instanceof Error ? err.name : "erro"}.`,
      );
      throw new InternalServerErrorException("Falha ao enviar o aviso de vencimento.");
    }

    // O e-mail ja saiu: falha ao gravar o historico NAO pode lancar, senao o orquestrador marcaria erro
    // e reenviaria o aviso (duplicado ao cliente).
    let id: number | null = null;
    try {
      const row = await this.prisma.cobrancaEmailEnvio.create({
        data: {
          token,
          idclienteAthos: input.idclienteAthos,
          destinatario: input.destinatario,
          cc: input.cc,
          assunto,
          status: "enviado",
          cobrancaBoletoId: input.cobrancaBoletoId,
          nfseEmitidaIds: [],
          nfeNumeros: [],
        },
      });
      id = row.id;
    } catch (err) {
      this.logger.error(
        `Aviso enviado, mas o historico nao foi gravado (cobrancaBoletoId=${input.cobrancaBoletoId} tipo=${input.tipo}): ${err instanceof Error ? err.name : "erro"}.`,
      );
    }
    return { id, token, assunto, anexouPdf };
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

  /** Corpo HTML do aviso de vencimento/atraso (Fase 45): mesma casca em tabelas do e-mail de cobranca, sem confirmar recebimento. */
  private montarCorpoAvisoHtml(input: {
    nomeCliente: string;
    empresaNome: string;
    empresaTelefones?: string;
    empresaEmail?: string;
    empresaLogoUrl?: string;
    empresaCor: string;
    tipo: TipoAviso;
    diasParaVencer: number;
    valor: number;
    expireAt: string;
    linkBoleto: string | null;
    anexouPdf: boolean;
    pixelUrl: string;
  }): string {
    const esc = escapeHtml;
    const cor = /^#[0-9a-f]{3,8}$/i.test(input.empresaCor) ? input.empresaCor : "#0d6efd";
    const atraso = input.diasParaVencer < 0;
    const faixa = atraso ? "Boleto em atraso" : "Lembrete de vencimento";
    const valor = formatarBRL(input.valor);
    const vencimento = formatarDataBR(input.expireAt);

    const cabecalhoHtml = input.empresaLogoUrl
      ? `<img src="${esc(input.empresaLogoUrl)}" alt="${esc(input.empresaNome)}" height="40" style="display:block;max-height:40px;width:auto;border:0">`
      : `<span style="font-size:18px;font-weight:700;color:#212529">${esc(input.empresaNome)}</span>`;

    const paragrafo = atraso
      ? `Identificamos que o boleto da <strong>${esc(input.empresaNome)}</strong> no valor de <strong>${esc(valor)}</strong>, com vencimento em <strong>${esc(vencimento)}</strong>, consta em aberto em nosso sistema.`
      : `Lembramos que o boleto da <strong>${esc(input.empresaNome)}</strong> no valor de <strong>${esc(valor)}</strong> vence em <strong>${esc(vencimento)}</strong>.`;
    const complemento = atraso ? TEXTO_ATRASO_DESCONSIDERE : TEXTO_AVISO_DESCONSIDERE;
    const anexoHtml = input.anexouPdf
      ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#495057">O boleto segue em anexo (PDF).</p>`
      : "";
    const botaoHtml = input.linkBoleto
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 8px">
              <tr><td style="border-radius:8px;background:${cor}">
                <a href="${esc(input.linkBoleto)}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">Ver boleto</a>
              </td></tr>
            </table>`
      : "";

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
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${cor};font-weight:700">${esc(faixa)}</p>
            <h1 style="margin:0 0 16px;font-size:20px;color:#212529">Olá, ${esc(input.nomeCliente)}</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#495057">${paragrafo}</p>
            ${anexoHtml}
            ${botaoHtml}
            <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6c757d">${esc(complemento)}</p>
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

  /** Corpo em texto puro do aviso de vencimento/atraso (fallback para clientes de e-mail sem HTML). */
  private montarCorpoAvisoTexto(input: {
    nomeCliente: string;
    empresaNome: string;
    empresaTelefones?: string;
    empresaEmail?: string;
    tipo: TipoAviso;
    diasParaVencer: number;
    valor: number;
    expireAt: string;
    linkBoleto: string | null;
    anexouPdf: boolean;
  }): string {
    const atraso = input.diasParaVencer < 0;
    const valor = formatarBRL(input.valor);
    const vencimento = formatarDataBR(input.expireAt);
    const linhas: string[] = [`Olá, ${input.nomeCliente},`, ""];
    if (atraso) {
      linhas.push(
        `Identificamos que o boleto da ${input.empresaNome} no valor de ${valor}, com vencimento em ${vencimento}, consta em aberto em nosso sistema.`,
      );
    } else {
      linhas.push(
        `Lembramos que o boleto da ${input.empresaNome} no valor de ${valor} vence em ${vencimento}.`,
      );
    }
    if (input.linkBoleto) linhas.push("", `Ver boleto: ${input.linkBoleto}`);
    if (input.anexouPdf) linhas.push("", "O boleto segue em anexo (PDF).");
    linhas.push("", atraso ? TEXTO_ATRASO_DESCONSIDERE : TEXTO_AVISO_DESCONSIDERE, "", input.empresaNome);
    const rodape = [input.empresaTelefones, input.empresaEmail].filter(Boolean).join("\n");
    if (rodape) linhas.push(rodape);
    return linhas.join("\n");
  }
}

const TEXTO_AVISO_DESCONSIDERE = "Se o pagamento já foi feito, por favor desconsidere esta mensagem.";
const TEXTO_ATRASO_DESCONSIDERE =
  "Se o pagamento já foi feito, por favor desconsidere esta mensagem. Para segunda via ou dúvidas, fale conosco.";

/** Assunto (sem o prefixo "Financeiro <empresa> - ") por tipo de aviso; N vem dos dias reais (catch-up). */
function textoAssuntoAviso(tipo: TipoAviso, diasParaVencer: number): string {
  if (tipo === "D-3") return `Lembrete: seu boleto vence em ${Math.max(diasParaVencer, 1)} dias`;
  if (tipo === "D-1") return "Lembrete: seu boleto vence amanhã";
  return `Aviso: boleto vencido há ${Math.abs(diasParaVencer)} dias`;
}

function formatarBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

/** YYYY-MM-DD -> DD/MM/AAAA por split (sem Date, evita deslocamento de fuso). */
function formatarDataBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : dataISO;
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
