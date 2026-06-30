import { Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { Pool, PoolClient } from "pg";

interface ComposicaoItem {
  idprodutocomposto: number;
  idprodutodetail: number;
  descricaoproduto: string | null; // null para linhas orfas (detail deletado do produto)
  statusproduto: boolean | null; // null para linhas orfas; false = inativo (D-04: nao filtrado)
  quantidade: string; // pg retorna DOMAIN/NUMERIC como string; INTEGER como number — retornamos o que o pg retorna
}

@Injectable()
export class AthosProdutoCompostoService {
  private readonly logger = new Logger(AthosProdutoCompostoService.name);
  private _pool: Pool | null = null;

  private getPool(): Pool {
    if (!this._pool) {
      const cfg = this.getDbConfig();
      this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on("error", (err: Error) => this.logger.error(`Athos pool error: ${err.message}`));
    }
    return this._pool;
  }

  private getDbConfig() {
    const host = process.env.ATHOS_PG_HOST;
    const database = process.env.ATHOS_PG_DB;
    const user = process.env.ATHOS_PG_USER;
    const password = process.env.ATHOS_PG_PASS;
    const port = Number(process.env.ATHOS_PG_PORT ?? "5432");

    if (!host || !database || !user || !password) {
      throw new InternalServerErrorException(
        "Configuracao Athos ausente. Defina ATHOS_PG_HOST, ATHOS_PG_DB, ATHOS_PG_USER e ATHOS_PG_PASS.",
      );
    }

    return { host, database, user, password, port };
  }

  async listarPorMaster(idprodutomaster: number): Promise<ComposicaoItem[]> {
    const client: PoolClient = await this.getPool().connect();
    try {
      // Passo 1: verificar existencia do produto master (D-03 — 404 se ausente)
      // idprodutomaster NUNCA interpolado na string SQL: usa $1 parametrizado (T-39-03-01)
      const masterCheck = await client.query(
        `SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1`,
        [idprodutomaster],
      );
      if (masterCheck.rows.length === 0) {
        throw new NotFoundException(`Produto ${idprodutomaster} nao encontrado no Athos`);
      }

      // Passo 2: buscar lista plana de componentes enriquecida (D-02)
      // LEFT JOIN (nao INNER) para expor linhas orfas com descricaoproduto/statusproduto null
      // e incluir todos os detail inativos sem filtro (D-04)
      const result = await client.query<ComposicaoItem>(
        `SELECT
           pc.idprodutocomposto,
           pc.idprodutodetail,
           p.descricaoproduto,
           p.statusproduto,
           pc.quantidade
         FROM produto_composto pc
         LEFT JOIN produto p ON p.idproduto = pc.idprodutodetail
         WHERE pc.idprodutomaster = $1
         ORDER BY pc.idprodutocomposto`,
        [idprodutomaster],
      );

      this.logger.log(
        `listarPorMaster idprodutomaster=${idprodutomaster} count=${result.rows.length}`,
      );

      return result.rows;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`Erro ao listar composicao: ${err}`);
      throw new InternalServerErrorException("Erro ao listar composicao do produto no Athos");
    } finally {
      client.release();
    }
  }
}
