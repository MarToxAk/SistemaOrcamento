import { Body, Controller, Get, Put } from "@nestjs/common";

import { AdminOnly } from "../security/admin.decorator";
import {
  JUROS_MES_PADRAO,
  MULTA_PERCENTUAL_PADRAO,
  TETO_JUROS_MES,
  TETO_MULTA_PERCENTUAL,
} from "./cobranca-boleto-atualizado.util";
import { CobrancaEncargosConfigService, type EncargosConfig } from "./cobranca-encargos-config.service";
import { AtualizarEncargosConfigDto } from "./dto/atualizar-encargos-config.dto";

export interface RespostaEncargosConfig {
  taxaJurosMes: number;
  multaPercentual: number;
  atualizadoEm: string | null;
  padroes: { taxaJurosMes: number; multaPercentual: number };
  tetos: { taxaJurosMes: number; multaPercentual: number };
}

function montarResposta(c: EncargosConfig): RespostaEncargosConfig {
  return {
    taxaJurosMes: c.taxaJurosMes,
    multaPercentual: c.multaPercentual,
    atualizadoEm: c.atualizadoEm ? c.atualizadoEm.toISOString() : null,
    padroes: { taxaJurosMes: JUROS_MES_PADRAO, multaPercentual: MULTA_PERCENTUAL_PADRAO },
    tetos: { taxaJurosMes: TETO_JUROS_MES, multaPercentual: TETO_MULTA_PERCENTUAL },
  };
}

/** Taxas padrao do boleto atualizado (Fase 50, D-07/D-18). Leitura e escrita exigem admin. */
@Controller("cobranca")
export class CobrancaEncargosConfigController {
  constructor(private readonly encargosConfig: CobrancaEncargosConfigService) {}

  @AdminOnly()
  @Get("encargos-config")
  async obter(): Promise<RespostaEncargosConfig> {
    return montarResposta(await this.encargosConfig.obter());
  }

  @AdminOnly()
  @Put("encargos-config")
  async atualizar(@Body() dto: AtualizarEncargosConfigDto): Promise<RespostaEncargosConfig> {
    return montarResposta(
      await this.encargosConfig.atualizar({ taxaJurosMes: dto.taxaJurosMes, multaPercentual: dto.multaPercentual }),
    );
  }
}
