import { Body, Controller, Get, Headers, InternalServerErrorException, Post, Query, UnauthorizedException } from "@nestjs/common";
import { AthosService } from "./athos.service";
import { CreateContaPagarDto } from "./dto/create-conta-pagar.dto";

@Controller("athos")
export class AthosController {
  constructor(private readonly athosService: AthosService) {}

  private validateAthosToken(authorization?: string, xApiToken?: string): void {
    const requiredToken = process.env.ATHOS_API_TOKEN;
    if (!requiredToken) {
      throw new InternalServerErrorException("ATHOS_API_TOKEN nao configurado no servidor");
    }
    const provided =
      xApiToken ||
      (authorization?.startsWith("Bearer ") ? authorization.slice(7) : authorization) ||
      undefined;
    if (!provided || provided !== requiredToken) {
      throw new UnauthorizedException("Token invalido ou ausente");
    }
  }

  // Lista todas as contas a pagar encontradas no banco Athos, ordenadas decrescentemente
  @Get("contas-pagar")
  async listarContasPagar(
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFinal") dataFinal?: string,
    @Query("datainicio") dataInicioLegacy?: string,
    @Query("datafinal") dataFinalLegacy?: string,
    @Query("statusconta") statusconta?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    return this.athosService.listarContasPagar(dataInicio ?? dataInicioLegacy, dataFinal ?? dataFinalLegacy, statusconta);
  }

  @Get("clientes")
  async buscarClientes(
    @Query("nome") nome?: string,
    @Query("documento") documento?: string,
    @Query("idcliente") idcliente?: string,
    @Query("page") page?: string,
    @Query("take") take?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);

    return this.athosService.buscarClientes({
      nome,
      documento,
      idcliente: idcliente ? Number(idcliente) : undefined,
      page: page ? Number(page) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Post("contas-pagar")
  async criarContaPagar(
    @Body() dto: CreateContaPagarDto,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    return this.athosService.criarContaPagar(dto);
  }

}
