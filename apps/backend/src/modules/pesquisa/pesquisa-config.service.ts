/**
 * Fase 52 (plano 52-03): configuracao da pesquisa e da recompensa (singleton id "default").
 *
 * D-24/D-26/D-42: a linha nasce no primeiro acesso com `ativo: false`, todos os textos preenchidos e
 * os padroes da empresa vindos das envs por instancia (PESQUISA_*_PADRAO) ou dos padroes do codigo.
 * Este plano so le e cria o padrao: a escrita (tela admin) e o DTO entram no plano 52-07.
 */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PesquisaConfig } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { type ConfigEntrada, montarConfigPadrao } from "./pesquisa-regras";

export type PesquisaConfigView = ConfigEntrada & {
  atualizadoEm: Date | null;
  atualizadoPor: string | null;
};

@Injectable()
export class PesquisaConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Le o singleton; ausente, cria com o padrao da empresa. Nunca guarda Decimal no retorno. */
  async obter(): Promise<PesquisaConfigView> {
    const existente = await this.prisma.pesquisaConfig.findUnique({ where: { id: "default" } });
    const linha =
      existente ??
      (await this.prisma.pesquisaConfig.create({ data: { id: "default", ...this.padroes() } }));
    return this.paraView(linha);
  }

  /** Padrao sugerido da instancia (para a tela do plano 52-07 mostrar o valor sugerido). */
  padroes(): ConfigEntrada {
    return montarConfigPadrao((chave) => this.config.get<string>(chave));
  }

  private paraView(linha: PesquisaConfig): PesquisaConfigView {
    return {
      ativo: linha.ativo,
      percentualDesconto: Number(String(linha.percentualDesconto)),
      tetoDesconto: Number(String(linha.tetoDesconto)),
      compraMinima: Number(String(linha.compraMinima)),
      validadeCupomDias: linha.validadeCupomDias,
      validadeLinkDias: linha.validadeLinkDias,
      intervaloDias: linha.intervaloDias,
      tetoMensal: Number(String(linha.tetoMensal)),
      prefixoCupom: linha.prefixoCupom,
      linkGoogle: linha.linkGoogle ?? null,
      varianteVisual: linha.varianteVisual,
      textoFechamento: linha.textoFechamento,
      textoSemRecompensa: linha.textoSemRecompensa,
      textoPosResposta: linha.textoPosResposta,
      textoConviteGoogle: linha.textoConviteGoogle,
      paginaTitulo: linha.paginaTitulo,
      paginaSubtitulo: linha.paginaSubtitulo,
      paginaObrigadoSemRecompensa: linha.paginaObrigadoSemRecompensa,
      paginaGoogleTitulo: linha.paginaGoogleTitulo,
      paginaGoogleCorpo: linha.paginaGoogleCorpo,
      atualizadoEm: linha.atualizadoEm ?? null,
      atualizadoPor: linha.atualizadoPor ?? null,
    };
  }
}
