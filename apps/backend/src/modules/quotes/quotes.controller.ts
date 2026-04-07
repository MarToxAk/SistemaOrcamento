import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { CreateQuoteDto } from "./dto/create-quote.dto";
import { UpdateStatusDto } from "./dto/update-status.dto";
import { QuotesService } from "./quotes.service";

@Controller("quotes")
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get("athos/:numero")
  buscarNoAthos(@Param("numero") numero: string, @Query("format") format?: string) {
    const resolvedFormat = format === "mapped" ? "mapped" : "raw";
    return this.quotesService.buscarNoAthosPorNumero(numero, resolvedFormat);
  }

  @Get()
  list() {
    return this.quotesService.list();
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.quotesService.getById(id);
  }

  @Post()
  create(@Body() payload: unknown) {
    const resolved = (payload as { body?: CreateQuoteDto }).body ?? (payload as CreateQuoteDto);
    return this.quotesService.create(resolved);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() payload: UpdateStatusDto) {
    return this.quotesService.changeStatus(id, payload.newStatus, payload.changedBy);
  }

  @Post(":id/pdf")
  generatePdf(@Param("id") id: string) {
    return this.quotesService.generatePdf(id);
  }
}
