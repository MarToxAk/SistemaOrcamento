import { BadRequestException, Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { validarTaxas } from "./cobranca-boleto-atualizado.util";

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
  private readonly logger = new Logger(CobrancaEncargosConfigService.name);

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

  /** Grava as taxas padrao (D-07). Tetos de D-16 aplicados tambem aqui, independente do DTO. */
  async atualizar(input: { taxaJurosMes: number; multaPercentual: number }): Promise<EncargosConfig> {
    const erro = validarTaxas(input);
    if (erro) throw new BadRequestException(erro);
    await this.obter(); // garante a linha singleton
    const linha = await this.prisma.cobrancaEncargosConfig.update({
      where: { id: "default" },
      data: { taxaJurosMes: input.taxaJurosMes, multaPercentual: input.multaPercentual },
    });
    this.logger.log(
      `Taxas padrao do boleto atualizado alteradas: juros ${input.taxaJurosMes}% a.m., multa ${input.multaPercentual}%`,
    );
    return {
      taxaJurosMes: Number(String(linha.taxaJurosMes)),
      multaPercentual: Number(String(linha.multaPercentual)),
      atualizadoEm: linha.atualizadoEm ?? null,
    };
  }
}
