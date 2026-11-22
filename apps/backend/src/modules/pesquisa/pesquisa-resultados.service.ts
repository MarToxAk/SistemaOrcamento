/**
 * Fase 52 (plano 52-07): painel de resultados da pesquisa (D-25, UI-D13, UI-D09).
 *
 * Numeros honestos: a taxa de resposta sempre traz o par n de N (respondidas / enviadas com sucesso no
 * periodo), o comparativo A/B sinaliza amostra pequena abaixo de 30 respostas por variante e o gasto
 * real do mes e sempre o mes atual de America/Sao_Paulo, independente do filtro de periodo.
 *
 * Pesquisas revogadas continuam contando nas metricas (a revogacao so desativa o link e cancela o
 * cupom disponivel); o campo `revogada` permite a tela esconder a acao. Nenhum telefone completo, token
 * ou conversationId sai deste servico.
 */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../database/prisma.service";
import { PesquisaConfigService } from "./pesquisa-config.service";
import { PesquisaService } from "./pesquisa.service";
import {
  type SituacaoCupom,
  janelaMesSaoPaulo,
  mascararTelefone,
  paraCentavos,
  situacaoCupom,
} from "./pesquisa-regras";

const DIA_MS = 86_400_000;
const JANELA_30_DIAS = 30 * DIA_MS;
const MINIMO_AMOSTRA = 30;
const MAXIMO_ULTIMAS = 20;

export type PeriodoResultados = "mes" | "30d" | "tudo";

export interface ResultadosDTO {
  periodo: PeriodoResultados;
  notaMedia: number | null;
  totalRespostas: number;
  taxaResposta: { respondidas: number; enviadas: number; percentual: number | null };
  cupons: { emitidos: number; usados: number; vencidos: number };
  gastoMes: { valor: number; teto: number; percentual: number; atingido: boolean };
  variantes: Array<{
    variante: "ESTRELAS" | "CARINHAS";
    respostas: number;
    notaMedia: number | null;
    enviadas: number;
    taxaResposta: number | null;
  }>;
  amostraPequena: boolean;
  distribuicao: Array<{ nota: 1 | 2 | 3 | 4 | 5; total: number; percentual: number }>;
  ultimas: Array<{
    id: string;
    respondidaEm: string;
    nota: number;
    variante: string;
    comentario: string | null;
    telefoneMascarado: string;
    revogada: boolean;
    cupom: { situacao: SituacaoCupom } | { situacao: "SEM_CUPOM" };
  }>;
  relatorioChatwootUrl: string | null;
}

type CupomDaLinha = { status: string; validadeAte: Date; usadoEm: Date | null; descontoAplicado: unknown };

type PesquisaRow = {
  id: string;
  nota: number | null;
  comentario: string | null;
  variante: string;
  telefone: string | null;
  status: string;
  enviadaEm: Date | null;
  respondidaEm: Date | null;
  revogadaEm: Date | null;
  cupom: CupomDaLinha | null;
};

type CupomRow = { criadoEm: Date; status: string; validadeAte: Date; usadoEm: Date | null; descontoAplicado: unknown };

type Janela = { inicio: Date; fim: Date | null } | null;

function umaCasa(valor: number): number {
  return Math.round(valor * 10) / 10;
}

