/**
 * Fase 52 (plano 52-03): configuracao da pesquisa e da recompensa (singleton id "default").
 *
 * D-24/D-26/D-42: a linha nasce no primeiro acesso com `ativo: false`, todos os textos preenchidos e
 * os padroes da empresa vindos das envs por instancia (PESQUISA_*_PADRAO) ou dos padroes do codigo.
 */
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PesquisaConfig } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { type ConfigEntrada, montarConfigPadrao, validarConfig } from "./pesquisa-regras";

export type PesquisaConfigView = ConfigEntrada & {
  atualizadoEm: Date | null;
  atualizadoPor: string | null;
};

/** Campos Decimal(x, 2): o servidor recusa mais de 2 casas mesmo que a tela deixe passar (UI-D15). */
const CAMPOS_DECIMAIS: Array<keyof ConfigEntrada> = [
  "percentualDesconto",
  "tetoDesconto",
  "compraMinima",
  "tetoMensal",
];

const CAMPOS_TEXTO: Array<keyof ConfigEntrada> = [
  "textoFechamento",
  "textoSemRecompensa",
  "textoPosResposta",
  "textoConviteGoogle",
  "paginaTitulo",
  "paginaSubtitulo",
  "paginaObrigadoSemRecompensa",
  "paginaGoogleTitulo",
  "paginaGoogleCorpo",
];

function duasCasas(valor: unknown): boolean {
  return typeof valor === "number" && Number.isFinite(valor) && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-9;
}

@Injectable()
export class PesquisaConfigService {
  private readonly logger = new Logger(PesquisaConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Le o singleton; ausente, cria com o padrao da empresa. Nunca guarda Decimal no retorno. */
  async obter(): Promise<PesquisaConfigView> {
    const existente = await this.prisma.pesquisaConfig.findUnique({ where: { id: "default" } });
    const linha = existente ?? (await this.criarPadrao());
    return this.paraView(linha);
  }

  /**
   * Cria o singleton no primeiro acesso. Dois acessos concorrentes podem tentar criar ao mesmo tempo:
   * o que perde recebe P2002 (id ja existe) e apenas le a linha criada pelo vencedor.
   */
  private async criarPadrao(): Promise<PesquisaConfig> {
    try {
      return await this.prisma.pesquisaConfig.create({ data: { id: "default", ...this.padroes() } });
    } catch (err) {
      if ((err as { code?: string } | null)?.code !== "P2002") throw err;
      const criada = await this.prisma.pesquisaConfig.findUnique({ where: { id: "default" } });
      if (!criada) throw err;
      return criada;
    }
  }

  /** Padrao sugerido da instancia (para a tela do plano 52-07 mostrar o valor sugerido). */
  padroes(): ConfigEntrada {
    return montarConfigPadrao((chave) => this.config.get<string>(chave));
  }

  /**
   * D-24/D-39/UI-D16: grava a config INTEIRA de uma vez. Normaliza antes de validar; `validarConfig` e a
   * fonte unica dos limites (desconto, validade, allowlist do Google, placeholders, 600 caracteres) e os
   * erros saem por campo em portugues. O log registra so a mudanca de ativo, nunca textos nem links.
   */
  async atualizar(entrada: ConfigEntrada, por?: string): Promise<PesquisaConfigView> {
    const normalizada = this.normalizar(entrada);
    const erros = validarConfig(normalizada);
    for (const campo of CAMPOS_DECIMAIS) {
      if (erros[campo] === undefined && !duasCasas(normalizada[campo])) {
        erros[campo] = "Use no máximo 2 casas decimais.";
      }
    }
    if (Object.keys(erros).length > 0) {
      throw new BadRequestException({
        message: Object.entries(erros).map(([campo, mensagem]) => `${campo}: ${mensagem}`),
        campos: erros,
      });
    }

    const antes = await this.obter();
    await this.prisma.pesquisaConfig.update({
      where: { id: "default" },
      data: { ...normalizada, atualizadoPor: por ?? "admin" },
    });
    if (antes.ativo !== normalizada.ativo) {
      this.logger.log(
        normalizada.ativo
          ? "Pesquisa e recompensa ativadas (antes: inativo)"
          : "Pesquisa e recompensa desativadas (antes: ativo)",
      );
    }
    return this.obter();
  }

  private normalizar(entrada: ConfigEntrada): ConfigEntrada {
    const normalizada: ConfigEntrada = {
      ...entrada,
      prefixoCupom: String(entrada.prefixoCupom ?? "").trim().toUpperCase(),
      linkGoogle:
        entrada.linkGoogle === null || entrada.linkGoogle === undefined || !String(entrada.linkGoogle).trim()
          ? null
          : String(entrada.linkGoogle).trim(),
    };
    for (const campo of CAMPOS_TEXTO) {
      (normalizada as unknown as Record<string, unknown>)[campo] = String(entrada[campo] ?? "").trim();
    }
    return normalizada;
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
