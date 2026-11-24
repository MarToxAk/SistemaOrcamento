import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Pool, PoolClient } from "pg";

import {
  FORMA_PAGAMENTO_AVISTA,
  montarVenda,
  type FiscalItem,
  type ItemVendaEntrada,
  type VendaMontadaCompleta,
  VendaAthosError,
} from "./athos-venda.util";

/**
 * Fase 53: lanca no Athos a venda de um orcamento, na ordem observada nas capturas do PDV
 * (.planning/phases/53-*\/53-CAPTURAS.md), em UMA transacao.
 *
 * Seguranca (CONTEXT da fase):
 * - Desligado por padrao: so grava com `ATHOS_VENDA_AUTOMATICA=true` E `simular: false`.
 * - `simular: true` abre `BEGIN` + `SET TRANSACTION READ ONLY`: nada e escrito.
 * - Em NODE_ENV=test so aceita host local/mock; nunca alcanca o Athos de producao em testes.
 * - NAO emite nem cancela NFC-e: so marca `sfnfce = 1` para o emissor do Athos.
 * - NAO replica os `update orcamento ... in (110540769)` / `(5682)` das capturas (ids sem explicacao).
 * - `senhapdv` usa a mesma expressao do PDV; o `update senha_pdv` NAO e feito ate validar no athos-teste.
 */

const HOSTS_PERMITIDOS_EM_TESTE = ["localhost", "127.0.0.1", "athos-mock.invalid"];

export interface LancarVendaInput {
  idorcamento: number;
  /** Usuario do PDV (`idvendedor` e `idfuncionariousuario`). */
  idvendedor: number;
  idterminal: number;
  /** Caixa aberto informado pelo balcao; confirmado como `status = 'ABE'` antes de gravar. */
  idcaixaMovimento: number;
  /** Desconto total do cupom em R$ (padrao 0). */
  descontoCupom?: number | string;
  idformapagamento?: number;
  /** true = nao escreve nada. */
  simular?: boolean;
  /** YYYY-MM-DD, injetavel nos testes. */
  hoje?: string;
}

export interface LancarVendaResultado {
  simulado: boolean;
  /** Presente so quando gravou. */
  idvenda?: number;
  idformapagamentovenda?: number;
  valores: VendaMontadaCompleta;
  /** Rotulos dos comandos executados (ou que seriam executados, na simulacao), em ordem. */
  comandos: string[];
}

interface LinhaOrcamento {
  idorcamento: number;
  statusorcamento: boolean | null;
  cancelado: boolean | null;
}

interface LinhaItem {
  sequenciaitem: number;
  idproduto: number;
  quantidadeitem: string;
  valoritem: string;
  orcamentodesconto: string | null;
  statusproduto: boolean | null;
  vende: boolean | null;
  controlaestoque: boolean | null;
  custo: string | null;
  origem: string | number | null;
  tributacao: string | null;
  csosn: string | null;
  cfop: string | null;
  cest: string | null;
  icms: string | null;
}

// ---------------------------------------------------------------------------
// SQL (parametrizado). Colunas da venda/venda_item seguem a captura do PDV (53-CAPTURAS.md).
// ---------------------------------------------------------------------------
const SQL_SOMENTE_LEITURA = "SET TRANSACTION READ ONLY";

const SQL_LER_ORCAMENTO = `SELECT idorcamento, statusorcamento, cancelado FROM orcamento WHERE idorcamento = $1`;

const SQL_LER_RELACAO = `SELECT idvenda FROM relacao_orcamento_venda WHERE idorcamento = $1 ORDER BY idrelataocaorcamentovenda LIMIT 1`;

const SQL_LER_CAIXA = `SELECT idcaixamovimento FROM caixa_movimento WHERE idcaixamovimento = $1 AND status = 'ABE'`;

const SQL_LER_ITENS = `SELECT i.sequenciaitem, i.idproduto, i.quantidadeitem, i.valoritem, i.orcamentodesconto,
       p.statusproduto, COALESCE(p.vendeproduto, true) AS vende, COALESCE(p.controlaestoque, false) AS controlaestoque,
       COALESCE(p.custorealunitario, 0) AS custo, p.origem, p.tributacao, p.codigocsosn AS csosn,
       p.idcfopsaida AS cfop, p.cest, p.icms
  FROM orcamento_item i JOIN produto p ON p.idproduto = i.idproduto
 WHERE i.idorcamento = $1 ORDER BY i.sequenciaitem`;

