import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import Handlebars from "handlebars";
import { Client as MinioClient } from "minio";
import puppeteer from "puppeteer";

import { PdfTemplatesRepository } from "../pdf-templates/pdf-templates.repository";
import { QUOTES_PDF_HTML_TEMPLATE } from "./quotes-pdf.template";

// ---------------------------------------------------------------------------
// shouldAllowRequest — função pura exportável (testável sem instanciar Puppeteer)
//
// Retorna true APENAS para o documento inline (about:blank / data:).
// Tudo o mais é bloqueado: http(s) externos, file://, fontes, imagens, CSS,
// XHR, fetch — neutraliza SSRF (169.254.169.254, IPs internos) e exfiltração.
// (D-02 / T-999.1-08 / T-999.1-09 / T-999.1-10)
// ---------------------------------------------------------------------------
export function shouldAllowRequest(url: string): boolean {
  return url === "about:blank" || url.startsWith("data:");
}

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

// ---------------------------------------------------------------------------
// Helpers Handlebars permitidos (D-02 / T-999.1-07).
// Listam apenas helpers *custom* registrados. Built-ins de bloco (#if, #each,
// #unless, #with, lookup) NÃO precisam estar aqui — o compilador os conhece.
// NAO adicionar helpers de I/O (require, fs, exec, eval).
// ---------------------------------------------------------------------------
const KNOWN_HELPERS: Record<string, boolean> = {};

@Injectable()
export class QuotesPdfStorageService {
  private readonly logger = new Logger(QuotesPdfStorageService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly pdfTemplatesRepository: PdfTemplatesRepository,
  ) {}

