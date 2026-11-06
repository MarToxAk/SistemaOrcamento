import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  AthosContaReceberBaixaService,
  BaixaAthosError,
  BaixaConstantes,
  BaixarTitulosResultado,
  hojeSaoPaulo,
} from "../integrations/athos/athos-conta-receber-baixa.service";
import { PERCENTUAL_MULTA_PADRAO } from "../integrations/athos/athos-baixa-encargos.util";
import { PrismaService } from "../database/prisma.service";

/**
 * Orquestrador da baixa automatica no Athos (Fase 43, planos 43-01 a 43-03).
 *
 * Contrato central (D-08): `executarAposPagamento` NUNCA lanca. Falha na baixa jamais
 * desfaz o status "pago" do boleto no Sistema nem propaga excecao ao webhook / job.
 * Cada tentativa deixa status no boleto (athosBaixa*) e uma linha em CobrancaBaixaAthosLog (BX-07).
 */

export interface ConfigBaixaAthos {
  auto: boolean;
  constantes: BaixaConstantes;
}

const PADROES = { forma: 10, livro: 2, funcionario: 1 } as const;

function lerInteiroPositivo(
  get: (chave: string) => string | undefined,
  chave: string,
  padrao: number,
): number {
  const bruto = get(chave);
  if (bruto === undefined || bruto === null || String(bruto).trim() === "") return padrao;
  const texto = String(bruto).trim();
  const n = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isInteger(n) || n <= 0) {
    throw new BaixaAthosError("CONFIG_INVALIDA", `${chave} deve ser um inteiro positivo.`);
  }
  return n;
}

function lerPercentualMulta(get: (chave: string) => string | undefined): number {
  const bruto = get("ATHOS_BAIXA_MULTA_PERCENTUAL");
  if (bruto === undefined || bruto === null || String(bruto).trim() === "") return PERCENTUAL_MULTA_PADRAO;
  const texto = String(bruto).trim().replace(",", ".");
  const n = Number(texto);
  if (!/^\d+(\.\d+)?$/.test(texto) || !Number.isFinite(n) || n > 100) {
    throw new BaixaAthosError("CONFIG_INVALIDA", "ATHOS_BAIXA_MULTA_PERCENTUAL deve ser um numero entre 0 e 100.");
  }
  return n;
}

/**
 * Padroes: auto=true, forma=10, livro=2, funcionario=1, multa=2 (%). So o texto exato "false" desliga o auto.
 * ATHOS_BAIXA_MULTA_PERCENTUAL: a coluna do percentual de multa em conf_financeiro e desconhecida (Fase 43-02).
 */
export function resolverConfigBaixaAthos(get: (chave: string) => string | undefined): ConfigBaixaAthos {
  const auto = String(get("ATHOS_BAIXA_AUTO") ?? "").trim() !== "false";
  return {
    auto,
    constantes: {
      idFormaPagamento: lerInteiroPositivo(get, "ATHOS_BAIXA_ID_FORMA_PAGAMENTO", PADROES.forma),
      idLivroRegistro: lerInteiroPositivo(get, "ATHOS_BAIXA_ID_LIVRO_REGISTRO", PADROES.livro),
      idFuncionario: lerInteiroPositivo(get, "ATHOS_BAIXA_ID_FUNCIONARIO", PADROES.funcionario),
      percentualMulta: lerPercentualMulta(get),
    },
  };
}

export type OrigemBaixa = "webhook" | "reconciliacao" | "manual" | "retentativa";

export interface DadosPagamentoEfi {
  dataPagamento: string | null;
  /** 'payment.paid_at' | 'payment.received_by_bank_at' | 'paid_at' | 'fallback_hoje' */
  fonteData: string;
  /** Valor pago informado pela EFI, em reais; null quando ausente ou invalido. */
  valorPago: number | null;
  /** 'payment.paid_value' | 'nao_informado' */
  fonteValor: string;
}

/**
 * payment.paid_value da EFI: centavos inteiros (mesma convencao dos itens enviados em criarBoleto),
 * logo reais = paid_value / 100. Ausente, nao numerico (inclui texto), nao inteiro (unidade duvidosa)
 * ou <= 0 devolve null: a baixa usa entao principal + encargos calculados.
 */