@Injectable()
export class PesquisaResultadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configPesquisa: PesquisaConfigService,
    private readonly pesquisa: PesquisaService,
    private readonly config: ConfigService,
  ) {}

  async resultados(periodo: PeriodoResultados, agora: Date = new Date()): Promise<ResultadosDTO> {
    const janela = this.janela(periodo, agora);
    const cfg = await this.configPesquisa.obter();

    const [pesquisas, cupons, gastoCentavos] = await Promise.all([
      this.prisma.pesquisaSatisfacao.findMany({
        select: {
          id: true,
          nota: true,
          comentario: true,
          variante: true,
          telefone: true,
          status: true,
          enviadaEm: true,
          respondidaEm: true,
          revogadaEm: true,
          cupom: { select: { status: true, validadeAte: true, usadoEm: true, descontoAplicado: true } },
        },
      }) as Promise<PesquisaRow[]>,
      this.prisma.cupomRecompensa.findMany({
        select: { criadoEm: true, status: true, validadeAte: true, usadoEm: true, descontoAplicado: true },
      }) as Promise<CupomRow[]>,
      this.pesquisa.gastoDoMesCentavos(agora),
    ]);

    const respondidas = pesquisas.filter((p) => this.dentro(p.respondidaEm, janela));
    // Enviadas = pesquisas cuja mensagem saiu com sucesso no periodo (CRIADA nunca entrou na conta).
    const enviadas = pesquisas.filter(
      (p) => (p.status === "ENVIADA" || p.status === "RESPONDIDA") && this.dentro(p.enviadaEm, janela),
    );
    const totalRespostas = respondidas.length;
    // WR-03: a taxa de resposta usa a mesma coorte no numerador e no denominador (enviada E respondida
    // no periodo); sem isso, respostas de envios do periodo anterior inflavam a taxa acima de 100%.
    const respondidasDasEnviadas = enviadas.filter((p) => this.dentro(p.respondidaEm, janela));

    const distribuicao = ([1, 2, 3, 4, 5] as const).map((nota) => {
      const total = respondidas.filter((p) => p.nota === nota).length;
      return { nota, total, percentual: totalRespostas > 0 ? umaCasa((total / totalRespostas) * 100) : 0 };
    });

    // A taxa por variante usa o mesmo criterio da taxa geral (respondidas / enviadas daquela variante).
    const variantes = (["ESTRELAS", "CARINHAS"] as const).map((variante) => {
      const respostas = respondidas.filter((p) => p.variante === variante);
      const enviadasVariante = enviadas.filter((p) => p.variante === variante);
      const respondidasEnviadasVariante = respondidasDasEnviadas.filter((p) => p.variante === variante);
      return {
        variante,
        respostas: respostas.length,
        notaMedia: this.media(respostas.map((p) => p.nota)),
        enviadas: enviadasVariante.length,
        taxaResposta:
          enviadasVariante.length > 0
            ? umaCasa((respondidasEnviadasVariante.length / enviadasVariante.length) * 100)
            : null,
      };
    });

    const emitidos = cupons.filter((c) => this.dentro(c.criadoEm, janela)).length;
    const usados = cupons.filter((c) => this.dentro(c.usadoEm, janela)).length;
    const vencidos = cupons.filter(
      (c) =>
        this.dentro(c.criadoEm, janela) &&
        (c.status === "EXPIRADO" || (c.status === "EMITIDO" && c.validadeAte.getTime() < agora.getTime())),
    ).length;

    const teto = Number(String(cfg.tetoMensal));
    const tetoCentavos = paraCentavos(String(cfg.tetoMensal));
    const percentualGasto =
      tetoCentavos > 0 ? Math.min(100, umaCasa((gastoCentavos / tetoCentavos) * 100)) : 0;

    const ultimas = [...respondidas]
      .filter((p) => p.respondidaEm !== null)
      .sort((a, b) => b.respondidaEm!.getTime() - a.respondidaEm!.getTime())
      .slice(0, MAXIMO_ULTIMAS)
      .map((p) => ({
        id: p.id,
        respondidaEm: p.respondidaEm!.toISOString(),
        nota: p.nota ?? 0,
        variante: p.variante,
        comentario: p.comentario ?? null,
        telefoneMascarado: mascararTelefone(p.telefone),
        revogada: p.revogadaEm !== null && p.revogadaEm !== undefined,
        cupom: p.cupom
          ? { situacao: situacaoCupom(p.cupom, agora, gastoCentavos, tetoCentavos) }
          : { situacao: "SEM_CUPOM" as const },
      }));

    const baseChatwoot = (this.config.get<string>("CHATWOOT_BASE_URL") ?? "").trim().replace(/\/+$/, "");
    const contaChatwoot = (this.config.get<string>("CHATWOOT_ACCOUNT_ID") ?? "").trim();

    return {
      periodo,
      notaMedia: this.media(respondidas.map((p) => p.nota)),
      totalRespostas,
      taxaResposta: {
        respondidas: respondidasDasEnviadas.length,
        enviadas: enviadas.length,
        percentual:
          enviadas.length > 0 ? umaCasa((respondidasDasEnviadas.length / enviadas.length) * 100) : null,
      },
      cupons: { emitidos, usados, vencidos },
      gastoMes: {
        valor: gastoCentavos / 100,
        teto,
        percentual: percentualGasto,
        atingido: gastoCentavos >= tetoCentavos,
      },
      variantes,
      amostraPequena: variantes.some((v) => v.respostas < MINIMO_AMOSTRA),
      distribuicao,
      ultimas,
      relatorioChatwootUrl:
        baseChatwoot && contaChatwoot ? `${baseChatwoot}/app/accounts/${contaChatwoot}/reports/csat` : null,
    };
  }

  private janela(periodo: PeriodoResultados, agora: Date): Janela {
    if (periodo === "mes") {
      const { inicio, fim } = janelaMesSaoPaulo(agora);
      return { inicio, fim };
    }
    if (periodo === "30d") return { inicio: new Date(agora.getTime() - JANELA_30_DIAS), fim: null };
    return null;
  }

  private dentro(data: Date | null, janela: Janela): boolean {
    if (!data) return false;
    if (!janela) return true;
    const tempo = data.getTime();
    return tempo >= janela.inicio.getTime() && (janela.fim === null || tempo < janela.fim.getTime());
  }

  private media(notas: Array<number | null>): number | null {
    const validas = notas.filter((nota): nota is number => typeof nota === "number" && Number.isFinite(nota));
    if (validas.length === 0) return null;
    return umaCasa(validas.reduce((soma, nota) => soma + nota, 0) / validas.length);
  }
}
