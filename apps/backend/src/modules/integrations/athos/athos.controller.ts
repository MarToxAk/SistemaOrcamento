import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { AthosService } from "./athos.service";

@Controller("athos")
export class AthosController {
  constructor(private readonly athosService: AthosService) {}

  // Lista todas as contas a pagar encontradas no banco Athos, ordenadas decrescentemente
  @Get("contas-pagar")
  async listarContasPagar(
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    const requiredToken = process.env.ATHOS_API_TOKEN;
    if (requiredToken) {
      const provided =
        xApiToken || (authorization && authorization.startsWith("Bearer ") ? authorization.slice(7) : authorization) ||
        undefined;
      if (!provided || provided !== requiredToken) {
        throw new UnauthorizedException("Token inválido ou ausente");
      }
    }

    return this.athosService.listarContasPagar();
  }
}
