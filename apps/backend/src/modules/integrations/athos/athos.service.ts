import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { Client, Pool, PoolClient } from "pg";
import {
  buildContaPagarInsertParts,
  buildContaPagarUpdateParts,
  mapContaPagarRow,
  resolveContaPagarIdColumn,
} from "./athos-conta-pagar.util";
import { buildContaPagarAnexoPaths } from "./athos-anexo.util";
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

      const query = `SELECT * FROM ${table.tableName} WHERE ${conditions.join(" AND ")} ORDER BY CAST(${dateColumn} AS timestamp) DESC`;

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
        const idCaixaCentral = pickIntFromUnknown(dto.idcaixacentral);

        if (!idFuncionario || idFuncionario <= 0) {
          throw new BadRequestException("idfuncionario obrigatorio para liquidacao de pagamento");
        }

        if (valorSaida === null || valorSaida <= 0) {
          throw new BadRequestException("valorpago ou valorconta obrigatorio para liquidacao de pagamento");
        }

        if (!idCaixaCentral || idCaixaCentral <= 0) {
          throw new BadRequestException("idcaixacentral obrigatorio quando statusconta = PAG");
        }

        const livroTable = await findExistingTable(client, ["livro_registro_io", "livroregistroio"]);
        if (!livroTable || !isSafeIdentifier(livroTable.tableName)) {
          throw new NotFoundException("Tabela livro_registro_io nao encontrada");
        }

        const livroIdContaPagarColumn = ["idcontapagar", "id_contapagar"].find(
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
        const livroDescricaoColumn = ["descricao"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );
        const livroObservacaoColumn = ["observacao"].find(
          (column) => livroTable.columns.has(column) && isSafeIdentifier(column),
        );

        if (!livroIdContaPagarColumn || !livroIdFuncionarioColumn || !livroValorSaidaColumn) {
          throw new InternalServerErrorException("Tabela livro_registro_io sem colunas obrigatorias para liquidacao");
        }

        const livroColumns = [`"${livroIdContaPagarColumn}"`, `"${livroIdFuncionarioColumn}"`, `"${livroValorSaidaColumn}"`];
        const livroValues = [`$1`, `$2`, `$3`];
        const livroParams: unknown[] = [idcontapagar, idFuncionario, valorSaida];

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

        await client.query(
          `INSERT INTO "${livroTable.tableName}" (${livroColumns.join(", ")}) VALUES (${livroValues.join(", ")})`,
          livroParams,
        );

        const caixaTable = await findExistingTable(client, ["caixa_saida", "caixasaida"]);
        if (!caixaTable || !isSafeIdentifier(caixaTable.tableName)) {
          throw new NotFoundException("Tabela caixa_saida nao encontrada");
        }

        const caixaIdCaixaCentralColumn = ["idcaixacentral", "id_caixacentral"].find(
          (column) => caixaTable.columns.has(column) && isSafeIdentifier(column),
        );
        const caixaIdContaPagarColumn = ["idcontapagar", "id_contapagar"].find(
          (column) => caixaTable.columns.has(column) && isSafeIdentifier(column),
        );
        const caixaValorColumn = ["valor"].find(
          (column) => caixaTable.columns.has(column) && isSafeIdentifier(column),
        );
        const caixaDataDocumentoColumn = ["datadocumento", "data_documento"].find(
          (column) => caixaTable.columns.has(column) && isSafeIdentifier(column),
        );
        const caixaDataLancamentoColumn = ["datalancamento", "data_lancamento"].find(
          (column) => caixaTable.columns.has(column) && isSafeIdentifier(column),
        );
        const caixaDescricaoColumn = ["descricao"].find(
          (column) => caixaTable.columns.has(column) && isSafeIdentifier(column),
        );
        const caixaObservacaoColumn = ["observacao"].find(
          (column) => caixaTable.columns.has(column) && isSafeIdentifier(column),
        );

        if (!caixaIdCaixaCentralColumn || !caixaIdContaPagarColumn || !caixaValorColumn) {
          throw new InternalServerErrorException("Tabela caixa_saida sem colunas obrigatorias para liquidacao");
        }

        const caixaColumns = [`"${caixaIdCaixaCentralColumn}"`, `"${caixaIdContaPagarColumn}"`, `"${caixaValorColumn}"`];
        const caixaValues = [`$1`, `$2`, `$3`];
        const caixaParams: unknown[] = [idCaixaCentral, idcontapagar, valorSaida];

        if (caixaDataDocumentoColumn && dataPagamento) {
          caixaColumns.push(`"${caixaDataDocumentoColumn}"`);
          caixaValues.push(`CAST($${caixaParams.length + 1} AS date)`);
          caixaParams.push(dataPagamento);
        }

        if (caixaDataLancamentoColumn && dataPagamento) {
          caixaColumns.push(`"${caixaDataLancamentoColumn}"`);
          caixaValues.push(`CAST($${caixaParams.length + 1} AS date)`);
          caixaParams.push(dataPagamento);
        }

        if (caixaDescricaoColumn) {
          caixaColumns.push(`"${caixaDescricaoColumn}"`);
          caixaValues.push(`$${caixaParams.length + 1}`);
          caixaParams.push("Saida automatica de caixa via PATCH Athos");
        }

        if (caixaObservacaoColumn) {
          caixaColumns.push(`"${caixaObservacaoColumn}"`);
          caixaValues.push(`$${caixaParams.length + 1}`);
          caixaParams.push(String(contaAtualizada.observacao ?? "").trim() || "Pagamento liquidado automaticamente");
        }

        await client.query(
          `INSERT INTO "${caixaTable.tableName}" (${caixaColumns.join(", ")}) VALUES (${caixaValues.join(", ")})`,
          caixaParams,
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

      const { directoryPath, fullPath, fileName } = buildContaPagarAnexoPaths(idcontapagar, file.originalname);

      await mkdir(directoryPath, { recursive: true });
      await writeFile(fullPath, file.buffer);
      writtenFilePath = fullPath;

      this.logger.log(
        `[Athos] anexarContaPagar: idcontapagar=${idcontapagar} idclientehistorico=${DEFAULT_ATHOS_ANEXO_IDCLIENTEHISTORICO}`,
      );

      const result = await client.query<{ idanexo: number }>(
        `INSERT INTO "${anexoTable.tableName}"
           ("${funcionarioColumn}", "${caminhoColumn}", "${arquivoColumn}", "${clienteHistoricoColumn}", "${contaPagarColumn}")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING "${idAnexoColumn}" as "idanexo"`,
        [
          idfuncionario ?? 1,
          fullPath,
          fileName,
          DEFAULT_ATHOS_ANEXO_IDCLIENTEHISTORICO,
          idcontapagar,
        ],
      );

      return {
        idanexo: Number(result.rows[0].idanexo),
        idcontapagar,
        arquivo: fileName,
        caminhoanexo: fullPath,
      };
    } catch (error) {
      if (writtenFilePath) {
        await unlink(writtenFilePath).catch(() => undefined);
      }

      this.logger.error(`Erro ao anexar conta a pagar no Athos: ${error}`);
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

}