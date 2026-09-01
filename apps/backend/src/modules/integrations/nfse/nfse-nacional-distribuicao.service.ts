import zlib from "node:zlib";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../../database/prisma.service";
import { carregarCertNfseNacional } from "./nfse-nacional-cert.util";
import { parseNfseXml } from "./nfse-xml-parser.util";

// ---------------------------------------------------------------------------
// Backfill das NFS-e via Distribuicao de DF-e do ADN (nfse-node/cliente):
// caminha os documentos disponibilizados pelo Ambiente de Dados Nacional,
// filtra os que somos PRESTADOR (nao tomador) e preenche NfseEmitida.chaveAcesso
// + NfseEmitida.xmlNacional (cache do XML assinado) por match de numeroNfse.
//
// Disparado manualmente via POST /cobranca/nfse/sincronizar-dfe (endpoint
// autenticado, sem cron). Idempotente: o cursor (NfseDfeSync.ultimoNsu) avanca
// sempre, e o update so grava se chaveAcesso OU xmlNacional ainda estiverem
// nulos — re-rodar nao duplica nem regride.
//
// `nfse-node` e ESM puro: o import da lib e SEMPRE dinamico
// (`await import("nfse-node/cliente")`), nunca estatico no topo do arquivo.
// ---------------------------------------------------------------------------
export interface SyncDfeResumo {
  lotesProcessados: number;
  documentosVistos: number;
  nfseDocs: number;
  atualizadas: number;
  numerosAtualizados: string[];
  ignorados: number;
  ultimoNsu: number;
  parouPor: "E2220" | "NENHUM_DOCUMENTO_LOCALIZADO" | "LIMITE_LOTES";
}

@Injectable()
export class NfseNacionalDistribuicaoService {
  private readonly logger = new Logger(NfseNacionalDistribuicaoService.name);
  private static readonly MAX_LOTES = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async criarCliente() {
    const { criarClienteSefin } = await import("nfse-node/cliente");
    const { certPem, keyPem, ambiente } = carregarCertNfseNacional(this.config);
    return criarClienteSefin({
      ambiente,
      certificado: { chavePrivadaPem: keyPem, certificadoPem: certPem },
      timeoutMs: 30_000,
    });
  }

  private extrairEmitCnpj(xml: string): string | null {
    const m = xml.match(/<emit>([\s\S]*?)<\/emit>/);
    if (!m) return null;
    const c = m[1].match(/<CNPJ>([^<]+)<\/CNPJ>/);
    return c ? c[1].replace(/\D/g, "") : null;
  }

  async sincronizar(): Promise<SyncDfeResumo> {
    const { cnpjPrestador } = carregarCertNfseNacional(this.config);
    const alvoCnpj = cnpjPrestador.replace(/\D/g, "");

    const cliente = await this.criarCliente();

    const sync = await this.prisma.nfseDfeSync.findUnique({ where: { id: 1 } });
    let nsu = sync && sync.ultimoNsu > 0 ? sync.ultimoNsu + 1 : 0;

    let lotesProcessados = 0;
    let documentosVistos = 0;
    let nfseDocs = 0;
    let atualizadas = 0;
    let ignorados = 0;
    const numerosAtualizados: string[] = [];
    let parouPor: SyncDfeResumo["parouPor"] | undefined;

    while (lotesProcessados < NfseNacionalDistribuicaoService.MAX_LOTES) {
      let lote;
      try {
        lote = await cliente.baixarDfe(nsu, { cnpjConsulta: alvoCnpj });
      } catch (err) {
        if ((err as any)?.status === 404 && (err as any)?.erros?.[0]?.codigo === "E2220") {
          parouPor = "E2220";
          break;
        }
        throw err;
      }
      lotesProcessados++;

      const docs = lote?.documentos ?? [];
      if (lote?.statusProcessamento === "NENHUM_DOCUMENTO_LOCALIZADO" || docs.length === 0) {
        parouPor = "NENHUM_DOCUMENTO_LOCALIZADO";
        break;
      }

      for (const doc of docs) {
        documentosVistos++;
        if (doc.tipoDocumento !== "NFSE") {
          ignorados++;
          continue;
        }
        nfseDocs++;

        const xml = doc.xml ?? "";
        const parsed = parseNfseXml(xml);
        const nNFSe = parsed.numeroNfse;
        const emitCnpj = this.extrairEmitCnpj(xml);

        if (!nNFSe || emitCnpj !== alvoCnpj) {
          ignorados++;
          continue;
        }

        const chave = parsed.chaveAcesso ?? doc.chaveAcesso ?? null;
        const res = await this.prisma.nfseEmitida.updateMany({
          where: { numeroNfse: nNFSe, OR: [{ chaveAcesso: null }, { xmlNacional: null }] },
          data: { chaveAcesso: chave, xmlNacional: xml },
        });

        if (res.count > 0) {
          atualizadas += res.count;
          numerosAtualizados.push(nNFSe);
        } else {
          ignorados++;
        }
      }

      const maxNsu = Math.max(...docs.map((d) => d.nsu));
      nsu = maxNsu + 1;
      await this.prisma.nfseDfeSync.upsert({
        where: { id: 1 },
        create: { id: 1, ultimoNsu: maxNsu },
        update: { ultimoNsu: maxNsu },
      });
    }

    if (lotesProcessados >= NfseNacionalDistribuicaoService.MAX_LOTES && !parouPor) {
      parouPor = "LIMITE_LOTES";
    }

    const finalNsu = nsu > 0 ? nsu - 1 : 0;
    await this.prisma.nfseDfeSync.upsert({
      where: { id: 1 },
      create: { id: 1, ultimoNsu: finalNsu },
      update: { ultimoNsu: finalNsu },
    });

    this.logger.log(
      `Sincronizacao DF-e: ${lotesProcessados} lote(s), ${nfseDocs} NFSE, ${atualizadas} NfseEmitida atualizada(s), parou por ${parouPor}`,
    );

    return {
      lotesProcessados,
      documentosVistos,
      nfseDocs,
      atualizadas,
      numerosAtualizados,
      ignorados,
      ultimoNsu: finalNsu,
      parouPor: parouPor as SyncDfeResumo["parouPor"],
    };
  }

  async consultarXmlPorChave(chave: string): Promise<string> {
    const cliente = await this.criarCliente();
    const { corpo } = await cliente.consultarNfse(chave);
    const b64 = corpo?.nfseXmlGZipB64;
    if (!b64) throw new Error(`consultarNfse(${chave}) nao retornou nfseXmlGZipB64`);
    return zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
  }
}
