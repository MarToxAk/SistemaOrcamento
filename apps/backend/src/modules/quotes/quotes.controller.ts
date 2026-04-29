import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { CreateQuoteDto } from "./dto/create-quote.dto";
import { UpdateStatusDto } from "./dto/update-status.dto";
import { QuotesService } from "./quotes.service";
import { MergeDuplicatesDto } from "./dto/merge-duplicates.dto";

@Controller("quotes")
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get("athos-health")
  testarConexaoAthos() {
    return this.quotesService.testarConexaoAthos();
  }

  @Get("athos/:numero")
  buscarNoAthos(@Param("numero") numero: string, @Query("format") format?: string) {
    const resolvedFormat = format === "mapped" ? "mapped" : "raw";
    return this.quotesService.buscarNoAthosPorNumero(numero, resolvedFormat);
  }

  @Get()
  list(
    @Query("status") status?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
    @Query("conversationId") conversationId?: string,
    @Query("chatwootContactId") chatwootContactId?: string,
  ) {
    const parsedTake = take !== undefined ? Number(take) : undefined;
    const parsedSkip = skip !== undefined ? Number(skip) : undefined;
    const parsedConversationId = conversationId !== undefined ? Number(conversationId) : undefined;
    const parsedChatwootContactId = chatwootContactId !== undefined ? Number(chatwootContactId) : undefined;
    const validTake = typeof parsedTake === "number" && Number.isFinite(parsedTake) ? parsedTake : undefined;
    const validSkip = typeof parsedSkip === "number" && Number.isFinite(parsedSkip) ? parsedSkip : undefined;
    const validConversationId =
      typeof parsedConversationId === "number" && Number.isFinite(parsedConversationId)
        ? parsedConversationId
        : undefined;
    const validChatwootContactId =
      typeof parsedChatwootContactId === "number" && Number.isFinite(parsedChatwootContactId)
        ? parsedChatwootContactId
        : undefined;

    return this.quotesService.list(status, validTake, validSkip, validConversationId, validChatwootContactId);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.quotesService.getById(id);
  }

  @Get(":id/payment-status")
  checkPaymentStatus(@Param("id") id: string) {
    return this.quotesService.checkPaymentStatus(id);
  }

  @Post()
  create(@Body() payload: unknown) {
    const resolved = (payload as { body?: CreateQuoteDto }).body ?? (payload as CreateQuoteDto);
    return this.quotesService.create(resolved);
  }

  @Get("duplicates")
  listDuplicates() {
    return this.quotesService.listDuplicates();
  }

  @Post("duplicates/merge")
  mergeDuplicates(@Body() payload: MergeDuplicatesDto) {
    return this.quotesService.mergeDuplicates(payload);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() payload: UpdateStatusDto) {
    return this.quotesService.changeStatus(id, payload.newStatus, payload.changedBy);
  }

  @Post(":id/pdf")
  generatePdf(@Param("id") id: string) {
    return this.quotesService.generatePdf(id);
  }

  @Post(":id/pdf/send")
  resendPdf(@Param("id") id: string) {
    return this.quotesService.resendPdfToChatwoot(id);
  }

  @Post(":id/enviar")
  enviarParaCliente(@Param("id") id: string) {
    return this.quotesService.enviarParaCliente(id);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @Query("token") token?: string, @Body() body?: { token?: string }) {
    const t = token ?? (body && body.token) ?? undefined;
    return this.quotesService.approveByToken(id, String(t ?? ""));
  }
}
