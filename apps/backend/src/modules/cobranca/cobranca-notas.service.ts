import { BadGatewayException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import axios from "axios";

import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { DanfePdfService } from "../integrations/nfse/danfe-pdf.service";
import { CobrancaService } from "./cobranca.service";

/** Maximo de notas (NFS-e + NF-e) por arquivo ZIP. O frontend (plano 47-06) espelha este valor. */
export const LIMITE_NOTAS_ZIP = 50;

/** Teto do XML baixado do link salvo (protecao contra resposta gigante, T-47-02). */
export const TAMANHO_MAXIMO_XML_BYTES = 5 * 1024 * 1024;

const TIMEOUT_DOWNLOAD_XML_MS = 15_000;

/** Deixa so [A-Za-z0-9_-]; qualquer outro caractere vira "_" (nome de arquivo e de entrada do ZIP, T-47-03). */
export function sanearNomeArquivo(valor: string | number | null | undefined): string {
  return String(valor ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Bytes iniciais para inspecao: sem BOM UTF-8 e sem espacos/quebras. So para olhar; o conteudo entregue nao e alterado. */
function inicioParaInspecao(bytes: Buffer): string {
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  return bytes.subarray(i, i + 32).toString("latin1");
}

function linkHttpValido(link: string): boolean {
  try {
    const protocolo = new URL(link).protocol;
    return protocolo === "http:" || protocolo === "https:";
  } catch {
    return false;
  }
}

interface ErroAxiosLike {
  response?: { status?: number };
  message?: string;
}

/**
 * Notas fiscais para download: XML da NFS-e (D-11) e ZIP em lote PDF + XML (D-12).
 * Regra de ouro: NUNCA monta, converte ou completa XML. So entrega bytes ja salvos
 * (xmlNacional, linkNfse ou o XML da NF-e no Athos); o que nao existe vira 404/pendencia.
 */
@Injectable()
export class CobrancaNotasService {
  private readonly logger = new Logger(CobrancaNotasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cobrancaService: CobrancaService,
    private readonly athosService: AthosService,
    private readonly danfePdfService: DanfePdfService,
  ) {}

  /**
   * XML salvo da NFS-e, na ordem do D-11: xmlNacional (cache) -> conteudo de linkNfse -> 404.
   * PDF (nota antiga iiBrasil) ou HTML no link nao sao XML: respondem 404 "XML indisponivel".
   */
  async baixarNfseXml(id: number): Promise<{ xml: Buffer; nomeArquivo: string }> {
    const nfse = await this.prisma.nfseEmitida.findUnique({
      where: { id },
      select: { id: true, numeroNfse: true, xmlNacional: true, linkNfse: true },
    });
    if (!nfse) throw new NotFoundException(`NFS-e ${id} não encontrada.`);

    const numero = nfse.numeroNfse ?? String(id);
    const nomeArquivo = `NFSe-${sanearNomeArquivo(numero)}.xml`;

    if (nfse.xmlNacional && nfse.xmlNacional.trim() !== "") {
      return { xml: Buffer.from(nfse.xmlNacional, "utf8"), nomeArquivo };
    }

    if (nfse.linkNfse && linkHttpValido(nfse.linkNfse)) {
      const xml = await this.baixarXmlDoLink(nfse.linkNfse, id, numero);
      return { xml, nomeArquivo };
    }

    throw new NotFoundException(`XML indisponível para a NFS-e ${numero}: nenhum XML salvo.`);
  }

  private async baixarXmlDoLink(link: string, id: number, numero: string): Promise<Buffer> {
    let bruto: Buffer;
    try {
      const resp = await axios.get<ArrayBuffer>(link, {
        responseType: "arraybuffer",
        timeout: TIMEOUT_DOWNLOAD_XML_MS,
        maxContentLength: TAMANHO_MAXIMO_XML_BYTES,
      });
      bruto = Buffer.from(resp.data);
    } catch (err) {
      const e = err as ErroAxiosLike;
      const status = e?.response?.status;
      if (status === 404 || status === 410) {
        throw new NotFoundException(
          `XML indisponível para a NFS-e ${numero}: o arquivo salvo não existe mais.`,
        );
      }
      // Log so com id e mensagem do erro; nunca o conteudo do arquivo nem a URL.
      this.logger.warn(
        `Download do XML da NFS-e ${id} falhou: ${e?.message ?? String(err)}`,
      );
      throw new BadGatewayException("Não foi possível baixar o XML salvo agora. Tente novamente.");
    }

    const inicio = inicioParaInspecao(bruto);
    if (inicio.startsWith("%PDF-")) {
      throw new NotFoundException(
        `XML indisponível para a NFS-e ${numero}: a nota só tem o PDF do provedor antigo (iiBrasil).`,
      );
    }
    const minusculo = inicio.toLowerCase();
    if (minusculo.startsWith("<!doctype html") || minusculo.startsWith("<html") || !inicio.startsWith("<")) {
      throw new NotFoundException(
        `XML indisponível para a NFS-e ${numero}: o link salvo não devolve XML.`,
      );
    }

    // Bytes originais, sem reconverter.
    return bruto;
  }
}
