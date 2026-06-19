import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Handlebars from "handlebars";
import { Client as MinioClient } from "minio";
import puppeteer from "puppeteer";
import { QUOTES_PDF_HTML_TEMPLATE } from "./quotes-pdf.template";

type QuotePdfData = {
  idorcamento_interno: number;
  idorcamento?: number;
  dataorcamento?: string;
  cliente?: { nome?: string | null; telefone?: string | null; email?: string | null };
  vendedorNome?: string | null;
  validade?: string | null;
  prazoEntrega?: string | null;
  condicaoPagamento?: string | null;
  observacoes?: string | null;
  itens?: Array<{
    sequenciaitem?: number;
    produto?: { descricaoproduto?: string; descricaocurta?: string };
    quantidadeitem?: number;
    valoritem?: number;
    valordesconto?: number;
    orcamentovalorfinalitem?: number;
  }>;
  carimbos?: {
    itens?: Array<{ numero?: number; carimbo?: string | null; dimensoes?: string | null; descricao?: string | null }>;
  };
  totais?: { valor?: number; desconto?: number; valoracrescimo?: number };
};

type StoredPdfResult = {
  fileName: string;
  contentType: string;
  objectName: string;
  publicUrl: string | null;
};

const HTML_TEMPLATE = QUOTES_PDF_HTML_TEMPLATE;

@Injectable()
export class QuotesPdfStorageService {
  private readonly logger = new Logger(QuotesPdfStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  async generateAndStore(payload: QuotePdfData): Promise<StoredPdfResult> {
    const contentType = "application/pdf";
    const quoteNumber = payload.idorcamento ?? payload.idorcamento_interno;
    const fileName = `Orçamento - ${quoteNumber}.pdf`;
    const objectName = `${this.getPathPrefix()}/${quoteNumber}/${fileName}`;

    this.logger.log(`Gerando PDF — orçamento ${quoteNumber}, template v2 (${QUOTES_PDF_HTML_TEMPLATE.length} chars)`);
    const html = this.renderHtml(payload);
    const pdfBuffer = await this.renderPdfBuffer(html);
    this.logger.log(`PDF gerado — ${pdfBuffer.length} bytes`);

    const client = this.buildMinioClient();
    const bucket = this.requireEnv("MINIO_BUCKET");

    await this.ensureBucket(client, bucket);
    await client.putObject(bucket, objectName, pdfBuffer, pdfBuffer.length, { "Content-Type": contentType });

    return {
      fileName,
      contentType,
      objectName,
      publicUrl: this.buildPublicUrl(bucket, objectName),
    };
  }

  async downloadObjectBuffer(objectName: string): Promise<Buffer> {
    const client = this.buildMinioClient();
    const bucket = this.requireEnv("MINIO_BUCKET");

    const stream = await client.getObject(bucket, objectName);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on("end", () => resolve());
      stream.on("error", (error) => reject(error));
    });