const SQL_LER_LIMITE_DESCONTO = `SELECT permitedescontode FROM conf_vendas LIMIT 1`;

const SQL_INSERIR_VENDA = `INSERT INTO venda(descontoRS, idvendedor, idcaixaMovimento, idfuncionariousuario, idorcamento,
  idcliente, idterminal, coo, ccf, data, hora, valor, desconto, troco, numeroordem, cancelada,
  NumeroSerieECF, CRZ, CRO, ValorTotalizadorGeral, obs, observacao, idTransportadora,
  idClienteContato, cpfcnpj, IE, quantidadepessoa, senhapdv, cpfcnpjnomecliente, idcentrodecusto,
  valoracrescimo, transacaodyndo, idMesa, idComanda, idEnderecoCliente, transacaoalbert,
  codigocanalvenda, descricaocanalvenda, deliveryfiscal)
VALUES($1, $2, $3, $2, $4, NULL, $5, '', '', current_date, current_time, $6, $7, 0, '', FALSE, '', '', '', 0, '', '',
  NULL, NULL, '', '', 0, (select (senha+1) from senha_pdv limit 1), '', NULL, 0, FALSE, '', '', 0, FALSE,
  1, 'VENDA NO LOCAL', FALSE)
RETURNING idvenda`;

const SQL_INSERIR_ITEM = `INSERT INTO venda_item(idvenda, pesoBruto, pesoLiquido, idproduto, quantidadeitem, valorcustoitem,
  valorvendaitem, cancelada, valorcomissao, AliquotaECF, valordesconto, vendaDesconto,
  vendaValorFinalItem, sequenciaitem, idfuncionariousuario, observacao, aplicacaoOrigem, valortaxa,
  origem, tributacao, csosn, cfop, cest, impostoAproximadoEST, impostoAproximadoMun,
  impostoAproximadoNAC, impostoAproximadoChave, bscanntech, bscanntechcancelado, bscanntechenviado,
  promocaostatus, utilizareducaoicms, desoneradoaliquota, desoneradomotivo, codigobeneficiofiscal,
  depositoloja, atacadostatus1, atacadostatus2)
VALUES($1, 0, 0, $2, $3, $4, $5, FALSE, 0, $6, $7, $8, $9, $10, $11, '', '', 0, $12, $13, $14, $15, $16,
  0, 0, 0, '', FALSE, FALSE, FALSE, FALSE, FALSE, 0, 0, '', FALSE, FALSE, FALSE)`;

const SQL_INSERIR_PAGAMENTO = `INSERT INTO forma_pagamento_venda(idvenda, idformapagamento, valor, valorRecebido, taxajuros,
  valorjurosdia, valorjurosparcela, idcondicaopagamento, tefnumeroautorizacao, tefmaskedpan, transaction_id)
VALUES($1, $2, $3, $4, 0, 0, 0, $5, '', '', '') RETURNING idformapagamentovenda`;

const SQL_INSERIR_RECEBIMENTO_CARTAO = `INSERT INTO recebimento_cartao(idformapagamentovenda, valorparcelacartao, datavencimento, status, taxacobrada)
VALUES($1, $2, $3::date, $4, $5)`;

/** Baixa de estoque RELATIVA, so para produto que controla estoque (o PDV grava o saldo absoluto; aqui nao). */
const SQL_BAIXAR_ESTOQUE = `UPDATE produto SET estoqueloja = COALESCE(estoqueloja, 0) - $2 WHERE idproduto = $1 AND controlaestoque = true`;

const SQL_DATA_ULTIMA_VENDA = `UPDATE produto SET dataultimavenda = current_date WHERE idproduto = $1`;

const SQL_MARCAR_ORCAMENTO = `UPDATE orcamento SET statusorcamento = true WHERE idorcamento = $1`;

const SQL_INSERIR_RELACAO = `INSERT INTO relacao_orcamento_venda(idOrcamento, idVenda) VALUES($1, $2)`;

/** `sfnfce = 1` = pendente de NFC-e; o emissor do Athos le a venda e emite. */
const SQL_MARCAR_NFCE = `UPDATE venda SET sfSAT = NULL, sfNFCe = 1 WHERE idVenda = $1 AND idTerminal = $2`;

