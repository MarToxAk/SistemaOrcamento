import { Injectable, Logger } from "@nestjs/common";
import { Pool, PoolClient } from "pg";

import {
  CONF_FINANCEIRO_COLUNAS,
  ConfFinanceiroEncargos,
  ModoValorBaixa,
  PERCENTUAL_MULTA_PADRAO,
  decidirValoresBaixa,
} from "./athos-baixa-encargos.util";

/**
 * Baixa de contas a receber no Athos (reproduz a tela "Baixar Contas").
 *
 * Fase 43 / plano 43-01. SQL observado no Athos real (43-REFERENCIA-SQL-ATHOS.md);
 * PostgreSQL 9.0.5: apenas parametros $n, RETURNING, FOR UPDATE, ANY($1::int[]).
 * Sem ON CONFLICT, sem CTE de escrita, sem jsonb.
 *
 * Seguranca (D-07): este servico e o UNICO lugar do backend que grava em
 * conta_recebida / livro_registro_io. Testes sempre mockam `pg`; com
 * NODE_ENV=test o servico recusa host que nao seja local/mock.
 */

export type BaixaAthosCodigo =
  | "TITULO_NAO_ENCONTRADO"
  | "STATUS_INVALIDO"
  | "VALOR_DIVERGENTE"
  | "VALOR_INCOMPATIVEL"
  | "CONFIG_ATHOS_INCOMPLETA"
  | "TITULO_NAO_POSITIVO"
  | "CLIENTE_DIVERGENTE"
  // Fase 43-02: so para atraso dentro da carencia (regiao de encargos nao validada); baixa manual.
  | "ATRASO_REQUER_ENCARGOS"
  | "DATA_PAGAMENTO_INVALIDA"
  | "DATA_PAGAMENTO_FUTURA"
  | "CONFIG_INVALIDA"
  | "PERMISSAO_NEGADA"
  | "TEXTO_LONGO"
  | "AMBIENTE_TESTE_HOST_REAL"
  | "ERRO_BANCO";

export class BaixaAthosError extends Error {
  constructor(
    public readonly codigo: BaixaAthosCodigo,
    message: string,
  ) {
    super(message);
    this.name = "BaixaAthosError";
  }
}

export interface BaixaConstantes {
  idFormaPagamento: number;
  idLivroRegistro: number;
  idFuncionario: number;
  /** % de multa sobre o principal; coluna em conf_financeiro desconhecida (padrao 2). */
  percentualMulta?: number;
}

export interface BaixarTitulosInput {
  idclienteAthos: number;
  /** valorEsperado = CobrancaBoletoTitulo.valor (snapshot da emissao do boleto) */
  titulos: Array<{ idcontareceber: number; valorEsperado: number }>;
  /** YYYY-MM-DD, calendario America/Sao_Paulo */
  dataPagamento: string;
  /** injetavel nos testes; padrao hojeSaoPaulo() */
  hoje?: string;
  constantes: BaixaConstantes;
  /** true = so leitura; nenhuma instrucao de escrita */
  simular?: boolean;
  /**
   * Valor efetivamente pago segundo a EFI, em reais (null/ausente = desconhecido). So e comparado
   * quando TODOS os titulos da chamada serao baixados.
   */
  valorPagoEfi?: number | null;
}

export interface BaixaTituloResultado {
  idcontareceber: number;
  acao: "baixado" | "ja_baixado";
  /** null em ja_baixado e em simulacao */
  idcontarecebida: number | null;
  principal: number;
  juros: number;
  multa: number;
  atraso: number;
  valorPago: number;
}

