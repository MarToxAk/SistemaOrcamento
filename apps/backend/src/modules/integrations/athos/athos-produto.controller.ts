import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { AthosService } from "./athos.service";
import { AthosProdutoService } from "./athos-produto.service";
import { CreateProdutoDto } from "./dto/create-produto.dto";
import { UpdateProdutoDto } from "./dto/update-produto.dto";
import { AlterarStatusProdutoDto } from "./dto/alterar-status-produto.dto";

@ApiTags("Athos")
@ApiSecurity("InternalApiKey")
@Controller("athos/produtos")
export class ProdutoController {
  private readonly logger = new Logger(ProdutoController.name);

  constructor(
    private readonly athosService: AthosService,
    private readonly athosProdutoService: AthosProdutoService,
  ) {}

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

  @ApiOperation({ summary: "Criar produto no Athos" })
  @ApiBody({ type: CreateProdutoDto })
  @ApiOkResponse({ description: "{ idproduto: number }" })
  @Post()
  async criarProduto(@Body() dto: CreateProdutoDto) {
    this.logger.log(`criarProduto descricao="${dto.descricaoproduto}"`);
    return this.athosProdutoService.criarProduto(dto);
  }

  // PATCH :idproduto/status DEVE vir ANTES de PATCH :idproduto
  // (segmento literal "status" capturado antes do paramétrico — Pitfall 1)
  @ApiOperation({ summary: "Desativar ou reativar produto no Athos" })
  @ApiParam({ name: "idproduto", example: "123" })
  @ApiBody({ type: AlterarStatusProdutoDto })
  @ApiOkResponse({ description: "{ idproduto: number, ativo: boolean }" })
  @Patch(":idproduto/status")
  async alterarStatusProduto(
    @Param("idproduto", ParseIntPipe) id: number,
    @Body() body: AlterarStatusProdutoDto,
  ) {
    this.logger.log(`alterarStatusProduto idproduto=${id} ativo=${body.ativo}`);
    return this.athosProdutoService.alterarStatusProduto(id, body.ativo);
  }

  @ApiOperation({ summary: "Editar produto no Athos (partial update)" })
  @ApiParam({ name: "idproduto", example: "123" })
  @ApiBody({ type: UpdateProdutoDto })
  @ApiOkResponse({ description: "{ idproduto: number }" })
  @Patch(":idproduto")
  async editarProduto(
    @Param("idproduto", ParseIntPipe) id: number,
    @Body() dto: UpdateProdutoDto,
  ) {
    this.logger.log(`editarProduto idproduto=${id}`);
    return this.athosProdutoService.editarProduto(id, dto);
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
