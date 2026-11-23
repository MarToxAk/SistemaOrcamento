/**
 * Fase 52 (quick 261122-rlb): variacao por IA dos textos da pesquisa, anti-spam leve.
 * Nunca lanca: qualquer falha (flag desligada, IA ausente, timeout, erro, resposta vazia ou
 * validacao reprovada) devolve o modelo original, sem atrasar o envio alem do timeout.
 *
 * Logs: so `motivo=` (strings fixas) e `tipo`; nunca o texto (modelo ou variado), o token,
 * a URL nem o objeto de erro do axios.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

import { extrairMensagemIA } from "../integrations/chatwoot/chatwoot-automation.service";
import {
  ENV_VARIACAO_IA,
  ENV_VARIACAO_NIVEL,
  TIMEOUT_VARIACAO_MS,
  type TipoVariacao,
  montarPromptVariacao,
  nivelVariacao,
  sortearDiretriz,
  validarVariacao,
  variacaoAtiva,
} from "./pesquisa-variacao";

@Injectable()
export class PesquisaVariacaoService {
  private readonly logger = new Logger(PesquisaVariacaoService.name);

  constructor(private readonly config: ConfigService) {}

  /** Devolve o texto variado ou, em qualquer falha, o modelo original. Nunca lanca. */
  async variar(modelo: string, tipo: TipoVariacao): Promise<string> {
    if (!variacaoAtiva(this.config.get<string>(ENV_VARIACAO_IA)) || !modelo) {
      return modelo;
    }

    const url = this.config.get<string>("CHATWOOT_AI_URL");
    const token = this.config.get<string>("CHATWOOT_AI_TOKEN");
    if (!url || !token) {
      this.logger.debug(`Variacao por IA ignorada motivo=ia_nao_configurada`);
      return modelo;
    }

    const model = this.config.get<string>("CHATWOOT_AI_MODEL") ?? "openclaw/main";
    const nivel = nivelVariacao(this.config.get<string>(ENV_VARIACAO_NIVEL));
    const prompt = montarPromptVariacao(modelo, tipo, sortearDiretriz(Math.random, nivel), nivel);

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, TIMEOUT_VARIACAO_MS);
    });

    try {
      const resposta = await Promise.race([
        axios.post(
          url,
          { model, input: prompt },
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: TIMEOUT_VARIACAO_MS,
            signal: controller.signal,
          },
        ),
        timeout,
      ]);

      const texto = extrairMensagemIA(resposta?.data);
      if (!texto) {
        this.logger.warn(`Variacao por IA descartada motivo=resposta_vazia`);
        return modelo;
      }

      const validacao = validarVariacao(modelo, texto, tipo);
      if (!validacao.valido) {
        this.logger.warn(`Variacao por IA descartada motivo=validacao_reprovada razao=${validacao.motivo}`);
        return modelo;
      }

      this.logger.log(`Variacao por IA aplicada tipo=${tipo}`);
      return validacao.texto;
    } catch (err) {
      this.logger.warn(`Variacao por IA descartada motivo=${this.motivoDeErro(err)}`);
      return modelo;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private motivoDeErro(err: unknown): string {
    const erro = err as { code?: unknown; response?: { status?: unknown } };
    const codigo = erro?.code;
    if (
      codigo === "ECONNABORTED" ||
      codigo === "ETIMEDOUT" ||
      codigo === "ERR_CANCELED" ||
      (err instanceof Error && err.message === "timeout")
    ) {
      return "timeout";
    }
    const status = erro?.response?.status;
    if (typeof status === "number") return `falha_chamada status=${status}`;
    return "falha_chamada";
  }
}
