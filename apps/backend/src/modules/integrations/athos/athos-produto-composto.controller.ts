import { Controller, Get, Logger, Param, ParseIntPipe } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { AthosProdutoCompostoService } from "./athos-produto-composto.service";

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
}
