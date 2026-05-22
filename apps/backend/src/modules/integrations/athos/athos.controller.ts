import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseFilePipeBuilder,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AthosService } from "./athos.service";
import { CreateContaPagarDto } from "./dto/create-conta-pagar.dto";
import { UpdateContaPagarDto } from "./dto/update-conta-pagar.dto";
import { UploadContaPagarAnexoDto } from "./dto/upload-conta-pagar-anexo.dto";

const ATHOS_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ATHOS_ATTACHMENT_MIME_PATTERN = /^(application\/pdf|image\/png|image\/jpeg)$/;
type UploadedAthosFile = { originalname: string; buffer: Buffer; mimetype: string; size: number };

@ApiTags("Athos")
@ApiSecurity("AthosApiToken")
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
    if (!provided) {
      throw new UnauthorizedException("Token invalido ou ausente");
    }
    const providedBuf = Buffer.from(provided, "utf8");
    const requiredBuf = Buffer.from(requiredToken, "utf8");
    const isValid = providedBuf.length === requiredBuf.length && timingSafeEqual(providedBuf, requiredBuf);
    if (!isValid) {
      throw new UnauthorizedException("Token invalido ou ausente");
    }
  }

  // Lista todas as contas a pagar encontradas no banco Athos, ordenadas decrescentemente
  @ApiOperation({
    summary: "Listar contas a pagar do Athos",
    description:
      "Retorna contas a pagar filtradas por data de vencimento e/ou status. Padrão: últimos 30 dias até +30 dias.",
  })
  @ApiQuery({ name: "dataInicio", required: false, example: "2026-05-01", description: "Início do filtro de vencimento (YYYY-MM-DD)" })
  @ApiQuery({ name: "dataFinal", required: false, example: "2026-05-31", description: "Fim do filtro de vencimento (YYYY-MM-DD)" })
  @ApiQuery({ name: "statusconta", required: false, example: "ABE", description: "Filtro por status: ABE (aberto), PAG (pago), CAN (cancelado)" })
  @ApiOkResponse({ description: "Lista de contas a pagar normalizadas" })
  @ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
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

  @ApiOperation({
    summary: "Buscar clientes no Athos",
    description: "Busca clientes por nome (mín. 3 chars), CPF/CNPJ ou idcliente com paginação.",
  })
  @ApiQuery({ name: "nome", required: false, example: "BomCusto" })
  @ApiQuery({ name: "documento", required: false, example: "62391927000157" })
  @ApiQuery({ name: "idcliente", required: false, example: "123" })
  @ApiQuery({ name: "page", required: false, example: "1" })
  @ApiQuery({ name: "take", required: false, example: "20" })
  @ApiOkResponse({ description: "Lista paginada de clientes" })
  @ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
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

  @ApiOperation({
    summary: "Listar bancos (livro_registro) do Athos",
    description: "Retorna os registros de livro_registro disponiveis para escolher o banco na liquidacao de pagamento.",
  })
  @ApiQuery({ name: "idcontacorrente", required: false, example: "2", description: "Filtra por conta corrente" })
  @ApiOkResponse({ description: "Lista de bancos para liquidacao" })
  @ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
  @Get("livros-registro")
  async listarLivrosRegistro(
    @Query("idcontacorrente") idcontacorrente?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);

    const parsedIdContaCorrente = typeof idcontacorrente === "string" && idcontacorrente.trim()
      ? Number(idcontacorrente)
      : undefined;

    return this.athosService.listarLivrosRegistro(
      Number.isInteger(parsedIdContaCorrente) && Number(parsedIdContaCorrente) > 0
        ? Number(parsedIdContaCorrente)
        : undefined,
    );
  }

  @ApiOperation({
    summary: "Criar conta a pagar no Athos",
    description: "Insere novo registro na tabela conta_pagar do banco Athos e retorna o ID gerado.",
  })
  @ApiResponse({ status: 201, description: "Conta criada com sucesso", schema: { example: { idcontapagar: 42 } } })
  @ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
  @Post("contas-pagar")
  async criarContaPagar(
    @Body() dto: CreateContaPagarDto,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    return this.athosService.criarContaPagar(dto);
  }

  @ApiOperation({
    summary: "Atualizar conta a pagar no Athos",
    description: "Atualiza parcialmente qualquer campo suportado pela tabela conta_pagar e retorna o registro completo.",
  })
  @ApiParam({ name: "id", description: "ID da conta a pagar no Athos", example: 15 })
  @ApiResponse({
    status: 200,
    description: "Conta atualizada com sucesso",
    schema: {
      example: {
        idcontapagar: 15,
        statusconta: "PAG",
        valorconta: 600,
        valorpago: 600,
        datapagamento: "2026-05-11",
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
  @Patch("contas-pagar/:id")
  async updateContaPagar(
    @Param("id", ParseIntPipe) idcontapagar: number,
    @Body() dto: UpdateContaPagarDto,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    return this.athosService.updateContaPagar(idcontapagar, dto);
  }

  @ApiOperation({
    summary: "Anexar arquivo a uma conta a pagar",
    description:
      "Envia arquivo (PDF/PNG/JPG, max 10MB) e grava em \\\\192.168.3.203\\html\\Anexo\\contapagar\\{id}\\. Registra path na tabela anexo.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiParam({ name: "id", description: "ID da conta a pagar no Athos", example: 42 })
  @ApiResponse({
    status: 201,
    description: "Anexo criado",
    schema: { example: { idanexo: 7, caminhoanexo: "\\\\192.168.3.203\\html\\Anexo\\contapagar\\42\\fatura.pdf" } },
  })
  @ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
  @Post("contas-pagar/:id/anexo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: ATHOS_ATTACHMENT_MAX_SIZE_BYTES } }))
  async anexarContaPagar(
    @Param("id", ParseIntPipe) idcontapagar: number,
    @Body() dto: UploadContaPagarAnexoDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: ATHOS_ATTACHMENT_MAX_SIZE_BYTES })
        .addFileTypeValidator({ fileType: ATHOS_ATTACHMENT_MIME_PATTERN })
        .build({ fileIsRequired: true }),
    )
    file: UploadedAthosFile,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);

    return this.athosService.anexarContaPagar({
      idcontapagar,
      file,
      idfuncionario: dto.idfuncionario,
    });
  }

  @ApiOperation({
    summary: "Dashboard de contas a receber",
    description: "Retorna summary global e top 100 clientes. status: AVC, VEN, REC, CAN ou vazio para AVC+VEN.",
  })
  @ApiQuery({ name: "status", required: false, example: "VEN", description: "Filtro: AVC | VEN | REC | CAN (omitir = AVC+VEN)" })
  @ApiOkResponse({ description: "Dashboard com summary e lista de clientes" })
  @ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
  @Get("contas-receber/dashboard")
  async dashboardContasReceber(
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
    @Query("status") status?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    const ALLOWED = ["AVC", "VEN", "REC", "CAN"];
    const filtro = status && ALLOWED.includes(status.toUpperCase()) ? status.toUpperCase() : undefined;
    return this.athosService.buscarDashboardContasReceber(filtro);
  }

  @ApiOperation({
    summary: "Títulos individuais de um cliente (contas a receber)",
    description: "Retorna títulos em aberto (ABE) do cliente para exibição no drawer. Lazy load.",
  })
  @ApiParam({ name: "idcliente", example: "123", description: "ID do cliente no Athos" })
  @ApiOkResponse({ description: "Array de títulos em aberto do cliente" })
  @ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
  @Get("contas-receber/cliente/:idcliente/titulos")
  async titulosClienteContasReceber(
    @Param("idcliente") idcliente: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    const id = Number(idcliente);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException("idcliente inválido");
    }
    return this.athosService.buscarTitulosClienteContasReceber(id);
  }

  @ApiOperation({
    summary: "Verificar NF emitida para títulos de contas a receber",
    description: "Para cada idcontareceber informado, verifica se há NF-e (venda.idnota) ou NFS-e (lotenfse) associada.",
  })
  @ApiParam({ name: "idcliente", example: "123" })
  @Post("contas-receber/cliente/:idcliente/nf-status")
  async nfStatusTitulos(
    @Param("idcliente") idcliente: string,
    @Body() body: { idcontasReceber: number[] },
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    const id = Number(idcliente);
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("idcliente inválido");
    if (!Array.isArray(body?.idcontasReceber) || body.idcontasReceber.length === 0) {
      return [];
    }
    return this.athosService.verificarNFTitulos(body.idcontasReceber);
  }

  @ApiOperation({ summary: "Dados cadastrais do cliente (contas a receber)" })
  @ApiParam({ name: "idcliente", example: "123" })
  @ApiOkResponse({ description: "Dados cadastrais: nome, telefone, email, limitecredito, bloqueaprazo" })
  @ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
  @Get("contas-receber/cliente/:idcliente/dados")
  async dadosCadastraisClienteContasReceber(
    @Param("idcliente") idcliente: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-api-token") xApiToken?: string,
  ) {
    this.validateAthosToken(authorization, xApiToken);
    const id = Number(idcliente);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException("idcliente inválido");
    }
    const dados = await this.athosService.buscarDadosClienteContasReceber(id);
    if (!dados) {
      throw new NotFoundException(`Cliente ${id} não encontrado no Athos`);
    }
    return dados;
  }
}
