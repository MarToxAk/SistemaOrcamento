import { HttpException, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Pool, PoolClient } from "pg";

import {
  CalcOrcamentoError,
  LIMITE_LINHA_CENTAVOS,
  centavosParaTexto,
  linhaCentavos,
  milliParaTexto,
  paraMilli,
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

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

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
  precoMilli: bigint;
  totalC: bigint;
  custo: string;
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
    this.rejeitarCamposNaoSuportados(input);
    const itens = this.validarEntrada(input);
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

      // ---- (h) calculo em inteiros --------------------------------------------
      let brutoC = 0n;
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
        const totalC = linhaCentavos(item.qMilli, precoMilli);
        if (totalC <= 0n || totalC >= LIMITE_LINHA_CENTAVOS) {
          throw new OrcamentoAthosError(
            "VALOR_FORA_DO_LIMITE",
            `Total do item ${item.sequenciaitem} (${centavosParaTexto(totalC)}) fora do limite aceito (maior que zero e menor que 1000000.00).`,
            422,
            det,
          );
        }
        item.descricao = String(p.descricaoproduto ?? "");
        item.precoMilli = precoMilli;
        item.totalC = totalC;
        item.custo = p.valorcustounitario === null || p.valorcustounitario === undefined ? "0" : String(p.valorcustounitario);
        brutoC += totalC;
      }

      // Sem desconto nesta etapa: liquido = bruto; descontors "0.00"; desconto "0.000".
      const liquidoC = brutoC;
      const brutoTxt = centavosParaTexto(brutoC);
      const liquidoTxt = centavosParaTexto(liquidoC);

      const montarResultado = (idorcamento: number | null, senhabalcao: number | null): CriarOrcamentoResultado => ({
        simulado: simular,
        idorcamento,
        senhabalcao,
        valorBruto: brutoTxt,
        descontoRS: "0.00",
        descontoPercentual: "0.000",
        valorLiquido: liquidoTxt,
        itens: itens.map((i) => ({
          sequenciaitem: i.sequenciaitem,
          idproduto: i.idproduto,
          descricao: i.descricao,
          quantidade: milliParaTexto(i.qMilli),
          valorUnitario: milliParaTexto(i.precoMilli),
          valorTotal: centavosParaTexto(i.totalC),
          desconto: "0.00",
          valorFinal: centavosParaTexto(i.totalC),
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
        "0.00",
        cfg.idVendedor,
        input.idcliente ?? null,
        cfg.idFuncionario,
        cfg.idTerminal,
        brutoTxt,
        "0.000",
        montarObsOrcamento(input.obs, opts?.ref),
      ]);
      const idorcamento = Number(cab.rows[0].idorcamento);
      const senhabalcao = Number(cab.rows[0].senhabalcao);

      for (const item of itens) {
        await client.query(SQL_INSERIR_ITEM, [
          idorcamento,
          item.sequenciaitem,
          item.idproduto,
          milliParaTexto(item.qMilli),
          milliParaTexto(item.precoMilli),
          item.custo,
          "0.00",
          centavosParaTexto(item.totalC),
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

  /**
   * Campos de desconto e preco informado ainda nao existem: o DTO ja os recusa com 400; aqui o servico tambem recusa, para nunca aceitar um campo que ignoraria.
   */
  private rejeitarCamposNaoSuportados(input: CriarOrcamentoInput): void {
    const extras: string[] = [];
    if (input.descontoTotalRS !== undefined) extras.push("descontoTotalRS");
    for (const item of input.itens ?? []) {
      if (item.valorUnitario !== undefined && !extras.includes("itens[].valorUnitario")) extras.push("itens[].valorUnitario");
      if (item.descontoRS !== undefined && !extras.includes("itens[].descontoRS")) extras.push("itens[].descontoRS");
    }
    if (extras.length > 0) {
      throw new OrcamentoAthosError(
        "VALOR_INVALIDO",
        `Campo(s) ainda nao suportado(s) nesta versao: ${extras.join(", ")}.`,
        422,
        { campos: extras },
      );
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
      return { sequenciaitem, idproduto: it.idproduto, descricao: "", qMilli, precoMilli: 0n, totalC: 0n, custo: "0" };
    });
  }
}
