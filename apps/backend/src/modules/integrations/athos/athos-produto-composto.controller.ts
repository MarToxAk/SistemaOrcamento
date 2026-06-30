import { Body, Controller, Get, Logger, Param, ParseIntPipe, Post } from "@nestjs/common";
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { AthosProdutoCompostoService } from "./athos-produto-composto.service";
import { CreateProdutoCompostoDto } from "./dto/create-produto-composto.dto";

@ApiTags("Athos")
@ApiSecurity("InternalApiKey")
@Controller("athos/produtos")
export class ProdutoCompostoController {
  private readonly logger = new Logger(ProdutoCompostoController.name);

  constructor(
    private readonly athosProdutoCompostoService: AthosProdutoCompostoService,
  ) {}

  // Rota de dois segmentos ":idprodutomaster/composicao" nao colide com a rota
  // de um segmento ":idproduto" do ProdutoController (D-03).
  // Guard x-internal-api-key aplicado pelo @ApiSecurity de classe (T-39-03-02).
  @ApiOperation({
    summary: "Listar componentes de um kit por produto master",
    description:
      "Retorna lista plana de componentes (produto_composto) do produto master indicado, " +
      "enriquecida com descricaoproduto e statusproduto do produto detail via JOIN unico (sem N+1). " +
      "Inclui componentes cujo detail esteja inativo (statusproduto=false) — sem filtro (D-04). " +
      "404 quando o produto master nao existe no catalogo; [] (HTTP 200) quando existe mas nao tem componentes (D-03).",
  })
  @ApiParam({
    name: "idprodutomaster",
    example: "42",
    description: "ID do produto master (kit) no Athos",
  })
  @ApiOkResponse({
    description:
      "Array de componentes: { idprodutocomposto, idprodutodetail, descricaoproduto, statusproduto, quantidade }[]. " +
      "descricaoproduto e statusproduto sao null para linhas orfas (detail deletado do produto).",
  })
  @Get(":idprodutomaster/composicao")
  async listarComposicao(
    @Param("idprodutomaster", ParseIntPipe) idprodutomaster: number,
  ) {
    this.logger.log(`listarComposicao idprodutomaster=${idprodutomaster}`);
    return this.athosProdutoCompostoService.listarPorMaster(idprodutomaster);
  }

  // POST :idprodutomaster/composicao — adicionar componente ao kit
  // Guard x-internal-api-key herdado do @ApiSecurity("InternalApiKey") de classe (T-40-02).
  // Rota de dois segmentos nao colide com a rota ":idproduto" de ProdutoController (D-03).
  @ApiOperation({
    summary: "Adicionar componente a um kit (produto composto)",
    description:
      "Insere um novo componente (produto detail) na composicao do kit (produto master). " +
      "Valida existencia de master e detail, rejeita auto-referencia (422), detail inativo (422) " +
      "e par duplicado (409). No primeiro componente, ativa usaprodutocomposto=true no master " +
      "na mesma transacao (COMP-05). Retorna { idprodutocomposto } gerado pelo banco via RETURNING.",
  })
  @ApiParam({
    name: "idprodutomaster",
    example: "42",
    description: "ID do produto master (kit) no Athos",
  })
  @ApiBody({ type: CreateProdutoCompostoDto })
  @ApiOkResponse({
    description: "Componente criado com sucesso. Retorna { idprodutocomposto: number }.",
  })
  @Post(":idprodutomaster/composicao")
  async adicionarComponente(
    @Param("idprodutomaster", ParseIntPipe) idprodutomaster: number,
    @Body() dto: CreateProdutoCompostoDto,
  ) {
    this.logger.log(
      `adicionarComponente idprodutomaster=${idprodutomaster} idprodutodetail=${dto.idprodutodetail}`,
    );
    return this.athosProdutoCompostoService.adicionarComponente(idprodutomaster, dto);
  }
}
