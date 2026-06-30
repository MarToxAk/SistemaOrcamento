import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { validarFkExiste } from "./athos-fk.util";
import { CreateProdutoCompostoDto } from "./dto/create-produto-composto.dto";
import { UpdateProdutoCompostoDto } from "./dto/update-produto-composto.dto";

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

  /**
   * Mapeia erros do driver pg para exceções HTTP adequadas.
   * Re-lança HttpException já lançadas pelos guardas de aplicação sem alterar.
   * Sempre lança — nunca retorna.
   *
   * Codes mapeados (camada defensiva — spikes provaram que UNIQUE/CHECK nao existem):
   *   42501 -> 500 acionável (GRANT de escrita ausente em produto_composto/sequence)
   *   22003 -> 422 (overflow numeric(9,3) — caminho real de quantidade fora de domínio)
   *   23503 -> 422 (FK violation)
   *   23505 -> 409 (unique violation — defensivo)
   *   23514 -> 422 (check violation — defensivo)
   *   default -> 500 genérico
   */
  private mapPgWriteError(err: unknown): never {
    // Re-lançar exceções HTTP já lançadas pelos guardas (preserva 404/409/422)
    if (err instanceof HttpException) {
      throw err;
    }

    this.logger.error(`Erro pg em produto_composto: ${err}`);

    const code = (err as { code?: string }).code;
    switch (code) {
      case "42501":
        throw new InternalServerErrorException(
          "Permissao de escrita ausente em produto_composto ou na sequence associada. " +
          "Solicite ao DBA o GRANT: " +
          "GRANT INSERT, UPDATE, DELETE ON TABLE produto_composto TO <usuario>; " +
          "GRANT USAGE, SELECT ON SEQUENCE produto_composto_idprodutocomposto_seq TO <usuario>;",
        );
      case "22003":
        throw new UnprocessableEntityException(
          "Valor de quantidade fora do dominio numeric(9,3). " +
          "Use um valor entre 0.001 e 999999.999 com no maximo 3 casas decimais.",
        );
      case "23503":
        throw new UnprocessableEntityException("FK invalida em produto_composto");
      case "23505":
        throw new ConflictException("Par (idprodutomaster, idprodutodetail) ja existe em produto_composto");
      case "23514":
        throw new UnprocessableEntityException("Violacao de CHECK constraint em produto_composto");
      default:
        throw new InternalServerErrorException(
          "Erro interno ao operar em produto_composto no Athos",
        );
    }
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

  /**
   * Adiciona um componente (detail) ao kit (master) em produto_composto.
   *
   * Sequência de guardas (todos dentro de BEGIN/COMMIT):
   *   1. Auto-referência: master == detail -> 422 (antes de tocar o banco)
   *   2. validarFkExiste master em produto -> 422
   *   3. validarFkExiste detail em produto -> 422
   *   4. detail inativo (statusproduto=false) -> 422
   *   5. par (master,detail) já existente -> 409 (SELECT antes do INSERT — ÚNICA proteção, spike b)
   *   6. Contar componentes do master (ehPrimeiro = count == 0)
   *   7. INSERT INTO produto_composto (idprodutomaster, idprodutodetail, quantidade)
   *      VALUES ($1,$2,$3) RETURNING idprodutocomposto
   *   8. Se ehPrimeiro: UPDATE produto SET usaprodutocomposto = true WHERE idproduto = $1
   *   9. COMMIT; retornar { idprodutocomposto }
   *
   * Em qualquer erro: ROLLBACK + mapPgWriteError (sempre lança).
   */
  async adicionarComponente(
    idprodutomaster: number,
    dto: CreateProdutoCompostoDto,
  ): Promise<{ idprodutocomposto: number }> {
    // 1. Guarda de auto-referência — sem tocar o banco
    if (idprodutomaster === dto.idprodutodetail) {
      throw new UnprocessableEntityException(
        "Um produto nao pode ser componente de si mesmo (idprodutomaster === idprodutodetail)",
      );
    }

    const client: PoolClient = await this.getPool().connect();
    try {
      await client.query("BEGIN");

      // 2. Validar existência do master em produto
      await validarFkExiste(client, "produto", "idproduto", idprodutomaster, "Produto master");

      // 3. Validar existência do detail em produto (sem FK no banco — spike b)
      await validarFkExiste(client, "produto", "idproduto", dto.idprodutodetail, "Produto detail");

      // 4. Verificar se detail está ativo
      const detalheStatus = await client.query<{ statusproduto: boolean }>(
        `SELECT statusproduto FROM produto WHERE idproduto = $1`,
        [dto.idprodutodetail],
      );
      if (detalheStatus.rows[0]?.statusproduto === false) {
        throw new UnprocessableEntityException(
          `Produto detail ${dto.idprodutodetail} esta inativo (statusproduto=false) e nao pode compor um kit`,
        );
      }

      // 5. Pre-checagem de duplicata (NUNCA remover — nao ha UNIQUE no banco, spike b)
      const duplicata = await client.query(
        `SELECT 1 FROM produto_composto WHERE idprodutomaster = $1 AND idprodutodetail = $2 LIMIT 1`,
        [idprodutomaster, dto.idprodutodetail],
      );
      if (duplicata.rows.length > 0) {
        throw new ConflictException(
          `Par (idprodutomaster=${idprodutomaster}, idprodutodetail=${dto.idprodutodetail}) ja existe em produto_composto`,
        );
      }

      // 6. Contar componentes atuais do master (para decidir flag usaprodutocomposto)
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM produto_composto WHERE idprodutomaster = $1`,
        [idprodutomaster],
      );
      const ehPrimeiro = (countResult.rows[0]?.total ?? 0) === 0;

      // 7. INSERT com colunas literais fixas + parametros $1,$2,$3 (T-40-01 anti-injection)
      //    PK serial via RETURNING — NUNCA MAX+1 (decisao 2026-06-29)
      const insertResult = await client.query<{ idprodutocomposto: number }>(
        `INSERT INTO produto_composto (idprodutomaster, idprodutodetail, quantidade)
         VALUES ($1, $2, $3)
         RETURNING idprodutocomposto`,
        [idprodutomaster, dto.idprodutodetail, dto.quantidade],
      );
      const idprodutocomposto = insertResult.rows[0].idprodutocomposto;

      // 8. Se primeiro componente, ativar flag usaprodutocomposto no master (COMP-05)
      //    dentro da MESMA transacao (T-40-04 atomicidade)
      if (ehPrimeiro) {
        await client.query(
          `UPDATE produto SET usaprodutocomposto = true WHERE idproduto = $1`,
          [idprodutomaster],
        );
      }

      await client.query("COMMIT");

      this.logger.log(
        `adicionarComponente idprodutomaster=${idprodutomaster} idprodutodetail=${dto.idprodutodetail} ` +
        `idprodutocomposto=${idprodutocomposto} ehPrimeiro=${ehPrimeiro}`,
      );

      return { idprodutocomposto };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rbErr) {
        this.logger.error(`Erro no ROLLBACK: ${rbErr}`);
      }
      this.mapPgWriteError(err); // sempre lança
      throw err; // unreachable — satisfaz TypeScript
    } finally {
      client.release();
    }
  }

  /**
   * Atualiza a quantidade de um componente existente em produto_composto.
   *
   * Fluxo:
   *   1. SELECT idprodutocomposto WHERE (master, detail) — 404 se par inexistente
   *   2. UPDATE produto_composto SET quantidade=$1 WHERE idprodutomaster=$2 AND idprodutodetail=$3
   *   3. Retorna { idprodutocomposto } do par encontrado no passo 1.
   *
   * Sem transação multi-statement explícita (operação single-UPDATE), mas erros pg
   * são mapeados via mapPgWriteError (incluindo 22003 -> 422).
   * Valores sempre via parâmetros $N — nunca interpolados na string SQL (T-40-06).
   */
  async atualizarQuantidade(
    idprodutomaster: number,
    idprodutodetail: number,
    dto: UpdateProdutoCompostoDto,
  ): Promise<{ idprodutocomposto: number }> {
    const client: PoolClient = await this.getPool().connect();
    try {
      // 1. Verificar existência do par (master, detail) em produto_composto
      const parCheck = await client.query<{ idprodutocomposto: number }>(
        `SELECT idprodutocomposto FROM produto_composto WHERE idprodutomaster = $1 AND idprodutodetail = $2 LIMIT 1`,
        [idprodutomaster, idprodutodetail],
      );
      if (parCheck.rows.length === 0) {
        throw new NotFoundException(
          `Par (idprodutomaster=${idprodutomaster}, idprodutodetail=${idprodutodetail}) nao encontrado em produto_composto`,
        );
      }
      const idprodutocomposto = parCheck.rows[0].idprodutocomposto;

      // 2. Atualizar a quantidade — todos os valores via parâmetros $N (T-40-06)
      await client.query(
        `UPDATE produto_composto SET quantidade = $1 WHERE idprodutomaster = $2 AND idprodutodetail = $3`,
        [dto.quantidade, idprodutomaster, idprodutodetail],
      );

      this.logger.log(
        `atualizarQuantidade idprodutomaster=${idprodutomaster} idprodutodetail=${idprodutodetail} ` +
        `idprodutocomposto=${idprodutocomposto} quantidade=${dto.quantidade}`,
      );

      return { idprodutocomposto };
    } catch (err) {
      this.mapPgWriteError(err); // re-lança HttpException ou mapeia pg -> HTTP; sempre lança
      throw err; // unreachable — satisfaz TypeScript
    } finally {
      client.release();
    }
  }

  /**
   * Remove fisicamente um componente de produto_composto.
   *
   * Fluxo transacional (BEGIN/COMMIT — T-40-08 atomicidade):
   *   1. BEGIN
   *   2. SELECT 1 WHERE (master, detail) — 404 se par inexistente (NotFoundException dentro do BEGIN)
   *   3. DELETE FROM produto_composto WHERE (master, detail) — DELETE FÍSICO (não soft-delete)
   *   4. SELECT count(*)::int AS total FROM produto_composto WHERE idprodutomaster = $1
   *   5. Se total === 0: UPDATE produto SET usaprodutocomposto = false WHERE idproduto = $1 (COMP-05)
   *   6. COMMIT; retorna { removed: true }
   *
   * Em qualquer erro: ROLLBACK protegido + mapPgWriteError.
   * Valores sempre via parâmetros $N (T-40-06).
   */
  async removerComponente(
    idprodutomaster: number,
    idprodutodetail: number,
  ): Promise<{ removed: true }> {
    const client: PoolClient = await this.getPool().connect();
    try {
      await client.query("BEGIN");

      // 2. Verificar existência do par (master, detail) antes do DELETE
      const parCheck = await client.query(
        `SELECT 1 FROM produto_composto WHERE idprodutomaster = $1 AND idprodutodetail = $2 LIMIT 1`,
        [idprodutomaster, idprodutodetail],
      );
      if (parCheck.rows.length === 0) {
        throw new NotFoundException(
          `Par (idprodutomaster=${idprodutomaster}, idprodutodetail=${idprodutodetail}) nao encontrado em produto_composto`,
        );
      }

      // 3. DELETE FÍSICO do par (produto_composto é tabela de composição — não usa soft-delete)
      await client.query(
        `DELETE FROM produto_composto WHERE idprodutomaster = $1 AND idprodutodetail = $2`,
        [idprodutomaster, idprodutodetail],
      );

      // 4. Contar componentes restantes APÓS o DELETE (na mesma transação)
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM produto_composto WHERE idprodutomaster = $1`,
        [idprodutomaster],
      );
      const total = countResult.rows[0]?.total ?? 0;

      // 5. Se nenhum componente restou, desligar flag usaprodutocomposto no master (COMP-05)
      //    Feito SOMENTE quando total === 0 e dentro da mesma transação (T-40-08)
      const flagDesligado = total === 0;
      if (flagDesligado) {
        await client.query(
          `UPDATE produto SET usaprodutocomposto = false WHERE idproduto = $1`,
          [idprodutomaster],
        );
      }

      await client.query("COMMIT");

      this.logger.log(
        `removerComponente idprodutomaster=${idprodutomaster} idprodutodetail=${idprodutodetail} ` +
        `flagDesligado=${flagDesligado}`,
      );

      return { removed: true };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rbErr) {
        this.logger.error(`Erro no ROLLBACK de removerComponente: ${rbErr}`);
      }
      this.mapPgWriteError(err); // sempre lança
      throw err; // unreachable — satisfaz TypeScript
    } finally {
      client.release();
    }
  }
}