  async generateAndStore(payload: QuotePdfData): Promise<StoredPdfResult> {
    const contentType = "application/pdf";
    const quoteNumber = payload.idorcamento ?? payload.idorcamento_interno;
    const fileName = `Orçamento - ${quoteNumber}.pdf`;
    const objectName = `${this.getPathPrefix()}/${quoteNumber}/${fileName}`;

    this.logger.log(`Gerando PDF — orçamento ${quoteNumber}`);
    const html = await this.renderHtml(payload);
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

  // ---------------------------------------------------------------------------
  // renderPreviewPdf — D-08: preview server-side de um templateSource explícito.
  //
  // Usa exatamente o mesmo caminho hardened de generateAndStore (renderHtml +
  // renderPdfBuffer — compile restrito + rede bloqueada), mas NUNCA persiste
  // no MinIO. Usado pelo endpoint POST /pdf-templates/preview (Plano 05) para
  // que o admin veja o resultado antes de ativar/salvar um template.
  // ---------------------------------------------------------------------------
  async renderPreviewPdf(payload: QuotePdfData, templateSource: string): Promise<Buffer> {
    this.logger.log("Gerando preview de template — sem persistência");
    const html = await this.renderHtml(payload, templateSource);
    return this.renderPdfBuffer(html);
  }

  // ---------------------------------------------------------------------------
  // renderHtml — público para que PdfTemplatesModule (Plano 05) possa chamar
  // o render hardened no endpoint de preview (D-08).
  //
  // @param payload     Dados do orçamento.
  // @param templateSource (opcional) Source Handlebars explícito para preview
  //                    server-side; quando fornecido, o repositório NÃO é
  //                    consultado e o template não é persistido (D-08).
  // ---------------------------------------------------------------------------
  async renderHtml(payload: QuotePdfData, templateSource?: string): Promise<string> {
    const src = await this.resolveTemplateSource(templateSource);

    // Compilação Handlebars hardened (D-02 / T-999.1-07):
    //   - knownHelpersOnly:true  → helpers fora de KNOWN_HELPERS causam erro de compile
    //   - strict:false           → mantém compatibilidade com {{#if campo.ausente}}
    //   - noEscape:false         → mantém escaping de HTML nas expressões {{ }}
    //   - Handlebars.create()    → instância isolada por render (Pitfall 3)
    //   - allowCallsToHelperMissing NÃO é true (default false — nunca ativar)
    const hbs = Handlebars.create();
    const template = hbs.compile(src, {
      knownHelpers: KNOWN_HELPERS,
      knownHelpersOnly: true,
      strict: false,
      noEscape: false,
    });

    // Empresa data via ConfigService (D-07)
    const empresaNome = this.configService.get<string>("EMPRESA_NOME") ?? "";
    const empresaCnpj = this.configService.get<string>("EMPRESA_CNPJ") ?? "";
    const empresaEndereco = this.configService.get<string>("EMPRESA_ENDERECO") ?? "";
    // O render do PDF roda com rede TOTALMENTE bloqueada (shouldAllowRequest só
    // libera about:blank e data:). Por isso o logo precisa virar data: URI aqui no
    // servidor — um <img src="https://..."> nunca carregaria no PDF (D-02).
    const empresaLogoUrl = await this.resolveLogoDataUri(
      this.configService.get<string>("EMPRESA_LOGO_URL"),
    );
    const empresaCor = this.configService.get<string>("EMPRESA_COR_PRIMARIA") ?? "#0d6efd";

    // Contato de empresa — dehardcode (D-07). Opcionais; sem elas a linha some no template.
    // NAO entram em REQUIRED_ENV_VARS.
    const empresaTelefones = this.configService.get<string>("EMPRESA_TELEFONES") ?? "";
    const empresaEmail = this.configService.get<string>("EMPRESA_EMAIL") ?? "";
    const empresaInstagram = this.configService.get<string>("EMPRESA_INSTAGRAM") ?? "";

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
      // Contato (D-07)
      empresaTelefones,
      empresaEmail,
      empresaInstagram,
    });
  }

  // ---------------------------------------------------------------------------
  // resolveLogoDataUri — D-02/white-label
  //
  // O Puppeteer renderiza com rede bloqueada (anti-SSRF), então um logo via URL
  // externa (ex.: MinIO https://...) nunca carrega no PDF. Aqui baixamos o arquivo
  // no servidor e devolvemos um data: URI (base64), que o render aceita.
  // EMPRESA_LOGO_URL vem do .env (config do operador, não de input do usuário).
  // Qualquer falha → undefined: o PDF é gerado sem logo (template cai no placeholder).
  // ---------------------------------------------------------------------------
  private readonly logoCache = new Map<string, { dataUri: string; expires: number }>();
  private static readonly LOGO_TTL_MS = 5 * 60 * 1000;
  private static readonly LOGO_MAX_BYTES = 5 * 1024 * 1024;

  private async resolveLogoDataUri(logoUrl?: string): Promise<string | undefined> {
    const url = logoUrl?.trim();
    if (!url) return undefined;
    if (url.startsWith("data:")) return url; // já inline

    if (!/^https?:\/\//i.test(url)) {
      this.logger.warn(`EMPRESA_LOGO_URL ignorada no PDF (precisa ser http(s) ou data:): ${url}`);
      return undefined;
    }

    const cached = this.logoCache.get(url);
    if (cached && cached.expires > Date.now()) return cached.dataUri;

    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 5000,
        maxContentLength: QuotesPdfStorageService.LOGO_MAX_BYTES,
        maxBodyLength: QuotesPdfStorageService.LOGO_MAX_BYTES,
      });
      const contentType = String(res.headers["content-type"] ?? "").split(";")[0].trim();
      if (!contentType.startsWith("image/")) {
        this.logger.warn(`EMPRESA_LOGO_URL não retornou imagem (content-type: ${contentType || "?"}): ${url}`);
        return undefined;
      }
      const dataUri = `data:${contentType};base64,${Buffer.from(res.data).toString("base64")}`;
      this.logoCache.set(url, { dataUri, expires: Date.now() + QuotesPdfStorageService.LOGO_TTL_MS });
      return dataUri;
    } catch (err) {
      this.logger.warn(`Falha ao baixar EMPRESA_LOGO_URL para o PDF (${url}): ${(err as Error).message}`);
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // resolveTemplateSource — D-05
  //
  // Cadeia de resolução (ordem decrescente de prioridade):
  //   1. explicit (preview server-side — D-08)
  //   2. PdfTemplate ativo no banco (isActive=true)
  //   3. EMPRESA_PDF_TEMPLATE_PATH (env var, arquivo local)
  //   4. apps/backend/templates/quote-default.hbs (bundled)
  //   5. QUOTES_PDF_HTML_TEMPLATE (string embutida — fallback absoluto)
  // ---------------------------------------------------------------------------
  private async resolveTemplateSource(explicit?: string): Promise<string> {
    if (explicit) return explicit; // preview server-side (D-08)

    const active = await this.pdfTemplatesRepository.getActiveSource();
    if (active) return active;

    // Fallback existente (D-05 — manter cadeia original como rede de segurança)
    const customPath = this.configService.get<string>("EMPRESA_PDF_TEMPLATE_PATH");
    if (customPath) {
      if (!existsSync(customPath)) {
        throw new InternalServerErrorException(
          `EMPRESA_PDF_TEMPLATE_PATH definida mas arquivo nao encontrado: ${customPath}`,
        );
      }
      return readFileSync(customPath, "utf-8");
    }

    const defaultPath = path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs");
    if (existsSync(defaultPath)) {
      return readFileSync(defaultPath, "utf-8");
    }

    return QUOTES_PDF_HTML_TEMPLATE;
  }

  // ---------------------------------------------------------------------------
  // renderPdfBuffer — D-02: hardened Puppeteer
  //
  // Segurança:
  //   - page.setRequestInterception(true): toda requisição de rede é avaliada
  //   - shouldAllowRequest(): apenas about:blank e data: passam (sem SSRF/exfil)
  //   - timeout: 30 000 ms (reduzido de 60 000 — T-999.1-11)
  //   - waitUntil: "load" (NÃO networkidle0 — Pitfall 6 / sem CDNs externas)
  //
  // ASSUNÇÃO DE SEGURANÇA A4 (alta criticidade — deferido para /gsd-secure-phase):
  //   --no-sandbox é mantido porque o ambiente de deploy roda como root em container.
  //   Postura compensatória: rede totalmente bloqueada (shouldAllowRequest) +
  //   sanitização de upload (Plano 05) + compile Handlebars restrito (knownHelpersOnly).
  //   Resolver em /gsd-secure-phase: usuário não-root no Dockerfile + sandbox seccomp
  //   do Chromium (Pitfall 1).
  // ---------------------------------------------------------------------------
  private async renderPdfBuffer(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",           // ASSUNÇÃO A4: ver comentário acima
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    // A4 at 96 DPI: 794 x 1122 px
    const A4_WIDTH_PX = 794;
    const A4_HEIGHT_PX = 1122;

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX, deviceScaleFactor: 1 });

      // Bloqueio total de rede (D-02 / anti-SSRF / T-999.1-08 / T-999.1-09 / T-999.1-10)
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (shouldAllowRequest(req.url())) {
          req.continue();
        } else {
          req.abort();
        }
      });

      // "load" aguarda o evento load sem travar em networkidle0
      // (com rede bloqueada não há idle — Pitfall 6)
      await page.setContent(html, { waitUntil: "load", timeout: 30000 });

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
