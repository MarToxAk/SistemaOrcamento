import { HttpException, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Pool, PoolClient } from "pg";

import {
  CalcOrcamentoError,
  LinhaCalcEntrada,
  TotaisOrcamento,
  calcularOrcamento,
  centavosParaTexto,
  milliParaTexto,
  paraCentavos,
  paraMilli,
  percentualTexto,
} from "./athos-orcamento-calc.util";
import { sanitizarTextoAthos } from "./athos-conta-receber-baixa.service";

/**
 * Criacao de orcamento no Athos para agentes de IA (Fase 44, plano 44-01).
 *
 * Grava, em UMA transacao, orcamento + orcamento_item + exatamente uma linha de
 * orcamento_forma_pagamento (PIX, D-04). SQL observado no Balcao (44-REFERENCIA-SQL-ATHOS.md);
 * PostgreSQL 9.0.5: apenas parametros $n, RETURNING, ANY($1::int[]), SET LOCAL statement_timeout.
 * Sem ON CONFLICT, FILTER, jsonb, CTE de escrita, lock_timeout.
 *
 * Seguranca (D-03): este servico e o UNICO lugar do backend que grava em orcamento*. A escrita
 * so liga com ATHOS_ORCAMENTO_ESCRITA exatamente "true" e, com NODE_ENV=test, so aceita host
 * local/mock. Todas as leituras e validacoes acontecem antes do primeiro INSERT: a RULE de INSERT
 * em orcamento faz UPDATE em conf_inicial e segura esse lock ate o COMMIT.
 */

export type OrcamentoAthosCodigo =
  | "PRODUTO_INEXISTENTE"
  | "PRODUTO_INATIVO"
  | "PRECO_INDISPONIVEL"
  | "QUANTIDADE_FRACIONADA"
  | "CLIENTE_INEXISTENTE"
  | "DESCONTO_ACIMA_LIMITE"
  | "VALOR_FORA_DO_LIMITE"
  | "VALOR_INVALIDO"
  | "ESCRITA_DESABILITADA"
  | "CONFIG_INVALIDA"
  | "FORMA_PAGAMENTO_INVALIDA"
  | "ORCAMENTO_INEXISTENTE"
  | "PERMISSAO_NEGADA"
  | "ATHOS_INDISPONIVEL"
  | "AMBIENTE_TESTE_HOST_REAL"
  | "ERRO_BANCO"
  | "IDEMPOTENCY_KEY_INVALIDA"
  | "IDEMPOTENCY_KEY_REUTILIZADA"
  | "IDEMPOTENCY_EM_PROCESSAMENTO";

/** Erro legivel por IA: corpo { statusCode, codigo, mensagem, detalhes? }. */
export class OrcamentoAthosError extends HttpException {
  readonly codigo: OrcamentoAthosCodigo;

  constructor(codigo: OrcamentoAthosCodigo, mensagem: string, status: number, detalhes?: Record<string, unknown>) {
    super(
      detalhes !== undefined
        ? { statusCode: status, codigo, mensagem, detalhes }
        : { statusCode: status, codigo, mensagem },
      status,
    );
    this.name = "OrcamentoAthosError";
    this.codigo = codigo;
  }
}

export interface ConfigOrcamentoAthos {
  escrita: boolean;
  idFuncionario: number;
  idVendedor: number;
  idTerminal: number;
  idFormaPagamento: number;
}

export interface ItemOrcamentoInput {
  idproduto: number;
  quantidade: number;
  valorUnitario?: number;
  descontoRS?: number;
}

export interface CriarOrcamentoInput {
  itens: ItemOrcamentoInput[];
  idcliente?: number;
  obs?: string;
  descontoTotalRS?: number;
  simular?: boolean;
}

export interface OrcamentoItemResultado {
  sequenciaitem: number;
  idproduto: number;
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  desconto: string;
  valorFinal: string;
}

export interface CriarOrcamentoResultado {
  simulado: boolean;
  idorcamento: number | null;
  senhabalcao: number | null;
  valorBruto: string;
  descontoRS: string;
  descontoPercentual: string;
  valorLiquido: string;
  itens: OrcamentoItemResultado[];
  pagamento: { idformapagamento: number; idcondicaopagamento: number; valor: string };
}

/** Produto devolvido pela busca da IA (44-04, D-01). Sem campos de custo. numeric como texto. */
export interface ProdutoOrcamentoResultado {
  idproduto: number;
  descricao: string;
  marca: string | null;
  referencia: string | null;
  codigoBarra: string | null;
  /** Texto de precovendaproduto ("68.000"); null quando o Athos nao tem preco. */
  preco: string | null;
  emPromocao: boolean;
  estoqueLoja: string;
  estoqueDeposito: string;
  permiteFracionar: boolean;
  /** Informativo (D-04): o limite aplicado na criacao e o global de conf_vendas. */
  descontoMaximo: string;
  unidade: string | null;
}

