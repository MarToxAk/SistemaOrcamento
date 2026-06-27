import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import {
  computeDefaults,
  DEFAULTS_CACHE_TTL_MS,
  FISCAL_FIELDS,
} from "./athos-defaults.util";
import type { ProductDefaults, RawRow } from "./athos-defaults.util";

// Query unica de leitura: seleciona os 15 campos da allowlist dos produtos ativos.
// 100% hardcoded — sem interpolacao de input de usuario (T-37-01).
// D-01: statusproduto = true AND vendeproduto = true.
// D-02: sem filtro de data — usa todo o catalogo ativo.
// D-06: statusproduto e vendeproduto NAO aparecem no SELECT de moda.
const SQL_ACTIVE_PRODUCTS = `
  SELECT icms, icmsnfe, tributacao, tributacaonfe,
         codigocsosn, codigocsosnnfe, origem, origemnfe,
         tipoitem, piscst, cofinscst, idcfopsaida, ncm,
         controlaestoque, baixarestoque
  FROM produto
  WHERE statusproduto = true AND vendeproduto = true
`;

@Injectable()
export class AthosDefaultsService {
  private readonly logger = new Logger(AthosDefaultsService.name);
  private _pool: Pool | null = null;

  // Cache em memoria com TTL (D-03)
  // D-04: sem invalidacao por escrita — expira somente por TTL (24h)
  private _cache: { defaults: ProductDefaults; expiresAt: number } | null = null;

  // Promise-lock: previne cache stampede em chamadas simultaneas (Pitfall 2 do RESEARCH)
  private _loading: Promise<ProductDefaults> | null = null;

  // -------------------------------------------------------------------------
  // Pool e configuracao de banco (copiado de athos-produto.service.ts — Padrao 1)
  // -------------------------------------------------------------------------

  private getPool(): Pool {
    if (!this._pool) {
      const cfg = this.getDbConfig();
      this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on("error", (err: Error) =>
        this.logger.error(`Athos defaults pool error: ${err.message}`),
      );
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

  // -------------------------------------------------------------------------
  // API publica
  // -------------------------------------------------------------------------

  /**
   * Retorna o mapa de defaults calculado por moda dos produtos ativos do Athos.
   *
   * - Cache hit: retorna resultado armazenado enquanto Date.now() < expiresAt (D-03)
   * - Cache miss: inicia _fetchAndCompute() com promise-lock para evitar stampede
   * - Nunca lanca excecao de logica de moda (DEFD-04)
   */
  async getDefaults(): Promise<ProductDefaults> {
    if (this._cache && Date.now() < this._cache.expiresAt) {
      return this._cache.defaults;
    }
    if (!this._loading) {
      // promise-lock: apenas um _fetchAndCompute() em andamento por vez
      this._loading = this._fetchAndCompute().finally(() => {
        this._loading = null;
      });
    }
    return this._loading;
  }

  // -------------------------------------------------------------------------
  // Implementacao interna
  // -------------------------------------------------------------------------

  private async _fetchAndCompute(): Promise<ProductDefaults> {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    let queryError: Error | undefined;
    try {
      const result = await client.query<RawRow>(SQL_ACTIVE_PRODUCTS);
      const defaults = computeDefaults(result.rows);

      // Gravar cache com TTL de 24h (D-03)
      this._cache = { defaults, expiresAt: Date.now() + DEFAULTS_CACHE_TTL_MS };

      // T-37-03: log apenas com contadores — nunca valores fiscais individuais
      const fiscalCount = Object.keys(defaults).filter((k) =>
        (FISCAL_FIELDS as readonly string[]).includes(k),
      ).length;
      this.logger.log(
        `defaults calculados sampleSize=${result.rows.length} campos_fiscais=${fiscalCount}`,
      );

      return defaults;
    } catch (err) {
      queryError = err as Error;
      throw err;
    } finally {
      // Sinaliza ao pool que a conexao pode estar corrompida quando houve erro (WR-01)
      client.release(queryError);
    }
  }
}