function extrairValorPagoEfi(item: Record<string, any>): number | null {
  const bruto = item?.payment?.paid_value;
  if (typeof bruto !== "number" || !Number.isInteger(bruto) || bruto <= 0) return null;
  return bruto / 100;
}

function dataIsoValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** Converte texto de data/hora da EFI para YYYY-MM-DD no calendario de America/Sao_Paulo (ou null). */
function paraDataSaoPaulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  const m = texto.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return null;
  const [, dia, hora, fuso] = m;
  if (!dataIsoValida(dia)) return null;
  if (hora && fuso) {
    const fusoNormalizado = fuso === "Z" ? "Z" : fuso.length === 5 ? `${fuso.slice(0, 3)}:${fuso.slice(3)}` : fuso;
    const d = new Date(`${dia}T${hora}${fusoNormalizado}`);
    if (Number.isNaN(d.getTime())) return null;
    return hojeSaoPaulo(d);
  }
  return dia; // sem fuso: usa a parte de data como esta
}

function infoValor(valorPago: number | null): { valorPago: number | null; fonteValor: string } {
  return { valorPago, fonteValor: valorPago === null ? "nao_informado" : "payment.paid_value" };
}

/**
 * Extrai a data real do pagamento do payload bruto da cobranca EFI (objeto ou array; usa o primeiro item).
 * Ordem: payment.paid_at, payment.received_by_bank_at, paid_at. Nunca lanca. Data futura vira hoje.
 */
export function extrairDadosPagamentoEfi(payload: unknown, hoje: string = hojeSaoPaulo()): DadosPagamentoEfi {
  let valorPago: number | null = null;
  try {
    const item = (Array.isArray(payload) ? payload[0] : payload) as Record<string, any> | null | undefined;
    if (item && typeof item === "object") {
      valorPago = extrairValorPagoEfi(item);
      const candidatos: Array<[unknown, string]> = [
        [item.payment?.paid_at, "payment.paid_at"],
        [item.payment?.received_by_bank_at, "payment.received_by_bank_at"],
        [item.paid_at, "paid_at"],
      ];
      for (const [valor, fonte] of candidatos) {
        const data = paraDataSaoPaulo(valor);
        if (data) {
          return { dataPagamento: data > hoje ? hoje : data, fonteData: fonte, ...infoValor(valorPago) };
        }
      }
    }
  } catch {
    // cai no fallback abaixo
  }
  return { dataPagamento: null, fonteData: "fallback_hoje", ...infoValor(valorPago) };
}

export type StatusExecucaoBaixa = "baixado" | "ja_baixado" | "desligado" | "falha" | "ignorado";

export interface ResultadoExecucaoBaixa {
  status: StatusExecucaoBaixa;
  codigo?: string;
  mensagem?: string;
  detalhe?: BaixarTitulosResultado;
}

export interface BaixarManualInput {
  dataPagamento?: string;
  simular?: boolean;
  ignorarValorEfi?: boolean;
}

export interface BaixarManualResultado {
  simulado: boolean;
  status: "baixado" | "ja_baixado";
  detalhe: BaixarTitulosResultado;
}

export interface StatusBaixaAthos {
  athosBaixaStatus: string | null;
  athosBaixaErroCodigo: string | null;
  athosBaixaErroMensagem: string | null;
  athosBaixaTentativas: number;
  athosBaixaUltimaEm: Date | null;
  historico: Array<{
    id: number;
    operacao: string;
    origem: string;
    resultado: string;
    codigoErro: string | null;
    mensagem: string | null;
    criadoEm: Date;
  }>;
}

/** Tamanho maximo da mensagem de erro persistida (T-43-19). */
export const MENSAGEM_ERRO_MAX = 300;
const HISTORICO_MAX = 20;
const MENSAGEM_ERRO_GENERICA = "Erro inesperado na baixa Athos.";

/** Falhas de infraestrutura/configuracao (HTTP 500); as demais BaixaAthosError sao de negocio (HTTP 422). */
const CODIGOS_INFRA: ReadonlySet<string> = new Set([
  "PERMISSAO_NEGADA",
  "ERRO_BANCO",
  "CONFIG_INVALIDA",
  "CONFIG_ATHOS_INCOMPLETA",
  "AMBIENTE_TESTE_HOST_REAL",
  "ERRO_INESPERADO",
]);

