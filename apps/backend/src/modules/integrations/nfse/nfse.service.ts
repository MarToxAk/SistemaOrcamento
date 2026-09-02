import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client as MinioClient } from "minio";

import axios from "axios";

import { PrismaService } from "../../database/prisma.service";
import { AthosService } from "../athos/athos.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";
import { DanfseNacionalPdfService } from "./danfse-nacional-pdf.service";
import { DanfsePdfService } from "./danfse-pdf.service";
import { EmitirNfseNacionalDto } from "./dto/emitir-nfse-nacional.dto";
import { NfseNacionalService } from "./nfse-nacional.service";
import { ParsedNfse, parseNfseXml } from "./nfse-xml-parser.util";

export type UploadedXmlFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
};

export type { ParsedNfse };

// ---------------------------------------------------------------------------
// NfseService — a emissao automatica via SOAP (iiBrasil/ABRASF) foi
// descontinuada pela prefeitura de Ilhabela. A nota agora e emitida
// manualmente (fora do sistema) e o XML assinado (padrao nacional NBS) e
// anexado aqui: parseia os campos relevantes e guarda o arquivo no MinIO.
// ---------------------------------------------------------------------------
@Injectable()
export class NfseService {
  private readonly logger = new Logger(NfseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly nfseNacionalService: NfseNacionalService,
    private readonly danfsePdfService: DanfsePdfService,
    private readonly athosService: AthosService,
    private readonly danfseNacionalPdfService: DanfseNacionalPdfService,
    private readonly chatwootService: ChatwootService,
  ) {}