export interface BaixarTitulosResultado {
  simulado: boolean;
  /** ja_baixado = nenhum titulo precisou de escrita */
  resultado: "baixado" | "ja_baixado";
  /** com_encargos = principal + juros + multa; nominal = EFI recebeu so o principal */
  modo: ModoValorBaixa;
  retroativa: boolean;
  dataPagamento: string;
  titulos: BaixaTituloResultado[];
  valorTotal: number;
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

const LIMITE_DESCRICAO_PADRAO = 100;
const LIMITE_LOG = 255;
const HOSTS_PERMITIDOS_EM_TESTE = ["localhost", "127.0.0.1", "athos-mock.invalid"];

/** Data corrente (YYYY-MM-DD) no calendario de America/Sao_Paulo. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const pick = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** NFD sem diacriticos; permite [A-Za-z0-9 .,:/-]; colapsa espacos; trim; trunca. */
export function sanitizarTextoAthos(texto: string, max: number): string {
  const limpo = String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,:/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.length > max ? limpo.slice(0, max).trim() : limpo;
}

/** 'Rec. Titulo <n> - Cliente: <nome>'; so a parte do nome e truncada. */
export function montarDescricaoLivro(
  numerotitulo: string | null,
  nomeCliente: string,
  max: number = LIMITE_DESCRICAO_PADRAO,
): string {
  const numero = sanitizarTextoAthos(numerotitulo ?? "", 40);
  const prefixo = `Rec. Titulo${numero ? ` ${numero}` : ""} - Cliente: `;
  const espaco = Math.max(0, max - prefixo.length);
  const nome = sanitizarTextoAthos(nomeCliente ?? "", espaco);
  return `${prefixo}${nome}`.trimEnd();
}

/** String com 2 casas via centavos inteiros (nunca aritmetica de float direta). */
export function formatarValorAthos(valor: number): string {
  return centavosParaTexto(paraCentavos(valor));
}

function paraCentavos(valor: number | string): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Math.round(n * 100);
}

