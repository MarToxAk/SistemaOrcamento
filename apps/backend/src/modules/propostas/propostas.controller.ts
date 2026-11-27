import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";

import { AdminOnly } from "../security/admin.decorator";
import { AddItemPropostaDto, CreatePropostaDto } from "./dto/propostas.dto";
import { PropostaDetalhe, PropostasService } from "./propostas.service";

/**
 * Propostas comerciais para orgaos publicos (Fase 55).
 *
 * @AdminOnly() na CLASSE: toda rota exige x-admin-api-key alem da chave interna global (T-55-19).
 * Custo e margem so aparecem nestas respostas administrativas (D-12). Nenhuma rota e da IA.
 * Rotas estaticas sao declaradas ANTES de `:id` para o Nest nao tentar parsear "produtos" como UUID.
 */
@ApiTags("Propostas")
@ApiSecurity("InternalApiKey")
@ApiHeader({ name: "x-admin-api-key", required: true })
@AdminOnly()
@Controller("propostas")
export class PropostasController {
  constructor(private readonly propostasService: PropostasService) {}

  @Post()
  @ApiOperation({ summary: "Criar rascunho de proposta (cabecalho opcional)" })
  async criar(@Body() dto: CreatePropostaDto): Promise<PropostaDetalhe> {
    return this.propostasService.criarRascunho(dto);
  }

  @Post(":id/itens")
  @ApiOperation({
    summary: "Adicionar item (idproduto e quantidade); o servidor busca preco e custo no Athos",
  })
  async adicionarItem(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AddItemPropostaDto,
  ): Promise<PropostaDetalhe> {
    return this.propostasService.adicionarItem(id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Detalhe da proposta com itens, total, custo e margem" })
  async obter(@Param("id", new ParseUUIDPipe()) id: string): Promise<PropostaDetalhe> {
    return this.propostasService.obter(id);
  }
}
