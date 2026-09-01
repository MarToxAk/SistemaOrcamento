import https from "node:https";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";

import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";

import {
  buildAndSignCancelamento,
  buildAndSignDps,
  BuildDpsParams,
} from "./nfse-nacional-dps.util";

export type EmitirNfseNacionalResult = {
  chaveAcesso: string;
  nfseXml: string;
};

// ---------------------------------------------------------------------------
// Emissao automatica de NFS-e via API do Sistema Nacional (ADN/Sefin
// Nacional), sucessora do modelo municipal via iiBrasil (descontinuado).
// Autenticacao por mTLS com o certificado A1 da empresa — mesmo padrao ja
// usado para a EFI (ver EfiService.loadPemCredentials). Ver
// nfse-nacional-dps.util.ts para o layout da DPS calibrado contra producao.
// ---------------------------------------------------------------------------
@Injectable()
export class NfseNacionalService {
  private readonly logger = new Logger(NfseNacionalService.name);

  constructor(private readonly config: ConfigService) {}

  private loadPem(pemEnv: string, pathEnv: string, label: string): string | null {
    const pemText = this.config.get<string>(pemEnv);
    if (pemText && pemText.trim().length > 0) {
      return pemText.replace(/\\n/g, "\n");
    }

    const filePath = this.config.get<string>(pathEnv);
    if (filePath && filePath.trim().length > 0) {
      const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
      if (fs.existsSync(resolved)) {
        return fs.readFileSync(resolved, "utf8");
      }
      this.logger.warn(`${label} nao encontrado em: ${resolved}`);
    }

    return null;
  }

  private getCredentials(): { cert: string; key: string } {
    const cert = this.loadPem("NFSE_NACIONAL_CERT_PEM", "NFSE_NACIONAL_CERT_PATH", "Certificado NFS-e Nacional");
    const key = this.loadPem("NFSE_NACIONAL_KEY_PEM", "NFSE_NACIONAL_KEY_PATH", "Chave privada NFS-e Nacional");
    if (!cert || !key) {
      throw new InternalServerErrorException(
        "Certificado da NFS-e Nacional nao configurado (NFSE_NACIONAL_CERT_PEM / NFSE_NACIONAL_KEY_PEM).",
      );
    }
    return { cert, key };
  }

  private getAmbiente(): "producao" | "homologacao" {
    return (this.config.get<string>("NFSE_NACIONAL_AMBIENTE") ?? "producao") === "homologacao"
      ? "homologacao"
      : "producao";
  }

  private getBaseHost(): string {
    return this.getAmbiente() === "homologacao"
      ? "sefin.producaorestrita.nfse.gov.br"
      : "sefin.nfse.gov.br";
  }

  private getClient(cert: string, key: string): AxiosInstance {
    const httpsAgent = new https.Agent({ cert, key, rejectUnauthorized: true });
    return axios.create({
      baseURL: `https://${this.getBaseHost()}/SefinNacional`,
      httpsAgent,
      timeout: 20_000,
      validateStatus: () => true,
    });
  }

  private getCnpjPrestador(): string {
    const cnpj = this.config.get<string>("NFSE_NACIONAL_CNPJ_PRESTADOR")?.trim();
    if (!cnpj) throw new InternalServerErrorException("NFSE_NACIONAL_CNPJ_PRESTADOR nao configurado.");
    return cnpj;
  }

  private getCodigoMunicipio(): string {
    return this.config.get<string>("NFSE_NACIONAL_CODIGO_MUNICIPIO")?.trim() || "3520400";
  }

  async emitir(params: Omit<BuildDpsParams, "ambiente" | "cnpjPrestador" | "codigoMunicipio" | "numeroDps">): Promise<EmitirNfseNacionalResult> {
    const { cert, key } = this.getCredentials();
    const ambiente = this.getAmbiente();
    const cnpjPrestador = this.getCnpjPrestador();
    const codigoMunicipio = this.getCodigoMunicipio();

    const { xmlAssinado } = buildAndSignDps(
      {
        ...params,
        ambiente,
        cnpjPrestador,
        codigoMunicipio,
        numeroDps: Date.now() % 1_000_000_000_000_000,
      },
      cert,
      key,
    );

    const dpsXmlGZipB64 = zlib.gzipSync(Buffer.from(xmlAssinado, "utf8")).toString("base64");

    const client = this.getClient(cert, key);
    const response = await client.post("/nfse", { dpsXmlGZipB64 });

    if (response.status !== 201) {
      const erros = response.data?.erros ?? response.data?.erro ?? response.data;
      this.logger.error(`Falha ao emitir NFS-e Nacional: ${JSON.stringify(erros)}`);
      const mensagem = Array.isArray(erros)
        ? erros.map((e: any) => e.descricao ?? e.Descricao).join("; ")
        : JSON.stringify(erros);
      throw new BadRequestException(`Sistema Nacional NFS-e rejeitou a emissao: ${mensagem}`);
    }

    const nfseXml = zlib.gunzipSync(Buffer.from(response.data.nfseXmlGZipB64, "base64")).toString("utf8");
    return { chaveAcesso: response.data.chaveAcesso as string, nfseXml };
  }

  async cancelar(chaveAcesso: string, motivo: string): Promise<void> {
    const { cert, key } = this.getCredentials();
    const ambiente = this.getAmbiente();
    const cnpjAutor = this.getCnpjPrestador();

    const xmlAssinado = buildAndSignCancelamento({ ambiente, cnpjAutor, chaveAcesso, motivo }, cert, key);
    const pedidoRegistroEventoXmlGZipB64 = zlib.gzipSync(Buffer.from(xmlAssinado, "utf8")).toString("base64");

    const client = this.getClient(cert, key);
    const response = await client.post(`/nfse/${chaveAcesso}/eventos`, { pedidoRegistroEventoXmlGZipB64 });

    if (response.status !== 201) {
      const erros = response.data?.erros ?? response.data?.erro ?? response.data;
      this.logger.error(`Falha ao cancelar NFS-e Nacional ${chaveAcesso}: ${JSON.stringify(erros)}`);
      const mensagem = Array.isArray(erros)
        ? erros.map((e: any) => e.descricao ?? e.Descricao).join("; ")
        : JSON.stringify(erros);
      throw new BadRequestException(`Sistema Nacional NFS-e rejeitou o cancelamento: ${mensagem}`);
    }
  }
}