function centavosParaTexto(centavos: number): string {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const inteiro = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sinal}${inteiro}.${frac}`;
}

function dataValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

function dataBr(isoData: string): string {
  const [a, m, d] = isoData.split("-");
  return `${d}/${m}/${a}`;
}

function inteiroPositivo(n: unknown): boolean {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

// ---------------------------------------------------------------------------
// SQL (literais fixos; valores apenas por parametro)
// ---------------------------------------------------------------------------

const SQL_LER_TITULOS =
  `SELECT cr.idcontareceber, cr.idcliente, cr.numerotitulo, cr.valor,
          to_char(cr.datavencimento, 'YYYY-MM-DD') AS datavencimento, TRIM(cr.statusconta) AS statusconta
     FROM conta_receber cr
    WHERE cr.idcontareceber = ANY($1::int[])
    ORDER BY cr.idcontareceber`;

const SQL_LER_CLIENTE =
  `SELECT COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente ' || c.idcliente::text) AS nome_cliente
     FROM cliente c
     LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
     LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
    WHERE c.idcliente = $1`;

// Identificadores vindos SOMENTE de CONF_FINANCEIRO_COLUNAS (constantes fixas, nunca de entrada externa).
const SQL_LER_CONF_FINANCEIRO =
  `SELECT ${CONF_FINANCEIRO_COLUNAS.taxaJurosMes} AS taxajurosmes, ${CONF_FINANCEIRO_COLUNAS.carenciaDias} AS carenciadias
     FROM conf_financeiro LIMIT 1`;

const SQL_INS_CONTA_RECEBIDA =
  `INSERT INTO conta_recebida (idcontareceber, valorpago, valortroco, datapagamento, horapagamento, juros, desconto,
                               atraso, idfuncionariousuario, idformapagamento, multa, idcondicaopagamento)
   VALUES ($1, $2, 0, $3::timestamp, cast(current_time(0) as time), $4, 0, $5, $6, $7, $8, NULL)
   RETURNING idcontarecebida`;

const SQL_INS_LIVRO =
  `INSERT INTO livro_registro_io (idlivroregistro, idfuncionario, datalancamento, horalancamento, descricao,
                                  valorentrada, tipopagamento, idcontarecebida)
   VALUES ($1, $2, $3::date, cast(current_time(0) as time), $4, $5, '', $6)`;

const SQL_UPD_CONTA_RECEBER = `UPDATE conta_receber SET statusconta = 'REC' WHERE idcontareceber = $1`;
const SQL_UPD_BOLETO = `UPDATE boleto SET statusboleto = 'REC' WHERE idcontareceber = $1`;
const SQL_UPD_CLIENTE = `UPDATE cliente SET aviso1 = false, aviso2 = false, aviso3 = false WHERE idcliente = $1`;
const SQL_INS_LOG =
  `INSERT INTO log (idfuncionariousuario, data, hora, mensagem)
   VALUES ($1, current_date, cast(current_time(0) as time), $2)`;

interface LinhaTitulo {
  idcontareceber: number;
  idcliente: number;
  numerotitulo: string | null;
  valor: string | number;
  datavencimento: string | null;
  statusconta: string | null;
}

interface LinhaConf {
  taxajurosmes: string | number | null;
  carenciadias: string | number | null;
}

function numeroConf(v: unknown): number | null {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface TituloValidado {
  linha: LinhaTitulo;
  principalCentavos: number;
  jaBaixado: boolean;
}

@Injectable()
export class AthosContaReceberBaixaService {
  private readonly logger = new Logger(AthosContaReceberBaixaService.name);
  private _pool: Pool | null = null;

  private getDbConfig() {
    const host = process.env.ATHOS_PG_HOST;
    const database = process.env.ATHOS_PG_DB;
    const user = process.env.ATHOS_PG_USER;
    const password = process.env.ATHOS_PG_PASS;
    const port = Number(process.env.ATHOS_PG_PORT ?? "5432");

    if (!host || !database || !user || !password) {
      throw new BaixaAthosError(
        "CONFIG_INVALIDA",
        "Configuracao Athos ausente. Defina ATHOS_PG_HOST, ATHOS_PG_DB, ATHOS_PG_USER e ATHOS_PG_PASS.",
      );
    }
    return { host, database, user, password, port };
  }

  /**
   * Trava de seguranca (D-07): em NODE_ENV=test so aceita host local/mock, de modo
   * que um teste mal configurado nunca alcance o Athos real. Roda antes de qualquer conexao.
   */
  private assertHostPermitido(): void {
    if (process.env.NODE_ENV !== "test") return;
    const host = (process.env.ATHOS_PG_HOST ?? "").trim().toLowerCase();
    if (!HOSTS_PERMITIDOS_EM_TESTE.includes(host)) {
      throw new BaixaAthosError(
        "AMBIENTE_TESTE_HOST_REAL",
        "Teste bloqueado: ATHOS_PG_HOST nao e local nem mock. Testes nunca devem alcancar o Athos real.",
      );
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

  private mapearErroPg(err: unknown): BaixaAthosError {
    if (err instanceof BaixaAthosError) return err;
    const code = (err as { code?: string })?.code;
    switch (code) {
      case "42501":
        return new BaixaAthosError(
          "PERMISSAO_NEGADA",
          "Permissao de escrita ausente no Athos para a baixa. Solicite ao DBA o GRANT: " +
            "GRANT INSERT, UPDATE ON TABLE conta_recebida, livro_registro_io, conta_receber, boleto, cliente, log TO <usuario>; " +
            "GRANT USAGE, SELECT nas sequences de conta_recebida, livro_registro_io e log para <usuario>.",
        );
      case "22001":
        return new BaixaAthosError("TEXTO_LONGO", "Texto excede o tamanho da coluna no Athos.");
      default:
        return new BaixaAthosError("ERRO_BANCO", "Erro de banco ao operar a baixa no Athos.");
    }
  }

  async baixarTitulos(input: BaixarTitulosInput): Promise<BaixarTitulosResultado> {
    const simular = input.simular === true;
    const hoje = input.hoje ?? hojeSaoPaulo();
    const { constantes } = input;

    // ---- validacao de entrada pura (nenhuma conexao aberta) -----------------
    if (!dataValida(input.dataPagamento)) {
      throw new BaixaAthosError("DATA_PAGAMENTO_INVALIDA", "dataPagamento deve estar no formato YYYY-MM-DD valido.");
    }
    if (input.dataPagamento > hoje) {
      throw new BaixaAthosError("DATA_PAGAMENTO_FUTURA", "dataPagamento nao pode ser posterior a hoje.");
    }
    if (
      !inteiroPositivo(constantes?.idFormaPagamento) ||
      !inteiroPositivo(constantes?.idLivroRegistro) ||
      !inteiroPositivo(constantes?.idFuncionario)
    ) {
      throw new BaixaAthosError("CONFIG_INVALIDA", "Constantes da baixa devem ser inteiros positivos.");
    }
    const multaPct = constantes.percentualMulta ?? PERCENTUAL_MULTA_PADRAO;
    if (typeof multaPct !== "number" || !Number.isFinite(multaPct) || multaPct < 0 || multaPct > 100) {
      throw new BaixaAthosError("CONFIG_INVALIDA", "percentualMulta deve estar entre 0 e 100.");
    }
    if (!inteiroPositivo(input.idclienteAthos) || !Array.isArray(input.titulos) || input.titulos.length === 0) {
      throw new BaixaAthosError("TITULO_NAO_ENCONTRADO", "Nenhum titulo informado para a baixa.");
    }

    const esperados = new Map<number, number>();
    for (const t of input.titulos) {
      if (!inteiroPositivo(t.idcontareceber)) {
        throw new BaixaAthosError("TITULO_NAO_ENCONTRADO", "idcontareceber invalido.");
      }
      if (!esperados.has(t.idcontareceber)) esperados.set(t.idcontareceber, paraCentavos(t.valorEsperado));
    }
    const ids = [...esperados.keys()];

    this.assertHostPermitido();

    const retroativa = input.dataPagamento < hoje;
    const pool = this.getPool();
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (err) {
      this.logger.error(`Baixa Athos: falha ao conectar (${(err as { code?: string })?.code ?? "sem_codigo"}).`);
      throw new BaixaAthosError("ERRO_BANCO", "Nao foi possivel conectar ao Athos.");
    }

    try {
      await client.query("BEGIN");
      if (simular) await client.query("SET TRANSACTION READ ONLY");

      // ---- fase 1: leitura (e trava, fora da simulacao) ---------------------
      const lidos = await client.query<LinhaTitulo>(
        simular ? SQL_LER_TITULOS : `${SQL_LER_TITULOS} FOR UPDATE`,
        [ids],
      );
      const porId = new Map<number, LinhaTitulo>();
      for (const l of lidos.rows) porId.set(Number(l.idcontareceber), l);

      // ---- fase 2: validacao de TODOS os titulos antes de qualquer escrita --
      const faltando = ids.filter((id) => !porId.has(id));
      if (faltando.length > 0) {
        throw new BaixaAthosError(
          "TITULO_NAO_ENCONTRADO",
          `Titulo(s) nao encontrado(s) no Athos: ${faltando.join(", ")}.`,
        );
      }

      const validados: TituloValidado[] = [];
      for (const id of ids) {
        const linha = porId.get(id) as LinhaTitulo;
        if (Number(linha.idcliente) !== input.idclienteAthos) {
          throw new BaixaAthosError("CLIENTE_DIVERGENTE", `Titulo ${id} pertence a outro cliente no Athos.`);
        }
        const status = (linha.statusconta ?? "").trim();
        const principalCentavos = paraCentavos(linha.valor);
        if (status === "REC") {
          validados.push({ linha, principalCentavos, jaBaixado: true });
          continue;
        }
        if (status !== "AVC" && status !== "VEN") {
          throw new BaixaAthosError("STATUS_INVALIDO", `Titulo ${id} com status ${status || "vazio"} nao pode ser baixado.`);
        }
        if (!(principalCentavos > 0)) {
          throw new BaixaAthosError("TITULO_NAO_POSITIVO", `Titulo ${id} com valor nao positivo.`);
        }
        if (Math.abs(principalCentavos - (esperados.get(id) as number)) > 1) {
          throw new BaixaAthosError("VALOR_DIVERGENTE", `Titulo ${id} com valor diferente do boleto emitido.`);
        }
        validados.push({ linha, principalCentavos, jaBaixado: false });
      }

      const pendentes = validados.filter((v) => !v.jaBaixado);
      const resultados: BaixaTituloResultado[] = [];
      let totalCentavos = 0;

      // ---- fase 2b: encargos e valor (D-02, D-08): conf_financeiro lido na MESMA transacao, antes de escrever
      const vencimentoDe = (v: TituloValidado): string => v.linha.datavencimento || input.dataPagamento;
      let confEncargos: ConfFinanceiroEncargos = {
        taxaJurosMes: 0,
        carenciaDias: 0,
        percentualMulta: multaPct,
      };
      if (pendentes.some((v) => vencimentoDe(v) < input.dataPagamento)) {
        const confLida = await client.query<LinhaConf>(SQL_LER_CONF_FINANCEIRO);
        const taxa = numeroConf(confLida.rows[0]?.taxajurosmes);
        const carencia = numeroConf(confLida.rows[0]?.carenciadias);
        if (taxa === null || carencia === null || taxa < 0 || taxa > 100 || carencia < 0) {
          throw new BaixaAthosError(
            "CONFIG_ATHOS_INCOMPLETA",
            "conf_financeiro ausente ou sem taxa de juros / carencia validas; baixa de titulo em atraso nao executada.",
          );
        }
        confEncargos = { taxaJurosMes: taxa, carenciaDias: carencia, percentualMulta: multaPct };
      }

      let decisaoOk: Extract<ReturnType<typeof decidirValoresBaixa>, { ok: true }> | null = null;
      if (pendentes.length > 0) {
        let decisao: ReturnType<typeof decidirValoresBaixa>;
        try {
          decisao = decidirValoresBaixa({
            titulos: pendentes.map((v) => ({
              idcontareceber: Number(v.linha.idcontareceber),
              principal: v.principalCentavos / 100,
              vencimento: vencimentoDe(v),
            })),
            dataPagamento: input.dataPagamento,
            conf: confEncargos,
            // a EFI cobre todos os titulos do boleto: so compara se nenhum ja estava REC
            valorPagoEfi: pendentes.length === validados.length ? (input.valorPagoEfi ?? null) : null,
          });
        } catch {
          throw new BaixaAthosError("CONFIG_ATHOS_INCOMPLETA", "Configuracao de encargos invalida para a baixa.");
        }
        if (!decisao.ok) throw new BaixaAthosError(decisao.codigo, decisao.mensagem);
        decisaoOk = decisao;
      }
      const valoresPorId = new Map((decisaoOk?.titulos ?? []).map((t) => [t.idcontareceber, t]));

      // ---- fase 3: escrita (a simulacao nunca alcanca este bloco) -----------
      let nomeCliente = "";
      if (pendentes.length > 0) {
        const nome = await client.query<{ nome_cliente: string }>(SQL_LER_CLIENTE, [input.idclienteAthos]);
        nomeCliente = nome.rows[0]?.nome_cliente ?? `Cliente ${input.idclienteAthos}`;
      }

      for (const v of validados) {
        const id = Number(v.linha.idcontareceber);
        if (v.jaBaixado) {
          resultados.push({
            idcontareceber: id,
            acao: "ja_baixado",
            idcontarecebida: null,
            principal: 0,
            juros: 0,
            multa: 0,
            atraso: 0,
            valorPago: 0,
          });
          continue;
        }

        const principal = v.principalCentavos / 100;
        const valores = valoresPorId.get(id);
        if (!valores) throw new BaixaAthosError("ERRO_BANCO", "Valores da baixa nao calculados para o titulo.");
        let idcontarecebida: number | null = null;

        if (!simular) {
          const valorTexto = formatarValorAthos(valores.valorPago);
          const ins = await client.query<{ idcontarecebida: number }>(SQL_INS_CONTA_RECEBIDA, [
            id,
            valorTexto,
            `${input.dataPagamento} 00:00:00`,
            formatarValorAthos(valores.juros),
            valores.atraso, // dias de atraso
            constantes.idFuncionario,
            constantes.idFormaPagamento,
            formatarValorAthos(valores.multa),
          ]);
          idcontarecebida = Number(ins.rows[0]?.idcontarecebida);
          if (!Number.isInteger(idcontarecebida)) {
            throw new BaixaAthosError("ERRO_BANCO", "Athos nao devolveu idcontarecebida.");
          }
          await client.query(SQL_INS_LIVRO, [
            constantes.idLivroRegistro,
            constantes.idFuncionario,
            input.dataPagamento,
            montarDescricaoLivro(v.linha.numerotitulo, nomeCliente),
            valorTexto,
            idcontarecebida,
          ]);
          await client.query(SQL_UPD_CONTA_RECEBER, [id]);
          await client.query(SQL_UPD_BOLETO, [id]); // zero linhas afetadas e valido
          if (retroativa) {
            const mensagem = sanitizarTextoAthos(
              `Baixou a conta com ID: ${id} com a data retroativa. Data atual: ${dataBr(hoje)} Data Informada: ${dataBr(input.dataPagamento)}`,
              LIMITE_LOG,
            );
            await client.query(SQL_INS_LOG, [constantes.idFuncionario, mensagem]);
          }
        }

        totalCentavos += paraCentavos(valores.valorPago);
        resultados.push({
          idcontareceber: id,
          acao: "baixado",
          idcontarecebida,
          principal,
          juros: valores.juros,
          multa: valores.multa,
          atraso: valores.atraso,
          valorPago: valores.valorPago,
        });
      }

      if (!simular && pendentes.length > 0) {
        await client.query(SQL_UPD_CLIENTE, [input.idclienteAthos]); // uma vez ao fim do lote (D-09)
      }

      const algumaEscrita = !simular && pendentes.length > 0;
      await client.query(algumaEscrita ? "COMMIT" : "ROLLBACK");

      return {
        simulado: simular,
        resultado: pendentes.length > 0 ? "baixado" : "ja_baixado",
        modo: decisaoOk?.modo ?? "com_encargos",
        retroativa,
        dataPagamento: input.dataPagamento,
        titulos: resultados,
        valorTotal: totalCentavos / 100,
      };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rbErr) {
        this.logger.error(`Baixa Athos: erro no ROLLBACK (${(rbErr as { code?: string })?.code ?? "sem_codigo"}).`);
      }
      const mapeado = this.mapearErroPg(err);
      this.logger.error(`Baixa Athos falhou: codigo=${mapeado.codigo} titulos=${ids.join(",")}`);
      throw mapeado;
    } finally {
      client.release();
    }
  }
}
