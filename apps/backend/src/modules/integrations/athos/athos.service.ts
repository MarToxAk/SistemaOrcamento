import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { Client, Pool, PoolClient } from "pg";
import {
  buildContaPagarInsertParts,
  buildContaPagarUpdateParts,
  mapContaPagarRow,
  resolveContaPagarIdColumn,
} from "./athos-conta-pagar.util";
import { buildContaPagarAnexoPaths, hasSmbMountPath } from "./athos-anexo.util";
import { getSmbDebugInfo, isSmbEnabled, smbUnlinkContaPagarFile, smbWriteContaPagarFile } from "./athos-smb.util";
import { CreateContaPagarDto } from "./dto/create-conta-pagar.dto";
import { UpdateContaPagarDto } from "./dto/update-conta-pagar.dto";

type Row = Record<string, unknown>;
type AthosAttachmentFile = { originalname: string; buffer: Buffer; mimetype: string; size: number };

const DEFAULT_ATHOS_ANEXO_IDCLIENTEHISTORICO = 0;

function isSafeIdentifier(value: string) {
  return /^[a-z_][a-z0-9_]*$/i.test(value);
}

async function getTableColumns(client: Pick<Client, "query">, tableName: string) {
  const result = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName],
  );

  return result.rows.map((row: any) => String(row.column_name).toLowerCase());
}

async function findExistingTable(client: Pick<Client, "query">, tableCandidates: string[]) {
  for (const tableName of tableCandidates) {
    const columns = await getTableColumns(client, tableName);
    if (columns.length > 0) {
      return { tableName, columns: new Set(columns) };
    }
  }

  return null;
}

async function allocateNextContaPagarId(client: PoolClient, tableName: string, idColumn: string) {
  await client.query(`LOCK TABLE "${tableName}" IN EXCLUSIVE MODE`);
  const result = await client.query<{ next_id: number }>(
    `SELECT COALESCE(MAX(CAST("${idColumn}" AS INTEGER)), 0) + 1 AS next_id FROM "${tableName}"`,
  );

  return Number(result.rows[0]?.next_id ?? 1);
}

function pickString(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function pickNumber(row: Row, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : fallback;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return fallback;
}

function pickDateISO(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function pickDateTimeISO(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }
  return null;
}

function pickIntFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return null;
}

function pickNumberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function pickBooleanFromUnknown(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "t", "sim", "s", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "f", "nao", "n", "no"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

type LivroRegistroOption = {
  idlivroregistro: number;
  idcontacorrente: number | null;
  descricao: string;
  acesso: string;
  conciliacaobancaria: boolean | null;
};

async function loadLivroRegistroOptions(client: Pick<Client, "query">, filterIdContaCorrente?: number) {
  const livroRegistroTable = await findExistingTable(client, ["livro_registro", "livroregistro"]);

  if (!livroRegistroTable || !isSafeIdentifier(livroRegistroTable.tableName)) {
    return [] as LivroRegistroOption[];
  }

  const idLivroRegistroColumn = ["idlivroregistro", "id_livro_registro", "id"].find(
    (column) => livroRegistroTable.columns.has(column) && isSafeIdentifier(column),
  );
  const idContaCorrenteColumn = ["idcontacorrente", "id_conta_corrente"].find(
    (column) => livroRegistroTable.columns.has(column) && isSafeIdentifier(column),
  );
  const descricaoColumn = ["descricao", "descricao_livro"].find(
    (column) => livroRegistroTable.columns.has(column) && isSafeIdentifier(column),
  );
  const acessoColumn = ["acesso"].find((column) => livroRegistroTable.columns.has(column) && isSafeIdentifier(column));
  const conciliacaoColumn = ["conciliacaobancaria", "conciliacao_bancaria"].find(
    (column) => livroRegistroTable.columns.has(column) && isSafeIdentifier(column),
  );

  if (!idLivroRegistroColumn) {
    return [] as LivroRegistroOption[];
  }

  const selectedColumns = [
    `CAST("${idLivroRegistroColumn}" AS INTEGER) AS "idlivroregistro"`,
    idContaCorrenteColumn
      ? `CAST("${idContaCorrenteColumn}" AS INTEGER) AS "idcontacorrente"`
      : `NULL::INTEGER AS "idcontacorrente"`,
    descricaoColumn ? `COALESCE(CAST("${descricaoColumn}" AS TEXT), '') AS "descricao"` : `'' AS "descricao"`,
    acessoColumn ? `COALESCE(CAST("${acessoColumn}" AS TEXT), '') AS "acesso"` : `'' AS "acesso"`,
    conciliacaoColumn
      ? `CAST("${conciliacaoColumn}" AS BOOLEAN) AS "conciliacaobancaria"`
      : `NULL::BOOLEAN AS "conciliacaobancaria"`,
  ];

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (Number.isInteger(filterIdContaCorrente) && Number(filterIdContaCorrente) > 0 && idContaCorrenteColumn) {
    params.push(Number(filterIdContaCorrente));
    conditions.push(`CAST("${idContaCorrenteColumn}" AS INTEGER) = $${params.length}`);
  }

  if (conciliacaoColumn) {
    conditions.push(`("${conciliacaoColumn}" IS NULL OR "${conciliacaoColumn}" = true)`);
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const query = `
    SELECT ${selectedColumns.join(", ")}
    FROM "${livroRegistroTable.tableName}"${whereClause}
    ORDER BY "idlivroregistro" ASC
  `;

  const result = await client.query<Row>(query, params);

  return (result.rows as Row[])
    .map((row) => {
      const idlivroregistro = pickIntFromUnknown(row.idlivroregistro);
      if (!idlivroregistro || idlivroregistro <= 0) {
        return null;
      }

      return {
        idlivroregistro,
        idcontacorrente: pickIntFromUnknown(row.idcontacorrente),
        descricao: String(row.descricao ?? "").trim(),
        acesso: String(row.acesso ?? "").trim(),
        conciliacaobancaria: pickBooleanFromUnknown(row.conciliacaobancaria),
      } as LivroRegistroOption;
    })
    .filter((item): item is LivroRegistroOption => item !== null);
}

async function resolveLivroRegistroIdForLiquidacao(
  client: Pick<Client, "query">,
  dto: UpdateContaPagarDto,
  contaAtualizada: Record<string, unknown>,
) {
  const requestedLivroRegistroId = pickIntFromUnknown((dto as Record<string, unknown>).idlivroregistro);
  const origemPagamentoIds = [
    pickIntFromUnknown((dto as Record<string, unknown>).idorigempagamento),
    pickIntFromUnknown(contaAtualizada.idorigempagamento),
  ].filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0);

  if (requestedLivroRegistroId && requestedLivroRegistroId > 0) {
    const todosLivros = await loadLivroRegistroOptions(client);
    const escolhido = todosLivros.find((item) => item.idlivroregistro === requestedLivroRegistroId);
    if (!escolhido) {
      throw new BadRequestException(`idlivroregistro ${requestedLivroRegistroId} nao encontrado no Athos`);
    }
    return escolhido.idlivroregistro;
  }

  for (const origemPagamentoId of origemPagamentoIds) {
    const livrosDaConta = await loadLivroRegistroOptions(client, origemPagamentoId);
    if (livrosDaConta.length === 1) {
      return livrosDaConta[0].idlivroregistro;
    }
    if (livrosDaConta.length > 1) {
      throw new BadRequestException(
        `Multiplos bancos encontrados para a conta ${origemPagamentoId}. Informe idlivroregistro ao liquidar o pagamento.`,
      );
    }
  }

  const livrosDisponiveis = await loadLivroRegistroOptions(client);
  if (livrosDisponiveis.length === 0) {
    throw new NotFoundException("Tabela livro_registro nao encontrada ou sem registros para liquidacao");
  }

  if (livrosDisponiveis.length > 1) {
    throw new BadRequestException("Existe mais de um banco no Athos. Informe idlivroregistro ao liquidar o pagamento.");
  }

  return livrosDisponiveis[0].idlivroregistro;
}

function parseDateFilter(value: string, fieldName: string, endOfDay = false) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`Parametro ${fieldName} invalido: valor vazio`);
  }

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  const normalized = dateOnlyPattern.test(trimmed)
    ? `${trimmed}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`
    : trimmed;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Parametro ${fieldName} invalido: use formato de data valido (ex: YYYY-MM-DD)`);
  }

  return parsed;
}

async function loadItems(client: Pick<Client, "query">, idOrcamento: string) {
  const candidates = ["orcamento_item", "orcamentoitem"];

  for (const tableName of candidates) {
    const columnsResult = await client.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      `,
      [tableName],
    );

    if (columnsResult.rows.length === 0) {
      continue;
    }

    const columns = new Set(columnsResult.rows.map((r: any) => String(r.column_name).toLowerCase()));
    const quoteIdColumn = ["idorcamento", "orcamentoid", "id_orcamento"].find((name) => columns.has(name));
    if (!quoteIdColumn) {
      continue;
    }

    const orderColumns = ["sequenciaitem", "sequencia", "ordem", "idorcamentoitem", "iditem", "id"]
      .filter((name) => columns.has(name))
      .map((name) => `COALESCE("${name}", 0)`);
    const orderBy = orderColumns.length > 0 ? ` ORDER BY ${orderColumns.join(", ")}` : "";

    const itemsResult = await client.query(
      `
      SELECT *
      FROM "${tableName}"
      WHERE CAST("${quoteIdColumn}" AS TEXT) = $1${orderBy}
      `,
      [idOrcamento],
    );

    const rows = itemsResult.rows as Row[];

    const productTable = await findExistingTable(client, ["produto", "produtos"]);
    const productIdOnItem = ["idproduto", "produtoid", "id_produto"].find((name) => columns.has(name));
    const productIdOnProduct = productTable
      ? ["idproduto", "produtoid", "id_produto", "id"].find((name) => productTable.columns.has(name))
      : undefined;

    let productsById = new Map<string, Row>();

    if (productTable && productIdOnItem && productIdOnProduct && isSafeIdentifier(productTable.tableName)) {
      const productIds = rows
        .map((row) => row[productIdOnItem])
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value));

      if (productIds.length > 0 && isSafeIdentifier(productIdOnProduct)) {
        const productsResult = await client.query(
          `
          SELECT *
          FROM "${productTable.tableName}"
          WHERE CAST("${productIdOnProduct}" AS TEXT) = ANY($1::text[])
          `,
          [Array.from(new Set(productIds))],
        );

        productsById = new Map((productsResult.rows as Row[]).map((row) => [String(row[productIdOnProduct]), row]));
      }
    }

    return rows.map((row: Row) => {
      const produto = productIdOnItem ? productsById.get(String(row[productIdOnItem])) : undefined;
      const quantidade = pickNumber(row, ["quantidadeitem", "quantidade", "qtd"], 0);
      const valor = pickNumber(row, ["valoritem", "valor", "valorunitario", "vlrunitario"], 0);
      const desconto = pickNumber(row, ["valordesconto", "desconto", "vlrdesconto"], 0);
      const total = pickNumber(row, ["orcamentovalorfinalitem", "valortotal", "total"], quantidade * valor - desconto);

      return {
        descricao:
          pickString(produto ?? {}, ["descricaoproduto", "descricao", "descricaocurta", "nomeproduto", "produto"]) ||
          pickString(row, ["descricaoproduto", "descricao", "descricaocurta", "nomeproduto", "produto"]),
        quantidade,
        valor,
        desconto,
        total,
        produto: produto ?? null,
        itemRaw: row,
      };
    });
  }

  return [];
}

