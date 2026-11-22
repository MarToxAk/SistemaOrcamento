/**
 * Fase 52 (plano 52-12): rotas administrativas da pesquisa (D-17, D-23, D-24, D-25 e revogacao do CONTEXT).
 *
 * `@Controller("pesquisa/admin")` com `@AdminOnly()` em CADA handler (nenhuma rota publica, inclusive a
 * revogacao). Serve as telas dos planos 52-08 (config), 52-09 (painel e revogacao) e 52-10 (cupons e
 * resgate). A criacao de etiquetas nao tem endpoint: e passo manual do roteiro com token de
 * administrador digitado na hora (D-33), por isso o controller nao depende do cliente do Chatwoot.
 *
 * Nenhuma resposta expoe telefone completo (sempre `telefoneMascarado`), token ou conversationId.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import { AdminOnly } from "../security/admin.decorator";
import { AtualizarPesquisaConfigDto } from "./dto/atualizar-pesquisa-config.dto";
import { ListarCuponsQueryDto } from "./dto/listar-cupons.query.dto";
import { ResgatarCupomDto } from "./dto/resgatar-cupom.dto";
import { PesquisaConfigService, type PesquisaConfigView } from "./pesquisa-config.service";
import { type CupomDetalhe, type CupomListaItem, PesquisaCupomService, type ResgateCupomResultado } from "./pesquisa-cupom.service";
import {
  type PeriodoResultados,
  PesquisaResultadosService,
  type ResultadosDTO,
} from "./pesquisa-resultados.service";
import { PesquisaRevogacaoService, type ResultadoRevogacao } from "./pesquisa-revogacao.service";
import { HOSTS_GOOGLE, PLACEHOLDERS_VALIDOS, type ConfigEntrada } from "./pesquisa-regras";

/** UI-D15: limites exibidos/editaveis na tela de configuracao. */
const LIMITES_CONFIG = {
  percentualMin: 1,
  percentualMax: 50,
  validadeCupomMin: 1,
  validadeCupomMax: 180,
  validadeLinkMin: 1,
  validadeLinkMax: 14,
  intervaloMin: 0,
  intervaloMax: 365,
  textoMax: 600,
} as const;

const PERIODOS: readonly PeriodoResultados[] = ["mes", "30d", "tudo"];

const MSG_CUPOM_NAO_ENCONTRADO = "Cupom não encontrado. Confira se digitou o código completo.";

export interface RespostaConfigAdmin {
  config: ConfigEntrada;
  padroes: Pick<ConfigEntrada, "percentualDesconto" | "tetoDesconto" | "compraMinima" | "tetoMensal" | "prefixoCupom">;
  limites: typeof LIMITES_CONFIG;
  placeholders: readonly string[];
  hostsGoogle: readonly string[];
  atualizadoEm: string | null;
}

function montarRespostaConfig(view: PesquisaConfigView, padroes: ConfigEntrada): RespostaConfigAdmin {
  const { atualizadoEm, atualizadoPor, ...config } = view;
  void atualizadoPor;
  return {
    config,
    padroes: {
      percentualDesconto: padroes.percentualDesconto,
      tetoDesconto: padroes.tetoDesconto,
      compraMinima: padroes.compraMinima,
      tetoMensal: padroes.tetoMensal,
      prefixoCupom: padroes.prefixoCupom,
    },
    limites: LIMITES_CONFIG,
    placeholders: PLACEHOLDERS_VALIDOS,
    hostsGoogle: HOSTS_GOOGLE,
    atualizadoEm: atualizadoEm ? atualizadoEm.toISOString() : null,
  };
}

@Controller("pesquisa/admin")
export class PesquisaAdminController {
  constructor(
    private readonly configPesquisa: PesquisaConfigService,
    private readonly resultadosService: PesquisaResultadosService,
    private readonly cupomService: PesquisaCupomService,
    private readonly revogacao: PesquisaRevogacaoService,
  ) {}

  @AdminOnly()
  @Get("config")
  async obterConfig(): Promise<RespostaConfigAdmin> {
    return montarRespostaConfig(await this.configPesquisa.obter(), this.configPesquisa.padroes());
  }

  @AdminOnly()
  @Put("config")
  async atualizarConfig(@Body() dto: AtualizarPesquisaConfigDto): Promise<RespostaConfigAdmin> {
    const view = await this.configPesquisa.atualizar(dto, "admin");
    return montarRespostaConfig(view, this.configPesquisa.padroes());
  }

  @AdminOnly()
  @Get("resultados")
  async resultados(@Query("periodo") periodo?: string): Promise<ResultadosDTO> {
    const escolhido = (periodo ?? "mes") as PeriodoResultados;
    if (!PERIODOS.includes(escolhido)) {
      throw new BadRequestException("periodo deve ser mes, 30d ou tudo.");
    }
    return this.resultadosService.resultados(escolhido);
  }

  @AdminOnly()
  @Get("cupons")
  async listarCupons(@Query() query: ListarCuponsQueryDto): Promise<{ itens: CupomListaItem[]; proximoCursor: string | null }> {
    return this.cupomService.listar({ status: query.status, cursor: query.cursor, limite: query.limite });
  }

  @AdminOnly()
  @Get("cupons/:codigo")
  async detalheCupom(@Param("codigo") codigo: string): Promise<CupomDetalhe> {
    const detalhe = await this.cupomService.buscarPorCodigo(codigo);
    if (!detalhe) throw new NotFoundException(MSG_CUPOM_NAO_ENCONTRADO);
    return detalhe;
  }

  @AdminOnly()
  @Post("cupons/:codigo/resgate")
  @HttpCode(200)
  async resgatarCupom(@Param("codigo") codigo: string, @Body() dto: ResgatarCupomDto): Promise<ResgateCupomResultado> {
    return this.cupomService.resgatar(codigo, dto.valorCompra);
  }

  @AdminOnly()
  @Post("pesquisas/:id/revogar")
  @HttpCode(200)
  async revogarPesquisa(@Param("id") id: string): Promise<ResultadoRevogacao> {
    return this.revogacao.revogar(id);
  }
}
