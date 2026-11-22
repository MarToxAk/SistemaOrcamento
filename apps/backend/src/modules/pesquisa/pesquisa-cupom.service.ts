/**
 * Fase 52 (plano 52-07): consulta, lista paginada e resgate de cupons de recompensa (D-17/D-30/UI-D09).
 *
 * O resgate nunca confia no calculo do cliente: desconto, compra minima e teto do cupom sao o snapshot
 * gravado na emissao; o teto mensal e lido dentro da transacao, serializada por `pg_advisory_xact_lock`,
 * e a gravacao usa `updateMany` condicionado a EMITIDO + validade (uso unico sob concorrencia).
 *
 * Nenhum retorno expoe telefone completo, token ou conversationId: o telefone sai sempre mascarado.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { CupomRecompensa } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { PesquisaConfigService } from "./pesquisa-config.service";
import { PesquisaService } from "./pesquisa.service";
import {
  REGEX_CODIGO,
  type SituacaoCupom,
  calcularDescontoCentavos,
  deCentavos,
  formatarDataBR,
  formatarReais,
  janelaMesSaoPaulo,
  mascararTelefone,
  normalizarCodigo,
  paraCentavos,
  situacaoCupom,
} from "./pesquisa-regras";

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 100;

const MSG_NAO_ENCONTRADO = "Cupom não encontrado. Confira se digitou o código completo.";
const MSG_JA_USADO = "Este cupom já foi usado. Atualize a busca.";

type LinhaCupom = Pick<
  CupomRecompensa,
  | "id"
  | "codigo"
  | "pesquisaId"
  | "telefone"
  | "percentual"
  | "teto"
  | "compraMinima"
  | "status"
  | "validadeAte"
  | "criadoEm"
  | "valorCompra"
  | "descontoAplicado"
  | "usadoEm"
  | "usadoPor"
> & { pesquisa?: { nota: number | null } | null };

export interface CupomListaItem {
  codigo: string;
  criadoEm: string;
  telefoneMascarado: string;
  percentual: number;
  teto: number;
  compraMinima: number;
  validadeAte: string;
  situacao: SituacaoCupom;
  usadoEm: string | null;
  descontoAplicado: number | null;
  notaPesquisa: number | null;
}

export interface CupomDetalhe extends CupomListaItem {
  valorCompra: number | null;
  usadoPor: string | null;
  suspensoAte: string | null;
}

export interface ResgateCupomResultado {
  cupom: CupomDetalhe;
  descontoAplicado: number;
  valorFinal: number;
}

export interface FiltroListaCupons {
  status?: string;
  cursor?: string;
  limite?: number;
}

function numero(valor: unknown): number {
  return Number(String(valor));
}

function duasCasas(valor: number): boolean {
  return Number.isFinite(valor) && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-9;
}

@Injectable()
export class PesquisaCupomService {
  private readonly logger = new Logger(PesquisaCupomService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configPesquisa: PesquisaConfigService,
    private readonly pesquisa: PesquisaService,
  ) {}

  /** Detalhe pelo codigo digitado (normalizado); null quando o formato nao e de cupom ou nao existe. */
  async buscarPorCodigo(codigo: string, agora: Date = new Date()): Promise<CupomDetalhe | null> {
    const normalizado = normalizarCodigo(codigo);
    if (!REGEX_CODIGO.test(normalizado)) return null;

    const linha = (await this.prisma.cupomRecompensa.findUnique({
      where: { codigo: normalizado },
      include: { pesquisa: { select: { nota: true } } },
    })) as LinhaCupom | null;
    if (!linha) return null;

    const cfg = await this.configPesquisa.obter();
    const gastoCentavos = await this.pesquisa.gastoDoMesCentavos(agora);
    return this.paraDetalhe(linha, agora, gastoCentavos, paraCentavos(String(cfg.tetoMensal)));
  }

  /** Lista paginada por cursor (50 por pagina, maximo 100) com filtro de situacao. */
  async listar(
    filtro: FiltroListaCupons,
    agora: Date = new Date(),
  ): Promise<{ itens: CupomListaItem[]; proximoCursor: string | null }> {
    const limite = this.normalizarLimite(filtro.limite);
    const cfg = await this.configPesquisa.obter();
    const gastoCentavos = await this.pesquisa.gastoDoMesCentavos(agora);
    const tetoCentavos = paraCentavos(String(cfg.tetoMensal));

    const linhas = (await this.prisma.cupomRecompensa.findMany({
      where: this.filtroStatus(filtro.status, agora),
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      take: limite + 1,
      ...(filtro.cursor ? { cursor: { id: filtro.cursor }, skip: 1 } : {}),
      include: { pesquisa: { select: { nota: true } } },
    })) as LinhaCupom[];

    const temMais = linhas.length > limite;
    const visiveis = temMais ? linhas.slice(0, limite) : linhas;
    const ultimo = visiveis[visiveis.length - 1];

    return {
      itens: visiveis.map((linha) => this.paraItem(linha, agora, gastoCentavos, tetoCentavos)),
      proximoCursor: temMais && ultimo ? ultimo.id : null,
    };
  }

  /**
   * D-17/D-30/P10/P12: resgate atomico e de uso unico. O valor da compra vem do balcao; todo o resto e
   * recalculado com o snapshot do cupom e o teto mensal e checado dentro da transacao (teto rigido).
   */
  async resgatar(codigo: string, valorCompra: number, agora: Date = new Date()): Promise<ResgateCupomResultado> {
    const compraCentavos = paraCentavos(valorCompra);
    if (!Number.isFinite(compraCentavos) || compraCentavos <= 0 || !duasCasas(valorCompra)) {
      throw new BadRequestException("Informe o valor da compra.");
    }

    const normalizado = normalizarCodigo(codigo);
    if (!REGEX_CODIGO.test(normalizado)) throw new NotFoundException(MSG_NAO_ENCONTRADO);

    const cfg = await this.configPesquisa.obter();
    const tetoMensalCentavos = paraCentavos(String(cfg.tetoMensal));
    const janela = janelaMesSaoPaulo(agora);

    const descontoCentavos = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(520001)`;

      const cupom = await tx.cupomRecompensa.findUnique({ where: { codigo: normalizado } });
      if (!cupom) throw new NotFoundException(MSG_NAO_ENCONTRADO);

      if (cupom.status === "USADO") throw new ConflictException({ codigo: "JA_USADO", message: MSG_JA_USADO });
      if (cupom.status === "CANCELADO") {
        throw new UnprocessableEntityException({
          codigo: "CANCELADO",
          message: "Este cupom foi cancelado e não pode ser usado.",
        });
      }
      if (cupom.status === "EXPIRADO" || cupom.validadeAte.getTime() < agora.getTime()) {
        throw new UnprocessableEntityException({ codigo: "VENCIDO", message: "Este cupom venceu e não pode ser usado." });
      }

      const minimoCentavos = paraCentavos(String(cupom.compraMinima));
      if (compraCentavos < minimoCentavos) {
        throw new UnprocessableEntityException({
          codigo: "ABAIXO_DO_MINIMO",
          message: `Compra mínima de ${formatarReais(minimoCentavos / 100)} não atingida. Este cupom não pode ser usado nesta compra.`,
        });
      }

      const percentualBps = Math.round(numero(cupom.percentual) * 100);
      const desconto = calcularDescontoCentavos(compraCentavos, percentualBps, paraCentavos(String(cupom.teto)));

      const soma = await tx.cupomRecompensa.aggregate({
        _sum: { descontoAplicado: true },
        where: { status: "USADO", usadoEm: { gte: janela.inicio, lt: janela.fim } },
      });
      const gastoCentavos =
        soma?._sum?.descontoAplicado === null || soma?._sum?.descontoAplicado === undefined
          ? 0
          : paraCentavos(String(soma._sum.descontoAplicado));

      if (gastoCentavos + desconto > tetoMensalCentavos) {
        throw new UnprocessableEntityException({
          codigo: "TETO_MENSAL",
          message: `Teto mensal atingido. Este cupom só pode ser usado a partir de ${formatarDataBR(janela.fim)}.`,
          liberadoEm: janela.fim.toISOString(),
        });
      }

      const atualizados = await tx.cupomRecompensa.updateMany({
        where: { id: cupom.id, status: "EMITIDO", validadeAte: { gte: agora } },
        data: {
          status: "USADO",
          valorCompra: deCentavos(compraCentavos),
          descontoAplicado: deCentavos(desconto),
          usadoEm: agora,
          usadoPor: "balcao",
        },
      });
      if (atualizados.count !== 1) throw new ConflictException({ codigo: "JA_USADO", message: MSG_JA_USADO });

      return desconto;
    });

    const cupomAtualizado = await this.buscarPorCodigo(normalizado, agora);
    if (!cupomAtualizado) throw new NotFoundException(MSG_NAO_ENCONTRADO);

    return {
      cupom: cupomAtualizado,
      descontoAplicado: descontoCentavos / 100,
      valorFinal: (compraCentavos - descontoCentavos) / 100,
    };
  }

  private normalizarLimite(limite: number | undefined): number {
    if (!Number.isFinite(limite) || limite === undefined) return LIMITE_PADRAO;
    return Math.min(Math.max(Math.trunc(limite), 1), LIMITE_MAXIMO);
  }

  private filtroStatus(status: string | undefined, agora: Date): Record<string, unknown> {
    if (status === "disponiveis") return { status: "EMITIDO", validadeAte: { gte: agora } };
    if (status === "usados") return { status: "USADO" };
    if (status === "cancelados") return { status: "CANCELADO" };
    if (status === "vencidos") {
      return { OR: [{ status: "EXPIRADO" }, { status: "EMITIDO", validadeAte: { lt: agora } }] };
    }
    return {};
  }

  private paraItem(linha: LinhaCupom, agora: Date, gastoCentavos: number, tetoCentavos: number): CupomListaItem {
    return {
      codigo: linha.codigo,
      criadoEm: new Date(linha.criadoEm).toISOString(),
      telefoneMascarado: mascararTelefone(linha.telefone),
      percentual: numero(linha.percentual),
      teto: numero(linha.teto),
      compraMinima: numero(linha.compraMinima),
      validadeAte: new Date(linha.validadeAte).toISOString(),
      situacao: situacaoCupom(linha, agora, gastoCentavos, tetoCentavos),
      usadoEm: linha.usadoEm ? new Date(linha.usadoEm).toISOString() : null,
      descontoAplicado: linha.descontoAplicado === null || linha.descontoAplicado === undefined ? null : numero(linha.descontoAplicado),
      notaPesquisa: linha.pesquisa?.nota ?? null,
    };
  }

  private paraDetalhe(linha: LinhaCupom, agora: Date, gastoCentavos: number, tetoCentavos: number): CupomDetalhe {
    const item = this.paraItem(linha, agora, gastoCentavos, tetoCentavos);
    return {
      ...item,
      valorCompra: linha.valorCompra === null || linha.valorCompra === undefined ? null : numero(linha.valorCompra),
      usadoPor: linha.usadoPor ?? null,
      suspensoAte: item.situacao === "SUSPENSO" ? janelaMesSaoPaulo(agora).fim.toISOString() : null,
    };
  }
}
