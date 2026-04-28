import { Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { Client } from "pg";

type Row = Record<string, unknown>;

function isSafeIdentifier(value: string) {
  return /^[a-z_][a-z0-9_]*$/i.test(value);
}

async function getTableColumns(client: Client, tableName: string) {
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

async function findExistingTable(client: Client, tableCandidates: string[]) {
  for (const tableName of tableCandidates) {
    const columns = await getTableColumns(client, tableName);
    if (columns.length > 0) {
      return { tableName, columns: new Set(columns) };
    }
  }

  return null;
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

async function loadItems(client: Client, idOrcamento: string) {
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
      .map((name) => `COALESCE(${name}, 0)`);
    const orderBy = orderColumns.length > 0 ? ` ORDER BY ${orderColumns.join(", ")}` : "";

    const itemsResult = await client.query(
      `
      SELECT *
      FROM ${tableName}
      WHERE CAST(${quoteIdColumn} AS TEXT) = $1${orderBy}
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
          FROM ${productTable.tableName}
          WHERE CAST(${productIdOnProduct} AS TEXT) = ANY($1::text[])
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

async function loadFuncionario(client: Client, quote: Row) {
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
    FROM ${funcionarioTable.tableName}
    WHERE CAST(${funcionarioIdColumn} AS TEXT) = $1
    LIMIT 1
    `,
    [String(funcionarioId)],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Row;
}

async function loadCarimbos(client: Client, idOrcamento: string) {
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
    FROM ${carimboTable.tableName}
    WHERE CAST(${quoteIdColumn} AS TEXT) = $1${orderBy}
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
      await client.connect();
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
    const client = new Client(this.getDbConfig());

    try {
      await client.connect();

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

      const query = `
        SELECT *
        FROM orcamento
        WHERE CAST(${identifierColumn} AS TEXT) = $1
        ORDER BY ${identifierColumn} DESC
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
      await client.end();
    }
  }

  async listarContasPagar() {
    const client = new Client(this.getDbConfig());

    try {
      await client.connect();

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

      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      const end = new Date(now);
      end.setDate(now.getDate() + 30);

      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const query = `SELECT * FROM ${table.tableName} WHERE ${dateColumn} IS NOT NULL AND CAST(${dateColumn} AS timestamp) BETWEEN $1 AND $2 ORDER BY CAST(${dateColumn} AS timestamp) DESC`;

      const result = await client.query(query, [startISO, endISO]);

      return (result.rows as Row[]).map((row) => ({
        descricaoconta: pickString(row, ["descricaoconta", "descricao", "descricaocurta", "nome", "descricao_conta"]),
        dataemissao: pickDateISO(row, ["dataemissao", "data_emissao", "dt_emissao", "dtemissao", "data"]),
        datavencimento: pickDateISO(row, ["datavencimento", "data_vencimento", "vencimento", "dtvenc", "dt_vencimento"]),
        valorconta: pickNumber(row, ["valorconta", "valor_conta", "valor", "valortotal", "valorconta"], 0),
        observacao: pickString(row, ["observacao", "obs", "observacoes", "descricao", "observacao_conta"]),
        statusconta: pickString(row, ["statusconta", "status_conta", "status", "situacao"]),
        valorpago: pickNumber(row, ["valorpago", "valor_pago", "valorquitado", "valorpago"], 0),
        datapagamento: pickDateISO(row, ["datapagamento", "data_pagamento", "dataquitacao", "datapagamento"]),
        ultimaalteracao: pickDateTimeISO(row, ["ultimaalteracao", "ultima_alteracao", "ultimaAlteracao", "ultimaalteracao", "ultimaalteracao"]),
        numerodocumento: pickString(row, ["numerodocumento", "numerodoc", "numero_documento", "numero", "documento", "numeronota"]),
      }));
    } catch (error) {
      this.logger.error(`Erro ao listar contas a pagar no Athos: ${error}`);
      if (error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException("Erro ao listar contas a pagar no Athos");
    } finally {
      await client.end();
    }
  }

  async verificarPagamentoPorOrcamento(orcamentoId: string, vendaId?: number | string | null) {
    this.logger.log(`Verificando pagamento para orçamento ${orcamentoId} e venda ${vendaId}`);
    return { paid: false, idVenda: vendaId ?? null, valor: 0 };
  }

  async buscarClientePorId(clienteId: string | number): Promise<{ id: string; name: string; type: "juridico" | "fisico" } | null> {
    const client = new Client(this.getDbConfig());
    try {
      await client.connect();

      // Pessoa jurídica: preferir nomefantasia, fallback razaosocial
      const juridicoResult = await client.query(
        `SELECT nomefantasia, razaosocial FROM cliente_juridico WHERE idcliente = $1 LIMIT 1`,
        [clienteId],
      );
      if (juridicoResult.rows.length > 0) {
        const row = juridicoResult.rows[0] as Row;
        const name = pickString(row, ["nomefantasia", "razaosocial"]);
        if (name) return { id: String(clienteId), name, type: "juridico" };
      }

      // Pessoa física: campo nome
      const fisicoResult = await client.query(
        `SELECT nome FROM cliente_fisico WHERE idcliente = $1 LIMIT 1`,
        [clienteId],
      );
      if (fisicoResult.rows.length > 0) {
        const row = fisicoResult.rows[0] as Row;
        const name = pickString(row, ["nome", "nomecliente"]);
        if (name) return { id: String(clienteId), name, type: "fisico" };
      }

      return null;
    } catch (err) {
      this.logger.warn(`Falha ao buscar cliente ${clienteId} no Athos: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
