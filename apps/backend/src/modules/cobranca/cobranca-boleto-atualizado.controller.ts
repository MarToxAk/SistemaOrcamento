import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from "@nestjs/common";

import { CobrancaBoletoAtualizadoService } from "./cobranca-boleto-atualizado.service";
import { GerarBoletoAtualizadoDto, PreviaBoletoAtualizadoDto } from "./dto/gerar-boleto-atualizado.dto";

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

  /**
   * Previa do boleto atualizado (D-06): detalhamento, datas permitidas e taxas, calculados no servidor.
   * Nao chama a EFI nem grava nada; responde 200 (nao cria recurso).
   */
  @Post("boleto/:id/atualizacao/previa")
  @HttpCode(HttpStatus.OK)
  async previa(@Param("id", ParseIntPipe) id: number, @Body() dto: PreviaBoletoAtualizadoDto) {
    return this.boletoAtualizado.previa(id, dto);
  }
}