function inteiroPositivo(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function textoOuVazio(v: string | number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

@Injectable()
export class AthosVendaService implements OnModuleDestroy {
  private readonly logger = new Logger(AthosVendaService.name);
  private _pool: Pool | null = null;

  async onModuleDestroy(): Promise<void> {
    if (this._pool) {
      const pool = this._pool;
      this._pool = null;
      await pool.end().catch(() => undefined);
    }
  }

  private getDbConfig() {
    const host = process.env.ATHOS_PG_HOST;
    const database = process.env.ATHOS_PG_DB;
    const user = process.env.ATHOS_PG_USER;
    const password = process.env.ATHOS_PG_PASS;
    const port = Number(process.env.ATHOS_PG_PORT ?? "5432");
    if (!host || !database || !user || !password) {
      throw new VendaAthosError(
        "CONFIG_INVALIDA",
        "Configuracao Athos ausente. Defina ATHOS_PG_HOST, ATHOS_PG_DB, ATHOS_PG_USER e ATHOS_PG_PASS.",
      );
    }
    return { host, database, user, password, port };
  }

  /** Em NODE_ENV=test so aceita host local/mock: um teste mal configurado nunca alcanca o Athos real. */
  private assertHostPermitido(): void {
    if (process.env.NODE_ENV !== "test") return;
    const host = (process.env.ATHOS_PG_HOST ?? "").trim().toLowerCase();
    if (!HOSTS_PERMITIDOS_EM_TESTE.includes(host)) {
      throw new VendaAthosError(
        "AMBIENTE_TESTE_HOST_REAL",
        "Teste bloqueado: ATHOS_PG_HOST nao e local nem mock. Testes nunca devem alcancar o Athos real.",
      );
    }
  }

  private getPool(): Pool {
    if (!this._pool) {
      const cfg = this.getDbConfig();
      this._pool = new Pool({ ...cfg, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on("error", (err: Error) => this.logger.error(`Athos pool error: ${err.message}`));
    }
    return this._pool;
  }

  private mapearErroPg(err: unknown): VendaAthosError {
    if (err instanceof VendaAthosError) return err;
    const code = (err as { code?: string })?.code;
    switch (code) {
      case "42501":
        return new VendaAthosError(
          "PERMISSAO_NEGADA",
          "Permissao de escrita ausente no Athos para lancar a venda. Solicite ao DBA o GRANT de INSERT/UPDATE nas tabelas da venda e USAGE nas sequences.",
        );
      case "42703":
      case "42P01":
        return new VendaAthosError(
          "ESQUEMA_DIVERGENTE",
          "O esquema do Athos nao tem uma coluna ou tabela esperada. Nada foi gravado; valide no clone athos-teste.",
        );
      case "57014":
      case "08000":
      case "08001":
      case "08006":
        return new VendaAthosError("ATHOS_INDISPONIVEL", "O Athos esta indisponivel ou demorou demais. Nada foi gravado.");
      default:
        return new VendaAthosError("ERRO_BANCO", "Erro de banco ao lancar a venda no Athos. Nada foi gravado.");
    }
  }

  /**
   * Lanca a venda do orcamento. Em `simular`, le tudo, calcula e devolve o que seria gravado.
   * Qualquer falha faz ROLLBACK; nunca grava parcialmente.
   */
  async lancarVendaDeOrcamento(input: LancarVendaInput): Promise<LancarVendaResultado> {
    const simular = input.simular === true;
    const idformapagamento = input.idformapagamento ?? FORMA_PAGAMENTO_AVISTA;

    // ---- validacao de entrada pura (nenhuma conexao aberta) -----------------
    for (const [nome, v] of [
      ["idorcamento", input.idorcamento],
      ["idvendedor", input.idvendedor],
      ["idterminal", input.idterminal],
      ["idcaixaMovimento", input.idcaixaMovimento],
    ] as const) {
      if (!inteiroPositivo(v)) throw new VendaAthosError("ITEM_INVALIDO", `${nome} deve ser um inteiro positivo.`);
    }
    if (idformapagamento !== FORMA_PAGAMENTO_AVISTA) {
      throw new VendaAthosError(
        "FORMA_PAGAMENTO_NAO_SUPORTADA",
        `Forma de pagamento ${idformapagamento} nao suportada: so a forma ${FORMA_PAGAMENTO_AVISTA} (a vista) foi capturada.`,
      );
    }
    if (!simular && process.env.ATHOS_VENDA_AUTOMATICA !== "true") {
      throw new VendaAthosError(
        "RECURSO_DESLIGADO",
        "O lancamento automatico da venda esta desligado (ATHOS_VENDA_AUTOMATICA). Use simular: true.",
      );
    }

    this.assertHostPermitido();

    const pool = this.getPool();
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (err) {
      this.logger.error(`Venda Athos: falha ao conectar (${(err as { code?: string })?.code ?? "sem_codigo"}).`);
      throw new VendaAthosError("ATHOS_INDISPONIVEL", "Nao foi possivel conectar ao Athos.");
    }

    const comandos: string[] = [];
    try {
      await client.query("BEGIN");
      if (simular) await client.query(SQL_SOMENTE_LEITURA);

      // ---- fase 1: leitura e travas -----------------------------------------
      const trava = simular ? "" : " FOR UPDATE";
      const orc = await client.query<LinhaOrcamento>(`${SQL_LER_ORCAMENTO}${trava}`, [input.idorcamento]);
      if (orc.rows.length === 0) {
        throw new VendaAthosError("ORCAMENTO_NAO_ENCONTRADO", `Orcamento ${input.idorcamento} nao encontrado no Athos.`);
      }
      const rel = await client.query<{ idvenda: number }>(SQL_LER_RELACAO, [input.idorcamento]);
      if (rel.rows.length > 0) {
        const existente = Number(rel.rows[0].idvenda);
        throw new VendaAthosError(
          "ORCAMENTO_JA_LANCADO",
          `Orcamento ${input.idorcamento} ja tem a venda ${existente}.`,
          existente,
        );
      }
      const o = orc.rows[0];
      if (o.cancelado === true) {
        throw new VendaAthosError("ORCAMENTO_JA_LANCADO", `Orcamento ${input.idorcamento} esta cancelado.`);
      }
      if (o.statusorcamento === true) {
        throw new VendaAthosError("ORCAMENTO_JA_LANCADO", `Orcamento ${input.idorcamento} ja foi usado.`);
      }

      const caixa = await client.query(SQL_LER_CAIXA, [input.idcaixaMovimento]);
      if (caixa.rows.length === 0) {
        throw new VendaAthosError("CAIXA_FECHADO", `O caixa ${input.idcaixaMovimento} nao esta aberto.`);
      }

      const itensLidos = await client.query<LinhaItem>(SQL_LER_ITENS, [input.idorcamento]);
      if (itensLidos.rows.length === 0) {
        throw new VendaAthosError("ITEM_INVALIDO", `Orcamento ${input.idorcamento} nao tem itens.`);
      }
      for (const it of itensLidos.rows) {
        if (it.statusproduto !== true || it.vende === false) {
          throw new VendaAthosError("PRODUTO_NAO_VENDAVEL", `Produto ${it.idproduto} nao esta vendavel.`);
        }
        if (it.orcamentodesconto !== null && Number(it.orcamentodesconto) > 0) {
          throw new VendaAthosError(
            "ORCAMENTO_COM_DESCONTO_NAO_SUPORTADO",
            "Orcamento com desconto nos itens ainda nao e suportado (so o desconto do cupom).",
          );
        }
      }

      const itensVenda: ItemVendaEntrada[] = itensLidos.rows.map((it) => {
        const fiscal: FiscalItem = {
          origem: textoOuVazio(it.origem) || "0",
          tributacao: textoOuVazio(it.tributacao),
          csosn: textoOuVazio(it.csosn),
          cfop: textoOuVazio(it.cfop),
          cest: textoOuVazio(it.cest),
          aliquotaEcf: textoOuVazio(it.icms),
        };
        return {
          idproduto: Number(it.idproduto),
          quantidade: it.quantidadeitem,
          valorUnitario: it.valoritem,
          custoUnitario: it.custo ?? 0,
          fiscal,
        };
      });

      const hoje = input.hoje ?? new Date().toISOString().slice(0, 10);
      const valores = montarVenda({
        itens: itensVenda,
        descontoCupom: input.descontoCupom ?? 0,
        idformapagamento,
        contexto: {
          idvendedor: input.idvendedor,
          idcaixaMovimento: input.idcaixaMovimento,
          idterminal: input.idterminal,
          idorcamento: input.idorcamento,
          data: hoje,
        },
      });

      // Limite global de desconto (conf_vendas.permitedescontode, em %).
      const lim = await client.query<{ permitedescontode: string | number | null }>(SQL_LER_LIMITE_DESCONTO);
      const limite = lim.rows[0]?.permitedescontode;
      if (limite !== null && limite !== undefined && Number(valores.venda.desconto) > Number(limite)) {
        throw new VendaAthosError(
          "DESCONTO_ACIMA_DO_MAXIMO",
          `Desconto de ${valores.venda.desconto}% acima do maximo permitido (${limite}%).`,
        );
      }

      // ---- fase 2: escrita (ou plano, na simulacao) ---------------------------
      const registrar = (rotulo: string) => comandos.push(rotulo);

      if (simular) {
        registrar("INSERT venda");
        for (const it of valores.itens) registrar(`INSERT venda_item #${it.sequenciaitem}`);
        registrar("INSERT forma_pagamento_venda");
        registrar("INSERT recebimento_cartao");
        for (const [i, it] of itensLidos.rows.entries()) {
          if (it.controlaestoque) registrar(`UPDATE produto estoque #${i + 1}`);
          registrar(`UPDATE produto dataultimavenda #${i + 1}`);
        }
        registrar("UPDATE orcamento statusorcamento");
        registrar("INSERT relacao_orcamento_venda");
        registrar("UPDATE venda sfnfce");
        await client.query("ROLLBACK");
        return { simulado: true, valores, comandos };
      }

      const v = valores.venda;
      const venda = await client.query<{ idvenda: number }>(SQL_INSERIR_VENDA, [
        v.descontoRS,
        input.idvendedor,
        input.idcaixaMovimento,
        input.idorcamento,
        input.idterminal,
        v.valor,
        v.desconto,
      ]);
      const idvenda = Number(venda.rows[0].idvenda);
      registrar("INSERT venda");

      for (const it of valores.itens) {
        await client.query(SQL_INSERIR_ITEM, [
          idvenda,
          it.idproduto,
          it.quantidadeitem,
          it.valorcustoitem,
          it.valorvendaitem,
          it.fiscal.aliquotaEcf,
          it.valordesconto,
          it.vendaDesconto,
          it.vendaValorFinalItem,
          it.sequenciaitem,
          input.idvendedor,
          it.fiscal.origem,
          it.fiscal.tributacao,
          it.fiscal.csosn,
          it.fiscal.cfop,
          it.fiscal.cest,
        ]);
        registrar(`INSERT venda_item #${it.sequenciaitem}`);
      }

      const p = valores.pagamento;
      const pag = await client.query<{ idformapagamentovenda: number }>(SQL_INSERIR_PAGAMENTO, [
        idvenda,
        p.idformapagamento,
        p.valor,
        p.valorRecebido,
        p.idcondicaopagamento,
      ]);
      const idformapagamentovenda = Number(pag.rows[0].idformapagamentovenda);
      registrar("INSERT forma_pagamento_venda");

      const rc = valores.recebimentoCartao;
      await client.query(SQL_INSERIR_RECEBIMENTO_CARTAO, [
        idformapagamentovenda,
        rc.valorparcelacartao,
        rc.datavencimento,
        rc.status,
        rc.taxacobrada,
      ]);
      registrar("INSERT recebimento_cartao");

      for (const [i, it] of itensLidos.rows.entries()) {
        if (it.controlaestoque) {
          await client.query(SQL_BAIXAR_ESTOQUE, [it.idproduto, it.quantidadeitem]);
          registrar(`UPDATE produto estoque #${i + 1}`);
        }
        await client.query(SQL_DATA_ULTIMA_VENDA, [it.idproduto]);
        registrar(`UPDATE produto dataultimavenda #${i + 1}`);
      }

      await client.query(SQL_MARCAR_ORCAMENTO, [input.idorcamento]);
      registrar("UPDATE orcamento statusorcamento");
      await client.query(SQL_INSERIR_RELACAO, [input.idorcamento, idvenda]);
      registrar("INSERT relacao_orcamento_venda");
      await client.query(SQL_MARCAR_NFCE, [idvenda, input.idterminal]);
      registrar("UPDATE venda sfnfce");

      await client.query("COMMIT");
      this.logger.log(`Venda Athos ${idvenda} lancada do orcamento ${input.idorcamento}.`);
      return { simulado: false, idvenda, idformapagamentovenda, valores, comandos };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.mapearErroPg(err);
    } finally {
      client.release();
    }
  }
}
