import { Injectable, Logger } from "@nestjs/common";
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
 * Orquestrador da baixa automatica no Athos (Fase 43, plano 43-01).
 *
 * Contrato central (D-08): `executarAposPagamento` NUNCA lanca. Falha na baixa jamais
 * desfaz o status "pago" do boleto no Sistema nem propaga excecao ao webhook / job.
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

@Injectable()
export class CobrancaBaixaAthosService {
  private readonly logger = new Logger(CobrancaBaixaAthosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly baixaService: AthosContaReceberBaixaService,
    private readonly config: ConfigService,
  ) {}

  /** NUNCA lanca. `payloadEfi` = objeto (ou primeiro item do array) da cobranca EFI, bruto. */
  async executarAposPagamento(
    cobrancaBoletoId: number,
    ctx: { origem: OrigemBaixa; payloadEfi?: unknown },
  ): Promise<ResultadoExecucaoBaixa> {
    let idsTitulos: number[] = [];
    try {
      const cfg = resolverConfigBaixaAthos((chave) => this.config.get<string>(chave));
      if (!cfg.auto) {
        this.logger.log(
          `Baixa Athos desligada (ATHOS_BAIXA_AUTO=false) cobrancaId=${cobrancaBoletoId} origem=${ctx.origem}.`,
        );
        return { status: "desligado" };
      }

      const boleto = await this.prisma.cobrancaBoleto.findUnique({
        where: { id: cobrancaBoletoId },
        include: { titulos: true },
      });
      if (!boleto || boleto.status !== "pago") {
        this.logger.warn(
          `Baixa Athos ignorada: cobrancaId=${cobrancaBoletoId} inexistente ou nao pago (origem=${ctx.origem}).`,
        );
        return { status: "ignorado" };
      }

      const titulos = (boleto.titulos ?? []).map((t) => ({
        idcontareceber: t.idcontareceber,
        valorEsperado: Number(String(t.valor)),
      }));
      idsTitulos = titulos.map((t) => t.idcontareceber);

      const dados = extrairDadosPagamentoEfi(ctx.payloadEfi);
      const dataPagamento = dados.dataPagamento ?? hojeSaoPaulo();

      const detalhe = await this.baixaService.baixarTitulos({
        idclienteAthos: boleto.idclienteAthos,
        titulos,
        dataPagamento,
        constantes: cfg.constantes,
        valorPagoEfi: dados.valorPago,
      });

      this.logger.log(
        `Baixa Athos ${detalhe.resultado} cobrancaId=${cobrancaBoletoId} origem=${ctx.origem} ` +
          `titulos=${idsTitulos.join(",")} data=${dataPagamento} fonteData=${dados.fonteData} fonteValor=${dados.fonteValor} ` +
          `modo=${detalhe.modo} retroativa=${detalhe.retroativa}.`,
      );
      return { status: detalhe.resultado, detalhe };
    } catch (err) {
      const codigo = err instanceof BaixaAthosError ? err.codigo : "ERRO_INESPERADO";
      const mensagem = err instanceof BaixaAthosError ? err.message : "Erro inesperado na baixa Athos.";
      this.logger.error(
        `Baixa Athos FALHOU cobrancaId=${cobrancaBoletoId} origem=${ctx.origem} codigo=${codigo} ` +
          `idcontareceber=${idsTitulos.join(",") || "n/d"}.`,
      );
      return { status: "falha", codigo, mensagem };
    }
  }
}
