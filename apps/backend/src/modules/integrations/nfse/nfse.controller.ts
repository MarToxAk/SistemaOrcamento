import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { EmitirNfseInput, NfseService } from "./nfse.service";
import { THROTTLE_SENSITIVE } from "../../security/throttle.config";

@Controller("quotes/:quoteId/nfse")
export class NfseController {
  constructor(private readonly nfseService: NfseService) {}

  @Get()
  consultar(@Param("quoteId") quoteId: string) {
    return this.nfseService.consultar(quoteId);
  }

  @Throttle({ default: THROTTLE_SENSITIVE })
  @Post()
  @HttpCode(200)
  emitir(
    @Param("quoteId") quoteId: string,
    @Body() body?: EmitirNfseInput,
  ) {
    return this.nfseService.emitir(quoteId, body);
  }

  @Throttle({ default: THROTTLE_SENSITIVE })
  @Post("teste")
  @HttpCode(200)
  emitirTeste() {
    return this.nfseService.emitirTeste();
  }
}
