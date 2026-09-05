import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";

import { PrismaService } from "../database/prisma.service";
import { CobrancaService } from "./cobranca.service";

const RECONCILIACAO_MAX_POR_CICLO = 300;

@Injectable()
export class CobrancaReconciliationJob {
  private readonly logger = new Logger(CobrancaReconciliationJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cobrancaService: CobrancaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconciliarBoletosPendentes(): Promise<{ verificados: number; atualizados: number; falhas: number }> {
    if (this.config.get<string>("EFI_RECONCILIACAO_ATIVA") === "false") {
      this.logger.log("Reconciliação EFI desligada via EFI_RECONCILIACAO_ATIVA=false — ciclo ignorado.");
      return { verificados: 0, atualizados: 0, falhas: 0 };
    }

    if (this.running) {
      this.logger.warn("Reconciliação EFI: ciclo anterior ainda em andamento — pulando este ciclo.");
      return { verificados: 0, atualizados: 0, falhas: 0 };
    }

    this.running = true;
    try {
      const pendentes = await this.prisma.cobrancaBoleto.findMany({
        where: { status: "pendente" },
        select: { id: true },
        orderBy: { criadoEm: "asc" },
        take: RECONCILIACAO_MAX_POR_CICLO,
      });

      this.logger.log(`Reconciliação EFI: ${pendentes.length} boleto(s) pendente(s) encontrado(s).`);
      if (pendentes.length === RECONCILIACAO_MAX_POR_CICLO) {
        this.logger.warn(
          `Reconciliação EFI: teto de ${RECONCILIACAO_MAX_POR_CICLO} boletos por ciclo atingido — pode haver boletos pendentes não verificados neste ciclo.`,
        );
      }

      let atualizados = 0;
      let falhas = 0;

      for (const { id } of pendentes) {
        try {
          const resultado = await this.cobrancaService.verificarPagamentoBoleto(id);
          if (resultado.atualizado) {
            atualizados += 1;
            this.logger.log(`Boleto ${id} atualizado para status=${resultado.status}.`);
          }
        } catch (err) {
          falhas += 1;
          this.logger.error(
            `Falha ao reconciliar boleto ${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      this.logger.log(
        `Reconciliação EFI concluída: verificados=${pendentes.length}, atualizados=${atualizados}, falhas=${falhas}.`,
      );

      return { verificados: pendentes.length, atualizados, falhas };
    } finally {
      this.running = false;
    }
  }
}
