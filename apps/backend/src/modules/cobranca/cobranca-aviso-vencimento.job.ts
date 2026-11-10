import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";

import {
  CobrancaAvisoVencimentoService,
  type ResultadoCicloAviso,
} from "./cobranca-aviso-vencimento.service";

/**
 * Job do aviso de vencimento/atraso de boletos (Fase 45, D-07). Roda as 08:00 e 14:00 em America/Sao_Paulo
 * (a segunda janela serve de nova tentativa para falhas do ciclo da manha).
 *
 * DESLIGADO POR PADRAO: envia e-mail real a clientes, entao so liga com COBRANCA_AVISO_ATIVO exatamente
 * igual a "true" (kill switch invertido: ausente, "false", "TRUE" ou qualquer outro texto = desligado).
 * COBRANCA_AVISO_DRY_RUN=true (so vale com ATIVO=true: um unico interruptor mestre) apenas loga o que
 * seria enviado, sem reservar linha nem enviar.
 *
 * `running` e guarda em memoria de processo: previne ciclos sobrepostos so na MESMA instancia. Com varias
 * replicas, cada uma teria o seu; o risco residual e coberto pela unique (cobrancaBoletoId, tipo) da
 * tabela CobrancaAvisoVencimento, que impede aviso duplicado (a reserva por create trata P2002 como pulo).
 */
@Injectable()
export class CobrancaAvisoVencimentoJob {
  private readonly logger = new Logger(CobrancaAvisoVencimentoJob.name);
  private running = false;

  constructor(
    private readonly avisos: CobrancaAvisoVencimentoService,
    private readonly config: ConfigService,
  ) {}

  @Cron("0 8,14 * * *", { name: "cobranca-aviso-vencimento", timeZone: "America/Sao_Paulo" })
  async executar(): Promise<ResultadoCicloAviso | null> {
    if (this.config.get<string>("COBRANCA_AVISO_ATIVO") !== "true") {
      this.logger.log(
        "Aviso de vencimento desligado (COBRANCA_AVISO_ATIVO diferente de true) - ciclo ignorado.",
      );
      return null;
    }

    if (this.running) {
      this.logger.warn("Aviso de vencimento: ciclo anterior ainda em andamento - pulando este ciclo.");
      return null;
    }

    const dryRun = this.config.get<string>("COBRANCA_AVISO_DRY_RUN") === "true";

    this.running = true;
    try {
      return await this.avisos.processarCiclo({ dryRun });
    } catch (err) {
      this.logger.error(
        `Aviso de vencimento: ciclo falhou: ${err instanceof Error ? err.name : "erro"}.`,
      );
      return null;
    } finally {
      this.running = false;
    }
  }
}
