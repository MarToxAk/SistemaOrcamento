import { Body, Controller, HttpException, HttpStatus, Param, ParseIntPipe, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { AdminOnly } from "../../security/admin.decorator";
import { THROTTLE_SENSITIVE } from "../../security/throttle.config";
import { AthosVendaService, type LancarVendaResultado } from "./athos-venda.service";
import { VendaAthosError, type VendaAthosCodigo } from "./athos-venda.util";
import { LancarVendaDto } from "./dto/lancar-venda.dto";

const STATUS_POR_CODIGO: Partial<Record<VendaAthosCodigo, HttpStatus>> = {
  ORCAMENTO_NAO_ENCONTRADO: HttpStatus.NOT_FOUND,
  ORCAMENTO_JA_LANCADO: HttpStatus.CONFLICT,
  RECURSO_DESLIGADO: HttpStatus.SERVICE_UNAVAILABLE,
  ATHOS_INDISPONIVEL: HttpStatus.SERVICE_UNAVAILABLE,
  FORMA_PAGAMENTO_NAO_SUPORTADA: HttpStatus.UNPROCESSABLE_ENTITY,
  DESCONTO_INVALIDO: HttpStatus.UNPROCESSABLE_ENTITY,
  DESCONTO_ACIMA_DO_MAXIMO: HttpStatus.UNPROCESSABLE_ENTITY,
  ORCAMENTO_COM_DESCONTO_NAO_SUPORTADO: HttpStatus.UNPROCESSABLE_ENTITY,
  ITEM_INVALIDO: HttpStatus.UNPROCESSABLE_ENTITY,
  CAIXA_FECHADO: HttpStatus.UNPROCESSABLE_ENTITY,
  PRODUTO_NAO_VENDAVEL: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Converte o erro do servico em resposta HTTP tipada, sem SQL, host nem credenciais. */
export function erroHttp(err: unknown): HttpException {
  if (err instanceof VendaAthosError) {
    const status = STATUS_POR_CODIGO[err.codigo] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    return new HttpException({ codigo: err.codigo, mensagem: err.message, idvenda: err.idvenda }, status);
  }
  return new HttpException(
    { codigo: "ERRO_INTERNO", mensagem: "Nao foi possivel lancar a venda no Athos." },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

/**
 * Lancamento da venda de um orcamento no Athos (Fase 53). SO administrador.
 * Simulacao por padrao; gravar exige `simular: false` E `ATHOS_VENDA_AUTOMATICA=true` no servidor.
 */
@ApiTags("Athos - Venda")
@ApiSecurity("InternalApiKey")
@Controller("athos/venda")
export class AthosVendaController {
  constructor(private readonly athosVendaService: AthosVendaService) {}

  @AdminOnly()
  @Post("de-orcamento/:idorcamento")
  @Throttle({ default: THROTTLE_SENSITIVE })
  @ApiOperation({
    summary: "Lancar a venda de um orcamento no caixa do Athos (simulacao por padrao)",
    description:
      "Replica a sequencia de gravacao do PDV (venda, itens, pagamento a vista forma 5, recebimento de cartao, " +
      "baixa de estoque relativa, vinculo com o orcamento e sfnfce = 1) em UMA transacao, com o desconto do cupom " +
      "rateado entre os itens. Padrao: simular = true (nada e gravado). Gravar exige simular = false e " +
      "ATHOS_VENDA_AUTOMATICA=true. A NFC-e e emitida pelo emissor do Athos; este endpoint nao emite nem cancela " +
      "nota e nao cancela venda. Apenas a forma de pagamento 5 e aceita.",
  })
  @ApiOkResponse({ description: "Resumo: simulado, idvenda (quando gravou), valores calculados e comandos." })
  async lancar(
    @Param("idorcamento", ParseIntPipe) idorcamento: number,
    @Body() dto: LancarVendaDto,
  ): Promise<LancarVendaResultado> {
    try {
      return await this.athosVendaService.lancarVendaDeOrcamento({
        idorcamento,
        idvendedor: dto.idvendedor,
        idterminal: dto.idterminal,
        idcaixaMovimento: dto.idcaixaMovimento,
        descontoCupom: dto.descontoCupom,
        idformapagamento: dto.idformapagamento,
        simular: dto.simular ?? true,
      });
    } catch (err) {
      throw erroHttp(err);
    }
  }
}
