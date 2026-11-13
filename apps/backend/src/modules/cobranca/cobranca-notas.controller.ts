import { Controller, Get, Param, ParseIntPipe, Res } from "@nestjs/common";

import { CobrancaNotasService } from "./cobranca-notas.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpressResponse = any;

/**
 * Downloads de notas fiscais (Fase 47). Sem @Public: o InternalAuthGuard global exige x-internal-api-key.
 * Arquivo separado de CobrancaController para nao tocar nas rotas de boleto/baixa/aviso (D-03).
 */
@Controller("cobranca")
export class CobrancaNotasController {
  constructor(private readonly notasService: CobrancaNotasService) {}

  /** XML salvo da NFS-e (xmlNacional, senao linkNfse). 404 "XML indisponível ..." quando nao ha XML real. */
  @Get("nfse/:id/xml")
  async baixarXml(@Param("id", ParseIntPipe) id: number, @Res() res: ExpressResponse) {
    const { xml, nomeArquivo } = await this.notasService.baixarNfseXml(id);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.send(xml);
  }
}