async function loadFuncionario(client: Pick<Client, "query">, quote: Row) {
  const funcionarioId = [quote.idvendedor, quote.idfuncionariousuario, quote.idusuario].find(
    (value) => value !== null && value !== undefined,
  );

  if (funcionarioId === undefined) {
    return null;
  }

  const funcionarioTable = await findExistingTable(client, [
    "funcionario",
    "funcionariousuario",
    "funcionario_usuario",
    "usuario",
    "vendedor",
  ]);

  if (!funcionarioTable || !isSafeIdentifier(funcionarioTable.tableName)) {
    return null;
  }

  const funcionarioIdColumn = ["idfuncionario", "idfuncionariousuario", "idusuario", "idvendedor", "id"].find((name) =>
    funcionarioTable.columns.has(name),
  );

  if (!funcionarioIdColumn || !isSafeIdentifier(funcionarioIdColumn)) {
    return null;
  }

  const result = await client.query(
    `
    SELECT *
    FROM "${funcionarioTable.tableName}"
    WHERE CAST("${funcionarioIdColumn}" AS TEXT) = $1
    LIMIT 1
    `,
    [String(funcionarioId)],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Row;
}

async function loadCarimbos(client: Pick<Client, "query">, idOrcamento: string) {
  const carimboTable = await findExistingTable(client, [
    "orcamento_carimbo",
    "orcamentocarimbo",
    "carimbo_orcamento",
    "orcamento_item_carimbo",
  ]);

  if (!carimboTable || !isSafeIdentifier(carimboTable.tableName)) {
    return [];
  }

  const quoteIdColumn = ["idorcamento", "orcamentoid", "id_orcamento"].find((name) => carimboTable.columns.has(name));
  if (!quoteIdColumn || !isSafeIdentifier(quoteIdColumn)) {
    return [];
  }

  const orderColumns = ["numero", "idcarimbo", "id", "sequencia"].filter((name) => carimboTable.columns.has(name)).map(
    (name) => `COALESCE(${name}, 0)`,
  );
  const orderBy = orderColumns.length > 0 ? ` ORDER BY ${orderColumns.join(", ")}` : "";

  const result = await client.query(
    `
    SELECT *
    FROM "${carimboTable.tableName}"
    WHERE CAST("${quoteIdColumn}" AS TEXT) = $1${orderBy}
    `,
    [idOrcamento],
  );

  return (result.rows as Row[]).map((row) => ({
    numero: pickNumber(row, ["numero", "nro", "ordem"], 0),
    carimbo: pickString(row, ["carimbo", "tipo", "tipocarimbo", "nome"]),
    dimensoes: pickString(row, ["dimensoes", "dimensao", "medidas"]),
    descricao: pickString(row, ["descricao", "observacao", "obs"]),
    carimboRaw: row,
  }));
}

@Injectable()
export class AthosService {
  private readonly logger = new Logger(AthosService.name);

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

  async testarConexao() {
    const { host, database, user, password, port } = this.getDbConfig();
    const client = new Client({ host, database, user, password, port, connectionTimeoutMillis: 5000 });

    try {
      await client.query("SELECT 1");
      return { ok: true, host, port, database, user, message: "Conexao com Athos estabelecida com sucesso." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido";
      this.logger.error(`Falha na conexao Athos (${host}:${port}/${database}): ${message}`);
      throw new InternalServerErrorException(`Falha na conexao Athos: ${message}`);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async buscarOrcamentoPorNumero(numero: string) {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();

    try {

      const columnsResult = await client.query(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orcamento'
        `,
      );

      const available = new Set(columnsResult.rows.map((row: any) => String(row.column_name).toLowerCase()));
      const identifierColumn = ["numero", "idorcamento", "codorcamento", "orcamento", "codigo"].find((name) =>
        available.has(name),
      );

      if (!identifierColumn) {
        throw new InternalServerErrorException(
          "Tabela orcamento sem coluna identificadora conhecida (numero/idorcamento/codorcamento).",
        );
      }
      this.logger.log(`[Athos] buscarOrcamentoPorNumero: numero="${numero}" identifierColumn="${identifierColumn}"`);

      const query = `
        SELECT *
        FROM "orcamento"
        WHERE CAST("${identifierColumn}" AS TEXT) = $1
        ORDER BY "${identifierColumn}" DESC
        LIMIT 1
      `;

      const result = await client.query(query, [numero]);

      if (result.rows.length === 0) {
        throw new NotFoundException("Orcamento nao encontrado no Athos");
      }

      const quote = result.rows[0] as Row;
      const idOrcamento = String(quote.idorcamento ?? quote.numero ?? numero);
      const itens = await loadItems(client, idOrcamento);
      const funcionario = await loadFuncionario(client, quote);
      const carimbos = await loadCarimbos(client, idOrcamento);

      const mapped = {
        numero: String(quote.numero ?? quote.idorcamento ?? numero),
        data: pickDateISO(quote, ["dataorcamento", "data", "createdat", "created_at"]),
        idcliente: pickNumber(quote, ["idcliente", "clienteid", "codcliente", "cliente_id"]) || undefined,
        cliente: pickString(quote, ["cliente", "nomecliente", "razaosocial", "nome"]),
        telefone: pickString(quote, ["telefone", "fone", "celular", "whatsapp"]),
        email: pickString(quote, ["email", "clienteemail"]),
        vendedor: pickString(quote, ["vendedor", "nomevendedor", "funcionario", "usuario"]),
        validade: pickString(quote, ["validade", "diasvalidade", "validadeproposta"]),
        prazoEntrega: pickDateISO(quote, ["prazoentrega", "dataentrega", "entrega"]),
        condPagamento: pickString(quote, ["condicaopagamento", "condpagamento", "pagamento"]),
        observacoes: pickString(quote, ["observacoes", "obs", "observacao"]),
        itens: itens.map((item) => ({
          descricao: item.descricao,
          quantidade: item.quantidade,
          valor: item.valor,
          desconto: item.desconto,
          total: item.total,
        })),
        itensDetalhados: itens,
        carimbos: carimbos.map((item) => ({
          numero: item.numero,
          carimbo: item.carimbo,
          dimensoes: item.dimensoes,
          descricao: item.descricao,
        })),
        carimbosDetalhados: carimbos,
        funcionario,
        athosRaw: quote,
      };

      return { rawRows: result.rows, mapped };
    } catch (error) {
      this.logger.error(`Erro ao buscar orçamento no Athos: ${error}`);
      if (error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException("Erro ao buscar orcamento no Athos");
    } finally {
      client.release();
    }
  }

  async listarContasPagar(dataInicio?: string, dataFinal?: string, statusconta?: string) {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();

    try {

      const candidates = [
        "conta_pagar",
        "contaspagar",
        "contas_pagar",
        "contaspagar",
        "conta_pagar_fornecedor",
        "conta_pagar_receber",
        "contasapagar",
        "contas_a_pagar",
      ];

      const table = await findExistingTable(client, candidates);

      if (!table || !isSafeIdentifier(table.tableName)) {
        throw new NotFoundException("Tabela de contas a pagar nao encontrada no Athos");
      }

      const dateCandidates = [
        "datavencimento",
        "data_vencimento",
        "vencimento",
        "dtvenc",
        "dt_vencimento",
        "dataemissao",
        "data_emissao",
        "data",
        "datalancamento",
        "datalanc",
        "dt_emissao",
      ];

      const dateColumn = dateCandidates.find((c) => table.columns.has(c) && isSafeIdentifier(c));

      if (!dateColumn) {
        throw new InternalServerErrorException("Nao foi possivel identificar coluna de data de vencimento para filtrar");
      }

      let start: Date | null = null;
      let end: Date | null = null;

      if (typeof dataInicio === "string" && dataInicio.trim()) {
        start = parseDateFilter(dataInicio, "dataInicio", false);
      }

      if (typeof dataFinal === "string" && dataFinal.trim()) {
        end = parseDateFilter(dataFinal, "dataFinal", true);
      }

      if (!start && !end) {
        const now = new Date();
        start = new Date(now);
        start.setDate(now.getDate() - 30);
        end = new Date(now);
        end.setDate(now.getDate() + 30);
      }

      if (start && end && start.getTime() > end.getTime()) {
        throw new BadRequestException("Parametro dataInicio nao pode ser maior que dataFinal");
      }

      const conditions = [`${dateColumn} IS NOT NULL`];
      const params: string[] = [];

      if (start) {
        params.push(start.toISOString());
        conditions.push(`CAST(${dateColumn} AS timestamp) >= $${params.length}`);
      }

      if (end) {
        params.push(end.toISOString());
        conditions.push(`CAST(${dateColumn} AS timestamp) <= $${params.length}`);
      }

      if (typeof statusconta === "string" && statusconta.trim()) {
        params.push(statusconta.trim().toUpperCase());
        conditions.push(`statusconta = $${params.length}`);
      }

      const query = `SELECT * FROM "${table.tableName}" WHERE ${conditions.join(" AND ")} ORDER BY CAST("${dateColumn}" AS timestamp) DESC`;

      const result = await client.query(query, params);

      return (result.rows as Row[]).map((row) => mapContaPagarRow(row));
    } catch (error) {
      this.logger.error(`Erro ao listar contas a pagar no Athos: ${error}`);
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException("Erro ao listar contas a pagar no Athos");
    } finally {
      client.release();
    }
  }

  async listarLivrosRegistro(idContaCorrente?: number): Promise<LivroRegistroOption[]> {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();

    try {
      const normalizedIdContaCorrente =
        typeof idContaCorrente === "number" && Number.isInteger(idContaCorrente) && idContaCorrente > 0
          ? idContaCorrente
          : undefined;

      const livros = await loadLivroRegistroOptions(client, normalizedIdContaCorrente);
      if (livros.length === 0) {
        throw new NotFoundException("Nenhum banco encontrado em livro_registro no Athos");
      }

      return livros;
    } catch (error) {
      this.logger.error(`Erro ao listar livro_registro no Athos: ${error}`);
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException("Erro ao listar livro_registro no Athos");
    } finally {
      client.release();
    }
  }

  async verificarPagamentoPorOrcamento(
    orcamentoId: string,
    vendaId?: number | string | null,
  ): Promise<{ paid: boolean; idVenda: number | string | null; valor: number }> {
    this.logger.log(`Verificando pagamento para orcamento ${orcamentoId} vendaId=${vendaId ?? "n/a"}`);

    const pool = this.getPool();
    let client: PoolClient | null = null;

    try {
      client = await pool.connect();

      const VENDA_TABLES = ["venda", "vendas", "orcamento_venda", "movimento_venda"];
      const FIN_TABLES = ["financeiro", "conta_receber", "contasreceber", "parcela_receber", "receber"];
      const SITUACAO_COLS = ["situacaovenda", "situacao", "statuspagamento", "status", "statussituacao"];
      const PAGO_KEYWORDS = ["PAGO", "QUITADO", "RECEBIDO", "LIQUIDADO", "FINALIZADO"];
      const VENDA_ID_COLS = ["idvenda", "vendaid", "id_venda", "id"];
      const ORC_ID_COLS = ["idorcamento", "orcamentoid", "id_orcamento", "codorcamento"];

      const vendaTable = await findExistingTable(client, VENDA_TABLES);
      if (!vendaTable || !isSafeIdentifier(vendaTable.tableName)) {
        this.logger.warn(`Tabela de venda nao encontrada no Athos para orcamento ${orcamentoId}`);
        return { paid: false, idVenda: vendaId ?? null, valor: 0 };
      }

      let vendaRow: Row | null = null;

      // Busca direta por vendaId quando fornecido
      if (vendaId != null && Number.isFinite(Number(vendaId))) {
        const vendaIdCol = VENDA_ID_COLS.find((c) => vendaTable.columns.has(c) && isSafeIdentifier(c));
        if (vendaIdCol) {
          const res = await client.query(
            `SELECT * FROM "${vendaTable.tableName}" WHERE CAST("${vendaIdCol}" AS TEXT) = $1 LIMIT 1`,
            [String(vendaId)],
          );
          if (res.rows.length > 0) {
            vendaRow = res.rows[0] as Row;
          }
        }
      }

      // Fallback: busca por orcamentoId
      if (!vendaRow) {
        const orcCol = ORC_ID_COLS.find((c) => vendaTable.columns.has(c) && isSafeIdentifier(c));
        if (!orcCol) {
          this.logger.warn(`Tabela ${vendaTable.tableName} sem coluna de ligacao ao orcamento`);
          return { paid: false, idVenda: vendaId ?? null, valor: 0 };
        }
        const res = await client.query(
          `SELECT * FROM "${vendaTable.tableName}" WHERE CAST("${orcCol}" AS TEXT) = $1 ORDER BY CTID DESC LIMIT 1`,
          [orcamentoId],
        );
        if (res.rows.length > 0) {
          vendaRow = res.rows[0] as Row;
        }
      }

      if (!vendaRow) {
        this.logger.log(`Nenhuma venda encontrada para orcamento ${orcamentoId}`);
        return { paid: false, idVenda: vendaId ?? null, valor: 0 };
      }

      // Extrair idVenda da row
      const resolvedIdVenda =
        (() => {
          for (const col of VENDA_ID_COLS) {
            const v = vendaRow![col];
            if (v != null) return typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : String(v);
          }
          return null;
        })() ?? vendaId ?? null;

      // Verificar situacao
      const situacaoCol = SITUACAO_COLS.find((c) => vendaRow![c] != null);
      const situacaoRaw = situacaoCol ? String(vendaRow![situacaoCol] ?? "").toUpperCase() : "";
      const paid = PAGO_KEYWORDS.some((kw) => situacaoRaw.includes(kw));

      this.logger.log(
        `Venda ${resolvedIdVenda} — situacao="${situacaoRaw}" paid=${paid} orcamento=${orcamentoId}`,
      );

      // Tentar buscar valor pago na tabela financeira
      let valor = 0;
      if (resolvedIdVenda != null) {
        try {
          const finTable = await findExistingTable(client, FIN_TABLES);
          if (finTable && isSafeIdentifier(finTable.tableName)) {
            const finVendaCol = VENDA_ID_COLS.find((c) => finTable.columns.has(c) && isSafeIdentifier(c));
            if (finVendaCol) {
              const finRes = await client.query(
                `SELECT * FROM "${finTable.tableName}" WHERE CAST("${finVendaCol}" AS TEXT) = $1`,
                [String(resolvedIdVenda)],
              );
              valor = (finRes.rows as Row[]).reduce(
                (acc, r) => acc + pickNumber(r, ["valorpago", "valor_pago", "valorquitado", "totalrecebido"], 0),
                0,
              );
            }
          }
        } catch (finErr) {
          this.logger.warn(`Falha ao buscar valor financeiro para venda ${resolvedIdVenda}: ${finErr}`);
        }
      }

      // Fallback: valor da venda
      if (valor === 0) {
        valor = pickNumber(vendaRow, ["valortotal", "valor", "totalvenda", "valorvenda"], 0);
      }

      return { paid, idVenda: resolvedIdVenda, valor };
    } catch (err) {
      this.logger.warn(
        `Falha ao verificar pagamento Athos para orcamento ${orcamentoId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { paid: false, idVenda: vendaId ?? null, valor: 0 };
    } finally {
      client?.release();
    }
  }

  async buscarClientePorId(clienteId: string | number): Promise<{
    id: string;
    name: string;
    type: "juridico" | "fisico";
    documento: string | null;
    endereco?: { logradouro: string; numero: string; bairro: string; cep: string; codigoMunicipio: string; uf: string } | null;
  } | null> {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {

      // Busca endereço na tabela cliente_endereco (isolado para não quebrar o restante)
      // Colunas reais: logradouro, numero, bairro, cep, codigocidade, uf, tipologradouro
      let enderecoData: { logradouro: string; numero: string; bairro: string; cep: string; codigoMunicipio: string; uf: string } | null = null;
      try {
        const enderecoResult = await client.query(
          `SELECT tipologradouro, logradouro, numero, bairro, cep, codigocidade, uf
           FROM cliente_endereco WHERE idcliente = $1 ORDER BY idenderecocliente LIMIT 1`,
          [clienteId],
        );
        const enderecoRow = enderecoResult.rows[0] as Row | undefined;
        if (enderecoRow && pickString(enderecoRow, ["logradouro"])) {
          const tipo      = pickString(enderecoRow, ["tipologradouro"]);
          const logradouro = pickString(enderecoRow, ["logradouro"]);
          enderecoData = {
            logradouro:      tipo ? `${tipo} ${logradouro}` : logradouro,
            numero:          pickString(enderecoRow, ["numero"]) || "S/N",
            bairro:          pickString(enderecoRow, ["bairro"]) || "Centro",
            cep:             pickString(enderecoRow, ["cep"]).replace(/\D/g, ""),
            codigoMunicipio: pickString(enderecoRow, ["codigocidade"]) || "3520400",
            uf:              pickString(enderecoRow, ["uf"]) || "SP",
          };
        }
      } catch (err) {
        this.logger.warn(`cliente_endereco não encontrado para cliente ${clienteId}: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Pessoa jurídica: nome + CNPJ
      const juridicoResult = await client.query(
        `SELECT nomefantasia, razaosocial, cnpj FROM cliente_juridico WHERE idcliente = $1 LIMIT 1`,
        [clienteId],
      );
      if (juridicoResult.rows.length > 0) {
        const row = juridicoResult.rows[0] as Row;
        const name = pickString(row, ["nomefantasia", "razaosocial"]);
        const documento = pickString(row, ["cnpj"]).replace(/\D/g, "") || null;
        if (name) return { id: String(clienteId), name, type: "juridico", documento, endereco: enderecoData };
      }

      // Pessoa física: nome + CPF
      const fisicoResult = await client.query(
        `SELECT nome, cpf FROM cliente_fisico WHERE idcliente = $1 LIMIT 1`,
        [clienteId],
      );
      if (fisicoResult.rows.length > 0) {
        const row = fisicoResult.rows[0] as Row;
        const name = pickString(row, ["nome", "nomecliente"]);
        const documento = pickString(row, ["cpf"]).replace(/\D/g, "") || null;
        if (name) return { id: String(clienteId), name, type: "fisico", documento, endereco: enderecoData };
      }

      return null;
    } catch (err) {
      this.logger.warn(`Falha ao buscar cliente ${clienteId} no Athos: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      client.release();
    }
  }

  async buscarDadosClienteContasReceber(idcliente: number): Promise<{
    idcliente: number;
    nome_cliente: string;
    telefone_completo: string | null;
    emailcliente: string | null;
    emailcobrancacliente: string | null;
    limitecredito: number;
    bloqueaprazo: string | null;
  } | null> {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query(
        `SELECT c.idcliente,
          COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente #' || c.idcliente::text) AS nome_cliente,
          c.dddtelefoneempresa || c.telefoneempresa AS telefone_completo,
          c.emailcliente, c.emailcobrancacliente, c.limitecredito, c.bloqueaprazo
        FROM cliente c
        LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
        LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
        WHERE c.idcliente = $1`,
        [idcliente],
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0] as Row;
      return {
        idcliente: Number(row["idcliente"]),
        nome_cliente: pickString(row, ["nome_cliente"]) || `Cliente #${idcliente}`,
        telefone_completo: pickString(row, ["telefone_completo"]) || null,
        emailcliente: pickString(row, ["emailcliente"]) || null,
        emailcobrancacliente: pickString(row, ["emailcobrancacliente"]) || null,
        limitecredito: Number(row["limitecredito"]) || 0,
        bloqueaprazo: pickString(row, ["bloqueaprazo"]) || null,
      };
    } catch (err) {
      this.logger.warn(`Falha ao buscar dados cadastrais do cliente ${idcliente} no Athos: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      client.release();
    }
  }

  async buscarRelacaoOrcamentoVenda(idorcamento: number): Promise<{ idvenda: number | null }> {
    this.logger.log(`buscarRelacaoOrcamentoVenda: idorcamento=${idorcamento}`);
    const pool = this.getPool();
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      const result = await client.query(
        'SELECT idvenda FROM relacao_orcamento_venda WHERE idorcamento = $1 ORDER BY idrelataocaorcamentovenda DESC LIMIT 1',
        [idorcamento],
      );
      if (result.rows.length === 0) {
        this.logger.log(`buscarRelacaoOrcamentoVenda: nenhuma venda encontrada para idorcamento=${idorcamento}`);
        return { idvenda: null };
      }
      const raw = result.rows[0].idvenda;
      const idvenda = typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : Number.isFinite(Number(raw)) ? Number(raw) : null;
      this.logger.log(`buscarRelacaoOrcamentoVenda: idorcamento=${idorcamento} -> idvenda=${idvenda}`);
      return { idvenda };
    } catch (error) {
      this.logger.warn(
        `buscarRelacaoOrcamentoVenda: erro para idorcamento=${idorcamento}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { idvenda: null };
    } finally {
      client?.release();
    }
  }

  async buscarClientes(params: {
    nome?: string;
    documento?: string;
    idcliente?: number | string;
    page?: number;
    take?: number;
  }): Promise<{
    total: number;
    page: number;
    take: number;
    items: Array<{
      idcliente: number;
      tipoPessoa: "fisico" | "juridico";
      nome: string;
      documento: string | null;
      endereco: {
        logradouro: string;
        numero: string;
        bairro: string;
        cep: string;
        codigoMunicipio: string;
        uf: string;
      } | null;
    }>;
  }> {
    const take = Math.min(Math.max(1, Number(params.take ?? 20) || 20), 50);
    const page = Math.max(1, Number(params.page ?? 1) || 1);
    const offset = (page - 1) * take;

    const nomeFilter = params.nome?.trim();
    const documentoFilter = params.documento?.replace(/\D/g, "") || undefined;
    const idclienteFilter = params.idcliente != null ? Number(params.idcliente) : undefined;

    const hasFiltro =
      (nomeFilter && nomeFilter.length >= 3) ||
      (documentoFilter && documentoFilter.length > 0) ||
      (idclienteFilter != null && Number.isFinite(idclienteFilter) && idclienteFilter > 0);

    if (!hasFiltro) {
      throw new BadRequestException(
        "Informe ao menos um filtro: nome (min 3 caracteres), documento (CPF/CNPJ) ou idcliente.",
      );
    }

    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const conditions: string[] = [];
      const qParams: (string | number)[] = [];
      let idx = 1;

      if (idclienteFilter != null && Number.isFinite(idclienteFilter) && idclienteFilter > 0) {
        conditions.push(`c.idcliente = $${idx++}`);
        qParams.push(idclienteFilter);
      } else {
        if (documentoFilter) {
          conditions.push(
            `(REGEXP_REPLACE(COALESCE(cf.cpf, ''), '[^0-9]', '', 'g') = $${idx} OR REGEXP_REPLACE(COALESCE(cj.cnpj, ''), '[^0-9]', '', 'g') = $${idx})`,
          );
          qParams.push(documentoFilter);
          idx++;
        }
        if (nomeFilter && nomeFilter.length >= 3) {
          conditions.push(
            `(cf.nome ILIKE $${idx} OR cj.nomefantasia ILIKE $${idx} OR cj.razaosocial ILIKE $${idx})`,
          );
          qParams.push(`%${nomeFilter}%`);
          idx++;
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const baseJoins = `
        FROM cliente c
        LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
        LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
        LEFT JOIN (
          SELECT DISTINCT ON (idcliente)
            idcliente, tipologradouro, logradouro, numero, bairro, cep, codigocidade, uf
          FROM cliente_endereco
          ORDER BY idcliente, idenderecocliente
        ) ce ON ce.idcliente = c.idcliente
        ${whereClause}
      `;

      const countResult = await client.query(`SELECT COUNT(*) AS total ${baseJoins}`, qParams);
      const total = Number(countResult.rows[0]?.total ?? 0);

      const dataResult = await client.query(
        `SELECT
          c.idcliente,
          cf.nome AS nome_fisico,
          cj.nomefantasia,
          cj.razaosocial,
          cf.cpf,
          cj.cnpj,
          ce.tipologradouro,
          ce.logradouro,
          ce.numero AS end_numero,
          ce.bairro,
          ce.cep,
          ce.codigocidade,
          ce.uf
        ${baseJoins}
        ORDER BY c.idcliente
        LIMIT $${idx} OFFSET $${idx + 1}`,
        [...qParams, take, offset],
      );

      const items = (dataResult.rows as Row[]).map((row) => {
        const isFisico = !!pickString(row, ["nome_fisico"]);
        const nome = isFisico
          ? pickString(row, ["nome_fisico"])
          : pickString(row, ["nomefantasia", "razaosocial"]);
        const documento = isFisico
          ? pickString(row, ["cpf"]).replace(/\D/g, "") || null
          : pickString(row, ["cnpj"]).replace(/\D/g, "") || null;

        let endereco: {
          logradouro: string;
          numero: string;
          bairro: string;
          cep: string;
          codigoMunicipio: string;
          uf: string;
        } | null = null;
        const logradouro = pickString(row, ["logradouro"]);
        if (logradouro) {
          const tipo = pickString(row, ["tipologradouro"]);
          endereco = {
            logradouro: tipo ? `${tipo} ${logradouro}` : logradouro,
            numero: pickString(row, ["end_numero"]) || "S/N",
            bairro: pickString(row, ["bairro"]) || "Centro",
            cep: pickString(row, ["cep"]).replace(/\D/g, ""),
            codigoMunicipio: pickString(row, ["codigocidade"]) || "3520400",
            uf: pickString(row, ["uf"]) || "SP",
          };
        }

        return {
          idcliente: Number(row["idcliente"]),
          tipoPessoa: (isFisico ? "fisico" : "juridico") as "fisico" | "juridico",
          nome,
          documento,
          endereco,
        };
      });

      this.logger.log(
        `[Athos-busca] nome="${nomeFilter ?? ""}" doc="${documentoFilter ?? ""}" idcliente=${idclienteFilter ?? ""} → ${total} resultado(s) page=${page} take=${take}`,
      );
      return { total, page, take, items };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(
        `Falha ao buscar clientes no Athos: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new InternalServerErrorException("Erro ao buscar clientes no Athos. Tente novamente.");
    } finally {
      client.release();
    }
  }

  async buscarVendaCaixa(idvenda: number): Promise<{ numeroordem: string | null; isCaixa: boolean }> {
    const pool = this.getPool();
    const client = await pool.connect();
    try {
      const result = await client.query<{ numeroordem: string | null; idcaixamovimento: number | null }>(
        "SELECT numeroordem, idcaixamovimento FROM venda WHERE idvenda = $1 LIMIT 1",
        [idvenda],
      );
      const row = result.rows[0];
      if (!row) return { numeroordem: null, isCaixa: false };
      return {
        numeroordem: row.numeroordem?.trim() || String(idvenda),
        isCaixa: row.idcaixamovimento != null,
      };
    } catch (err) {
      this.logger.warn(`buscarVendaCaixa idvenda=${idvenda}: ${err instanceof Error ? err.message : String(err)}`);
      return { numeroordem: null, isCaixa: false };
    } finally {
      client.release();
    }
  }

  async criarContaPagar(dto: CreateContaPagarDto): Promise<{ idcontapagar: number }> {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");
      const candidates = [
        "conta_pagar",
        "contaspagar",
        "contas_pagar",
        "contasapagar",
        "conta_pagar_fornecedor",
      ];
      const table = await findExistingTable(client, candidates);
      if (!table || !isSafeIdentifier(table.tableName)) {
        throw new NotFoundException("Tabela de contas a pagar nao encontrada");
      }

      const idColumn = resolveContaPagarIdColumn(table.columns);
      if (!idColumn) {
        throw new InternalServerErrorException("Tabela de contas a pagar sem coluna identificadora reconhecida");
      }

      const { insertColumns, valueExpressions, params } = buildContaPagarInsertParts(
        table.columns,
        dto as unknown as Record<string, unknown>,
      );
      if (insertColumns.length === 0) {
        throw new BadRequestException("Nenhum campo valido informado para criar conta a pagar");
      }

      const nextId = await allocateNextContaPagarId(client, table.tableName, idColumn);
      const insertColumnsWithId = [`"${idColumn}"`, ...insertColumns];
      const valueExpressionsWithId = [
        "$1",
        ...valueExpressions.map((expression) => expression.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + 1}`)),
      ];
      const paramsWithId = [nextId, ...params];

      const result = await client.query<{ idcontapagar: number }>(
        `INSERT INTO "${table.tableName}" (${insertColumnsWithId.join(", ")})
         VALUES (${valueExpressionsWithId.join(", ")})
         RETURNING "${idColumn}" as "idcontapagar"`,
        paramsWithId,
      );
      await client.query("COMMIT");
      const idcontapagar = result.rows[0].idcontapagar;
      this.logger.log(`[Athos] conta_pagar criada: idcontapagar=${idcontapagar}`);
      return { idcontapagar };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // noop
      }
      this.logger.error(`Erro ao criar conta a pagar no Athos: ${error}`);
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException || error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Erro ao criar conta a pagar no Athos");
    } finally {
      client.release();
    }
  }

  async updateContaPagar(idcontapagar: number, dto: UpdateContaPagarDto) {
    if (!Number.isInteger(idcontapagar) || idcontapagar <= 0) {
      throw new BadRequestException("idcontapagar invalido");
    }

    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");

      const candidates = [
        "conta_pagar",
        "contaspagar",
        "contas_pagar",
        "contasapagar",
        "conta_pagar_fornecedor",
      ];
      const table = await findExistingTable(client, candidates);
      if (!table || !isSafeIdentifier(table.tableName)) {
        throw new NotFoundException("Tabela de contas a pagar nao encontrada");
      }

      const idColumn = resolveContaPagarIdColumn(table.columns);
      if (!idColumn) {
        throw new InternalServerErrorException("Tabela de contas a pagar sem coluna identificadora reconhecida");
      }

      const { assignments, params } = buildContaPagarUpdateParts(
        table.columns,
        dto as unknown as Record<string, unknown>,
      );
      if (assignments.length === 0) {
        throw new BadRequestException("Nenhum campo valido informado para atualizacao");
      }

      params.push(String(idcontapagar));
      const result = await client.query<Row>(
        `UPDATE "${table.tableName}"
            SET ${assignments.join(", ")}
          WHERE CAST("${idColumn}" AS TEXT) = $${params.length}
          RETURNING *`,
        params,
      );

      if (result.rows.length === 0) {
        throw new NotFoundException("Conta a pagar nao encontrada no Athos");
      }

      const contaAtualizada = mapContaPagarRow(result.rows[0]);
      const statusAtualizado = String(contaAtualizada.statusconta ?? "").toUpperCase();

      if (statusAtualizado === "PAG") {
        const idFuncionario = pickIntFromUnknown(dto.idfuncionario ?? contaAtualizada.idfuncionario);
        const valorSaida = pickNumberFromUnknown(dto.valorpago ?? contaAtualizada.valorpago ?? contaAtualizada.valorconta);

        if (!idFuncionario || idFuncionario <= 0) {
          throw new BadRequestException("idfuncionario obrigatorio para liquidacao de pagamento");
        }

        if (valorSaida === null || valorSaida <= 0) {
          throw new BadRequestException("valorpago ou valorconta obrigatorio para liquidacao de pagamento");
        }

        const livroTable = await findExistingTable(client, ["livro_registro_io", "livroregistroio"]);
        if (!livroTable || !isSafeIdentifier(livroTable.tableName)) {
          throw new NotFoundException("Tabela livro_registro_io nao encontrada");
        }

        const livroIdContaPagarColumn = ["idcontapagar", "id_contapagar"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroIdLivroRegistroColumn = ["idlivroregistro", "id_livro_registro"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroIdFuncionarioColumn = ["idfuncionario", "id_funcionario"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroValorSaidaColumn = ["valorsaida", "valor_saida"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroDataDocumentoColumn = ["datadocumento", "data_documento"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroDataLancamentoColumn = ["datalancamento", "data_lancamento"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroHoraLancamentoColumn = ["horalancamento", "hora_lancamento"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroDescricaoColumn = ["descricao"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroNumeroDocumentoColumn = ["numerodocumento", "numero_documento", "numerodoc"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroTipoPagamentoColumn = ["tipopagamento", "tipo_pagamento"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroObservacaoColumn = ["observacao"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroIdOrigemLancamentoColumn = ["idorigemlancamento", "id_origem_lancamento"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroIdRevendaColumn = ["idrevenda", "id_revenda"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroSincronizadoColumn = ["sincronizado"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroTransferenciaColumn = ["transferencia"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroHistoryCodeColumn = ["history_code"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroTransactionIdColumn = ["transaction_id"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );

        if (!livroIdContaPagarColumn || !livroIdFuncionarioColumn || !livroValorSaidaColumn) {
          throw new InternalServerErrorException("Tabela livro_registro_io sem colunas obrigatorias para liquidacao");
        }

        const livroColumns = [`"${livroIdContaPagarColumn}"`, `"${livroIdFuncionarioColumn}"`, `"${livroValorSaidaColumn}"`];
        const livroValues = [`$1`, `$2`, `$3`];
        const livroParams: unknown[] = [idcontapagar, idFuncionario, valorSaida];

        if (livroIdLivroRegistroColumn) {
          const livroRegistroSelecionado = await resolveLivroRegistroIdForLiquidacao(client, dto, contaAtualizada);
          livroColumns.push(`"${livroIdLivroRegistroColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push(livroRegistroSelecionado);
        }

        const dataPagamento = String(contaAtualizada.datapagamento ?? "").trim();
        if (livroDataDocumentoColumn && dataPagamento) {
          livroColumns.push(`"${livroDataDocumentoColumn}"`);
          livroValues.push(`CAST($${livroParams.length + 1} AS date)`);
          livroParams.push(dataPagamento);
        }

        if (livroDataLancamentoColumn && dataPagamento) {
          livroColumns.push(`"${livroDataLancamentoColumn}"`);
          livroValues.push(`CAST($${livroParams.length + 1} AS date)`);
          livroParams.push(dataPagamento);
        }

        if (livroHoraLancamentoColumn) {
          const horaAtual = new Date().toTimeString().slice(0, 8);
          livroColumns.push(`"${livroHoraLancamentoColumn}"`);
          livroValues.push(`CAST($${livroParams.length + 1} AS time)`);
          livroParams.push(horaAtual);
        }

        if (livroDescricaoColumn) {
          livroColumns.push(`"${livroDescricaoColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push("Baixa automatica via PATCH Athos");
        }

        if (livroObservacaoColumn) {
          livroColumns.push(`"${livroObservacaoColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push(String(contaAtualizada.observacao ?? "").trim() || "Pagamento liquidado automaticamente");
        }

        if (livroNumeroDocumentoColumn) {
          livroColumns.push(`"${livroNumeroDocumentoColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push("DINHEIRO");
        }

        if (livroTipoPagamentoColumn) {
          livroColumns.push(`"${livroTipoPagamentoColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push("Dinheiro");
        }

        if (livroIdOrigemLancamentoColumn) {
          livroColumns.push(`"${livroIdOrigemLancamentoColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push(11305);
        }

        if (livroIdRevendaColumn) {
          livroColumns.push(`"${livroIdRevendaColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push(null);
        }

        if (livroSincronizadoColumn) {
          livroColumns.push(`"${livroSincronizadoColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push(false);
        }

        if (livroTransferenciaColumn) {
          livroColumns.push(`"${livroTransferenciaColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push(false);
        }

        if (livroHistoryCodeColumn) {
          livroColumns.push(`"${livroHistoryCodeColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push(null);
        }

        if (livroTransactionIdColumn) {
          livroColumns.push(`"${livroTransactionIdColumn}"`);
          livroValues.push(`$${livroParams.length + 1}`);
          livroParams.push(null);
        }

        await client.query(
          `INSERT INTO "${livroTable.tableName}" (${livroColumns.join(", ")}) VALUES (${livroValues.join(", ")})`,
          livroParams,
        );
      }

      await client.query("COMMIT");

      return contaAtualizada;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // noop
      }
      this.logger.error(`Erro ao atualizar conta a pagar no Athos: ${error}`);
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException || error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Erro ao atualizar conta a pagar no Athos");
    } finally {
      client.release();
    }
  }

  async anexarContaPagar(input: {
    idcontapagar: number;
    file: AthosAttachmentFile;
    idfuncionario?: number;
  }): Promise<{ idanexo: number; idcontapagar: number; arquivo: string; caminhoanexo: string }> {
    const { idcontapagar, file, idfuncionario } = input;

    if (!Number.isInteger(idcontapagar) || idcontapagar <= 0) {
      throw new BadRequestException("idcontapagar invalido");
    }

    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException("Arquivo obrigatorio");
    }

    const pool = this.getPool();
    let client: PoolClient | null = null;
    let writtenFilePath: string | null = null;
    let writtenViaSMB = false;
    let storageMode = "unknown";
    let writeFullPath = "";
    let dbFullPath = "";
    let fileName = "";

    try {
      client = await pool.connect();

      const contaPagarTable = await findExistingTable(client, [
        "conta_pagar",
        "contaspagar",
        "contas_pagar",
        "contasapagar",
        "conta_pagar_fornecedor",
      ]);

      if (!contaPagarTable || !isSafeIdentifier(contaPagarTable.tableName)) {
        throw new NotFoundException("Tabela de contas a pagar nao encontrada");
      }

      const contaPagarIdColumn = ["idcontapagar", "id_contapagar", "id"].find(
        (column) => contaPagarTable.columns.has(column) && isSafeIdentifier(column),
      );

      if (!contaPagarIdColumn) {
        throw new InternalServerErrorException("Tabela de contas a pagar sem coluna identificadora reconhecida");
      }

      const contaPagarResult = await client.query(
        `SELECT 1 FROM "${contaPagarTable.tableName}" WHERE CAST("${contaPagarIdColumn}" AS TEXT) = $1 LIMIT 1`,
        [String(idcontapagar)],
      );

      if (contaPagarResult.rows.length === 0) {
        throw new NotFoundException("Conta a pagar nao encontrada no Athos");
      }

      const anexoTable = await findExistingTable(client, ["anexo", "anexos"]);
      if (!anexoTable || !isSafeIdentifier(anexoTable.tableName)) {
        throw new NotFoundException("Tabela de anexos nao encontrada no Athos");
      }

      const idAnexoColumn = ["idanexo", "id_anexo", "id"].find(
        (column) => anexoTable.columns.has(column) && isSafeIdentifier(column),
      );
      const caminhoColumn = ["caminhoanexo", "caminho_anexo", "caminho"].find(
        (column) => anexoTable.columns.has(column) && isSafeIdentifier(column),
      );
      const arquivoColumn = ["arquivo", "nomearquivo", "nome_arquivo"].find(
        (column) => anexoTable.columns.has(column) && isSafeIdentifier(column),
      );
      const funcionarioColumn = ["idfuncionario", "id_funcionario"].find(
        (column) => anexoTable.columns.has(column) && isSafeIdentifier(column),
      );
      const clienteHistoricoColumn = ["idclientehistorico", "id_clientehistorico", "idcliente_historico"].find(
        (column) => anexoTable.columns.has(column) && isSafeIdentifier(column),
      );
      const contaPagarColumn = ["idcontapagar", "id_contapagar"].find(
        (column) => anexoTable.columns.has(column) && isSafeIdentifier(column),
      );

      if (!idAnexoColumn || !caminhoColumn || !arquivoColumn || !funcionarioColumn || !clienteHistoricoColumn || !contaPagarColumn) {
        throw new InternalServerErrorException("Tabela de anexos sem colunas obrigatorias para upload");
      }

      const { writeDirectoryPath, writeFullPath: computedWriteFullPath, dbFullPath: computedDbFullPath, fileName: computedFileName } =
        buildContaPagarAnexoPaths(idcontapagar, file.originalname);

      writeFullPath = computedWriteFullPath;
      dbFullPath = computedDbFullPath;
      fileName = computedFileName;
      storageMode = !hasSmbMountPath() && isSmbEnabled() ? "smb2" : hasSmbMountPath() ? "mount" : "local";

      if (!hasSmbMountPath() && isSmbEnabled()) {
        await smbWriteContaPagarFile(idcontapagar, fileName, file.buffer);
        writtenFilePath = fileName;
        writtenViaSMB = true;
      } else {
        await mkdir(writeDirectoryPath, { recursive: true });
        await writeFile(writeFullPath, file.buffer);
        writtenFilePath = writeFullPath;
      }

      this.logger.log(
        `[Athos] anexarContaPagar: idcontapagar=${idcontapagar} arquivo=${fileName} modo=${storageMode} writePath=${writeFullPath} dbPath=${dbFullPath}`,
      );

      const result = await client.query<{ idanexo: number }>(
        `INSERT INTO "${anexoTable.tableName}"
           ("${funcionarioColumn}", "${caminhoColumn}", "${arquivoColumn}", "${clienteHistoricoColumn}", "${contaPagarColumn}")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING "${idAnexoColumn}" as "idanexo"`,
        [
          idfuncionario ?? 1,
          dbFullPath,  // UNC path para o Athos ERP abrir no Windows
          fileName,
          DEFAULT_ATHOS_ANEXO_IDCLIENTEHISTORICO,
          idcontapagar,
        ],
      );

      return {
        idanexo: Number(result.rows[0].idanexo),
        idcontapagar,
        arquivo: fileName,
        caminhoanexo: dbFullPath,  // UNC retornado na resposta
      };
    } catch (error) {
      if (writtenFilePath) {
        if (writtenViaSMB) {
          await smbUnlinkContaPagarFile(idcontapagar, writtenFilePath).catch(() => undefined);
        } else {
          await unlink(writtenFilePath).catch(() => undefined);
        }
      }

      const smbDetails = getSmbDebugInfo();
      this.logger.error(
        `Erro ao anexar conta a pagar no Athos: modo=${storageMode} idcontapagar=${idcontapagar} arquivo=${fileName || "<nao-gerado>"} writePath=${writeFullPath || "<nao-definido>"} dbPath=${dbFullPath || "<nao-definido>"} smbShare=${smbDetails.share} smbDomain=${smbDetails.domain} smbUser=${smbDetails.userMasked} causa=${String(error)}`,
      );
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException("Erro ao anexar conta a pagar no Athos");
    } finally {
      client?.release();
    }
  }

  async buscarDashboardContasReceber(statusFiltro?: string): Promise<{
    summary: {
      total_a_receber: number;
      total_atrasado: number;
      total_clientes_devedores: number;
    };
    clientes: Array<{
      idcliente: number;
      nome_cliente: string;
      telefone_completo: string | null;
      emailcliente: string | null;
      emailcobrancacliente: string | null;
      limitecredito: number;
      bloqueaprazo: string | null;
      total_devido: number;
      total_atrasado: number;
      titulos_pendentes: number;
      maior_atraso_dias: number | null;
    }>;
  }> {
    this.logger.log("buscarDashboardContasReceber: iniciando consulta agregada de contas a receber");
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
            c.idcliente,
            COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente #' || c.idcliente::text) AS nome_cliente,
            c.dddtelefoneempresa || c.telefoneempresa AS telefone_completo,
            c.emailcliente,
            c.emailcobrancacliente,
            c.limitecredito,
            c.bloqueaprazo,
            SUM(cr.valor) AS total_devido,
            SUM(CASE WHEN TRIM(cr.statusconta) = 'VEN' THEN cr.valor ELSE 0 END) AS total_atrasado,
            COUNT(cr.idcontareceber) AS titulos_pendentes,
            MAX(CASE WHEN TRIM(cr.statusconta) = 'VEN' THEN CURRENT_DATE - cr.datavencimento::date END) AS maior_atraso_dias
        FROM cliente c
        INNER JOIN conta_receber cr ON c.idcliente = cr.idcliente
        LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
        LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
        WHERE TRIM(cr.statusconta) = ANY($1)
        GROUP BY c.idcliente, cf.nome, cj.nomefantasia, cj.razaosocial,
                 c.dddtelefoneempresa, c.telefoneempresa, c.emailcliente,
                 c.emailcobrancacliente, c.limitecredito, c.bloqueaprazo
        ORDER BY total_atrasado DESC NULLS LAST, total_devido DESC
        LIMIT 100
      `, [statusFiltro ? [statusFiltro] : ["AVC", "VEN"]]);

      const clientes = (result.rows as Row[]).map((row) => {
        const telefone = row["telefone_completo"];
        const telefoneFull =
          typeof telefone === "string" && telefone.trim() ? telefone.trim() : null;

        const email = row["emailcliente"];
        const emailcobranca = row["emailcobrancacliente"];
        const bloqueaprazo = row["bloqueaprazo"];

        return {
          idcliente: Number(row["idcliente"]),
          nome_cliente: typeof row["nome_cliente"] === "string" ? row["nome_cliente"] : String(row["idcliente"]),
          telefone_completo: telefoneFull,
          emailcliente: typeof email === "string" && email.trim() ? email.trim() : null,
          emailcobrancacliente:
            typeof emailcobranca === "string" && emailcobranca.trim() ? emailcobranca.trim() : null,
          limitecredito: Number(row["limitecredito"] ?? 0),
          bloqueaprazo: typeof bloqueaprazo === "string" && bloqueaprazo.trim() ? bloqueaprazo.trim() : null,
          total_devido: Number(row["total_devido"] ?? 0),
          total_atrasado: Number(row["total_atrasado"] ?? 0),
          titulos_pendentes: Number(row["titulos_pendentes"] ?? 0),
          maior_atraso_dias:
            row["maior_atraso_dias"] != null ? Number(row["maior_atraso_dias"]) : null,
        };
      });

      const summary = {
        total_a_receber: clientes.reduce((acc, c) => acc + c.total_devido, 0),
        total_atrasado: clientes.reduce((acc, c) => acc + (c.total_atrasado ?? 0), 0),
        total_clientes_devedores: clientes.length,
      };

      return { summary, clientes };
    } finally {
      client.release();
    }
  }

  async buscarTitulosClienteContasReceber(idcliente: number): Promise<
    Array<{
      idcontareceber: number;
      numerotitulo: string | null;
      datavencimento: string;
      valor: number;
      observacao: string | null;
      idvenda: number | null;
      dataemissao: string | null;
      numeroordem: string | null;
    }>
  > {
    this.logger.log(`buscarTitulosClienteContasReceber: idcliente=${idcliente}`);
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT
            cr.idcontareceber, cr.numerotitulo, cr.datavencimento, cr.valor,
            cr.observacao, cr.idvenda, cr.dataemissao,
            v.numeroordem
        FROM conta_receber cr
        LEFT JOIN venda v ON v.idvenda = cr.idvenda
        WHERE cr.idcliente = $1 AND TRIM(cr.statusconta) IN ('AVC', 'VEN')
        ORDER BY cr.datavencimento ASC
        `,
        [idcliente],
      );

      return (result.rows as Row[]).map((row) => {
        const datavenc = row["datavencimento"];
        const dataemis = row["dataemissao"];
        const obs = row["observacao"];
        const numerotitulo = row["numerotitulo"];
        const numeroordem = row["numeroordem"];

        return {
          idcontareceber: Number(row["idcontareceber"]),
          numerotitulo: typeof numerotitulo === "string" && numerotitulo.trim() ? numerotitulo.trim() : null,
          datavencimento:
            datavenc instanceof Date
              ? datavenc.toISOString().slice(0, 10)
              : typeof datavenc === "string" && datavenc.trim()
              ? datavenc.trim()
              : String(datavenc),
          valor: Number(row["valor"]),
          observacao: typeof obs === "string" && obs.trim() ? obs.trim() : null,
          idvenda: row["idvenda"] != null ? Number(row["idvenda"]) : null,
          dataemissao:
            dataemis instanceof Date
              ? dataemis.toISOString().slice(0, 10)
              : typeof dataemis === "string" && dataemis.trim()
              ? dataemis.trim()
              : null,
          numeroordem:
            typeof numeroordem === "string" && numeroordem.trim() ? numeroordem.trim() : null,
        };
      });
    } finally {
      client.release();
    }
  }

  /**
   * Verifica se cada título possui NF emitida (NF-e via venda.idnota ou NFS-e via lotenfse).
   * Retorna tipo de NF por título para validação antes de gerar boleto.
   */
  async verificarNFTitulos(idcontasReceber: number[]): Promise<Array<{
    idcontareceber: number;
    tipoNf: "NF-e" | "NFS-e" | null;
    numeroNf: string | null;
  }>> {
    if (idcontasReceber.length === 0) return [];
    const pool = this.getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT
           cr.idcontareceber,
           CASE
             WHEN cr.lotenfse = true THEN 'NFS-e'
             WHEN EXISTS (
               SELECT 1
               FROM venda_nota vn
               JOIN nota n ON n.idnota = vn.idnota
               WHERE vn.idvenda = cr.idvenda
                 AND COALESCE(n.cancelada, false) = false
                 AND n.nfechaveacesso IS NOT NULL
             ) THEN 'NF-e'
             ELSE NULL
           END AS tipo_nf,
           (
             SELECT n.numero
             FROM venda_nota vn
             JOIN nota n ON n.idnota = vn.idnota
             WHERE vn.idvenda = cr.idvenda
               AND COALESCE(n.cancelada, false) = false
               AND n.nfechaveacesso IS NOT NULL
             ORDER BY n.idnota DESC
             LIMIT 1
           ) AS numero_nf
         FROM conta_receber cr
         WHERE cr.idcontareceber = ANY($1)`,
        [idcontasReceber],
      );
      return (result.rows as Array<{ idcontareceber: unknown; tipo_nf: unknown; numero_nf: unknown }>).map((row) => ({
        idcontareceber: Number(row["idcontareceber"]),
        tipoNf: (row["tipo_nf"] as "NF-e" | "NFS-e" | null) ?? null,
        numeroNf: typeof row["numero_nf"] === "string" && row["numero_nf"].trim() ? row["numero_nf"].trim() : null,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Verifica o tipo de produto de uma venda via venda_item JOIN produto.
   * tipoproduto=true → produto físico (não entra na NFS-e); tipoproduto=false → serviço.
   * D-02: resultado NULL (sem itens) → { temProdutoFisico: false, todosServico: true }
   * Pitfall 4: aggregate functions retornam NULL para conjunto vazio — tratado com ?? false / ?? true
   * Nota: filtro vi.cancelada removido — coluna pode não existir ou ter tipo não-boolean no Athos.
   */
  /**
   * Para cada idcontareceber, retorna TODAS as NF-es ativas do venda associado,
   * com número e valor de cada nota. Usado pelo boleto para criar um item por NF-e.
   */
  async buscarTodasNfesParaTitulos(idcontasReceber: number[]): Promise<
    Array<{ idcontareceber: number; numero: string; valorNota: 0 }>
  > {
    if (idcontasReceber.length === 0) return [];
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query(
        `SELECT cr.idcontareceber,
                n.numero
         FROM conta_receber cr
         JOIN venda_nota vn ON vn.idvenda = cr.idvenda
         JOIN nota n ON n.idnota = vn.idnota
         WHERE cr.idcontareceber = ANY($1)
           AND COALESCE(n.cancelada, false) = false
           AND n.nfechaveacesso IS NOT NULL
         ORDER BY cr.idcontareceber, n.idnota`,
        [idcontasReceber],
      );
      return (result.rows as Array<{ idcontareceber: unknown; numero: unknown }>).map((r) => ({
        idcontareceber: Number(r["idcontareceber"]),
        numero: String(r["numero"] ?? "").trim(),
        /** @deprecated valorNota é sempre 0 — distribuição proporcional indisponível neste endpoint */
        valorNota: 0 as const,
      }));
    } catch (err) {
      this.logger.warn(`buscarTodasNfesParaTitulos: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Retorna TODOS os itens (produto físico + serviço) de uma venda, com flag tipoFisico.
   * Usado pelo boleto EFI para criar 1 item por venda_item.
   */
  async buscarItensVenda(idvenda: number): Promise<
    Array<{ nome: string; quantidade: number; valor: number; tipoFisico: boolean; sequencia: number }>
  > {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query(
        `SELECT p.descricaoproduto AS nome,
                vi.quantidadeitem AS quantidade,
                vi.vendavalorfinalitem AS valor,
                COALESCE(p.tipoproduto, false) AS tipo_fisico,
                vi.sequenciaitem AS sequencia
         FROM venda_item vi
         JOIN produto p ON p.idproduto = vi.idproduto
         WHERE vi.idvenda = $1
           AND COALESCE(vi.vendavalorfinalitem, 0) > 0
         ORDER BY vi.sequenciaitem`,
        [idvenda],
      );
      return result.rows.map((r) => ({
        nome: String(r["nome"] ?? "").trim() || `Item ${r["sequencia"] ?? "?"}`,
        quantidade: Number(r["quantidade"] ?? 1) || 1,
        valor: Number(r["valor"] ?? 0),
        tipoFisico: Boolean(r["tipo_fisico"]),
        sequencia: Number(r["sequencia"] ?? 0),
      }));
    } catch (err) {
      this.logger.warn(
        `buscarItensVenda idvenda=${idvenda}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Retorna valor total da venda calculado a partir da soma dos venda_item.
   * Usa SUM(vendavalorfinalitem) ao invés de coluna "valortotal" da tabela venda,
   * que não existe em todas as versões do Athos.
   */
  async buscarValorTotalVenda(idvenda: number): Promise<number> {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query<{ valortotal: unknown }>(
        `SELECT COALESCE(SUM(vi.vendavalorfinalitem), 0) AS valortotal
         FROM venda_item vi
         WHERE vi.idvenda = $1
           AND COALESCE(vi.vendavalorfinalitem, 0) > 0`,
        [idvenda],
      );
      const raw = result.rows[0]?.valortotal;
      const v = Number(raw);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (err) {
      this.logger.warn(
        `buscarValorTotalVenda idvenda=${idvenda}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    } finally {
      client.release();
    }
  }

  async verificarTipoProdutoVenda(idvenda: number): Promise<{
    temProdutoFisico: boolean;
    todosServico: boolean;
    valorServicos: number | null;
    itensServico: Array<{ nome: string; quantidade: number; valor: number }>;
  }> {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const aggResult = await client.query(
        `SELECT
           BOOL_OR(p.tipoproduto) as tem_produto_fisico,
           BOOL_AND(NOT COALESCE(p.tipoproduto, false)) as todos_servico,
           SUM(CASE WHEN NOT COALESCE(p.tipoproduto, false) THEN COALESCE(vi.vendavalorfinalitem, 0) ELSE 0 END) as valor_servicos
         FROM venda_item vi
         JOIN produto p ON p.idproduto = vi.idproduto
         WHERE vi.idvenda = $1`,
        [idvenda],
      );
      const itensResult = await client.query(
        `SELECT p.descricaoproduto as nome, vi.quantidadeitem as quantidade, vi.vendavalorfinalitem as valor
         FROM venda_item vi
         JOIN produto p ON p.idproduto = vi.idproduto
         WHERE vi.idvenda = $1
           AND NOT COALESCE(p.tipoproduto, false)
           AND COALESCE(vi.vendavalorfinalitem, 0) > 0
         ORDER BY vi.sequenciaitem`,
        [idvenda],
      );
      const row = aggResult.rows[0];
      // NULL = sem itens em venda_item → permitir sem aviso (D-02, Pitfall 4)
      return {
        temProdutoFisico: row?.tem_produto_fisico ?? false,
        todosServico: row?.todos_servico ?? true,
        valorServicos: row?.valor_servicos != null ? Number(row.valor_servicos) : null,
        itensServico: itensResult.rows.map((r) => ({
          nome: String(r.nome ?? "").trim(),
          quantidade: Number(r.quantidade ?? 1),
          valor: Number(r.valor ?? 0),
        })),
      };
    } catch (err) {
      this.logger.warn(
        `verificarTipoProdutoVenda idvenda=${idvenda}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { temProdutoFisico: false, todosServico: true, valorServicos: null, itensServico: [] };
    } finally {
      client.release();
    }
  }


  /**
   * Retorna notas fiscais nao-servico (NF-e) de um cliente do Athos via query read-only.
   * Lista ate 50 registros ordenados por data de emissao DESC.
   * Quando  e fornecido, aplica filtro WHERE n.numero = $2 (match exato, server-side).
   * Notas canceladas sao excluidas (COALESCE(n.cancelada, false) = false).
   * Em caso de erro de query, loga com warn e retorna [] sem quebrar o endpoint.
   * NFAT-01 (lista) e NFAT-02 (busca por numero) — D-09 a D-14.
   */
  async buscarNotasFiscaisCliente(
    idcliente: number,
    numero?: string,
  ): Promise<Array<{ numero: string; dataemissao: string | null; valor: number; tipo: string }>> {
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const temNumero = typeof numero === 'string' && numero.trim() !== '';
      const params: Array<number | string> = temNumero ? [idcliente, numero!.trim()] : [idcliente];
      const filtroNumero = temNumero ? ' AND n.numero = $2' : '';
      const result = await client.query(
        `SELECT n.numero, n.dataemissao, n.valornota, 'NF-e' AS tipo
         FROM venda v
         JOIN venda_nota vn ON vn.idvenda = v.idvenda
         JOIN nota n ON n.idnota = vn.idnota
         WHERE v.idcliente = $1
           AND COALESCE(n.cancelada, false) = false
           AND n.nfechaveacesso IS NOT NULL${filtroNumero}
         ORDER BY n.dataemissao DESC
         LIMIT 50`,
        params,
      );
      return (result.rows as Array<{ numero: unknown; dataemissao: unknown; valornota: unknown; tipo: unknown }>).map(
        (row) => {
          const dataemis = row['dataemissao'];
          return {
            numero: String(row['numero'] ?? '').trim(),
            dataemissao:
              dataemis instanceof Date
                ? dataemis.toISOString().slice(0, 10)
                : typeof dataemis === 'string' && dataemis.trim()
                ? dataemis.trim()
                : null,
            valor: Number(row['valornota'] ?? 0),
            tipo: 'NF-e',
          };
        },
      );
    } catch (err) {
      this.logger.warn(`buscarNotasFiscaisCliente idcliente=${idcliente}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Produtos — Phase 32 (read-only)
  // ---------------------------------------------------------------------------

  async buscarProdutos(params: {
    descricao?: string;
    codigobarra?: string;
    iddepartamento?: number;
    idgrupo?: number;
    idmarca?: number;
    page?: number;
    take?: number;
  }): Promise<{ total: number; page: number; take: number; items: import('./produto.types').Produto[] }> {
    this.logger.log(
      `buscarProdutos descricao="${params.descricao ?? ""}" codigobarra="${params.codigobarra ?? ""}" iddepartamento=${params.iddepartamento ?? ""} idgrupo=${params.idgrupo ?? ""} idmarca=${params.idmarca ?? ""}`,
    );

    const take = Math.min(Math.max(1, Number(params.take ?? 20) || 20), 50);
    const page = Math.max(1, Number(params.page ?? 1) || 1);
    const offset = (page - 1) * take;

    const conditions: string[] = [];
    const qParams: (string | number)[] = [];
    let idx = 1;

    if (params.descricao?.trim()) {
      conditions.push(`(p.descricaoproduto ILIKE $${idx} OR p.descricaocurta ILIKE $${idx})`);
      qParams.push(`%${params.descricao.trim()}%`);
      idx++;
    }
    if (params.codigobarra?.trim()) {
      conditions.push(`(p.codigobarra1 = $${idx} OR p.codigobarra2 = $${idx})`);
      qParams.push(params.codigobarra.trim());
      idx++;
    }
    if (params.iddepartamento) {
      conditions.push(`p.iddepartamento = $${idx++}`);
      qParams.push(params.iddepartamento);
    }
    if (params.idgrupo) {
      conditions.push(`p.idgrupo = $${idx++}`);
      qParams.push(params.idgrupo);
    }
    if (params.idmarca) {
      conditions.push(`p.idmarca = $${idx++}`);
      qParams.push(params.idmarca);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const countResult = await client.query(
        `SELECT COUNT(*) AS total FROM produto p ${whereClause}`,
        qParams,
      );
      const total = Number(countResult.rows[0]?.total ?? 0);

      const dataResult = await client.query(
        `SELECT p.*, NULL::bytea AS imagemproduto FROM produto p ${whereClause} ORDER BY p.descricaoproduto ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...qParams, take, offset],
      );

      return { total, page, take, items: dataResult.rows as import('./produto.types').Produto[] };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      this.logger.warn(`buscarProdutos: ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException("Erro ao buscar produtos no Athos.");
    } finally {
      client.release();
    }
  }

  async buscarProdutoPorId(idproduto: number): Promise<import('./produto.types').Produto | null> {
    this.logger.log(`buscarProdutoPorId idproduto=${idproduto}`);
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query(
        "SELECT p.*, NULL::bytea AS imagemproduto FROM produto p WHERE p.idproduto = $1 LIMIT 1",
        [idproduto],
      );
      return (result.rows[0] as import('./produto.types').Produto) ?? null;
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      this.logger.warn(`buscarProdutoPorId: ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException("Erro ao buscar produto no Athos.");
    } finally {
      client.release();
    }
  }

  async buscarDepartamentos(): Promise<import('./produto.types').LookupItem[]> {
    this.logger.log("buscarDepartamentos");
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query(
        "SELECT iddepartamento AS id, nome FROM produto_departamento ORDER BY nome ASC",
      );
      return result.rows as import('./produto.types').LookupItem[];
    } catch (err) {
      this.logger.warn(`buscarDepartamentos: ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException("Erro ao buscar departamentos no Athos.");
    } finally {
      client.release();
    }
  }

  async buscarGrupos(): Promise<import('./produto.types').LookupItem[]> {
    this.logger.log("buscarGrupos");
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query(
        "SELECT idgrupo AS id, nome FROM produto_grupo ORDER BY nome ASC",
      );
      return result.rows as import('./produto.types').LookupItem[];
    } catch (err) {
      this.logger.warn(`buscarGrupos: ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException("Erro ao buscar grupos no Athos.");
    } finally {
      client.release();
    }
  }

  async buscarMarcas(): Promise<import('./produto.types').LookupItem[]> {
    this.logger.log("buscarMarcas");
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();
    try {
      const result = await client.query(
        "SELECT idmarca AS id, nome FROM produto_marca ORDER BY nome ASC",
      );
      return result.rows as import('./produto.types').LookupItem[];
    } catch (err) {
      this.logger.warn(`buscarMarcas: ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException("Erro ao buscar marcas no Athos.");
    } finally {
      client.release();
    }
  }

}