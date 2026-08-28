import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

// ---------------------------------------------------------------------------
// Wrapper de `nfse-node/danfse` (gerarDanfse) — renderiza o DANFSe nacional
// (leiaute NT 008/2026, com canhoto) a partir do XML assinado da NFS-e.
// `nfse-node` e ESM puro: o import da lib e SEMPRE dinamico
// (`await import("nfse-node/danfse")`) dentro do metodo, nunca estatico no
// topo do arquivo — o backend compila para CommonJS.
//
// Cancelamento/substituicao (marca d'agua) fora de escopo desta rodada:
// `gerarDanfse` e chamado sem `situacaoEspecial`.
// ---------------------------------------------------------------------------
@Injectable()
export class DanfseNacionalPdfService {
  private readonly logger = new Logger(DanfseNacionalPdfService.name);
  private readonly logoCache = new Map<string, Buffer>();

  constructor(private readonly config: ConfigService) {}

  async gerar(xmlNacional: string): Promise<Buffer> {
    const { gerarDanfse } = await import("nfse-node/danfse");
    const logomarca = await this.resolveLogomarca();

    const opcoes: { incluirCanhoto: boolean; logomarca?: Buffer } = { incluirCanhoto: true };
    if (logomarca) opcoes.logomarca = logomarca;

    return await gerarDanfse(xmlNacional, opcoes);
  }

  private async resolveLogomarca(): Promise<Buffer | undefined> {
    const url = this.config.get<string>("EMPRESA_LOGO_URL")?.trim();
    if (!url || !/^https?:\/\//i.test(url)) return undefined;

    const cached = this.logoCache.get(url);
    if (cached) return cached;

    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 5000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        // Alguns hosts (ex. Wikimedia) bloqueiam requisições sem User-Agent identificado (403).
        headers: { "User-Agent": "SistemaOrcamentoBomCusto/1.0 (+https://bomcustoilhabela.com.br)" },
      });
      const contentType = String(res.headers["content-type"] ?? "").split(";")[0].trim();
      if (!contentType.startsWith("image/")) return undefined;
      const buffer = Buffer.from(res.data);
      this.logoCache.set(url, buffer);
      return buffer;
    } catch (err) {
      this.logger.warn(`Falha ao baixar EMPRESA_LOGO_URL para o DANFSe nacional: ${(err as Error).message}`);
      return undefined;
    }
  }
}
