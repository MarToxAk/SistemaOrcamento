import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import axios from "axios";

import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { hojeSaoPaulo } from "../integrations/athos/athos-conta-receber-baixa.service";
import { DanfePdfService } from "../integrations/nfse/danfe-pdf.service";
import { CobrancaService } from "./cobranca.service";
import { BaixarNotasZipDto } from "./dto/baixar-notas-zip.dto";
import { EntradaZip, criarZipStore } from "./zip-store.util";

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

  /**
   * ZIP com PDF + XML de cada nota selecionada (D-12). Sequencial (um await por vez) para nao
   * sobrecarregar o renderizador de PDF. O que nao puder ser incluido vai para o LEIA-ME.txt;
   * XML nunca e inventado (D-11): so o que a origem guardou.
   */
  async gerarZipNotas(dto: BaixarNotasZipDto): Promise<{ zip: Buffer; nomeArquivo: string }> {
    const nfseIds = [...new Set(dto.nfseIds ?? [])];
    const vistosNfe = new Set<string>();
    const nfe = (dto.nfe ?? []).filter((n) => {
      const chave = `${n.cobrancaBoletoId}:${n.numero}`;
      if (vistosNfe.has(chave)) return false;
      vistosNfe.add(chave);
      return true;
    });

    const total = nfseIds.length + nfe.length;
    if (total === 0) throw new BadRequestException("Selecione ao menos uma nota.");
    if (total > LIMITE_NOTAS_ZIP) {
      throw new BadRequestException(`Selecione no máximo ${LIMITE_NOTAS_ZIP} notas por arquivo ZIP.`);
    }

    const entradas: EntradaZip[] = [];
    const pendencias: string[] = [];
    const basesUsadas = new Map<string, number>();
    let baseUnica: string | null = null;

    // Reserva um nome-base unico (NFSe-239, NFSe-239-2, ...) para PDF e XML da mesma nota.
    const reservarBase = (base: string): string => {
      const usos = (basesUsadas.get(base) ?? 0) + 1;
      basesUsadas.set(base, usos);
      return usos === 1 ? base : `${base}-${usos}`;
    };

    for (const id of nfseIds) {
      try {
        const danfse = await this.cobrancaService.baixarDanfsePdf(id);
        const numero = danfse.nomeArquivo.match(/^NFSe-(.+)\.pdf$/)?.[1] ?? String(id);
        const base = reservarBase(`NFSe-${sanearNomeArquivo(numero)}`);
        baseUnica = base;
        entradas.push({ nome: `${base}.pdf`, conteudo: danfse.pdfBuffer });
        if (danfse.xml) {
          entradas.push({ nome: `${base}.xml`, conteudo: Buffer.from(danfse.xml, "utf8") });
        } else {
          pendencias.push(`NFS-e ${numero}: XML indisponível (a origem guardou só o PDF).`);
        }
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : String(err);
        this.logger.warn(`ZIP de notas: NFS-e ${id} não incluída: ${mensagem}`);
        pendencias.push(`NFS-e id ${id}: ${mensagem}`);
      }
    }

    // Cache por boleto: varias NF-e do mesmo boleto consultam o Athos uma vez so.
    const notasPorBoleto = new Map<number, Array<{ numero: string; xml: string; cancelada: boolean }> | null>();
    for (const item of nfe) {
      try {
        if (!notasPorBoleto.has(item.cobrancaBoletoId)) {
          const boleto = await this.prisma.cobrancaBoleto.findUnique({
            where: { id: item.cobrancaBoletoId },
            include: { titulos: { select: { idcontareceber: true } } },
          });
          if (!boleto) {
            notasPorBoleto.set(item.cobrancaBoletoId, null);
          } else {
            const idcontas = boleto.titulos.map((t) => t.idcontareceber);
            const notas = idcontas.length
              ? await this.athosService.buscarNotasFiscaisXmlPorTitulos(idcontas)
              : [];
            notasPorBoleto.set(item.cobrancaBoletoId, notas);
          }
        }
        const notas = notasPorBoleto.get(item.cobrancaBoletoId);
        if (notas === null || notas === undefined) {
          pendencias.push(`NF-e ${item.numero}: boleto ${item.cobrancaBoletoId} não encontrado.`);
          continue;
        }
        const nota = notas.find((n) => n.numero === item.numero);
        if (!nota) {
          pendencias.push(
            `NF-e ${item.numero}: não encontrada entre as notas do boleto ${item.cobrancaBoletoId}.`,
          );
          continue;
        }

        const base = reservarBase(`NF-e-${sanearNomeArquivo(nota.numero)}`);
        baseUnica = base;
        let pdf: Buffer | null = null;
        try {
          pdf = await this.danfePdfService.gerarDanfe({ xml: nota.xml, cancelada: nota.cancelada });
        } catch (err) {
          this.logger.warn(
            `ZIP de notas: DANFE da NF-e ${nota.numero} falhou: ${err instanceof Error ? err.message : String(err)}`,
          );
          pendencias.push(`NF-e ${nota.numero}: PDF não pôde ser gerado; o XML foi incluído.`);
        }
        if (pdf) entradas.push({ nome: `${base}.pdf`, conteudo: pdf });
        // XML exatamente como veio do Athos.
        entradas.push({ nome: `${base}.xml`, conteudo: Buffer.from(nota.xml, "utf8") });
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `ZIP de notas: NF-e ${item.numero} (boleto ${item.cobrancaBoletoId}) não incluída: ${mensagem}`,
        );
        pendencias.push(`NF-e ${item.numero} (boleto ${item.cobrancaBoletoId}): ${mensagem}`);
      }
    }

    if (entradas.length === 0) {
      throw new NotFoundException("Nenhum arquivo disponível para as notas selecionadas.");
    }

    if (pendencias.length > 0) {
      const texto = ["Itens não incluídos neste arquivo", "", ...pendencias.map((p) => `- ${p}`), ""].join("\n");
      entradas.push({ nome: "LEIA-ME.txt", conteudo: Buffer.from(texto, "utf8") });
    }

    this.logger.log(
      `ZIP de notas gerado: ${nfseIds.length} NFS-e e ${nfe.length} NF-e pedidas, ${entradas.length} arquivos, ${pendencias.length} pendências.`,
    );

    const zip = criarZipStore(entradas);
    const nomeArquivo =
      total === 1 && baseUnica ? `${baseUnica}.zip` : `notas-fiscais-${hojeSaoPaulo()}.zip`;
    return { zip, nomeArquivo };
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
