import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { AthosService } from "./athos.service";

@ApiTags("Athos")
@ApiSecurity("InternalApiKey")
@Controller("athos/produtos")
export class ProdutoController {
  private readonly logger = new Logger(ProdutoController.name);

  constructor(private readonly athosService: AthosService) {}

  // Rotas estáticas declaradas ANTES da rota paramétrica (:idproduto)
  // para evitar que NestJS tente parsear "lookup" como inteiro (Pitfall 2)

  @ApiOperation({ summary: "Lookup de departamentos do Athos" })
  @ApiOkResponse({ description: "Array de departamentos { id, nome }[]" })
  @Get("lookup/departamentos")
  async lookupDepartamentos() {
    this.logger.log("lookupDepartamentos");
    return this.athosService.buscarDepartamentos();
  }

  @ApiOperation({ summary: "Lookup de grupos do Athos" })
  @ApiOkResponse({ description: "Array de grupos { id, nome }[]" })
  @Get("lookup/grupos")
  async lookupGrupos() {
    this.logger.log("lookupGrupos");
    return this.athosService.buscarGrupos();
  }

  @ApiOperation({ summary: "Lookup de marcas do Athos" })
  @ApiOkResponse({ description: "Array de marcas { id, nome }[]" })
  @Get("lookup/marcas")
  async lookupMarcas() {
    this.logger.log("lookupMarcas");
    return this.athosService.buscarMarcas();
  }

  @ApiOperation({ summary: "Consultar produto por ID no Athos" })
  @ApiParam({ name: "idproduto", example: "123", description: "ID do produto no Athos" })
  @ApiOkResponse({ description: "Linha completa do produto ou 404 se não encontrado" })
  @Get(":idproduto")
  async buscarProdutoPorId(
    @Param("idproduto", ParseIntPipe) idproduto: number,
  ) {
    this.logger.log(`buscarProdutoPorId idproduto=${idproduto}`);
    const produto = await this.athosService.buscarProdutoPorId(idproduto);
    if (!produto) {
      throw new NotFoundException(`Produto ${idproduto} nao encontrado no Athos`);
    }
    return produto;
  }

  @ApiOperation({
    summary: "Buscar produtos no Athos",
    description:
      "Busca produtos com filtros opcionais. Sem filtro retorna todos os produtos paginados ordenados por descricaoproduto ASC.",
  })
  @ApiQuery({ name: "descricao", required: false, example: "papel" })
  @ApiQuery({ name: "codigobarra", required: false, example: "7891234567890" })
  @ApiQuery({ name: "iddepartamento", required: false, example: "1" })
  @ApiQuery({ name: "idgrupo", required: false, example: "2" })
  @ApiQuery({ name: "idmarca", required: false, example: "3" })
  @ApiQuery({ name: "page", required: false, example: "1" })
  @ApiQuery({ name: "take", required: false, example: "20" })
  @ApiOkResponse({ description: "Lista paginada de produtos { total, page, take, items }" })
  @Get()
  async buscarProdutos(
    @Query("descricao") descricao?: string,
    @Query("codigobarra") codigobarra?: string,
    @Query("iddepartamento") iddepartamento?: string,
    @Query("idgrupo") idgrupo?: string,
    @Query("idmarca") idmarca?: string,
    @Query("page") page?: string,
    @Query("take") take?: string,
  ) {
    this.logger.log(
      `buscarProdutos descricao="${descricao ?? ""}" codigobarra="${codigobarra ?? ""}"`,
    );
    return this.athosService.buscarProdutos({
      descricao,
      codigobarra,
      iddepartamento: iddepartamento ? Number(iddepartamento) : undefined,
      idgrupo: idgrupo ? Number(idgrupo) : undefined,
      idmarca: idmarca ? Number(idmarca) : undefined,
      page: page ? Number(page) : undefined,
      take: take ? Number(take) : undefined,
    });
  }
}
