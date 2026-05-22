import { Body, Controller, HttpCode, HttpStatus, Logger, Post, Query } from "@nestjs/common";

import { Public } from "../security/public.decorator";
import { CobrancaService } from "./cobranca.service";
import { CriarBoletoDto } from "./dto/criar-boleto.dto";

@Controller("cobranca")
export class CobrancaController {
  private readonly logger = new Logger(CobrancaController.name);

  constructor(private readonly cobrancaService: CobrancaService) {}

  /**
   * Cria um boleto consolidado EFI para os títulos selecionados.
   * Requer autenticação via x-internal-api-key (InternalAuthGuard global).
   */
  @Post("boleto")
  async criarBoleto(@Body() dto: CriarBoletoDto) {
    return this.cobrancaService.criarBoleto(dto);
  }

  /**
   * Webhook EFI — recebe notificação de pagamento.
   * Deve retornar HTTP 200 sempre (sem auth), mesmo em caso de erro interno.
   */
  @Public()
  @Post("boleto/notificacao")
  @HttpCode(HttpStatus.OK)
  async notificacaoEfi(
    @Body() body: { token?: string },
    @Query("token") tokenQuery?: string,
  ): Promise<{ ok: boolean }> {
    const token = body?.token ?? tokenQuery ?? "";
    try {
      await this.cobrancaService.processarNotificacaoEFI(token);
    } catch (err: unknown) {
      this.logger.error(`Erro inesperado no webhook EFI: ${String(err)}`);
    }
    return { ok: true };
  }
}