/** Orcamento lido do Athos (44-04). statusorcamento NULL = aberto, true = convertido, false = outro. */
export interface OrcamentoAthosDetalhe {
  idorcamento: number;
  senhabalcao: number;
  data: string;
  hora: string;
  status: "aberto" | "convertido" | "outro";
  cancelado: boolean | null;
  statusimpressao: boolean | null;
  idcliente: number | null;
  idvendedor: number | null;
  idfuncionariousuario: number | null;
  idterminal: number | null;
  obs: string | null;
  valorBruto: string;
  descontoRS: string;
  descontoPercentual: string;
  /** valor - descontors em milesimos (inteiros, nunca ponto flutuante). */
  valorLiquido: string;
  itens: Array<{
    sequenciaitem: number;
    idproduto: number;
    descricao: string;
    quantidade: string;
    valorUnitario: string;
    desconto: string;
    valorFinal: string;
  }>;
  pagamentos: Array<{
    idformapagamento: number;
    descricao: string | null;
    valor: string;
    valorRecebido: string;
    idcondicaopagamento: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const HOSTS_PERMITIDOS_EM_TESTE = ["localhost", "127.0.0.1", "athos-mock.invalid"];
const MAX_ITENS = 200;
const MAX_INT4 = 2147483647;
/** Quantidade maxima por linha: 10000 unidades (em milesimos). */
const QUANTIDADE_MAX_MILLI = 10_000_000n;
const OBS_MAX_USUARIO = 1900;
const ID_FORMA_PAGAMENTO_PADRAO = 5;

const SQL_STATEMENT_TIMEOUT = "SET LOCAL statement_timeout = 15000";
/** Simulacao (D-03): primeira instrucao da transacao; qualquer escrita passa a falhar no proprio banco. */
const SQL_SOMENTE_LEITURA = "SET TRANSACTION READ ONLY";

const SQL_LER_CONFIG = `SELECT EXISTS (SELECT 1 FROM funcionario_usuario WHERE idfuncionariousuario = $1) AS funcionario_ok,
       EXISTS (SELECT 1 FROM funcionario WHERE idfuncionario = $2) AS vendedor_ok,
       EXISTS (SELECT 1 FROM terminal WHERE idterminal = $3) AS terminal_ok,
       EXISTS (SELECT 1 FROM forma_pagamento WHERE idformapagamento = $4 AND status = true AND tipodeforma IN (1, 4)) AS pix_ok,
       EXISTS (SELECT 1 FROM cliente WHERE idcliente = $5) AS cliente_ok,
       (SELECT permitedescontode FROM conf_vendas LIMIT 1) AS permitedescontode`;

const SQL_LER_PRODUTOS = `SELECT p.idproduto, p.descricaoproduto, p.statusproduto, COALESCE(p.vendeproduto, true) AS vende,
       precovendaproduto(p.idproduto) AS preco, COALESCE(p.permitefracionar, true) AS permitefracionar,
       round(COALESCE(CASE WHEN p.quantidadecaixa > 0
         THEN (p.valorcustocaixa / p.quantidadecaixa) + ((p.valorcustocaixa / p.quantidadecaixa) * (p.imposto + p.ipi + p.frete + p.outroimposto) / 100)
         ELSE p.valorcustocaixa + (p.valorcustocaixa * (p.imposto + p.ipi + p.frete + p.outroimposto) / 100) END, 0), 3) AS valorcustounitario
  FROM produto p WHERE p.idproduto = ANY($1::int[])`;

const SQL_INSERIR_ORCAMENTO = `INSERT INTO orcamento (descontors, idvendedor, idcliente, idfuncionariousuario, idterminal, dataorcamento, hora,
                       validadeorcamento, valor, desconto, statusorcamento, obs, idtransportadora, dataentrega,
                       idenderecocliente, valoracrescimo, statusimpressao)
VALUES ($1, $2, $3, $4, $5, current_date, cast(current_time(0) as time), NULL, $6, $7, NULL, $8, NULL, NULL, 0, 0, false)
RETURNING idorcamento, senhabalcao`;

const SQL_INSERIR_ITEM = `INSERT INTO orcamento_item (idorcamento, sequenciaitem, idproduto, quantidadeitem, valoritem, valordesconto,
                            valorcustoitem, valorcomissao, codigovariante, comprimento, pesoliquido, pesobruto,
                            observacao, depositoloja, orcamentodesconto, orcamentovalorfinalitem)
VALUES ($1, $2, $3, $4, $5, 0, $6, 0, '', 0, 0, 0, '', false, $7, $8)`;

const SQL_LIMPAR_PAGAMENTO = "DELETE FROM orcamento_forma_pagamento WHERE idorcamento = $1";

const SQL_INSERIR_PAGAMENTO = `INSERT INTO orcamento_forma_pagamento (idorcamento, idformapagamento, valor, valorrecebido, idcondicaopagamento)
VALUES ($1, $2, $3, $4, 0)`;

// Leituras (44-04). Todo texto do usuario entra como parametro; nenhuma clausula de escape literal
// (no PG 9.0 standard_conforming_strings vem desligado: o escape padrao do LIKE e a barra invertida,
// aplicada ao VALOR do parametro).
const SQL_BUSCA_PRODUTOS_SELECT = `SELECT p.idproduto, p.descricaoproduto, pm.nome AS marca, p.referencia, p.codigobarra1,
       precovendaproduto(p.idproduto) AS preco, estanapromocao(p.idproduto) AS empromocao,
       COALESCE(p.estoqueloja, 0) AS estoqueloja, COALESCE(p.estoquedeposito, 0) AS estoquedeposito,
       COALESCE(p.permitefracionar, true) AS permitefracionar, COALESCE(p.descontomaximo, 0) AS descontomaximo,
       pu.sigla AS unidade
  FROM produto p
  LEFT JOIN produto_marca pm ON pm.idmarca = p.idmarca
  LEFT JOIN produto_unidade pu ON pu.idunidade = p.idunidade
 WHERE p.statusproduto = true AND COALESCE(p.vendeproduto, true) = true`;

const SQL_LER_ORCAMENTO = `SELECT idorcamento, senhabalcao, idcliente, idvendedor, idfuncionariousuario, idterminal,
       to_char(dataorcamento, 'YYYY-MM-DD') AS data, to_char(hora, 'HH24:MI:SS') AS hora,
       valor, desconto, descontors, statusorcamento, statusimpressao, cancelado, obs
  FROM orcamento WHERE idorcamento = $1`;

const SQL_LER_ITENS = `SELECT i.sequenciaitem, i.idproduto, p.descricaoproduto, i.quantidadeitem, i.valoritem,
       i.orcamentodesconto, i.orcamentovalorfinalitem
  FROM orcamento_item i JOIN produto p ON p.idproduto = i.idproduto
 WHERE i.idorcamento = $1 ORDER BY i.sequenciaitem`;

const SQL_LER_PAGAMENTOS = `SELECT ofp.idformapagamento, f.descricao, ofp.valor, ofp.valorrecebido, ofp.idcondicaopagamento
  FROM orcamento_forma_pagamento ofp LEFT JOIN forma_pagamento f ON f.idformapagamento = ofp.idformapagamento
 WHERE ofp.idorcamento = $1 ORDER BY ofp.idformapagamentoorcamento`;

const BUSCA_LIMITE_PADRAO = 20;
const BUSCA_LIMITE_MAX = 50;
const BUSCA_MAX_TOKENS = 5;

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/** Escapa \, % e _ no VALOR do parametro (o escape padrao do LIKE/ILIKE e a barra invertida). */
function escaparLike(token: string): string {
  return token.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function textoOuNull(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

function textoNumerico(valor: unknown, padrao: string): string {
  return valor === null || valor === undefined ? padrao : String(valor);
}

function inteiroPositivoEnv(env: NodeJS.ProcessEnv, nome: string, padrao?: number): number {
  const bruto = env[nome];
  if (bruto === undefined || bruto.trim() === "") {
    if (padrao !== undefined) return padrao;
    throw new OrcamentoAthosError(
      "CONFIG_INVALIDA",
      `Variavel de ambiente ${nome} ausente. Defina um inteiro positivo (id no Athos).`,
      500,
    );
  }
  const texto = bruto.trim();
  const n = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(n) || n < 1 || n > MAX_INT4) {
    throw new OrcamentoAthosError("CONFIG_INVALIDA", `Variavel de ambiente ${nome} deve ser um inteiro positivo.`, 500);
  }
  return n;
}

/** `escrita` so e verdadeiro com o texto exato "true"; as demais envs sao obrigatorias (exceto a forma, padrao 5). */
export function resolverConfigOrcamentoAthos(env: NodeJS.ProcessEnv = process.env): ConfigOrcamentoAthos {
  return {
    escrita: env.ATHOS_ORCAMENTO_ESCRITA === "true",
    idFuncionario: inteiroPositivoEnv(env, "ATHOS_ORCAMENTO_ID_FUNCIONARIO"),
    idVendedor: inteiroPositivoEnv(env, "ATHOS_ORCAMENTO_ID_VENDEDOR"),
    idTerminal: inteiroPositivoEnv(env, "ATHOS_ORCAMENTO_ID_TERMINAL"),
    idFormaPagamento: inteiroPositivoEnv(env, "ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO", ID_FORMA_PAGAMENTO_PADRAO),
  };
}

/** "[IA]" [+ " ref:<ref>"] [+ " " + texto sanitizado]. O prefixo entra DEPOIS da sanitizacao (os colchetes seriam removidos). */
export function montarObsOrcamento(obs: string | undefined, ref?: string): string {
  let resultado = "[IA]";
  const refLimpa = ref ? sanitizarTextoAthos(ref, 32).replace(/[^A-Za-z0-9]/g, "") : "";
  if (refLimpa) resultado += ` ref:${refLimpa}`;
  const texto = sanitizarTextoAthos(obs ?? "", OBS_MAX_USUARIO);
  if (texto) resultado += ` ${texto}`;
  return resultado;
}

function converterErroCalc(err: CalcOrcamentoError): OrcamentoAthosError {
  return new OrcamentoAthosError(err.codigo, err.message, 422, err.indice !== undefined ? { sequenciaitem: err.indice + 1 } : undefined);
}

interface LinhaProduto {
  idproduto: number;
  descricaoproduto: string | null;
  statusproduto: boolean | null;
  vende: boolean | null;
  preco: string | null;
  permitefracionar: boolean | null;
  valorcustounitario: string | null;
}

interface ItemValidado {
  sequenciaitem: number;
  idproduto: number;
  descricao: string;
  qMilli: bigint;
  /** Preco informado pelo chamador (milesimos), se houver. */
  valorUnitarioMilli?: bigint;
  /** Desconto explicito da linha (centavos). */
  descontoItemC: bigint;
  /** Preco de venda lido do Athos (milesimos). */
  precoMilli: bigint;
  custo: string;
}

/** conf_vendas.permitedescontode em milesimos de percentual; ausente/NULL/ilegivel = 100% (sem limite). */
function limitePercentualMilli(bruto: string | number | null | undefined): bigint {
  if (bruto === null || bruto === undefined) return 100_000n;
  try {
    return paraMilli(typeof bruto === "number" ? bruto : String(bruto));
  } catch {
    return 100_000n;
  }
}

@Injectable()
export class AthosOrcamentoService implements OnModuleDestroy {
  private readonly logger = new Logger(AthosOrcamentoService.name);
  private _pool: Pool | null = null;

  private getDbConfig() {
    const host = process.env.ATHOS_PG_HOST;
    const database = process.env.ATHOS_PG_DB;
    const user = process.env.ATHOS_PG_USER;
    const password = process.env.ATHOS_PG_PASS;
    const port = Number(process.env.ATHOS_PG_PORT ?? "5432");

    if (!host || !database || !user || !password) {
      throw new OrcamentoAthosError(
        "CONFIG_INVALIDA",
        "Configuracao Athos ausente. Defina ATHOS_PG_HOST, ATHOS_PG_DB, ATHOS_PG_USER e ATHOS_PG_PASS.",
        500,
      );
    }
    return { host, database, user, password, port };
  }

  /**
   * Trava de seguranca (D-03): em NODE_ENV=test so aceita host local/mock, de modo que um teste
   * mal configurado nunca alcance o Athos real. Roda antes de qualquer conexao.
   */
  private assertHostPermitido(): void {
    if (process.env.NODE_ENV !== "test") return;
    const host = (process.env.ATHOS_PG_HOST ?? "").trim().toLowerCase();
    if (!HOSTS_PERMITIDOS_EM_TESTE.includes(host)) {
      throw new OrcamentoAthosError(
        "AMBIENTE_TESTE_HOST_REAL",
        "Teste bloqueado: ATHOS_PG_HOST nao e local nem mock. Testes nunca devem alcancar o Athos real.",
        500,
      );
    }
  }

  /** Encerra o pool ao fechar a aplicacao (evita handle aberto em testes e no shutdown). */
  async onModuleDestroy(): Promise<void> {
    if (this._pool) {
      const pool = this._pool;
      this._pool = null;
      await pool.end().catch(() => undefined);
    }
  }

  private getPool(): Pool {
    if (!this._pool) {
      const cfg = this.getDbConfig();
      this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on("error", (err: Error) => this.logger.error(`Athos pool error: ${err.message}`));
    }
    return this._pool;
  }

  private mapearErroPg(err: unknown): OrcamentoAthosError {
    if (err instanceof OrcamentoAthosError) return err;
    if (err instanceof CalcOrcamentoError) return converterErroCalc(err);
    const code = (err as { code?: string })?.code;
    switch (code) {
      case "42501":
        return new OrcamentoAthosError(
          "PERMISSAO_NEGADA",
          "Permissao de escrita ausente no Athos para criar orcamento. Solicite ao DBA o GRANT: " +
            "GRANT INSERT ON TABLE orcamento, orcamento_item, orcamento_forma_pagamento TO <usuario>; " +
            "GRANT DELETE ON TABLE orcamento_forma_pagamento TO <usuario>; " +
            "GRANT USAGE ON SEQUENCE orcamento_idorcamento_seq, orcamento_senhabalcao_seq, " +
            "orcamento_item_iditemorcamento_seq, orcamento_forma_pagamento_idformapagamentoorcamento_seq TO <usuario>.",
          500,
        );
      case "22003":
        return new OrcamentoAthosError(
          "VALOR_FORA_DO_LIMITE",
          "Valor excede o limite aceito pelo Athos (maximo 999999.999 por linha).",
          422,
        );
      case "57014":
        return new OrcamentoAthosError(
          "ATHOS_INDISPONIVEL",
          "O Athos demorou demais para responder (tempo limite). Nenhum orcamento foi criado; tente novamente.",
          503,
        );
      default:
        return new OrcamentoAthosError("ERRO_BANCO", "Erro de banco ao criar o orcamento no Athos.", 500);
    }
  }

  async criarOrcamento(input: CriarOrcamentoInput, opts?: { ref?: string }): Promise<CriarOrcamentoResultado> {
    // ---- (a)/(b) escrita habilitada? Antes de qualquer conexao (D-03). Simulacao nao grava e dispensa a flag.
    const simular = input?.simular === true;
    if (!simular && process.env.ATHOS_ORCAMENTO_ESCRITA !== "true") {
      throw new OrcamentoAthosError(
        "ESCRITA_DESABILITADA",
        "A criacao de orcamentos no Athos esta desabilitada neste ambiente (ATHOS_ORCAMENTO_ESCRITA diferente de true). Nada foi gravado.",
        503,
      );
    }
    const cfg = resolverConfigOrcamentoAthos(process.env);

    // ---- (c) validacao pura da entrada (nenhuma conexao aberta) ---------------
    const itens = this.validarEntrada(input);
    const descontoTotalC = this.validarDescontoTotal(input.descontoTotalRS);
    const idsProdutos = [...new Set(itens.map((i) => i.idproduto))];

    // ---- (d)/(e) trava de host e conexao -------------------------------------
    this.assertHostPermitido();
    const pool = this.getPool();
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (err) {
      this.logger.error(`Orcamento Athos: falha ao conectar (${(err as { code?: string })?.code ?? "sem_codigo"}).`);
      throw new OrcamentoAthosError("ATHOS_INDISPONIVEL", "Nao foi possivel conectar ao Athos. Nada foi gravado.", 503);
    }

    try {
      // ---- (f) leituras (nenhuma escrita ate aqui) ----------------------------
      await client.query("BEGIN");
      if (simular) await client.query(SQL_SOMENTE_LEITURA);
      await client.query(SQL_STATEMENT_TIMEOUT);

      const conf = await client.query<{
        funcionario_ok: boolean;
        vendedor_ok: boolean;
        terminal_ok: boolean;
        pix_ok: boolean;
        cliente_ok: boolean;
        permitedescontode: string | null;
      }>(SQL_LER_CONFIG, [cfg.idFuncionario, cfg.idVendedor, cfg.idTerminal, cfg.idFormaPagamento, input.idcliente ?? null]);
      const prods = await client.query<LinhaProduto>(SQL_LER_PRODUTOS, [idsProdutos]);

      // ---- (g) validacoes, todas antes de qualquer escrita --------------------
      const c = conf.rows[0];
      if (!c?.funcionario_ok) {
        throw new OrcamentoAthosError(
          "CONFIG_INVALIDA",
          `ATHOS_ORCAMENTO_ID_FUNCIONARIO (${cfg.idFuncionario}) nao existe em funcionario_usuario no Athos.`,
          500,
        );
      }
      if (!c.vendedor_ok) {
        throw new OrcamentoAthosError(
          "CONFIG_INVALIDA",
          `ATHOS_ORCAMENTO_ID_VENDEDOR (${cfg.idVendedor}) nao existe em funcionario no Athos.`,
          500,
        );
      }
      if (!c.terminal_ok) {
        throw new OrcamentoAthosError(
          "CONFIG_INVALIDA",
          `ATHOS_ORCAMENTO_ID_TERMINAL (${cfg.idTerminal}) nao existe em terminal no Athos.`,
          500,
        );
      }
      if (!c.pix_ok) {
        throw new OrcamentoAthosError(
          "FORMA_PAGAMENTO_INVALIDA",
          `ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO (${cfg.idFormaPagamento}) nao e uma forma de pagamento ativa de tipo dinheiro/PIX no Athos.`,
          500,
        );
      }

      if (input.idcliente !== undefined && input.idcliente !== null && !c.cliente_ok) {
        throw new OrcamentoAthosError(
          "CLIENTE_INEXISTENTE",
          `Cliente ${input.idcliente} nao existe no Athos. Busque o idcliente correto ou crie o orcamento sem cliente.`,
          422,
          { idcliente: input.idcliente },
        );
      }

      const porId = new Map<number, LinhaProduto>();
      for (const p of prods.rows) porId.set(Number(p.idproduto), p);

      const inexistentes = idsProdutos.filter((id) => !porId.has(id));
      if (inexistentes.length > 0) {
        throw new OrcamentoAthosError(
          "PRODUTO_INEXISTENTE",
          `Produto(s) inexistente(s) no Athos: ${inexistentes.join(", ")}. Busque o idproduto correto antes de criar o orcamento.`,
          422,
          { idsInexistentes: inexistentes },
        );
      }

      // ---- (h) validacao por produto e calculo em inteiros ----------------------
      for (const item of itens) {
        const p = porId.get(item.idproduto) as LinhaProduto;
        const det = { idproduto: item.idproduto, sequenciaitem: item.sequenciaitem };
        if (p.statusproduto !== true || p.vende === false) {
          throw new OrcamentoAthosError(
            "PRODUTO_INATIVO",
            `Produto ${item.idproduto} (item ${item.sequenciaitem}) esta inativo ou nao e vendido. Escolha outro produto.`,
            422,
            det,
          );
        }
        let precoMilli = 0n;
        try {
          precoMilli = p.preco === null || p.preco === undefined ? 0n : paraMilli(p.preco);
        } catch {
          precoMilli = 0n;
        }
        if (precoMilli <= 0n) {
          throw new OrcamentoAthosError(
            "PRECO_INDISPONIVEL",
            `Produto ${item.idproduto} (item ${item.sequenciaitem}) esta sem preco de venda no Athos.`,
            422,
            det,
          );
        }
        if (item.qMilli % 1000n !== 0n && p.permitefracionar === false) {
          throw new OrcamentoAthosError(
            "QUANTIDADE_FRACIONADA",
            `Produto ${item.idproduto} (item ${item.sequenciaitem}) nao permite quantidade fracionada (${milliParaTexto(item.qMilli)}). Use quantidade inteira.`,
            422,
            det,
          );
        }
        item.descricao = String(p.descricaoproduto ?? "");
        item.precoMilli = precoMilli;
        item.custo = p.valorcustounitario === null || p.valorcustounitario === undefined ? "0" : String(p.valorcustounitario);
      }

      // descontomaximo do produto NAO e consultado (D-04): so o limite global de conf_vendas vale.
      const entradaCalc: LinhaCalcEntrada[] = itens.map((i) => ({
        qMilli: i.qMilli,
        precoMilli: i.precoMilli,
        valorUnitarioMilli: i.valorUnitarioMilli,
        descontoItemC: i.descontoItemC,
      }));
      let totais: TotaisOrcamento;
      try {
        totais = calcularOrcamento(entradaCalc, descontoTotalC, limitePercentualMilli(c.permitedescontode));
      } catch (err) {
        if (err instanceof CalcOrcamentoError) throw converterErroCalc(err);
        throw err;
      }

      const brutoTxt = centavosParaTexto(totais.brutoC);
      const descontoTxt = centavosParaTexto(totais.descontoC);
      const percentualTxt = percentualTexto(totais.percentualMilli);
      const liquidoTxt = centavosParaTexto(totais.liquidoC);

      const montarResultado = (idorcamento: number | null, senhabalcao: number | null): CriarOrcamentoResultado => ({
        simulado: simular,
        idorcamento,
        senhabalcao,
        valorBruto: brutoTxt,
        descontoRS: descontoTxt,
        descontoPercentual: percentualTxt,
        valorLiquido: liquidoTxt,
        itens: itens.map((i, k) => ({
          sequenciaitem: i.sequenciaitem,
          idproduto: i.idproduto,
          descricao: i.descricao,
          quantidade: milliParaTexto(i.qMilli),
          valorUnitario: milliParaTexto(totais.linhas[k].valorItemMilli),
          valorTotal: centavosParaTexto(totais.linhas[k].totalC),
          desconto: centavosParaTexto(totais.linhas[k].descontoC),
          valorFinal: centavosParaTexto(totais.linhas[k].finalC),
        })),
        pagamento: { idformapagamento: cfg.idFormaPagamento, idcondicaopagamento: 0, valor: liquidoTxt },
      });

      // ---- (i) PONTO UNICO DE DECISAO: a simulacao termina aqui, antes de qualquer INSERT ----
      if (simular) {
        await client.query("ROLLBACK");
        return montarResultado(null, null);
      }

      // ---- (j) escritas na ordem exata -----------------------------------------
      const cab = await client.query<{ idorcamento: number; senhabalcao: number }>(SQL_INSERIR_ORCAMENTO, [
        descontoTxt,
        cfg.idVendedor,
        input.idcliente ?? null,
        cfg.idFuncionario,
        cfg.idTerminal,
        brutoTxt,
        percentualTxt,
        montarObsOrcamento(input.obs, opts?.ref),
      ]);
      const idorcamento = Number(cab.rows[0].idorcamento);
      const senhabalcao = Number(cab.rows[0].senhabalcao);

      for (const [k, item] of itens.entries()) {
        const linha = totais.linhas[k];
        await client.query(SQL_INSERIR_ITEM, [
          idorcamento,
          item.sequenciaitem,
          item.idproduto,
          milliParaTexto(item.qMilli),
          milliParaTexto(linha.valorItemMilli),
          item.custo,
          centavosParaTexto(linha.descontoC),
          centavosParaTexto(linha.finalC),
        ]);
      }

      await client.query(SQL_LIMPAR_PAGAMENTO, [idorcamento]);
      await client.query(SQL_INSERIR_PAGAMENTO, [idorcamento, cfg.idFormaPagamento, liquidoTxt, liquidoTxt]);

      // ---- (k) commit e resposta -----------------------------------------------
      await client.query("COMMIT");
      this.logger.log(`Orcamento Athos criado: idorcamento=${idorcamento} itens=${itens.length}`);
      return montarResultado(idorcamento, senhabalcao);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* conexao ja encerrada: nada a desfazer */
      }
      const erro = this.mapearErroPg(err);
      this.logger.warn(`Orcamento Athos nao criado: codigo=${erro.codigo}`);
      throw erro;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Leituras para a IA (44-04). Nao dependem de ATHOS_ORCAMENTO_ESCRITA nem das envs de autor.
  // -------------------------------------------------------------------------

  private mapearErroLeitura(err: unknown): OrcamentoAthosError {
    if (err instanceof OrcamentoAthosError) return err;
    const code = (err as { code?: string })?.code;
    if (code === "42501") {
      return new OrcamentoAthosError(
        "PERMISSAO_NEGADA",
        "Permissao de leitura ausente no Athos para consultar produtos ou orcamentos. Solicite ao DBA o GRANT SELECT nas tabelas consultadas.",
        500,
      );
    }
    if (code === "57014") {
      return new OrcamentoAthosError(
        "ATHOS_INDISPONIVEL",
        "O Athos demorou demais para responder (tempo limite). Tente novamente com uma busca mais especifica.",
        503,
      );
    }
    return new OrcamentoAthosError("ERRO_BANCO", "Erro de banco ao consultar o Athos.", 500);
  }

  /**
   * Executa leituras numa transacao READ ONLY com statement_timeout (o proprio banco recusa qualquer escrita)
   * e encerra com ROLLBACK. Trava de host antes de qualquer conexao.
   */
  private async lerSomenteLeitura<T>(leitura: (client: PoolClient) => Promise<T>): Promise<T> {
    this.assertHostPermitido();
    const pool = this.getPool();
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (err) {
      this.logger.error(`Athos leitura: falha ao conectar (${(err as { code?: string })?.code ?? "sem_codigo"}).`);
      throw new OrcamentoAthosError("ATHOS_INDISPONIVEL", "Nao foi possivel conectar ao Athos.", 503);
    }
    try {
      await client.query("BEGIN");
      await client.query(SQL_SOMENTE_LEITURA);
      await client.query(SQL_STATEMENT_TIMEOUT);
      const resultado = await leitura(client);
      await client.query("ROLLBACK");
      return resultado;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* conexao ja encerrada: nada a desfazer */
      }
      const erro = this.mapearErroLeitura(err);
      if (erro.codigo !== "ORCAMENTO_INEXISTENTE") this.logger.warn(`Athos leitura falhou: codigo=${erro.codigo}`);
      throw erro;
    } finally {
      client.release();
    }
  }

  /** Busca produtos vendaveis por descricao/referencia/codigo de barras (e idproduto exato se q for numerico). */
  async buscarProdutos(q: string, limit?: number): Promise<ProdutoOrcamentoResultado[]> {
    const texto = String(q ?? "").trim();
    const tokens = texto.split(/\s+/).filter((t) => t.length > 0).slice(0, BUSCA_MAX_TOKENS);
    if (tokens.length === 0) {
      throw new OrcamentoAthosError("VALOR_INVALIDO", "Informe o texto de busca (q).", 400);
    }
    const lim =
      typeof limit === "number" && Number.isFinite(limit) && Math.floor(limit) >= 1
        ? Math.min(Math.floor(limit), BUSCA_LIMITE_MAX)
        : BUSCA_LIMITE_PADRAO;

    const params: unknown[] = [];
    const blocos = tokens.map((token) => {
      params.push(`%${escaparLike(token)}%`);
      const n = `$${params.length}::text`;
      return `(p.descricaoproduto ILIKE ${n} OR p.referencia ILIKE ${n} OR p.codigobarra1 ILIKE ${n})`;
    });

    // idproduto exato: so quando q e inteiro e cabe em int4 (acima disso o pg falharia com "out of range").
    let compIdProduto = "";
    if (/^\d+$/.test(texto) && Number(texto) <= MAX_INT4) {
      params.push(Number(texto));
      compIdProduto = `p.idproduto = $${params.length}`;
    }
    params.push(texto);
    const exato = `$${params.length}::text`;
    params.push(lim);

    const sql = `${SQL_BUSCA_PRODUTOS_SELECT}
   AND ( (${blocos.join("\n         AND ")})${compIdProduto ? `\n         OR ${compIdProduto}` : ""} )
 ORDER BY CASE WHEN (p.codigobarra1 = ${exato} OR p.referencia = ${exato}${compIdProduto ? ` OR ${compIdProduto}` : ""}) THEN 0 ELSE 1 END,
          p.descricaoproduto
 LIMIT $${params.length}`;

    const linhas = await this.lerSomenteLeitura(async (client) => {
      const r = await client.query<Record<string, unknown>>(sql, params);
      return r.rows;
    });

    return linhas.map((l) => ({
      idproduto: Number(l.idproduto),
      descricao: String(l.descricaoproduto ?? ""),
      marca: textoOuNull(l.marca),
      referencia: textoOuNull(l.referencia),
      codigoBarra: textoOuNull(l.codigobarra1),
      preco: textoOuNull(l.preco),
      emPromocao: l.empromocao === true,
      estoqueLoja: textoNumerico(l.estoqueloja, "0"),
      estoqueDeposito: textoNumerico(l.estoquedeposito, "0"),
      permiteFracionar: l.permitefracionar !== false,
      descontoMaximo: textoNumerico(l.descontomaximo, "0"),
      unidade: textoOuNull(l.unidade),
    }));
  }

  /** Le cabecalho, itens e pagamentos de um orcamento do Athos. Inexistente = 404 ORCAMENTO_INEXISTENTE. */
  async buscarOrcamento(idorcamento: number): Promise<OrcamentoAthosDetalhe> {
    const naoExiste = () =>
      new OrcamentoAthosError("ORCAMENTO_INEXISTENTE", `Orcamento ${String(idorcamento)} nao existe no Athos.`, 404, {
        idorcamento,
      });
    if (!Number.isSafeInteger(idorcamento) || idorcamento < 1 || idorcamento > MAX_INT4) throw naoExiste();

    const { cab, itens, pags } = await this.lerSomenteLeitura(async (client) => {
      const c = await client.query<Record<string, unknown>>(SQL_LER_ORCAMENTO, [idorcamento]);
      if (c.rows.length === 0) throw naoExiste();
      const i = await client.query<Record<string, unknown>>(SQL_LER_ITENS, [idorcamento]);
      const p = await client.query<Record<string, unknown>>(SQL_LER_PAGAMENTOS, [idorcamento]);
      return { cab: c.rows[0], itens: i.rows, pags: p.rows };
    });

    const valor = textoNumerico(cab.valor, "0.000");
    const descontoRS = textoNumerico(cab.descontors, "0.000");
    let valorLiquido: string;
    try {
      valorLiquido = milliParaTexto(paraMilli(valor) - paraMilli(descontoRS));
    } catch {
      // Valor legado fora do formato (mais de 3 casas/negativo): nao inventar numero.
      valorLiquido = valor;
    }
    const status = cab.statusorcamento === null || cab.statusorcamento === undefined ? "aberto" : cab.statusorcamento === true ? "convertido" : "outro";
    const idOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    const boolOuNull = (v: unknown): boolean | null => (v === null || v === undefined ? null : v === true);

    return {
      idorcamento: Number(cab.idorcamento),
      senhabalcao: Number(cab.senhabalcao),
      data: String(cab.data ?? ""),
      hora: String(cab.hora ?? ""),
      status,
      cancelado: boolOuNull(cab.cancelado),
      statusimpressao: boolOuNull(cab.statusimpressao),
      idcliente: idOuNull(cab.idcliente),
      idvendedor: idOuNull(cab.idvendedor),
      idfuncionariousuario: idOuNull(cab.idfuncionariousuario),
      idterminal: idOuNull(cab.idterminal),
      obs: textoOuNull(cab.obs),
      valorBruto: valor,
      descontoRS,
      descontoPercentual: textoNumerico(cab.desconto, "0.000"),
      valorLiquido,
      itens: itens.map((i) => ({
        sequenciaitem: Number(i.sequenciaitem),
        idproduto: Number(i.idproduto),
        descricao: String(i.descricaoproduto ?? ""),
        quantidade: textoNumerico(i.quantidadeitem, "0"),
        valorUnitario: textoNumerico(i.valoritem, "0"),
        desconto: textoNumerico(i.orcamentodesconto, "0"),
        valorFinal: textoNumerico(i.orcamentovalorfinalitem, "0"),
      })),
      pagamentos: pags.map((p) => ({
        idformapagamento: Number(p.idformapagamento),
        descricao: textoOuNull(p.descricao),
        valor: textoNumerico(p.valor, "0"),
        valorRecebido: textoNumerico(p.valorrecebido, "0"),
        idcondicaopagamento: idOuNull(p.idcondicaopagamento),
      })),
    };
  }

  /** Desconto global em R$ (centavos). Ausente = 0; mais de 2 casas ou negativo = VALOR_INVALIDO. */
  private validarDescontoTotal(valor: number | undefined): bigint {
    if (valor === undefined || valor === null) return 0n;
    try {
      return paraCentavos(valor);
    } catch (err) {
      if (err instanceof CalcOrcamentoError) {
        throw new OrcamentoAthosError("VALOR_INVALIDO", "descontoTotalRS invalido: use valor nao negativo com ate 2 casas decimais.", 422);
      }
      throw err;
    }
  }

  private validarEntrada(input: CriarOrcamentoInput): ItemValidado[] {
    const lista = input?.itens;
    if (!Array.isArray(lista) || lista.length === 0 || lista.length > MAX_ITENS) {
      throw new OrcamentoAthosError(
        "VALOR_INVALIDO",
        `Informe entre 1 e ${MAX_ITENS} itens no orcamento.`,
        422,
      );
    }
    return lista.map((it, idx) => {
      const sequenciaitem = idx + 1;
      const det = { sequenciaitem };
      if (!Number.isSafeInteger(it?.idproduto) || it.idproduto < 1 || it.idproduto > MAX_INT4) {
        throw new OrcamentoAthosError("VALOR_INVALIDO", `idproduto invalido no item ${sequenciaitem}.`, 422, det);
      }
      let qMilli: bigint;
      try {
        qMilli = paraMilli(it.quantidade);
      } catch (err) {
        if (err instanceof CalcOrcamentoError) {
          throw new OrcamentoAthosError(
            "VALOR_INVALIDO",
            `Quantidade invalida no item ${sequenciaitem}: use ate 3 casas decimais.`,
            422,
            { ...det, idproduto: it.idproduto },
          );
        }
        throw err;
      }
      if (qMilli < 1n || qMilli > QUANTIDADE_MAX_MILLI) {
        throw new OrcamentoAthosError(
          "VALOR_INVALIDO",
          `Quantidade do item ${sequenciaitem} fora do intervalo 0.001 a 10000.`,
          422,
          { ...det, idproduto: it.idproduto },
        );
      }
      let valorUnitarioMilli: bigint | undefined;
      let descontoItemC = 0n;
      try {
        if (it.valorUnitario !== undefined && it.valorUnitario !== null) {
          valorUnitarioMilli = paraMilli(it.valorUnitario);
          if (valorUnitarioMilli < 1n) throw new CalcOrcamentoError("VALOR_INVALIDO", "valorUnitario zerado.");
        }
        if (it.descontoRS !== undefined && it.descontoRS !== null) descontoItemC = paraCentavos(it.descontoRS);
      } catch (err) {
        if (err instanceof CalcOrcamentoError) {
          throw new OrcamentoAthosError(
            "VALOR_INVALIDO",
            `valorUnitario/descontoRS invalido no item ${sequenciaitem}: valorUnitario > 0 com ate 3 casas e descontoRS >= 0 com ate 2 casas.`,
            422,
            { ...det, idproduto: it.idproduto },
          );
        }
        throw err;
      }
      return { sequenciaitem, idproduto: it.idproduto, descricao: "", qMilli, valorUnitarioMilli, descontoItemC, precoMilli: 0n, custo: "0" };
    });
  }
}