  /**
   * Resolve CPF/CNPJ, nome e endereco do tomador a partir do cliente Athos
   * vinculado ao orcamento, para pre-preencher o formulario de emissao
   * automatica. Todo o trecho Athos e best-effort: qualquer falha e apenas
   * logada e o metodo devolve tudo nulo, sem nunca lancar por causa do Athos.
   */
  async resolverTomadorQuote(quoteId: string): Promise<{
    idclienteAthos: number | null;
    documento: string | null;
    nome: string | null;
    endereco: { logradouro: string; numero: string; bairro: string; cep: string; codigoMunicipio: string; uf: string } | null;
  }> {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException("Orcamento nao encontrado.");

    try {
      const lookupId = String((quote as any).externalQuoteId ?? (quote as any).internalNumber ?? "");
      const athosData = await this.athosService.buscarOrcamentoPorNumero(lookupId);
      const mapped = (athosData as any)?.mapped ?? null;
      const idclienteAthos = mapped?.idcliente ?? mapped?.clienteid ?? null;

      if (!idclienteAthos) {
        return { idclienteAthos: null, documento: null, nome: null, endereco: null };
      }

      const cliente = await this.athosService.buscarClientePorId(idclienteAthos);
      return {
        idclienteAthos,
        documento: cliente?.documento ?? null,
        nome: cliente?.name ?? null,
        endereco: cliente?.endereco ?? null,
      };
    } catch (err) {
      this.logger.debug(
        `Falha ao resolver tomador Athos para o orcamento ${quoteId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { idclienteAthos: null, documento: null, nome: null, endereco: null };
    }
  }

  /** Baixa o XML ja anexado/emitido e gera o DANFSe (PDF) para envio ao cliente. */
  async baixarDanfsePdf(quoteId: string): Promise<{ pdfBuffer: Buffer; nomeArquivo: string }> {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException("Orcamento nao encontrado.");
    if (!quote.nfseLink) throw new BadRequestException("Orcamento nao possui NFS-e anexada.");

    const xmlResp = await axios.get(quote.nfseLink, { responseType: "text", timeout: 15_000 });
    const pdfBuffer = await this.danfsePdfService.gerarPdfDoXml(xmlResp.data as string);

    return { pdfBuffer, nomeArquivo: `NFSe-${quote.nfseNumero ?? quoteId}.pdf` };
  }

  /** Emite a NFS-e automaticamente via API do Sistema Nacional e anexa o resultado ao orcamento. */
  async emitirQuoteNfseAutomatica(quoteId: string, dto: EmitirNfseNacionalDto) {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException("Orcamento nao encontrado.");
    if (quote.nfseNumero) {
      throw new BadRequestException("Orcamento ja possui NFS-e emitida.");
    }

    // Endereco sempre resolvido aqui no backend a partir do Athos (nunca do
    // que o frontend mandar), para nao divergir do cadastro oficial do
    // cliente vinculado ao orcamento. Ausencia de cliente ou falha no Athos
    // apenas omite o grupo <end> — a emissao segue normalmente (best-effort).
    const tomadorAthos = await this.resolverTomadorQuote(quoteId);
    const endereco = tomadorAthos.endereco
      ? {
          logradouro: tomadorAthos.endereco.logradouro,
          numero: tomadorAthos.endereco.numero,
          bairro: tomadorAthos.endereco.bairro,
          cep: tomadorAthos.endereco.cep,
          codigoMunicipio: tomadorAthos.endereco.codigoMunicipio,
        }
      : undefined;

    const { chaveAcesso, nfseXml } = await this.nfseNacionalService.emitir({
      codigoServico: dto.codigoServico,
      descricaoServico: dto.descricaoServico,
      valorServico: dto.valorServico,
      incluirIbsCbs: dto.incluirIbsCbs,
      tomador: {
        cpf: dto.cpfTomador,
        cnpj: dto.cnpjTomador,
        nome: dto.nomeTomador,
        endereco,
      },
    });

    const buffer = Buffer.from(nfseXml, "utf-8");
    const parsed = this.parseXml(buffer);
    const { publicUrl } = await this.storeXml(buffer, parsed.numeroNfse ?? chaveAcesso, `quotes/${quoteId}`);

    await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        nfseNumero: parsed.numeroNfse,
        nfseCodigoVerificacao: parsed.chaveAcesso ?? chaveAcesso,
        nfseLink: publicUrl,
        nfseEmitidaEm: parsed.dataEmissao ?? new Date(),
      },
    });

    this.logger.log(`NFS-e #${parsed.numeroNfse} emitida automaticamente para o orcamento ${quoteId}.`);

    const envioChatwoot = await this.enviarDanfseParaCliente(quote, nfseXml, parsed.numeroNfse ?? null);

    return {
      numero: parsed.numeroNfse,
      codigoVerificacao: parsed.chaveAcesso ?? chaveAcesso,
      link: publicUrl,
      dataEmissao: parsed.dataEmissao,
      valorServico: parsed.valorServico,
      envioChatwoot,
    };
  }

  /**
   * Gera o DANFSe nacional a partir do XML assinado e entrega ao cliente pelo
   * Chatwoot, anexado a mensagem. Best-effort: nunca lanca — a nota ja esta
   * fiscalmente definitiva no SEFIN quando este metodo e chamado (D-04), e o
   * destino e resolvido exclusivamente por quote.conversationId (D-05,
   * T-HAL-01) — nunca por busca de contato por nome/documento.
   */
  private async enviarDanfseParaCliente(
    quote: { id: string; conversationId: bigint | null },
    nfseXml: string,
    numeroNfse: string | null,
  ): Promise<{ enviado: boolean; motivo?: string }> {
    const convId = quote.conversationId ? String(quote.conversationId) : undefined;
    if (!convId) {
      this.logger.debug(`Orcamento ${quote.id} sem conversationId no Chatwoot — DANFSe nao enviado ao cliente.`);
      return { enviado: false, motivo: "orcamento sem conversa vinculada no Chatwoot" };
    }

    try {
      const pdfBuffer = await this.danfseNacionalPdfService.gerar(nfseXml);
      const mensagem = `Sua Nota Fiscal de Servico (NFS-e) n. ${numeroNfse} foi emitida. O documento (DANFSe) esta em anexo.`;
      await this.chatwootService.sendOutgoingMessage(convId, mensagem);
      await this.chatwootService.sendAttachment(convId, pdfBuffer, `NFSe-${numeroNfse ?? quote.id}.pdf`, "application/pdf");
      return { enviado: true };
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao entregar DANFSe pelo Chatwoot para o orcamento ${quote.id}: ${motivo}`);
      return { enviado: false, motivo };
    }
  }

  parseXml(buffer: Buffer): ParsedNfse {
    const xml = buffer.toString("utf-8");
    const parsed = parseNfseXml(xml);
    if (!parsed.numeroNfse) {
      throw new BadRequestException(
        "XML da NFS-e invalido: numero da nota (nNFSe) nao encontrado. Confirme que o arquivo e o XML assinado da nota (padrao nacional NBS).",
      );
    }
    return parsed;
  }

  async storeXml(
    buffer: Buffer,
    numeroNfse: string,
    prefix: string,
  ): Promise<{ objectName: string; publicUrl: string | null }> {
    const client = this.buildMinioClient();
    const bucket = this.requireEnv("MINIO_BUCKET");
    await this.ensureBucket(client, bucket);

    const objectName = `${this.getPathPrefix()}/${prefix}/NFSe-${numeroNfse}-${randomUUID().slice(0, 8)}.xml`;
    await client.putObject(bucket, objectName, buffer, buffer.length, {
      "Content-Type": "application/xml",
    });

    return { objectName, publicUrl: this.buildPublicUrl(bucket, objectName) };
  }

  async anexarQuoteNfse(quoteId: string, file: UploadedXmlFile) {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException("Orcamento nao encontrado.");

    const parsed = this.parseXml(file.buffer);
    const { publicUrl } = await this.storeXml(file.buffer, parsed.numeroNfse!, `quotes/${quoteId}`);

    await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        nfseNumero: parsed.numeroNfse,
        nfseCodigoVerificacao: parsed.chaveAcesso,
        nfseLink: publicUrl,
        nfseEmitidaEm: parsed.dataEmissao ?? new Date(),
      },
    });

    this.logger.log(`NFS-e #${parsed.numeroNfse} anexada manualmente ao orcamento ${quoteId}.`);

    return {
      numero: parsed.numeroNfse,
      codigoVerificacao: parsed.chaveAcesso,
      link: publicUrl,
      dataEmissao: parsed.dataEmissao,
      valorServico: parsed.valorServico,
    };
  }

  async removerQuoteNfse(quoteId: string): Promise<{ ok: boolean }> {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException("Orcamento nao encontrado.");

    await this.prisma.quote.update({
      where: { id: quoteId },
      data: { nfseNumero: null, nfseCodigoVerificacao: null, nfseLink: null, nfseEmitidaEm: null },
    });

    return { ok: true };
  }

  private buildMinioClient(): MinioClient {
    const endPointRaw = this.requireEnv("MINIO_ENDPOINT").replace(/\/$/, "");
    const useSSL = endPointRaw.startsWith("https://")
      ? true
      : endPointRaw.startsWith("http://")
        ? false
        : (this.configService.get<string>("MINIO_USE_SSL") ?? "true").toLowerCase() !== "false";
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
    if (!endPoint) return null;

    const useSSL = (this.configService.get<string>("MINIO_USE_SSL") ?? "true").toLowerCase() !== "false";
    const port = Number(this.configService.get<string>("MINIO_PORT") ?? (useSSL ? 443 : 80));
    const protocol = useSSL ? "https" : "http";
    const includePort = (useSSL && port !== 443) || (!useSSL && port !== 80);

    return `${protocol}://${endPoint}${includePort ? `:${port}` : ""}/${bucket}/${objectName}`;
  }

  private getPathPrefix(): string {
    return (this.configService.get<string>("MINIO_PATH_PREFIX_NFSE") ?? "nfse").replace(/^\/+|\/+$/g, "");
  }

  private requireEnv(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      throw new InternalServerErrorException(`Configuracao ausente para armazenamento de NFS-e: defina a variavel ${name}.`);
    }
    return value;
  }
}
