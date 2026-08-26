import { BadRequestException, Controller, Delete, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";

import { THROTTLE_SENSITIVE } from "../../security/throttle.config";
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
}