type BoletoComTitulos = {
  id: number;
  status: string;
  idclienteAthos: number;
  titulos?: Array<{ idcontareceber: number; valor: unknown }> | null;
  athosBaixaStatus?: string | null;
  athosBaixaDataPagamento?: string | null;
  athosBaixaValorPagoEfi?: unknown;
};

interface ParametrosRegistro {
  cobrancaBoletoId: number;
  origem: OrigemBaixa;
  resultado: "baixado" | "ja_baixado" | "pendente" | "falha";
  codigo?: string;
  mensagem?: string;
  dataPagamento?: string | null;
  detalhe?: BaixarTitulosResultado;
  /** false para "pendente" (flag desligada): nao conta tentativa. */
  contarTentativa: boolean;
}

function truncar(texto: string, max = MENSAGEM_ERRO_MAX): string {
  return texto.length > max ? texto.slice(0, max) : texto;
}

function numeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(String(valor));
  return Number.isFinite(n) ? n : null;
}

/** Codigo e mensagem persistiveis: so BaixaAthosError tem texto controlado (T-43-19). */
function descreverErro(err: unknown): { codigo: string; mensagem: string } {
  if (err instanceof BaixaAthosError) return { codigo: err.codigo, mensagem: truncar(err.message) };
  return { codigo: "ERRO_INESPERADO", mensagem: MENSAGEM_ERRO_GENERICA };
}

