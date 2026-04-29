import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";

import { NfseService } from "./nfse.service";

@Controller("quotes/:quoteId/nfse")
export class NfseController {
  constructor(private readonly nfseService: NfseService) {}

  @Get()
  consultar(@Param("quoteId") quoteId: string) {
    return this.nfseService.consultar(quoteId);
  }

  @Post()
  @HttpCode(200)
  emitir(@Param("quoteId") quoteId: string) {
    return this.nfseService.emitir(quoteId);
  }
}
