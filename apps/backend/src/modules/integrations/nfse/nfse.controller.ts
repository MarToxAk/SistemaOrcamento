import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpressResponse = any;

import { THROTTLE_SENSITIVE } from "../../security/throttle.config";
import { EmitirNfseNacionalDto } from "./dto/emitir-nfse-nacional.dto";
import { NfseService, UploadedXmlFile } from "./nfse.service";

const NFSE_XML_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const NFSE_XML_MIME_PATTERN = /^(application\/xml|text\/xml)$/;

@Controller("quotes/:quoteId/nfse")
export class NfseController {
  constructor(private readonly nfseService: NfseService) {}

  /** Anexa manualmente o XML da NFS-e (emissao SOAP descontinuada pela prefeitura). */
  @Throttle({ default: THROTTLE_SENSITIVE })
  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: NFSE_XML_MAX_SIZE_BYTES } }))
  async anexar(@Param("quoteId") quoteId: string, @UploadedFile() file?: UploadedXmlFile) {
    if (!file) throw new BadRequestException("Arquivo XML da NFS-e nao enviado.");
    if (!NFSE_XML_MIME_PATTERN.test(file.mimetype)) {
      throw new BadRequestException("Arquivo deve ser XML (application/xml ou text/xml).");
    }
    return this.nfseService.anexarQuoteNfse(quoteId, file);
  }

  /** Remove o anexo local, permitindo corrigir e reenviar o XML. */
  @Delete()
  async remover(@Param("quoteId") quoteId: string) {
    return this.nfseService.removerQuoteNfse(quoteId);
  }

  /** Emite a NFS-e automaticamente via API do Sistema Nacional (ADN/Sefin Nacional). */
  @Throttle({ default: THROTTLE_SENSITIVE })
  @Post("emitir")
  async emitir(@Param("quoteId") quoteId: string, @Body() dto: EmitirNfseNacionalDto) {
    return this.nfseService.emitirQuoteNfseAutomatica(quoteId, dto);
  }

  /** Resolve CPF/CNPJ, nome e endereco do tomador via cliente Athos vinculado ao orcamento (pre-preenchimento). */
  @Get("tomador")
  async tomador(@Param("quoteId") quoteId: string) {
    return this.nfseService.resolverTomadorQuote(quoteId);
  }

  /** Download do DANFSe (PDF) gerado localmente a partir do XML, para envio ao cliente. */
  @Get("pdf")
  async baixarPdf(@Param("quoteId") quoteId: string, @Res() res: ExpressResponse) {
    const { pdfBuffer, nomeArquivo } = await this.nfseService.baixarDanfsePdf(quoteId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.send(pdfBuffer);
  }
}
