import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Res } from "@nestjs/common";

import { CobrancaNotasService } from "./cobranca-notas.service";
import { BaixarNotasZipDto } from "./dto/baixar-notas-zip.dto";
import { ListarNotasQueryDto } from "./dto/listar-notas.query.dto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpressResponse = any;

/**
 * Downloads de notas fiscais (Fase 47). Sem @Public: o InternalAuthGuard global exige x-internal-api-key.
 * Arquivo separado de CobrancaController para nao tocar nas rotas de boleto/baixa/aviso (D-03).
 */
@Controller("cobranca")
export class CobrancaNotasController {
  constructor(private readonly notasService: CobrancaNotasService) {}

  /** Lista geral de NFS-e e NF-e dos boletos, com filtros opcionais de cliente e periodo. Somente leitura (Fase 47, D-09). */
  @Get("notas")
  async listar(@Query() query: ListarNotasQueryDto) {
    return this.notasService.listarNotas(query);
  }

  /** XML salvo da NFS-e (xmlNacional, senao linkNfse). 404 "XML indisponível ..." quando nao ha XML real. */
  @Get("nfse/:id/xml")
  async baixarXml(@Param("id", ParseIntPipe) id: number, @Res() res: ExpressResponse) {
    const { xml, nomeArquivo } = await this.notasService.baixarNfseXml(id);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.send(xml);
  }

  /** ZIP com PDF + XML das notas selecionadas (NFS-e e NF-e), com LEIA-ME.txt das pendencias. Maximo de 50 notas. */
  @Post("notas/zip")
  @HttpCode(HttpStatus.OK)
  async gerarZip(@Body() dto: BaixarNotasZipDto, @Res() res: ExpressResponse) {
    const { zip, nomeArquivo } = await this.notasService.gerarZipNotas(dto);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.setHeader("Content-Length", zip.length);
    res.send(zip);
  }
}
