import { Body, Controller, Param, ParseIntPipe, Post } from "@nestjs/common";

import { CobrancaBoletoAtualizadoService } from "./cobranca-boleto-atualizado.service";
import { GerarBoletoAtualizadoDto } from "./dto/gerar-boleto-atualizado.dto";

@Controller("cobranca")
export class CobrancaBoletoAtualizadoController {
  constructor(private readonly boletoAtualizado: CobrancaBoletoAtualizadoService) {}

  /**
   * Gera o boleto atualizado (juros e multa) e cancela o original na EFI (Fase 50).
   * Sem @Public: protegido pelo guard global (x-internal-api-key), como criarBoleto.
   */
  @Post("boleto/:id/atualizar")
  async gerar(@Param("id", ParseIntPipe) id: number, @Body() dto: GerarBoletoAtualizadoDto) {
    return this.boletoAtualizado.gerar(id, dto);
  }
}
