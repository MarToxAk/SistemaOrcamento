import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  AthosContaReceberBaixaService,
  BaixaAthosError,
  BaixaConstantes,
  BaixarTitulosResultado,
  hojeSaoPaulo,
} from "../integrations/athos/athos-conta-receber-baixa.service";
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

/** Padroes: auto=true, forma=10, livro=2, funcionario=1. So o texto exato "false" desliga o auto. */
export function resolverConfigBaixaAthos(get: (chave: string) => string | undefined): ConfigBaixaAthos {
  const auto = String(get("ATHOS_BAIXA_AUTO") ?? "").trim() !== "false";
  return {
    auto,
    constantes: {
      idFormaPagamento: lerInteiroPositivo(get, "ATHOS_BAIXA_ID_FORMA_PAGAMENTO", PADROES.forma),
      idLivroRegistro: lerInteiroPositivo(get, "ATHOS_BAIXA_ID_LIVRO_REGISTRO", PADROES.livro),
      idFuncionario: lerInteiroPositivo(get, "ATHOS_BAIXA_ID_FUNCIONARIO", PADROES.funcionario),
    },
  };
}

export type OrigemBaixa = "webhook" | "reconciliacao" | "manual" | "retentativa";

export interface DadosPagamentoEfi {
  dataPagamento: string | null;
  /** 'payment.paid_at' | 'payment.received_by_bank_at' | 'paid_at' | 'fallback_hoje' */
  fonteData: string;
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

/**
 * Extrai a data real do pagamento do payload bruto da cobranca EFI (objeto ou array; usa o primeiro item).
 * Ordem: payment.paid_at, payment.received_by_bank_at, paid_at. Nunca lanca. Data futura vira hoje.
 */
export function extrairDadosPagamentoEfi(payload: unknown, hoje: string = hojeSaoPaulo()): DadosPagamentoEfi {
  try {
    const item = (Array.isArray(payload) ? payload[0] : payload) as Record<string, any> | null | undefined;
    if (item && typeof item === "object") {
      const candidatos: Array<[unknown, string]> = [
        [item.payment?.paid_at, "payment.paid_at"],
        [item.payment?.received_by_bank_at, "payment.received_by_bank_at"],
        [item.paid_at, "paid_at"],
      ];
      for (const [valor, fonte] of candidatos) {
        const data = paraDataSaoPaulo(valor);
        if (data) return { dataPagamento: data > hoje ? hoje : data, fonteData: fonte };
      }
    }
  } catch {
    // cai no fallback abaixo
  }
  return { dataPagamento: null, fonteData: "fallback_hoje" };
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
      });

      this.logger.log(
        `Baixa Athos ${detalhe.resultado} cobrancaId=${cobrancaBoletoId} origem=${ctx.origem} ` +
          `titulos=${idsTitulos.join(",")} data=${dataPagamento} fonteData=${dados.fonteData} retroativa=${detalhe.retroativa}.`,
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
