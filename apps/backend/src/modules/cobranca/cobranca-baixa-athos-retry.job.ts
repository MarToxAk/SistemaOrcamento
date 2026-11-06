import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";

import { PrismaService } from "../database/prisma.service";
import { CobrancaBaixaAthosService } from "./cobranca-baixa-athos.service";

/** Tentativas automaticas por boleto; acima disso so a baixa manual (que ignora o limite). */
export const BAIXA_MAX_TENTATIVAS_AUTO = 5;
/** Teto de boletos por ciclo (T-43-17: nao saturar o Athos). */
export const BAIXA_MAX_POR_CICLO = 50;

/**
 * Retentativa automatica das baixas no Athos que falharam ou ficaram pendentes (ATHOS_BAIXA_AUTO=false).
 *
 * Seleciona SOMENTE athosBaixaStatus em [falha, pendente]: boletos pagos antes da Fase 43 tem o campo nulo
 * e jamais sao baixados automaticamente (T-43-16); baixa-los exige acao manual explicita do operador.
 */
@Injectable()
export class CobrancaBaixaAthosRetryJob {
  private readonly logger = new Logger(CobrancaBaixaAthosRetryJob.name);
  /**
   * Guarda em memoria de processo - previne apenas ciclos sobrepostos dentro da MESMA instancia do backend.
   * Mesmo risco residual aceito do CobrancaReconciliationJob (41-02-PLAN.md, T-41-02-02): com mais de uma
   * replica cada instancia teria seu proprio `running`. A idempotencia no Athos (FOR UPDATE + statusconta)
   * evita baixa em duplicidade; para escalar horizontalmente, trocar por lock distribuido
   * (ex.: `pg_try_advisory_lock`).
   */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly baixaAthos: CobrancaBaixaAthosService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async retentarBaixasPendentes(): Promise<{ verificados: number; baixados: number; falhas: number }> {
    const zerado = { verificados: 0, baixados: 0, falhas: 0 };

    if (this.config.get<string>("ATHOS_BAIXA_AUTO") === "false") {
      this.logger.log("Retentativa de baixa Athos desligada via ATHOS_BAIXA_AUTO=false - ciclo ignorado.");
      return zerado;
    }

    if (this.running) {
      this.logger.warn("Retentativa de baixa Athos: ciclo anterior ainda em andamento - pulando este ciclo.");
      return zerado;
    }

    this.running = true;
    try {
      const candidatos = await this.prisma.cobrancaBoleto.findMany({
        where: {
          status: "pago",
          athosBaixaStatus: { in: ["falha", "pendente"] },
          athosBaixaTentativas: { lt: BAIXA_MAX_TENTATIVAS_AUTO },
        },
        select: { id: true },
        orderBy: { athosBaixaUltimaEm: { sort: "asc", nulls: "first" } },
        take: BAIXA_MAX_POR_CICLO,
      });

      this.logger.log(`Retentativa de baixa Athos: ${candidatos.length} boleto(s) candidato(s).`);
      if (candidatos.length === BAIXA_MAX_POR_CICLO) {
        this.logger.warn(
          `Retentativa de baixa Athos: teto de ${BAIXA_MAX_POR_CICLO} boletos por ciclo atingido - pode haver boletos nao processados neste ciclo.`,
        );
      }

      let baixados = 0;
      let falhas = 0;

      for (const { id } of candidatos) {
        try {
          const resultado = await this.baixaAthos.executarAposPagamento(id, { origem: "retentativa" });
          if (resultado.status === "baixado" || resultado.status === "ja_baixado") {
            baixados += 1;
          } else if (resultado.status === "falha") {
            falhas += 1;
          }
        } catch (err) {
          falhas += 1;
          this.logger.error(
            `Falha inesperada na retentativa de baixa Athos cobrancaId=${id}: ${err instanceof Error ? err.name : "erro"}.`,
          );
        }
      }

      this.logger.log(
        `Retentativa de baixa Athos concluida: verificados=${candidatos.length}, baixados=${baixados}, falhas=${falhas}.`,
      );
      return { verificados: candidatos.length, baixados, falhas };
    } finally {
      this.running = false;
    }
  }
}
