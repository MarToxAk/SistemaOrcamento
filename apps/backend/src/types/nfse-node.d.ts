// Shim de tipos p/ nfse-node@0.3.2 (lib ESM pura; package.json "exports" so declara
// condicao "import", sem "require"). O tsc de build (tsconfig.build.json, module:
// Node16/moduleResolution:node16) resolve os subpaths via exports.types normalmente,
// mas o ts-jest (jest.config.js forca module:CommonJS / moduleResolution:node, resolucao
// classica, nao exports-aware) nao encontra os subpaths sem este shim. Ver Task 1 do
// PLAN.md da quick 260828-g45 (criado condicionalmente).
declare module "nfse-node/danfse" {
  export function gerarDanfse(
    xml: string,
    opcoes?: {
      situacaoEspecial?: "Cancelada" | "Substituida";
      resolverMunicipio?: (cod: string) => { nome: string; uf: string } | undefined;
      logomarca?: Buffer;
      incluirCanhoto?: boolean;
    },
  ): Promise<Buffer>;
}
declare module "nfse-node/cliente" {
  export interface DocumentoDistribuicao {
    nsu: number;
    chaveAcesso: string;
    tipoDocumento: "NFSE" | "EVENTO" | "DPS" | string;
    tipoEvento?: string;
    xml: string;
    dataHoraGeracao: string;
  }
  export interface LoteDistribuicaoNsu {
    statusProcessamento: "DOCUMENTOS_LOCALIZADOS" | "NENHUM_DOCUMENTO_LOCALIZADO" | "REJEICAO" | string;
    documentos: DocumentoDistribuicao[];
    ultimoNsu?: number;
    [k: string]: unknown;
  }
  export interface ClienteSefin {
    baixarDfe(nsu: number, opcoes?: { cnpjConsulta?: string; lote?: number }): Promise<LoteDistribuicaoNsu>;
    consultarNfse(chave: string): Promise<{ status: number; corpo: { nfseXmlGZipB64?: string; [k: string]: unknown } }>;
  }
  export function criarClienteSefin(opcoes: {
    ambiente: "producao" | "homologacao";
    certificado: { chavePrivadaPem: string; certificadoPem: string };
    timeoutMs?: number;
  }): ClienteSefin;
  export function descompactarGZipBase64(b64: string): string;
}
