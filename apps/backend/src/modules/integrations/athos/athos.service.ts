import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { Client, Pool, PoolClient } from "pg";

type Row = Record<string, unknown>;

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

  async listarContasPagar() {
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
        LEFT JOIN LATERAL (
          SELECT tipologradouro, logradouro, numero, bairro, cep, codigocidade, uf
          FROM cliente_endereco
          WHERE idcliente = c.idcliente
          ORDER BY idenderecocliente
          LIMIT 1
        ) ce ON true
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

}