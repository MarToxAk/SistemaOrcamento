import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { Client } from "pg";

import { PrismaService } from "../../database/prisma.service";
import { EventsService } from "../../events/events.service";

const LISTEN_CHANNEL = "n8n_channel";
const KEEP_ALIVE_MS = 55_000;
const PAYMENT_NOTE = "Pagamento feito no caixa";

@Injectable()
export class AthosListenerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AthosListenerService.name);
  private client: Client | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const host = process.env.ATHOS_PG_HOST;
    const database = process.env.ATHOS_PG_DB;
    const user = process.env.ATHOS_PG_USER;
    const password = process.env.ATHOS_PG_PASS;
    const port = Number(process.env.ATHOS_PG_PORT ?? "5432");

    if (!host || !database || !user || !password) {
      this.logger.warn("Variaveis ATHOS_PG_* ausentes — listener desativado.");
      return;
    }

    this.client = new Client({ host, database, user, password, port, connectionTimeoutMillis: 10_000 });

    try {
      await this.client.connect();
      await this.client.query(`LISTEN ${LISTEN_CHANNEL}`);
      this.logger.log(`Athos listener conectado. Escutando canal: ${LISTEN_CHANNEL}`);

      this.client.on("notification", (msg) => {
        this.logger.log(`Notificacao recebida no canal ${msg.channel}: ${msg.payload ?? ""}`);
        void this.handleNotification();
      });

      this.client.on("error", (err) => {
        this.logger.error(`Erro no client Athos listener: ${err.message}`);
      });

      this.keepAliveTimer = setInterval(() => {
        this.client?.query("SELECT 1").catch((err: Error) => {
          this.logger.warn(`Keep-alive falhou: ${err.message}`);
        });
      }, KEEP_ALIVE_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao iniciar Athos listener: ${msg}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    await this.client?.end().catch(() => undefined);
    this.logger.log("Athos listener encerrado.");
  }

  private async handleNotification(): Promise<void> {
    if (!this.client) return;

    try {
      // Busca o registro mais recente na tabela de relacao
      const relResult = await this.client.query<{ idvenda: number; idorcamento: number }>(
        "SELECT idvenda, idorcamento FROM relacao_orcamento_venda ORDER BY idrelataocaorcamentovenda DESC LIMIT 1",
      );

      const relRow = relResult.rows[0];
      if (!relRow?.idvenda) {
        this.logger.warn("Nenhum registro em relacao_orcamento_venda.");
        return;
      }

      const { idvenda, idorcamento } = relRow;

      // Busca a venda para obter numeroordem e verificar se e pagamento no caixa
      const vendaResult = await this.client.query<{
        numeroordem: string | null;
        idcaixamovimento: number | null;
      }>("SELECT numeroordem, idcaixamovimento FROM venda WHERE idvenda = $1 LIMIT 1", [idvenda]);

      const venda = vendaResult.rows[0];
      if (!venda) {
        this.logger.warn(`Venda idvenda=${idvenda} nao encontrada.`);
        return;
      }

      const isCaixa = venda.idcaixamovimento != null;
      if (!isCaixa) {
        this.logger.log(`Venda ${idvenda} nao e pagamento no caixa — ignorado.`);
        return;
      }

      const numeroordem = venda.numeroordem?.trim() ?? String(idvenda);
      this.logger.log(`Pagamento no caixa detectado: numeroordem=${numeroordem} idvenda=${idvenda}`);

      // Persiste a observacao no nosso banco (busca por saleExternalId ou externalQuoteId)
      await this.persistPaymentNote(idvenda, idorcamento);

      // Notifica o frontend via SSE
      this.eventsService.emitCaixaPayment({
        numeroordem,
        idVenda: idvenda,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erro ao processar notificacao Athos: ${msg}`);
    }
  }

  private async persistPaymentNote(idvenda: number, idorcamento: number): Promise<void> {
    try {
      const updated = await this.prisma.quote.updateMany({
        where: {
          OR: [
            { saleExternalId: BigInt(idvenda) },
            { externalQuoteId: BigInt(idorcamento) },
          ],
          paymentNote: null,
        },
        data: { paymentNote: PAYMENT_NOTE },
      });

      if (updated.count > 0) {
        this.logger.log(`paymentNote atualizado em ${updated.count} orcamento(s).`);
      } else {
        this.logger.warn(`Nenhum orcamento encontrado para idvenda=${idvenda} / idorcamento=${idorcamento}.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao persistir paymentNote: ${msg}`);
    }
  }
}
