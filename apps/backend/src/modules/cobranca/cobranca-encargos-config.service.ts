import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

export interface EncargosConfig {
  taxaJurosMes: number;
  multaPercentual: number;
  atualizadoEm: Date | null;
}

/**
 * Taxas padrao do boleto atualizado (Fase 50, D-07). Singleton (id "default") no padrao de
 * ChatwootAutomationConfig: ausente -> cria com os padroes do banco (0,99% a.m. e 2%).
 */
@Injectable()
export class CobrancaEncargosConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(): Promise<EncargosConfig> {
    const existente = await this.prisma.cobrancaEncargosConfig.findUnique({ where: { id: "default" } });
    const linha = existente ?? (await this.prisma.cobrancaEncargosConfig.create({ data: { id: "default" } }));
    return {
      taxaJurosMes: Number(String(linha.taxaJurosMes)),
      multaPercentual: Number(String(linha.multaPercentual)),
      atualizadoEm: linha.atualizadoEm ?? null,
    };
  }
}
