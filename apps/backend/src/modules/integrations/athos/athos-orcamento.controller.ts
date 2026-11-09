import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { THROTTLE_SENSITIVE } from "../../security/throttle.config";
import { AthosOrcamentoIdempotenciaService, ResultadoComReplay } from "./athos-orcamento-idempotencia.service";
import { AthosOrcamentoService, OrcamentoAthosDetalhe, ProdutoOrcamentoResultado } from "./athos-orcamento.service";
import { BuscarProdutosOrcamentoQueryDto } from "./dto/buscar-produtos-orcamento.dto";
import { CreateAthosOrcamentoDto } from "./dto/create-athos-orcamento.dto";

/**
 * Orcamentos criados por agentes de IA no Athos (Fase 44).
 *
 * Sem @Public(): o guard global InternalAuthGuard (header x-internal-api-key) protege a rota.
 * Rotas estaticas (produtos) sao declaradas ANTES da rota parametrica (:id).
 */
@ApiTags("Athos - Orcamentos IA")
@ApiSecurity("InternalApiKey")
@Controller("athos/orcamentos")
export class AthosOrcamentoController {
  constructor(
    private readonly athosOrcamentoService: AthosOrcamentoService,
    private readonly idempotencia: AthosOrcamentoIdempotenciaService,
  ) {}

  // Rotas estaticas declaradas ANTES da rota parametrica (:id) para o NestJS nao tentar
  // parsear "produtos" como inteiro (mesmo padrao de athos-produto.controller.ts).

  @Get("produtos")
  @ApiOperation({
    summary: "Buscar produtos para montar o orcamento",
    description:
      "Busca produtos ativos e vendaveis por descricao, referencia ou codigo de barras (palavras combinadas com E) e " +
      "por idproduto exato quando q e numerico. Cada item traz idproduto (use no POST), descricao, marca, referencia, " +
      "codigoBarra, preco (preco de venda atual do Athos, texto; null quando o produto esta sem preco e nao pode ser " +
      "orcado), emPromocao, estoqueLoja, estoqueDeposito, permiteFracionar (se false, use quantidade inteira), " +
      "descontoMaximo (informativo; o limite aplicado e o global do Athos) e unidade. Correspondencias exatas vem " +
      "primeiro. limit: 1 a 50 (padrao 20). Funciona com a escrita desligada.",
  })
  @ApiOkResponse({ description: "Lista de produtos com preco, estoque e unidade (sem custo)." })
  async buscarProdutos(@Query() query: BuscarProdutosOrcamentoQueryDto): Promise<ProdutoOrcamentoResultado[]> {
    return this.athosOrcamentoService.buscarProdutos(query.q, query.limit);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Consultar orcamento criado no Athos",
    description:
      "Devolve cabecalho (idorcamento, senhabalcao, data, hora, status aberto/convertido/outro, totais), itens e " +
      "pagamentos de um orcamento do Athos. Use para reconfirmar o numero informado ao cliente. " +
      "Inexistente: 404 ORCAMENTO_INEXISTENTE.",
  })
  @ApiOkResponse({ description: "Orcamento com itens e pagamentos." })
  async buscarOrcamento(@Param("id", ParseIntPipe) id: number): Promise<OrcamentoAthosDetalhe> {
    return this.athosOrcamentoService.buscarOrcamento(id);
  }

  @Post()
  @Throttle({ default: THROTTLE_SENSITIVE })
  @ApiOperation({
    summary: "Criar orcamento no Athos (aparece no Balcao)",
    description:
      "Cria, em uma unica transacao, um orcamento aberto no Athos com os itens pelo preco de venda atual do " +
      "Athos e uma linha de pagamento PIX. Retorna o numero (idorcamento) e a senha do Balcao (senhabalcao). " +
      "Requer ATHOS_ORCAMENTO_ESCRITA=true no servidor; caso contrario responde 503 ESCRITA_DESABILITADA. " +
      "Erros trazem { codigo, mensagem, detalhes? } legiveis por IA.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description:
      "Chave de idempotencia (8 a 128 caracteres: letras, numeros, . _ : -). Repetir a chamada com a mesma chave e o " +
      "mesmo corpo devolve o orcamento ja criado (mesmo idorcamento e senhabalcao, replay: true) sem criar outro. " +
      "Mesma chave com corpo diferente responde 409 IDEMPOTENCY_KEY_REUTILIZADA; chave ainda em processamento " +
      "responde 409 IDEMPOTENCY_EM_PROCESSAMENTO; formato invalido responde 400 IDEMPOTENCY_KEY_INVALIDA. " +
      "Simulacoes nao consomem a chave.",
  })
  @ApiBody({ type: CreateAthosOrcamentoDto })
  @ApiCreatedResponse({ description: "Orcamento criado: idorcamento, senhabalcao, totais, itens e pagamento." })
  async criar(
    @Body() dto: CreateAthosOrcamentoDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<ResultadoComReplay> {
    return this.idempotencia.executar(idempotencyKey, dto, (opts) =>
      this.athosOrcamentoService.criarOrcamento(dto, opts),
    );
  }
}
