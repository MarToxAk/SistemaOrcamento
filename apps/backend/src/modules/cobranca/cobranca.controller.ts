import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Param, ParseIntPipe, Post, Query, Res } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpressResponse = any;

import { Public } from "../security/public.decorator";
import { CobrancaService } from "./cobranca.service";
import { CriarBoletoDto } from "./dto/criar-boleto.dto";
import { EmitirNfseCobrancaDto } from "./dto/emitir-nfse-cobranca.dto";

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
   * Emite NFS-e para os títulos selecionados via iiBrasil.
   * Requer autenticação via x-internal-api-key (InternalAuthGuard global).
   */
  @Post("nfse")
  async emitirNfse(@Body() dto: EmitirNfseCobrancaDto) {
    return this.cobrancaService.emitirNfse(dto);
  }

  /**
   * Retorna quais idcontareceber já possuem boleto pendente ou pago.
   * Usado pelo frontend para desabilitar seleção e mostrar aviso.
   */
  @Post("boleto/preview")
  async previewBoleto(@Body() body: { idclienteAthos: number; idcontasReceber: number[] }) {
    return this.cobrancaService.previewBoleto(body.idclienteAthos, body.idcontasReceber ?? []);
  }

  @Post("boleto/titulos-em-uso")
  async titulosEmUso(@Body() body: { idcontasReceber: number[] }) {
    return this.cobrancaService.buscarTitulosComBoletoAtivo(body.idcontasReceber ?? []);
  }

  /** Retorna quais idcontareceber possuem NFS-e emitida no nosso banco */
  @Post("nfse/titulos-em-uso")
  async nfseTitulosEmUso(@Body() body: { idcontasReceber: number[] }) {
    return this.cobrancaService.buscarNfseEmitidaParaTitulos(body.idcontasReceber ?? []);
  }

  /** Remove registro NfseEmitida do banco para permitir re-emissão */
  @Delete("nfse/:id")
  async cancelarNfse(@Param("id", ParseIntPipe) id: number) {
    return this.cobrancaService.cancelarNfseEmitida(id);
  }

  /** Lista NFS-e emitidas de um cliente com títulos vinculados */
  @Get("nfse/cliente/:idclienteAthos")
  async nfseCliente(@Param("idclienteAthos", ParseIntPipe) idclienteAthos: number) {
    return this.cobrancaService.buscarNfseEmitidaCliente(idclienteAthos);
  }

  /** Lista boletos de um cliente com títulos vinculados */
  @Get("boleto/cliente/:idcliente")
  async boletosCliente(@Param("idcliente", ParseIntPipe) idcliente: number) {
    return this.cobrancaService.buscarBoletosCliente(idcliente);
  }

  /** Cancela boleto na EFI e no banco */
  @Post("boleto/:id/cancelar")
  async cancelarBoleto(@Param("id", ParseIntPipe) id: number) {
    return this.cobrancaService.cancelarBoleto(id);
  }

  /** Verifica status do boleto na EFI e atualiza banco */
  @Post("boleto/:id/verificar-pagamento")
  async verificarPagamento(@Param("id", ParseIntPipe) id: number) {
    return this.cobrancaService.verificarPagamentoBoleto(id);
  }

  /** Remove boleto do banco (cleanup — libera títulos) */
  @Delete("boleto/:id")
  async removerBoleto(@Param("id", ParseIntPipe) id: number) {
    return this.cobrancaService.removerBoletoBanco(id);
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
