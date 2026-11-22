/**
 * Fase 52 (plano 52-06): job de retencao de 12 meses (parecer juridico pendente, D-38).
 *
 * Roda uma vez por dia as 03:30 em America/Sao_Paulo e so liga com PESQUISA_RETENCAO_ATIVA
 * exatamente igual a "true" (kill-switch invertido, como COBRANCA_AVISO_ATIVO: ausente, "TRUE", "1",
 * " true" e qualquer outro texto deixam desligado). O kill-switch e avaliado ANTES de abrir a
 * transacao: desligado nao toca o banco. Ligado, o ciclo roda sob a trava advisory (T-52-73) entre
 * processos e a guarda `running` dentro do processo. Logs so com contagens.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";

import { PrismaService } from "../database/prisma.service";
import { CHAVE_TRAVA_RETENCAO, comTravaAdvisory } from "./pesquisa-trava";
import { PesquisaService } from "./pesquisa.service";

const MESES_PADRAO = 12;

/** PESQUISA_RETENCAO_MESES: inteiro >= 1; qualquer outra coisa volta ao padrao de 12. */
function lerMeses(bruto: string | undefined): number {
  const n = Number(String(bruto ?? "").trim());
  return Number.isInteger(n) && n >= 1 ? n : MESES_PADRAO;
}

export type ResultadoCicloRetencao = { pesquisas: number; cupons: number };

@Injectable()
export class PesquisaRetencaoJob {
  private readonly logger = new Logger(PesquisaRetencaoJob.name);
  private running = false;

  constructor(
    private readonly pesquisa: PesquisaService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron("30 3 * * *", { name: "pesquisa-retencao", timeZone: "America/Sao_Paulo" })
  async executar(): Promise<ResultadoCicloRetencao | null> {
    if (this.config.get<string>("PESQUISA_RETENCAO_ATIVA") !== "true") {
      this.logger.log(
        "Retencao de pesquisas desligada (PESQUISA_RETENCAO_ATIVA diferente de true) - ciclo ignorado.",
      );
      return null;
    }

    if (this.running) {
      this.logger.warn("pesquisa-retencao: ciclo anterior ainda em andamento - pulando este ciclo.");
      return null;
    }

    this.running = true;
    try {
      const meses = lerMeses(this.config.get<string>("PESQUISA_RETENCAO_MESES"));
      const trava = await comTravaAdvisory(this.prisma, CHAVE_TRAVA_RETENCAO, () =>
        this.pesquisa.anonimizarAntigos(meses),
      );

      if (!trava.executou) {
        this.logger.warn("pesquisa-retencao: outro processo esta executando o ciclo - pulando.");
        return null;
      }

      this.logger.log(
        `pesquisa-retencao: ciclo concluido meses=${meses} pesquisas=${trava.resultado.pesquisas} ` +
          `cupons=${trava.resultado.cupons}.`,
      );
      return trava.resultado;
    } catch (err) {
      this.logger.error(`pesquisa-retencao: ciclo falhou: ${err instanceof Error ? err.name : "erro"}.`);
      return null;
    } finally {
      this.running = false;
    }
  }
}
