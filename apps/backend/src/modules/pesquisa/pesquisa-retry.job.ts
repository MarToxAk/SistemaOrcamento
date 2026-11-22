/**
 * Fase 52 (plano 52-06): job de re-tentativa dos envios da pesquisa (D-47).
 *
 * Roda a cada 10 minutos em America/Sao_Paulo. Sempre marca os cupons vencidos como EXPIRADO e, so
 * com a pesquisa ativa na config, chama `reenviarPendentes` (cupom, convite e CSAT nativo). A guarda
 * `running` evita sobreposicao no MESMO processo; entre processos a protecao e a trava advisory
 * (T-52-73). Logs so com contagens — nunca telefone, texto ou codigo de cupom.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { PrismaService } from "../database/prisma.service";
import { PesquisaConfigService } from "./pesquisa-config.service";
import { CHAVE_TRAVA_RETRY, comTravaAdvisory } from "./pesquisa-trava";
import { PesquisaService } from "./pesquisa.service";

export type ResultadoCicloRetry = {
  expirados: number;
  reenvio: {
    candidatos: number;
    cupons: number;
    convites: number;
    csat: number;
    falhas: number;
  } | null;
};

@Injectable()
export class PesquisaRetryJob {
  private readonly logger = new Logger(PesquisaRetryJob.name);
  private running = false;

  constructor(
    private readonly pesquisa: PesquisaService,
    private readonly configPesquisa: PesquisaConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron("*/10 * * * *", { name: "pesquisa-retry", timeZone: "America/Sao_Paulo" })
  async executar(): Promise<ResultadoCicloRetry | null> {
    if (this.running) {
      this.logger.warn("pesquisa-retry: ciclo anterior ainda em andamento - pulando este ciclo.");
      return null;
    }

    this.running = true;
    try {
      const trava = await comTravaAdvisory(this.prisma, CHAVE_TRAVA_RETRY, async () => {
        const expirados = await this.pesquisa.marcarCuponsExpirados();
        const reenvio = (await this.configPesquisa.obter()).ativo ? await this.pesquisa.reenviarPendentes() : null;
        return { expirados, reenvio };
      });

      if (!trava.executou) {
        this.logger.warn("pesquisa-retry: outro processo esta executando o ciclo - pulando.");
        return null;
      }

      const { expirados, reenvio } = trava.resultado;
      this.logger.log(
        `pesquisa-retry: ciclo concluido expirados=${expirados} candidatos=${reenvio?.candidatos ?? 0} ` +
          `cupons=${reenvio?.cupons ?? 0} convites=${reenvio?.convites ?? 0} csat=${reenvio?.csat ?? 0} ` +
          `falhas=${reenvio?.falhas ?? 0}.`,
      );
      return trava.resultado;
    } catch (err) {
      this.logger.error(`pesquisa-retry: ciclo falhou: ${err instanceof Error ? err.name : "erro"}.`);
      return null;
    } finally {
      this.running = false;
    }
  }
}
