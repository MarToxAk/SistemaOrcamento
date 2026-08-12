import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Pool } from "pg";

// Banco de producao dos pedidos (tabelas pedidos/status_historico/mensagens_enviadas),
// separado do banco do Athos e do banco proprio da aplicacao. Credenciais via env
// PEDIDOS_PG_* (mesmo padrao do ATHOS_PG_* em athos.service.ts).
export type UltimoStatusPedido = { pedidoId: number; numero: string | null; nome: string | null; ultimoStatus: number | null; quando: Date | null } | null;

@Injectable()
export class PedidosDbService {
  private readonly logger = new Logger(PedidosDbService.name);
  private _pool: Pool | null = null;

  private getPool(): Pool {
    if (!this._pool) {
      const cfg = this.getDbConfig();
      this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on("error", (err: Error) => this.logger.error(`Pedidos pool error: ${err.message}`));
    }
    return this._pool;
  }

  private getDbConfig() {
    const host = process.env.PEDIDOS_PG_HOST;
    const database = process.env.PEDIDOS_PG_DB;
    const user = process.env.PEDIDOS_PG_USER;
    const password = process.env.PEDIDOS_PG_PASS;
    const port = Number(process.env.PEDIDOS_PG_PORT ?? "5432");

    if (!host || !database || !user || !password) {
      throw new InternalServerErrorException(
        "Configuracao do banco de pedidos ausente. Defina PEDIDOS_PG_HOST, PEDIDOS_PG_DB, PEDIDOS_PG_USER e PEDIDOS_PG_PASS.",
      );
    }

    return { host, database, user, password, port };
  }

  async buscarUltimoStatusPorChatId(chatId: string): Promise<UltimoStatusPedido> {
    const pool = this.getPool();
    const result = await pool.query(
      `
      SELECT p.id AS pedido_id, p.numero, p.nome, sh.status AS ultimo_status, sh.datahora AS quando
      FROM status_historico sh
      JOIN pedidos p ON sh.pedido_id = p.id
      WHERE p.chatid = $1
      ORDER BY sh.datahora DESC
      LIMIT 1
      `,
      [chatId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      pedidoId: Number(row.pedido_id),
      numero: row.numero == null ? null : String(row.numero),
      nome: row.nome == null ? null : String(row.nome),
      ultimoStatus: row.ultimo_status == null ? null : Number(row.ultimo_status),
      quando: row.quando instanceof Date ? row.quando : row.quando ? new Date(String(row.quando)) : null,
    };
  }

  async podeEnviarMensagemFechamento(chatId: string): Promise<boolean> {
    const pool = this.getPool();
    const result = await pool.query(
      `
      SELECT NOT EXISTS (
        SELECT 1
        FROM mensagens_enviadas
        WHERE chat_id = $1
          AND tipo_evento = 'close'
          AND data_envio >= CURRENT_DATE - INTERVAL '1 day'
          AND data_envio <= CURRENT_DATE
      ) AS pode_enviar
      `,
      [chatId],
    );

    return Boolean(result.rows[0]?.pode_enviar);
  }

  async registrarMensagemEnviada(chatId: string, tipoEvento: string, mensagem: string): Promise<void> {
    const pool = this.getPool();
    await pool.query(
      `INSERT INTO mensagens_enviadas (chat_id, tipo_evento, mensagem_enviada) VALUES ($1, $2, $3)`,
      [chatId, tipoEvento, mensagem],
    );
  }
}
