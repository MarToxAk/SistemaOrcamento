import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { BuscarProdutosOrcamentoQueryDto } from "../integrations/athos/dto/buscar-produtos-orcamento.dto";
import { AdminOnly } from "../security/admin.decorator";
import { THROTTLE_SENSITIVE } from "../security/throttle.config";
import {
  AddItemPropostaDto,
  AplicarPercentualDto,
  CreatePropostaDto,
  GerarPropostaDto,
  ListarPropostasQueryDto,
  UpdateItemPropostaDto,
  UpdatePropostaDto,
} from "./dto/propostas.dto";
import {
  AssinanteRecente,
  PropostaDetalhe,
  PropostaGerada,
  PropostaListagem,
  PropostaRecuperada,
  PropostasService,
} from "./propostas.service";

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

  // --- Rotas estaticas (antes de :id) ---------------------------------------

  @Get("produtos")
  @ApiOperation({ summary: "Buscar produtos do Athos com preco e custo (montagem da proposta)" })
  async buscarProdutos(@Query() query: BuscarProdutosOrcamentoQueryDto) {
    return this.propostasService.buscarProdutos(query.q, query.limit);
  }

  @Get("assinantes")
  @ApiOperation({ summary: "Assinantes recentes distintos para reuso (D-19)" })
  async listarAssinantes(): Promise<AssinanteRecente[]> {
    return this.propostasService.listarAssinantesRecentes();
  }

  @Get("clientes/:idcliente")
  @ApiOperation({ summary: "Cliente do Athos com razao social real e endereco por campo" })
  async buscarCliente(@Param("idcliente", ParseIntPipe) idcliente: number) {
    return this.propostasService.buscarCliente(idcliente);
  }

  @Get()
  @ApiOperation({ summary: "Listar propostas (filtro por status, busca por numero do orcamento ou cliente, paginada)" })
  async listar(@Query() query: ListarPropostasQueryDto): Promise<PropostaListagem> {
    return this.propostasService.listar(query);
  }

  @Post()
  @ApiOperation({ summary: "Criar rascunho de proposta (cabecalho opcional)" })
  async criar(@Body() dto: CreatePropostaDto): Promise<PropostaDetalhe> {
    return this.propostasService.criarRascunho(dto);
  }

  // --- Rotas parametricas ----------------------------------------------------

  @Get(":id")
  @ApiOperation({ summary: "Detalhe da proposta com itens, total, custo e margem" })
  async obter(@Param("id", new ParseUUIDPipe()) id: string): Promise<PropostaDetalhe> {
    return this.propostasService.obter(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Atualizar cabecalho (cliente do Athos, dados de orgao, validade, prazo, observacao)" })
  async atualizarCabecalho(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePropostaDto,
  ): Promise<PropostaDetalhe> {
    return this.propostasService.atualizarCabecalho(id, dto);
  }

  @Post(":id/itens")
  @ApiOperation({ summary: "Adicionar item (idproduto e quantidade); o servidor busca preco e custo no Athos" })
  async adicionarItem(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AddItemPropostaDto,
  ): Promise<PropostaDetalhe> {
    return this.propostasService.adicionarItem(id, dto);
  }

  @Patch(":id/itens/:itemId")
  @ApiOperation({ summary: "Editar item: quantidade, nome, descricao curta e ajuste (preco recalculado no servidor)" })
  async atualizarItem(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateItemPropostaDto,
  ): Promise<PropostaDetalhe> {
    return this.propostasService.atualizarItem(id, itemId, dto);
  }

  @Delete(":id/itens/:itemId")
  @ApiOperation({ summary: "Remover item e renumerar a sequencia" })
  async removerItem(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
  ): Promise<PropostaDetalhe> {
    return this.propostasService.removerItem(id, itemId);
  }

  @Post(":id/aplicar-percentual")
  @ApiOperation({ summary: "Aplicar a mesma porcentagem ao preco base de todos os itens (0 limpa os ajustes)" })
  async aplicarPercentual(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AplicarPercentualDto,
  ): Promise<PropostaDetalhe> {
    return this.propostasService.aplicarPercentualEmTodos(id, dto);
  }

  @Post(":id/gerar")
  @Throttle({ default: THROTTLE_SENSITIVE })
  @ApiOperation({ summary: "Gerar a proposta: lanca o orcamento no Athos (one-way) e emite o PDF oficial" })
  async gerar(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: GerarPropostaDto): Promise<PropostaGerada> {
    return this.propostasService.gerar(id, dto);
  }

  @Post(":id/recuperar")
  @Throttle({ default: THROTTLE_SENSITIVE })
  @ApiOperation({
    summary: "Recuperar proposta presa em lancamento (somente apos 120 s): finaliza pelo marcador ref sem novo INSERT no Athos",
  })
  async recuperar(@Param("id", new ParseUUIDPipe()) id: string): Promise<PropostaRecuperada> {
    return this.propostasService.recuperarLancamento(id);
  }
}
