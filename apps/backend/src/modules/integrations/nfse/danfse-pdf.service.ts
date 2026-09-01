import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";

import { DANFSE_PDF_HTML_TEMPLATE } from "./danfse-pdf.template";
import { parseDanfseFields } from "./danfse-xml-parser.util";

// ---------------------------------------------------------------------------
// Gera o DANFSe (PDF) localmente a partir do XML da NFS-e. A API do governo
// que fazia isso foi descontinuada em 03/08/2026 (NT 008/2026 — DANFSe 2.0).
//
// Reaproveita o mesmo padrao hardened do Puppeteer usado no PDF do orcamento
// (QuotesPdfStorageService.renderPdfBuffer): rede bloqueada (so about:blank e
// data: passam), sem sandbox pois o container roda como root. Ver comentario
// D-02 em quotes-pdf-storage.service.ts para o racional completo.
// ---------------------------------------------------------------------------
@Injectable()
export class DanfsePdfService {
  private readonly logger = new Logger(DanfsePdfService.name);

  constructor(private readonly configService: ConfigService) {}

  async gerarPdfDoXml(nfseXml: string): Promise<Buffer> {
    const campos = parseDanfseFields(nfseXml);
    const empresaLogoUrl = await this.resolveLogoDataUri(this.configService.get<string>("EMPRESA_LOGO_URL"));

    const hbs = Handlebars.create();
    const template = hbs.compile(DANFSE_PDF_HTML_TEMPLATE, { knownHelpersOnly: true, strict: false, noEscape: false });

    const html = template({
      numeroNfse: campos.numeroNfse ?? "-",
      dataEmissao: this.formatDate(campos.dataEmissao),
      municipio: campos.municipio ?? "-",
      chaveAcesso: campos.chaveAcesso ?? "-",
      prestador: {
        nome: campos.prestador.nome ?? "-",
        cnpj: this.formatCnpj(campos.prestador.cnpj),
        endereco: campos.prestador.endereco ?? "-",
      },
      tomador: {
        nome: campos.tomador.nome ?? "-",
        documento: campos.tomador.documento ?? "-",
      },
      servico: {
        descricao: campos.servico.descricao ?? "-",
        codigoTributacaoNacional: campos.servico.codigoTributacaoNacional ?? "-",
      },
      valores: {
        aliquotaIssqn: campos.valores.aliquotaIssqn,
        servico: this.formatCurrency(campos.valores.servico),
        liquido: this.formatCurrency(campos.valores.liquido ?? campos.valores.servico),
      },
      empresaLogoUrl,
    });

    return this.renderPdfBuffer(html);
  }

  private async renderPdfBuffer(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const A4_WIDTH_PX = 794;
    const A4_HEIGHT_PX = 1122;

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX, deviceScaleFactor: 1 });

      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (url === "about:blank" || url.startsWith("data:")) req.continue();
        else req.abort();
      });

      await page.setContent(html, { waitUntil: "load", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 300));

      return Buffer.from(
        await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } }),
      );
    } finally {
      await browser.close();
    }
  }

  private readonly logoCache = new Map<string, { dataUri: string; expires: number }>();
  private static readonly LOGO_TTL_MS = 5 * 60 * 1000;
  private static readonly LOGO_MAX_BYTES = 5 * 1024 * 1024;

  private async resolveLogoDataUri(logoUrl?: string): Promise<string | undefined> {
    const url = logoUrl?.trim();
    if (!url) return undefined;
    if (url.startsWith("data:")) return url;
    if (!/^https?:\/\//i.test(url)) return undefined;

    const cached = this.logoCache.get(url);
    if (cached && cached.expires > Date.now()) return cached.dataUri;

    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 5000,
        maxContentLength: DanfsePdfService.LOGO_MAX_BYTES,
        maxBodyLength: DanfsePdfService.LOGO_MAX_BYTES,
        // Alguns hosts (ex. Wikimedia) bloqueiam requisições sem User-Agent identificado (403).
        headers: { "User-Agent": "SistemaOrcamentoBomCusto/1.0 (+https://bomcustoilhabela.com.br)" },
      });
      const contentType = String(res.headers["content-type"] ?? "").split(";")[0].trim();
      if (!contentType.startsWith("image/")) return undefined;
      const dataUri = `data:${contentType};base64,${Buffer.from(res.data).toString("base64")}`;
      this.logoCache.set(url, { dataUri, expires: Date.now() + DanfsePdfService.LOGO_TTL_MS });
      return dataUri;
    } catch (err) {
      this.logger.warn(`Falha ao baixar EMPRESA_LOGO_URL para o DANFSe: ${(err as Error).message}`);
      return undefined;
    }
  }

  private formatDate(date: Date | null): string {
    if (!date) return "-";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  private formatCnpj(cnpj: string | null): string {
    if (!cnpj) return "-";
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  private formatCurrency(value: number | null): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);
  }
}
