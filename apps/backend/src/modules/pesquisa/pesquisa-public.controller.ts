/**
 * Fase 52 (plano 52-01): rota PUBLICA da pesquisa de satisfacao (D-01, D-37).
 *
 * O throttler global por IP nao serve aqui: todos os clientes chegam pelo proxy do Next, que
 * compartilha um IP so. Por isso a classe usa @SkipThrottle e tres limites proprios em memoria,
 * consultados antes do servico (e portanto antes de qualquer acesso ao banco), nesta ordem:
 * por IP real, teto da rota inteira e por token. O IP real vem de `x-client-ip` (enviado pelo
 * proxy do Next) e SO vale com `x-internal-api-key` valida; sem ela vale o IP do socket, num
 * balde compartilhado e mais estrito.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

import {
  LIMITES_PESQUISA_PUBLICA,
  LimitadorJanela,
  chaveInternaValida,
  resolverIpCliente,
} from "./pesquisa-regras";
import { PesquisaService, type PesquisaPublicaView, type RespostaPublica } from "./pesquisa.service";
import { Public } from "../security/public.decorator";
import { INTERNAL_API_KEY_HEADER } from "../security/security.constants";

export class ResponderPesquisaDto {
  @IsInt()
  @Min(1)
  @Max(5)
  nota!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;
}

export const LIMITADORES_PESQUISA_PUBLICA = Symbol("LIMITADORES_PESQUISA_PUBLICA");

export type LimitadoresPesquisaPublica = {
  porIpReal: LimitadorJanela;
  porIpSocketCompartilhado: LimitadorJanela;
  porToken: LimitadorJanela;
  tetoDaRota: LimitadorJanela;
};

type RequisicaoPublica = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

const HEADER_IP_CLIENTE = "x-client-ip";

function criarLimitadoresPadrao(): LimitadoresPesquisaPublica {
  const l = LIMITES_PESQUISA_PUBLICA;
  return {
    porIpReal: new LimitadorJanela(l.porIpReal.max, l.porIpReal.janelaMs),
    porIpSocketCompartilhado: new LimitadorJanela(l.porIpSocketCompartilhado.max, l.porIpSocketCompartilhado.janelaMs),
    porToken: new LimitadorJanela(l.porToken.max, l.porToken.janelaMs),
    tetoDaRota: new LimitadorJanela(l.tetoDaRota.max, l.tetoDaRota.janelaMs),
  };
}

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

@Public()
@SkipThrottle()
@Controller("pesquisa/publica")
export class PesquisaPublicController {
  private readonly limitadores: LimitadoresPesquisaPublica;

  constructor(
    private readonly service: PesquisaService,
    private readonly config: ConfigService,
    @Optional() @Inject(LIMITADORES_PESQUISA_PUBLICA) limitadores?: Partial<LimitadoresPesquisaPublica>,
  ) {
    this.limitadores = { ...criarLimitadoresPadrao(), ...(limitadores ?? {}) };
  }

  @Get(":token")
  async obter(@Param("token") token: string, @Req() req?: RequisicaoPublica): Promise<PesquisaPublicaView> {
    this.aplicarLimites(token, req);
    return this.service.obterPublica(token);
  }

  @Post(":token/resposta")
  @HttpCode(200)
  async responder(
    @Param("token") token: string,
    @Body() dto: ResponderPesquisaDto,
    @Req() req?: RequisicaoPublica,
  ): Promise<RespostaPublica> {
    this.aplicarLimites(token, req);
    const resultado = await this.service.responder(token, dto.nota, dto.comentario);
    if (resultado.tipo === "OK") return resultado.resposta;
    if (resultado.tipo === "JA_RESPONDIDA") throw new HttpException(resultado.view, HttpStatus.CONFLICT);
    throw new HttpException({ estado: "INDISPONIVEL" }, HttpStatus.NOT_FOUND);
  }

  /** Ordem: IP (um IP recusado nao consome o teto), teto da rota, token. A primeira recusa vira 429. */
  private aplicarLimites(token: string, req?: RequisicaoPublica): void {
    const headers = req?.headers ?? {};
    const chaveValida = chaveInternaValida(
      primeiroValor(headers[INTERNAL_API_KEY_HEADER]),
      this.config.get<string>("INTERNAL_API_KEY"),
    );
    const { ip, confiavel } = resolverIpCliente({
      ipSocket: req?.socket?.remoteAddress ?? req?.ip,
      ipEncaminhado: primeiroValor(headers[HEADER_IP_CLIENTE]),
      chaveValida,
    });

    const passouIp = confiavel
      ? this.limitadores.porIpReal.permitir(`ip:${ip}`)
      : this.limitadores.porIpSocketCompartilhado.permitir(`socket:${ip}`);
    if (!passouIp) this.recusar();
    if (!this.limitadores.tetoDaRota.permitir("rota")) this.recusar();
    if (!this.limitadores.porToken.permitir(`token:${token}`)) this.recusar();
  }

  private recusar(): never {
    throw new HttpException({ estado: "LIMITE" }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
