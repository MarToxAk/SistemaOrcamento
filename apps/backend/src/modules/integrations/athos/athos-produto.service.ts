import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CreateProdutoDto } from "./dto/create-produto.dto";
import { UpdateProdutoDto } from "./dto/update-produto.dto";
import { AthosDefaultsService } from "./athos-defaults.service";
import { FISCAL_FIELDS } from "./athos-defaults.util";

@Injectable()
export class AthosProdutoService {
  private readonly logger = new Logger(AthosProdutoService.name);
  private _pool: Pool | null = null;

  constructor(private readonly defaultsService: AthosDefaultsService) {}

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

  private async validarFkExiste(
    client: PoolClient,
    tabela: string,
    coluna: string,
    id: number,
    nomeEntidade: string,
  ): Promise<void> {
    const result = await client.query(
      `SELECT 1 FROM "${tabela}" WHERE "${coluna}" = $1 LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new UnprocessableEntityException(
        `${nomeEntidade} com id ${id} nao encontrado no Athos`,
      );
    }
  }

  async criarProduto(dto: CreateProdutoDto): Promise<{ idproduto: number }> {
    const sistemaUsuarioId = Number(process.env.ATHOS_SISTEMA_USUARIO_ID);
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      // Pre-validacao FK: departamento, grupo, marca (apenas para IDs informados)
      if (dto.iddepartamento !== undefined) {
        await this.validarFkExiste(client, "produto_departamento", "iddepartamento", dto.iddepartamento, "Departamento");
      }
      if (dto.idgrupo !== undefined) {
        await this.validarFkExiste(client, "produto_grupo", "idgrupo", dto.idgrupo, "Grupo");
      }
      if (dto.idmarca !== undefined) {
        await this.validarFkExiste(client, "produto_marca", "idmarca", dto.idmarca, "Marca");
      }

      // === Aplicar defaults (D-03..D-13, OBSV-01) ===
      // Buscar defaults fiscais do motor da Fase 37 (D-08, D-13 — nunca lanca excecao)
      const fiscalDefaults = await this.defaultsService.getDefaults();

      // Defaults operacionais fixos (D-03..D-07) — mapa proprio da Fase 38 (D-10)
      const OPERATIONAL_DEFAULTS: Partial<CreateProdutoDto> = {
        statusproduto: true,
        vendeproduto: true,
        controlaestoque: true,
        baixarestoque: true,
        estoqueloja: "10",
      };

      // Merge: operador prevalece sempre (D-01/D-02) — undefined OU null dispara default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged: any = { ...dto };
      const appliedDefaults: Record<string, unknown> = {};

      // Aplicar defaults operacionais
      for (const [field, defaultVal] of Object.entries(OPERATIONAL_DEFAULTS)) {
        if (merged[field] == null) {
          merged[field] = defaultVal;
          appliedDefaults[field] = defaultVal;
        }
      }

      // Aplicar defaults fiscais — usando FISCAL_FIELDS como fonte unica (D-10)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fiscalDefaultsMap = fiscalDefaults as any;
      for (const field of FISCAL_FIELDS) {
        const defaultVal = fiscalDefaultsMap[field];
        if (defaultVal !== undefined && merged[field] == null) {
          merged[field] = defaultVal;
          appliedDefaults[field] = defaultVal;
        }
      }

      // Construir INSERT dinamicamente com o objeto merged (nao dto original — D-05/Task3)
      // Campos fixos: descricaoproduto ($1), datacadastro (NOW() literal), idusuariocadastro ($2), idusuarioalteracao ($2)
      const columns: string[] = ["descricaoproduto", "datacadastro", "idusuariocadastro", "idusuarioalteracao"];
      const valuePlaceholders: string[] = ["$1", "NOW()", "$2", "$2"];
      const params: unknown[] = [dto.descricaoproduto, sistemaUsuarioId];
      let paramIndex = 3;

      // Allowlist ampliada com os campos de default (T-38-01: sem interpolacao de input)
      const optionalFields: (keyof CreateProdutoDto)[] = [
        "descricaocurta",
        "codigobarra1",
        "codigobarra2",
        "referencia",
        "ncm",
        "informacaoadicional",
        "observacao",
        "idunidade",
        "iddepartamento",
        "idgrupo",
        "idmarca",
        "idfornecedor",
        "valorvenda1",
        "valorvenda2",
        "valorvenda3",
        "valorvenda4",
        "valorvenda5",
        "valorvenda6",
        "valorvendapromocao",
        "valorvendaatacado1",
        "valorcustounitario",
        "descontomaximo",
        "tipoproduto",
        "controlaestoque",
        // Novos campos de default operacional (D-03..D-07)
        "statusproduto",
        "vendeproduto",
        "baixarestoque",
        "estoqueloja",
        // Novos campos fiscais (D-08/D-10 — FISCAL_FIELDS)
        "icms",
        "icmsnfe",
        "tributacao",
        "tributacaonfe",
        "codigocsosn",
        "codigocsosnnfe",
        "origem",
        "origemnfe",
        "tipoitem",
        "piscst",
        "cofinscst",
        "idcfopsaida",
      ];

      // Iterar sobre merged (nao dto) para incluir valores de default aplicados
      for (const field of optionalFields) {
        if (merged[field] !== undefined) {
          columns.push(field);
          valuePlaceholders.push(`$${paramIndex++}`);
          params.push(merged[field]);
        }
      }

      const sql = `INSERT INTO produto (${columns.join(", ")}) VALUES (${valuePlaceholders.join(", ")}) RETURNING idproduto`;
      const result = await client.query<{ idproduto: number }>(sql, params);
      const idproduto = result.rows[0].idproduto;

      this.logger.log(
        `criarProduto descricao="${dto.descricaoproduto}" idproduto=${idproduto} idusuario=${sistemaUsuarioId}`,
      );

      // Log D-12 (OBSV-01): registrar campo->valor de cada default aplicado nesta criacao
      const appliedStr =
        Object.keys(appliedDefaults).length > 0
          ? Object.entries(appliedDefaults)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(", ")
          : "nenhum default necessario";
      this.logger.log(`criarProduto idproduto=${idproduto} defaults aplicados: ${appliedStr}`);

      return { idproduto };
    } catch (err) {
      this.logger.error(`Erro ao criar produto: ${err}`);
      if (
        err instanceof BadRequestException ||
        err instanceof UnprocessableEntityException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      // FK violation: distinguir FK de usuário do sistema vs FK de input do operador
      if ((err as any).code === "23503") {
        const constraint = (err as any).constraint as string | undefined;
        if (
          constraint === "fk_produto_relations_funciona" ||
          constraint === "fk_produto_funcionar_funciona"
        ) {
          throw new InternalServerErrorException(
            "ATHOS_SISTEMA_USUARIO_ID invalido — usuario nao encontrado em funcionario_usuario",
          );
        }
        // FK de input do operador (idfornecedor, idunidade, etc.) ou constraint ausente -> 422
        throw new UnprocessableEntityException(
          `FK invalida: campo ${constraint ?? "desconhecido"} nao encontrado`,
        );
      }
      throw new InternalServerErrorException("Erro ao criar produto no Athos");
    } finally {
      client.release();
    }
  }

  async editarProduto(idproduto: number, dto: UpdateProdutoDto): Promise<{ idproduto: number }> {
    const sistemaUsuarioId = Number(process.env.ATHOS_SISTEMA_USUARIO_ID);
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      // Verificar que o produto existe
      const exists = await client.query(
        "SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1",
        [idproduto],
      );
      if (exists.rows.length === 0) {
        throw new NotFoundException(`Produto ${idproduto} nao encontrado`);
      }

      // Pre-validacao FK: departamento, grupo, marca (apenas para IDs informados)
      if (dto.iddepartamento !== undefined) {
        await this.validarFkExiste(client, "produto_departamento", "iddepartamento", dto.iddepartamento, "Departamento");
      }
      if (dto.idgrupo !== undefined) {
        await this.validarFkExiste(client, "produto_grupo", "idgrupo", dto.idgrupo, "Grupo");
      }
      if (dto.idmarca !== undefined) {
        await this.validarFkExiste(client, "produto_marca", "idmarca", dto.idmarca, "Marca");
      }

      // Construir UPDATE dinamicamente
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      // idusuarioalteracao SEMPRE incluido (Pitfall 2)
      setClauses.push(`idusuarioalteracao = $${paramIndex++}`);
      params.push(sistemaUsuarioId);

      // Allowlist explícita — evita identifier injection mesmo que o ValidationPipe seja contornado
      const ALLOWED_UPDATE_FIELDS = new Set([
        "descricaoproduto", "descricaocurta", "codigobarra1", "codigobarra2", "referencia",
        "ncm", "informacaoadicional", "observacao", "idunidade", "iddepartamento", "idgrupo",
        "idmarca", "idfornecedor", "valorvenda1", "valorvenda2", "valorvenda3", "valorvenda4",
        "valorvenda5", "valorvenda6", "valorvendapromocao", "valorvendaatacado1",
        "valorcustounitario", "descontomaximo", "tipoproduto", "controlaestoque",
      ]);
      for (const [key, value] of Object.entries(dto)) {
        if (value !== undefined && ALLOWED_UPDATE_FIELDS.has(key)) {
          setClauses.push(`"${key}" = $${paramIndex++}`);
          params.push(value);
        }
      }

      if (setClauses.length === 1) {
        // Apenas idusuarioalteracao — nada a atualizar alem da alteracao registrada
        this.logger.log(
          `editarProduto idproduto=${idproduto} campos=[] idusuario=${sistemaUsuarioId} (nenhum campo alterado)`,
        );
      }

      params.push(idproduto);
      await client.query(
        `UPDATE produto SET ${setClauses.join(", ")} WHERE idproduto = $${paramIndex}`,
        params,
      );

      this.logger.log(
        `editarProduto idproduto=${idproduto} campos=[${Object.keys(dto).join(",")}] idusuario=${sistemaUsuarioId}`,
      );

      return { idproduto };
    } catch (err) {
      this.logger.error(`Erro ao editar produto: ${err}`);
      if (
        err instanceof BadRequestException ||
        err instanceof UnprocessableEntityException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      if ((err as any).code === "23503") {
        const constraint = (err as any).constraint as string | undefined;
        if (
          constraint === "fk_produto_relations_funciona" ||
          constraint === "fk_produto_funcionar_funciona"
        ) {
          throw new InternalServerErrorException(
            "ATHOS_SISTEMA_USUARIO_ID invalido — usuario nao encontrado em funcionario_usuario",
          );
        }
        throw new UnprocessableEntityException(
          `FK invalida: campo ${constraint ?? "desconhecido"} nao encontrado`,
        );
      }
      throw new InternalServerErrorException("Erro ao editar produto no Athos");
    } finally {
      client.release();
    }
  }

  async alterarStatusProduto(
    idproduto: number,
    ativo: boolean,
  ): Promise<{ idproduto: number; ativo: boolean }> {
    const sistemaUsuarioId = Number(process.env.ATHOS_SISTEMA_USUARIO_ID);
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const exists = await client.query(
        "SELECT 1 FROM produto WHERE idproduto = $1 LIMIT 1",
        [idproduto],
      );
      if (exists.rows.length === 0) {
        throw new NotFoundException(`Produto ${idproduto} nao encontrado`);
      }

      await client.query(
        "UPDATE produto SET statusproduto = $1, vendeproduto = $1, idusuarioalteracao = $2 WHERE idproduto = $3",
        [ativo, sistemaUsuarioId, idproduto],
      );

      const operacao = ativo ? "reactivate" : "deactivate";
      this.logger.log(`${operacao} idproduto=${idproduto} idusuario=${sistemaUsuarioId}`);

      return { idproduto, ativo };
    } catch (err) {
      this.logger.error(`Erro ao alterar status do produto: ${err}`);
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException("Erro ao alterar status do produto no Athos");
    } finally {
      client.release();
    }
  }
}
