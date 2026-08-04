import { Logger } from "@nestjs/common";
import axios from "axios";

/**
 * Fallback de CodigoMunicipio do tomador (NFSE-MUN-*).
 * Cliente HTTP puro para o ViaCEP — sem DI Nest, nunca lanca excecao (D-04).
 */
export interface ViaCepEndereco {
  ibge: string;
  uf: string;
  localidade: string;
}

export const VIACEP_BASE_URL = "https://viacep.com.br/ws";

const logger = new Logger("ViaCep");

/**
 * Consulta o ViaCEP pelo CEP informado e retorna o codigo IBGE do municipio.
 * Nunca lanca: qualquer falha (CEP invalido, rede, timeout, resposta com erro) retorna null.
 */
export async function consultarIbgePorCep(cep: string, timeoutMs = 5000): Promise<ViaCepEndereco | null> {
  try {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) {
      logger.warn(`CEP invalido para consulta ViaCEP: "${cep}" (esperado 8 digitos)`);
      return null;
    }

    const url = `${VIACEP_BASE_URL}/${cepLimpo}/json/`;
    const resp = await axios.get(url, { timeout: timeoutMs });
    const data = resp.data as Record<string, unknown>;

    if (data?.erro) {
      logger.warn(`ViaCEP retornou erro para CEP ${cepLimpo}`);
      return null;
    }

    const ibge = String((data as any)?.ibge ?? "").replace(/\D/g, "");
    if (ibge.length !== 7) {
      logger.warn(`ViaCEP retornou ibge invalido para CEP ${cepLimpo}: "${(data as any)?.ibge}"`);
      return null;
    }

    const resultado: ViaCepEndereco = {
      ibge,
      uf: String((data as any)?.uf ?? "").trim().toUpperCase(),
      localidade: String((data as any)?.localidade ?? "").trim(),
    };
    logger.log(`ViaCEP CEP ${cepLimpo} -> ibge=${resultado.ibge} uf=${resultado.uf} localidade="${resultado.localidade}"`);
    return resultado;
  } catch (err) {
    logger.warn(`Falha ao consultar ViaCEP para CEP "${cep}": ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
