import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { gerarPDF } from "nfe-danfe-pdf";

// ---------------------------------------------------------------------------
// Renderiza o DANFE (PDF) da NF-e de produto (modelo 55) a partir do XML
// <nfeProc> autorizado, usando a biblioteca pronta `nfe-danfe-pdf` (MIT,
// deps 100% JS: pdfkit/bwip-js/qrcode/xml2js/date-fns). NAO construir
// parser/template/renderer do zero. NAO usar Puppeteer para NF-e.
//
// Pegadinha: a lib finaliza o PDFDocument internamente — NUNCA finalizar
// o doc manualmente. Coletar o stream via doc.on("data"|"end"|"error").
//
// `pathLogo` da lib e caminho de ARQUIVO no disco (nao data URI, nao
// Buffer) — por isso resolveLogoPath baixa EMPRESA_LOGO_URL para um
// arquivo temp e cacheia o path. Logo e best-effort: se vazio ou o
// download falhar, o DANFE renderiza sem logo (sem erro).
// ---------------------------------------------------------------------------
@Injectable()
export class DanfePdfService {
  private readonly logger = new Logger(DanfePdfService.name);

  constructor(private readonly config: ConfigService) {}

  private static readonly RENDER_TIMEOUT_MS = 20_000;
  private static readonly LOGO_MAX_BYTES = 5 * 1024 * 1024;

  private readonly logoPathCache = new Map<string, string>();

  async gerarDanfe(input: { xml: string; cancelada?: boolean }): Promise<Buffer> {
    const pathLogo = await this.resolveLogoPath();

    const opcoes: { cancelada: boolean; pathLogo?: string } = {
      cancelada: input.cancelada ?? false,
    };
    if (pathLogo) opcoes.pathLogo = pathLogo;

    const doc = await gerarPDF(input.xml, opcoes);

    const chunks: Buffer[] = [];
    let timer: NodeJS.Timeout | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("DANFE render timeout")), DanfePdfService.RENDER_TIMEOUT_MS);
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve());
        doc.on("error", reject);
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    return Buffer.concat(chunks);
  }

  private async resolveLogoPath(): Promise<string | undefined> {
    const url = this.config.get<string>("EMPRESA_LOGO_URL")?.trim();
    if (!url) return undefined;

    if (!/^https?:\/\//i.test(url)) {
      return fs.existsSync(url) ? url : undefined;
    }

    const cached = this.logoPathCache.get(url);
    if (cached && fs.existsSync(cached)) return cached;

    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 5000,
        maxContentLength: DanfePdfService.LOGO_MAX_BYTES,
        maxBodyLength: DanfePdfService.LOGO_MAX_BYTES,
      });
      const contentType = String(res.headers["content-type"] ?? "").split(";")[0].trim();
      if (!contentType.startsWith("image/")) return undefined;

      const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
      const hash = createHash("sha1").update(url).digest("hex").slice(0, 12);
      const filePath = path.join(os.tmpdir(), `danfe-logo-${hash}.${ext}`);
      fs.writeFileSync(filePath, Buffer.from(res.data));
      this.logoPathCache.set(url, filePath);
      return filePath;
    } catch (err) {
      this.logger.warn(
        `Falha ao baixar EMPRESA_LOGO_URL para o DANFE: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }
}