@Injectable()
export class CobrancaBaixaAthosService {
  private readonly logger = new Logger(CobrancaBaixaAthosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly baixaService: AthosContaReceberBaixaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * NUNCA lanca. `payloadEfi` = objeto (ou primeiro item do array) da cobranca EFI, bruto.
   * Registra de forma duravel (status no boleto + linha de log) o resultado de cada tentativa (BX-07).
   */
  async executarAposPagamento(
    cobrancaBoletoId: number,
    ctx: { origem: OrigemBaixa; payloadEfi?: unknown },
  ): Promise<ResultadoExecucaoBaixa> {
    let boleto: BoletoComTitulos | null;
    try {
      boleto = (await this.prisma.cobrancaBoleto.findUnique({
        where: { id: cobrancaBoletoId },
        include: { titulos: true },
      })) as BoletoComTitulos | null;
    } catch (err) {
      return this.falhaSemRegistro(cobrancaBoletoId, ctx.origem, err);
    }

    if (!boleto || boleto.status !== "pago") {
      this.logger.warn(
        `Baixa Athos ignorada: cobrancaId=${cobrancaBoletoId} inexistente ou nao pago (origem=${ctx.origem}).`,
      );
      return { status: "ignorado" };
    }
    if (boleto.athosBaixaStatus === "baixado" || boleto.athosBaixaStatus === "ja_baixado") {
      this.logger.warn(
        `Baixa Athos ignorada: cobrancaId=${cobrancaBoletoId} ja registrada (${boleto.athosBaixaStatus}) origem=${ctx.origem}.`,
      );
      return { status: "ignorado", codigo: "JA_REGISTRADO" };
    }

    const idsTitulos = (boleto.titulos ?? []).map((t) => t.idcontareceber);
    let dataPagamento: string | null = null;
    try {
      const dados = await this.resolverDadosPagamento(boleto, ctx.payloadEfi);
      dataPagamento = dados.dataPagamento;

      const cfg = resolverConfigBaixaAthos((chave) => this.config.get<string>(chave));
      if (!cfg.auto) {
        this.logger.log(
          `Baixa Athos desligada (ATHOS_BAIXA_AUTO=false) cobrancaId=${cobrancaBoletoId} origem=${ctx.origem}; ficou pendente.`,
        );
        await this.registrarResultado({
          cobrancaBoletoId,
          origem: ctx.origem,
          resultado: "pendente",
          dataPagamento,
          contarTentativa: false,
        });
        return { status: "desligado" };
      }

      return await this.executarBaixa(boleto, {
        origem: ctx.origem,
        dataPagamento,
        valorPagoEfi: dados.valorPagoEfi,
        constantes: cfg.constantes,
        fonteLog: dados.fonte,
      });
    } catch (err) {
      return this.falhaRegistrada(cobrancaBoletoId, ctx.origem, idsTitulos, dataPagamento, err);
    }
  }

  /**
   * Baixa acionada por operador (AdminOnly). Ignora ATHOS_BAIXA_AUTO e o limite de tentativas.
   * `simular` e somente leitura: nao grava estado local nem log e nao emite escrita no Athos.
   */
  async baixarManual(cobrancaBoletoId: number, input: BaixarManualInput): Promise<BaixarManualResultado> {
    const boleto = (await this.prisma.cobrancaBoleto.findUnique({
      where: { id: cobrancaBoletoId },
      include: { titulos: true },
    })) as BoletoComTitulos | null;
    if (!boleto) throw new BadRequestException(`Cobranca ${cobrancaBoletoId} nao encontrada.`);
    if (boleto.status !== "pago") {
      throw new BadRequestException(`Cobranca ${cobrancaBoletoId} nao esta paga; so boleto pago pode ser baixado.`);
    }
    if (boleto.athosBaixaStatus === "baixado") {
      throw new ConflictException(`Cobranca ${cobrancaBoletoId} ja foi baixada no Athos.`);
    }

    const dataPagamento = input.dataPagamento ?? boleto.athosBaixaDataPagamento ?? hojeSaoPaulo();
    const valorPagoEfi = input.ignorarValorEfi ? null : numeroOuNull(boleto.athosBaixaValorPagoEfi);
    const idsTitulos = (boleto.titulos ?? []).map((t) => t.idcontareceber);

    let cfg: ConfigBaixaAthos;
    try {
      cfg = resolverConfigBaixaAthos((chave) => this.config.get<string>(chave));
    } catch (err) {
      const { codigo, mensagem } = descreverErro(err);
      if (!input.simular) {
        await this.registrarResultado({
          cobrancaBoletoId,
          origem: "manual",
          resultado: "falha",
          codigo,
          mensagem,
          dataPagamento,
          contarTentativa: true,
        });
      }
      throw this.paraExcecaoHttp(codigo, mensagem);
    }

    if (input.simular) {
      try {
        const detalhe = await this.baixaService.baixarTitulos({
          idclienteAthos: boleto.idclienteAthos,
          titulos: this.titulosParaBaixa(boleto),
          dataPagamento,
          constantes: cfg.constantes,
          valorPagoEfi,
          simular: true,
        });
        return { simulado: true, status: detalhe.resultado, detalhe };
      } catch (err) {
        const { codigo, mensagem } = descreverErro(err);
        this.logger.error(
          `Simulacao de baixa Athos FALHOU cobrancaId=${cobrancaBoletoId} codigo=${codigo} idcontareceber=${idsTitulos.join(",") || "n/d"}.`,
        );
        throw this.paraExcecaoHttp(codigo, mensagem);
      }
    }

    // Baixa real.
    const resultado = await this.executarBaixa(boleto, {
      origem: "manual",
      dataPagamento,
      valorPagoEfi,
      constantes: cfg.constantes,
      fonteLog: input.ignorarValorEfi ? "fonteData=manual fonteValor=ignorado" : "fonteData=manual fonteValor=guardado",
    });
    // A data informada pelo operador passa a ser a guardada para retentativas deterministicas,
    // exceto quando o proprio Athos/validacao a recusou como invalida ou futura.
    const dataRecusada = resultado.codigo === "DATA_PAGAMENTO_INVALIDA" || resultado.codigo === "DATA_PAGAMENTO_FUTURA";
    if (input.dataPagamento && input.dataPagamento !== boleto.athosBaixaDataPagamento && !dataRecusada) {
      await this.persistirDadosPagamento(cobrancaBoletoId, { athosBaixaDataPagamento: dataPagamento });
    }
    if (resultado.status === "falha") {
      throw this.paraExcecaoHttp(resultado.codigo ?? "ERRO_INESPERADO", resultado.mensagem ?? MENSAGEM_ERRO_GENERICA);
    }
    return {
      simulado: false,
      status: resultado.status === "ja_baixado" ? "ja_baixado" : "baixado",
      detalhe: resultado.detalhe as BaixarTitulosResultado,
    };
  }

  /** Status persistido da baixa e ate 20 tentativas mais recentes (mais recente primeiro). */
  async consultarStatus(cobrancaBoletoId: number): Promise<StatusBaixaAthos> {
    const boleto = await this.prisma.cobrancaBoleto.findUnique({
      where: { id: cobrancaBoletoId },
      select: {
        athosBaixaStatus: true,
        athosBaixaErroCodigo: true,
        athosBaixaErroMensagem: true,
        athosBaixaTentativas: true,
        athosBaixaUltimaEm: true,
      },
    });
    if (!boleto) throw new BadRequestException(`Cobranca ${cobrancaBoletoId} nao encontrada.`);

    const historico = await this.prisma.cobrancaBaixaAthosLog.findMany({
      where: { cobrancaBoletoId },
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      take: HISTORICO_MAX,
      select: {
        id: true,
        operacao: true,
        origem: true,
        resultado: true,
        codigoErro: true,
        mensagem: true,
        criadoEm: true,
      },
    });

    return {
      athosBaixaStatus: boleto.athosBaixaStatus ?? null,
      athosBaixaErroCodigo: boleto.athosBaixaErroCodigo ?? null,
      athosBaixaErroMensagem: boleto.athosBaixaErroMensagem ?? null,
      athosBaixaTentativas: boleto.athosBaixaTentativas,
      athosBaixaUltimaEm: boleto.athosBaixaUltimaEm ?? null,
      historico,
    };
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private titulosParaBaixa(boleto: BoletoComTitulos): Array<{ idcontareceber: number; valorEsperado: number }> {
    return (boleto.titulos ?? []).map((t) => ({
      idcontareceber: t.idcontareceber,
      valorEsperado: Number(String(t.valor)),
    }));
  }

  /**
   * Data e valor da EFI: reutiliza o que ja foi guardado no boleto; senao extrai do payload e PERSISTE antes de
   * falar com o Athos (a baixa retroativa fica deterministica nas retentativas). Falha ao persistir so gera log.
   */
  private async resolverDadosPagamento(
    boleto: BoletoComTitulos,
    payloadEfi: unknown,
  ): Promise<{ dataPagamento: string; valorPagoEfi: number | null; fonte: string }> {
    if (boleto.athosBaixaDataPagamento) {
      return {
        dataPagamento: boleto.athosBaixaDataPagamento,
        valorPagoEfi: numeroOuNull(boleto.athosBaixaValorPagoEfi),
        fonte: "fonteData=guardado fonteValor=guardado",
      };
    }
    const dados = extrairDadosPagamentoEfi(payloadEfi);
    const dataPagamento = dados.dataPagamento ?? hojeSaoPaulo();
    await this.persistirDadosPagamento(boleto.id, {
      athosBaixaDataPagamento: dataPagamento,
      athosBaixaValorPagoEfi: dados.valorPago,
    });
    return {
      dataPagamento,
      valorPagoEfi: dados.valorPago,
      fonte: `fonteData=${dados.fonteData} fonteValor=${dados.fonteValor}`,
    };
  }

  private async persistirDadosPagamento(
    cobrancaBoletoId: number,
    data: { athosBaixaDataPagamento: string; athosBaixaValorPagoEfi?: number | null },
  ): Promise<void> {
    try {
      await this.prisma.cobrancaBoleto.update({ where: { id: cobrancaBoletoId }, data });
    } catch (err) {
      this.logger.error(
        `Baixa Athos: falha ao guardar data/valor do pagamento cobrancaId=${cobrancaBoletoId}: ${err instanceof Error ? err.name : "erro"}.`,
      );
    }
  }

  /** Caminho unico (automatico e manual): chama o Athos, registra o resultado e devolve. Nunca lanca. */
  private async executarBaixa(
    boleto: BoletoComTitulos,
    p: {
      origem: OrigemBaixa;
      dataPagamento: string;
      valorPagoEfi: number | null;
      constantes: BaixaConstantes;
      fonteLog: string;
    },
  ): Promise<ResultadoExecucaoBaixa> {
    const idsTitulos = (boleto.titulos ?? []).map((t) => t.idcontareceber);
    try {
      const detalhe = await this.baixaService.baixarTitulos({
        idclienteAthos: boleto.idclienteAthos,
        titulos: this.titulosParaBaixa(boleto),
        dataPagamento: p.dataPagamento,
        constantes: p.constantes,
        valorPagoEfi: p.valorPagoEfi,
      });

      this.logger.log(
        `Baixa Athos ${detalhe.resultado} cobrancaId=${boleto.id} origem=${p.origem} ` +
          `titulos=${idsTitulos.join(",")} data=${p.dataPagamento} ${p.fonteLog} ` +
          `modo=${detalhe.modo} retroativa=${detalhe.retroativa}.`,
      );
      await this.registrarResultado({
        cobrancaBoletoId: boleto.id,
        origem: p.origem,
        resultado: detalhe.resultado,
        dataPagamento: p.dataPagamento,
        detalhe,
        contarTentativa: true,
      });
      return { status: detalhe.resultado, detalhe };
    } catch (err) {
      return this.falhaRegistrada(boleto.id, p.origem, idsTitulos, p.dataPagamento, err);
    }
  }

  private async falhaRegistrada(
    cobrancaBoletoId: number,
    origem: OrigemBaixa,
    idsTitulos: number[],
    dataPagamento: string | null,
    err: unknown,
  ): Promise<ResultadoExecucaoBaixa> {
    const { codigo, mensagem } = descreverErro(err);
    this.logger.error(
      `Baixa Athos FALHOU cobrancaId=${cobrancaBoletoId} origem=${origem} codigo=${codigo} ` +
        `idcontareceber=${idsTitulos.join(",") || "n/d"}.`,
    );
    await this.registrarResultado({
      cobrancaBoletoId,
      origem,
      resultado: "falha",
      codigo,
      mensagem,
      dataPagamento,
      contarTentativa: true,
    });
    return { status: "falha", codigo, mensagem };
  }

  /** Falha antes de existir boleto carregado: nada a persistir, so log. */
  private falhaSemRegistro(cobrancaBoletoId: number, origem: OrigemBaixa, err: unknown): ResultadoExecucaoBaixa {
    const { codigo, mensagem } = descreverErro(err);
    this.logger.error(
      `Baixa Athos FALHOU cobrancaId=${cobrancaBoletoId} origem=${origem} codigo=${codigo} idcontareceber=n/d.`,
    );
    return { status: "falha", codigo, mensagem };
  }

  /**
   * Grava status no boleto e uma linha append-only no log. Cada escrita tem try/catch proprio: falha de
   * persistencia so gera logger.error e nunca desfaz o pago nem vira excecao (D-08).
   */
  private async registrarResultado(p: ParametrosRegistro): Promise<void> {
    const dadosBoleto: Record<string, unknown> = {
      athosBaixaStatus: p.resultado,
      athosBaixaErroCodigo: p.codigo ?? null,
      athosBaixaErroMensagem: p.mensagem ? truncar(p.mensagem) : null,
    };
    if (p.contarTentativa) {
      dadosBoleto.athosBaixaTentativas = { increment: 1 };
      dadosBoleto.athosBaixaUltimaEm = new Date();
    }
    try {
      await this.prisma.cobrancaBoleto.update({ where: { id: p.cobrancaBoletoId }, data: dadosBoleto });
    } catch (err) {
      this.logger.error(
        `Baixa Athos: falha ao gravar status cobrancaId=${p.cobrancaBoletoId}: ${err instanceof Error ? err.name : "erro"}.`,
      );
    }

    try {
      await this.prisma.cobrancaBaixaAthosLog.create({
        data: {
          cobrancaBoletoId: p.cobrancaBoletoId,
          operacao: "baixa",
          origem: p.origem,
          resultado: p.resultado,
          codigoErro: p.codigo ?? null,
          mensagem: p.mensagem ? truncar(p.mensagem) : null,
          dataPagamento: p.dataPagamento ?? null,
          valorTotal: p.detalhe ? p.detalhe.valorTotal : null,
          // so ids e valores; nunca nome de cliente
          titulos: p.detalhe
            ? p.detalhe.titulos.map((t) => ({
                idcontareceber: t.idcontareceber,
                idcontarecebida: t.idcontarecebida,
                principal: t.principal,
                juros: t.juros,
                multa: t.multa,
                atraso: t.atraso,
                valorPago: t.valorPago,
              }))
            : undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `Baixa Athos: falha ao gravar log cobrancaId=${p.cobrancaBoletoId}: ${err instanceof Error ? err.name : "erro"}.`,
      );
    }
  }

  private paraExcecaoHttp(codigo: string, mensagem: string): Error {
    if (CODIGOS_INFRA.has(codigo)) {
      return new InternalServerErrorException(`Falha de infraestrutura na baixa Athos (${codigo}).`);
    }
    return new UnprocessableEntityException({ codigo, message: mensagem });
  }
}