    return Buffer.concat(chunks);
  }

  async objectExists(objectName: string): Promise<boolean> {
    try {
      const client = this.buildMinioClient();
      const bucket = this.requireEnv("MINIO_BUCKET");
      await client.statObject(bucket, objectName);
      return true;
    } catch {
      return false;
    }
  }

  private renderHtml(payload: QuotePdfData): string {
    // Template chain resolution (D-05/D-06):
    // (1) EMPRESA_PDF_TEMPLATE_PATH defined -> use it (error if file missing)
    // (2) apps/backend/templates/quote-default.hbs present -> use it
    // (3) fallback -> inline QUOTES_PDF_HTML_TEMPLATE string (zero regression risk)
    let templateSource: string;
    const customPath = this.configService.get<string>("EMPRESA_PDF_TEMPLATE_PATH");

    if (customPath) {
      if (!existsSync(customPath)) {
        throw new InternalServerErrorException(
          `EMPRESA_PDF_TEMPLATE_PATH definida mas arquivo nao encontrado: ${customPath}`,
        );
      }
      templateSource = readFileSync(customPath, "utf-8");
    } else {
      const defaultPath = path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs");
      if (existsSync(defaultPath)) {
        templateSource = readFileSync(defaultPath, "utf-8");
      } else {
        templateSource = QUOTES_PDF_HTML_TEMPLATE;
      }
    }

    // Empresa data via ConfigService (D-07)
    const empresaNome = this.configService.get<string>("EMPRESA_NOME") ?? "";
    const empresaCnpj = this.configService.get<string>("EMPRESA_CNPJ") ?? "";
    const empresaEndereco = this.configService.get<string>("EMPRESA_ENDERECO") ?? "";
    const empresaLogoUrl = this.configService.get<string>("EMPRESA_LOGO_URL"); // undefined when absent (D-08 / Pitfall 3)
    const empresaCor = this.configService.get<string>("EMPRESA_COR_PRIMARIA") ?? "#0d6efd";

    const template = Handlebars.compile(templateSource);

    const itens = (payload.itens ?? []).map((item) => ({
      sequenciaitem: item.sequenciaitem ?? "-",
      produto: {
        descricaoproduto: item.produto?.descricaoproduto ?? "Item sem descricao",
        descricaocurta: item.produto?.descricaocurta,
      },
      quantidadeitem: this.formatNumber(item.quantidadeitem ?? 0),
      valoritem: this.formatCurrency(item.valoritem ?? 0),
      orcamentovalorfinalitem: this.formatCurrency(item.orcamentovalorfinalitem ?? 0),
    }));

    const carimbos = (payload.carimbos?.itens ?? []).map((item, index) => ({
      numero: item.numero ?? index + 1,
      carimbo: item.carimbo ?? "BORRACHA",
      dimensoes: item.dimensoes ?? "-",
      descricao: item.descricao ?? "-",
    }));

    return template({
      idorcamento: payload.idorcamento ?? payload.idorcamento_interno,
      dataorcamento: this.formatDate(payload.dataorcamento),
      cliente: {
        nome: payload.cliente?.nome ?? "Nao informado",
        telefone: payload.cliente?.telefone ?? "Nao informado",
        email: payload.cliente?.email ?? "Nao informado",
      },
      vendedorNome: payload.vendedorNome ?? "Nao informado",
      validade: payload.validade ?? "Nao informado",
      prazoEntrega: this.formatDate(payload.prazoEntrega),
      condicaoPagamento: payload.condicaoPagamento ?? "Nao informado",
      observacoes: payload.observacoes ?? "Sem observacoes",
      itens,
      carimbos: {
        itens: carimbos,
      },
      totais: {
        valor: this.formatCurrency(payload.totais?.valor ?? 0),
        desconto: this.formatCurrency(payload.totais?.desconto ?? 0),
      },
      empresaNome,
      empresaCnpj,
      empresaEndereco,
      empresaLogoUrl,
      empresaCor,
    });
  }

  private async renderPdfBuffer(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    // A4 at 96 DPI: 794 x 1122 px
    const A4_WIDTH_PX = 794;
    const A4_HEIGHT_PX = 1122;

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX, deviceScaleFactor: 1 });

      // "load" aguarda o evento load (CSS + fonts incluídas) sem travar em
      // networkidle0 que pode timeout quando CDNs externas demoram.
      await page.setContent(html, { waitUntil: "load", timeout: 60000 });

      // Aguarda um tick extra para garantir que fontes web sejam aplicadas
      await new Promise((r) => setTimeout(r, 500));

      // Calculate scale to guarantee single-page output
      const contentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const scale = contentHeight > A4_HEIGHT_PX ? A4_HEIGHT_PX / contentHeight : 1;

      return Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          scale: Math.max(0.1, Math.min(scale, 1)),
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        }),
      );
    } finally {
      await browser.close();
    }
  }

  private buildMinioClient(): MinioClient {
    const endPointRaw = this.requireEnv("MINIO_ENDPOINT").replace(/\/$/, "");
    // URL protocol is the source of truth for SSL - overrides MINIO_USE_SSL when protocol is explicit
    const useSSL = endPointRaw.startsWith("https://")
      ? true
      : endPointRaw.startsWith("http://")
        ? false
        : (this.configService.get<string>("MINIO_USE_SSL") ?? "true").toLowerCase() !== "false";
    // MinioClient expects hostname only - strip protocol
    const endPoint = endPointRaw.replace(/^https?:\/\//, "");
    const accessKey = this.requireEnv("MINIO_ACCESS_KEY");
    const secretKey = this.requireEnv("MINIO_SECRET_KEY");
    const port = Number(this.configService.get<string>("MINIO_PORT") ?? (useSSL ? 443 : 80));

    return new MinioClient({ endPoint, port, useSSL, accessKey, secretKey });
  }

  private async ensureBucket(client: MinioClient, bucket: string) {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      const region = this.configService.get<string>("MINIO_REGION") ?? "us-east-1";
      await client.makeBucket(bucket, region);
    }
  }

  private buildPublicUrl(bucket: string, objectName: string): string | null {
    const customBase = this.configService.get<string>("MINIO_PUBLIC_BASE_URL");
    if (customBase) {
      return `${customBase.replace(/\/$/, "")}/${bucket}/${objectName}`;
    }

    const endPoint = this.configService.get<string>("MINIO_ENDPOINT");
    if (!endPoint) {
      return null;
    }

    const useSSL = (this.configService.get<string>("MINIO_USE_SSL") ?? "true").toLowerCase() !== "false";
    const port = Number(this.configService.get<string>("MINIO_PORT") ?? (useSSL ? 443 : 80));
    const protocol = useSSL ? "https" : "http";
    const includePort = (useSSL && port !== 443) || (!useSSL && port !== 80);

    return `${protocol}://${endPoint}${includePort ? `:${port}` : ""}/${bucket}/${objectName}`;
  }

  private getPathPrefix(): string {
    return (this.configService.get<string>("MINIO_PATH_PREFIX") ?? "quotes").replace(/^\/+|\/+$/g, "");
  }

  private requireEnv(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      throw new InternalServerErrorException(
        `Configuracao ausente para PDF/MinIO: defina a variavel ${name}.`,
      );
    }
    return value;
  }

  private formatDate(input?: string | null): string {
    if (!input) return "Nao informado";
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return input;
    return new Intl.DateTimeFormat("pt-BR").format(parsed);
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
  }
}
