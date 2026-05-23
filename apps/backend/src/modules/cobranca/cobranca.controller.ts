import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Param, ParseIntPipe, Post, Query, Res } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpressResponse = any;

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
   * Retorna quais idcontareceber já possuem boleto pendente ou pago.
   * Usado pelo frontend para desabilitar seleção e mostrar aviso.
   */
  @Post("boleto/titulos-em-uso")
  async titulosEmUso(@Body() body: { idcontasReceber: number[] }) {
    return this.cobrancaService.buscarTitulosComBoletoAtivo(body.idcontasReceber ?? []);
  }

  /**
   * Download do PDF do boleto com nome formatado.
   * Requer autenticação via x-internal-api-key.
   */
  @Get("boleto/:id/pdf")
  async downloadBoleto(
    @Param("id", ParseIntPipe) cobrancaId: number,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const { pdfBuffer, nomeArquivo } = await this.cobrancaService.downloadBoletoPdf(cobrancaId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.send(pdfBuffer);
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
