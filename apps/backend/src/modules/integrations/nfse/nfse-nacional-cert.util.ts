import fs from "node:fs";
import path from "node:path";

import type { ConfigService } from "@nestjs/config";

// ---------------------------------------------------------------------------
// Helper puro (nao e provider Nest) para carregar o certificado mTLS da NFS-e
// Nacional, compartilhado pelos servicos novos desta quick task
// (DanfseNacionalPdfService, NfseNacionalDistribuicaoService).
//
// NfseNacionalService (emissao) mantem sua propria copia PRIVADA da mesma
// logica de proposito: seus metodos sao todos `private` e o servico nao tem
// nenhuma cobertura de teste hoje. Refatora-lo para usar este helper
// compartilhado seria mexer no caminho de emissao em producao sem rede de
// seguranca, dentro de um quick task. A duplicacao aqui e consciente e
// localizada; unificar os dois e trabalho de um refactor futuro com testes.
// ---------------------------------------------------------------------------

export interface NfseNacionalCert {
  certPem: string;
  keyPem: string;
  ambiente: "producao" | "homologacao";
  cnpjPrestador: string;
}

function loadPem(config: ConfigService, pemEnv: string, pathEnv: string): string | null {
  const pemText = config.get<string>(pemEnv);
  if (pemText && pemText.trim().length > 0) {
    return pemText.replace(/\\n/g, "\n");
  }

  const filePath = config.get<string>(pathEnv);
  if (filePath && filePath.trim().length > 0) {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, "utf8");
    }
  }

  return null;
}

export function carregarCertNfseNacional(config: ConfigService): NfseNacionalCert {
  const certPem = loadPem(config, "NFSE_NACIONAL_CERT_PEM", "NFSE_NACIONAL_CERT_PATH");
  const keyPem = loadPem(config, "NFSE_NACIONAL_KEY_PEM", "NFSE_NACIONAL_KEY_PATH");
  if (!certPem || !keyPem) {
    throw new Error("Certificado da NFS-e Nacional nao configurado (NFSE_NACIONAL_CERT_PEM / NFSE_NACIONAL_KEY_PEM).");
  }

  const ambiente: "producao" | "homologacao" =
    config.get<string>("NFSE_NACIONAL_AMBIENTE") === "homologacao" ? "homologacao" : "producao";

  const cnpjPrestador = config.get<string>("NFSE_NACIONAL_CNPJ_PRESTADOR")?.trim();
  if (!cnpjPrestador) {
    throw new Error("NFSE_NACIONAL_CNPJ_PRESTADOR nao configurado.");
  }

  return { certPem, keyPem, ambiente, cnpjPrestador };
}
