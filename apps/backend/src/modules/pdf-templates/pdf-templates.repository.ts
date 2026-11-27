import { Injectable } from "@nestjs/common";
import { PdfTemplateFamilia } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";

/**
 * PdfTemplatesRepository — acesso read-only ao template ativo.
 *
 * Injetado pelo QuotesPdfStorageService para resolver o template ativo
 * a cada geração de PDF (D-05). Operações de escrita (upsert, delete,
 * swap atômico de ativo) ficam no PdfTemplatesService (Plano 05).
 */
@Injectable()
export class PdfTemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna o `source` Handlebars/HTML do template marcado como ativo
   * (isActive = true) na família informada. Sem argumento, resolve a família
   * ORCAMENTO — preserva o comportamento do QuotesPdfStorageService.
   * Retorna null quando não há nenhum ativo — o chamador usa a cadeia de
   * fallback existente. A ordem por `updatedAt desc` é determinística caso
   * mais de um esteja marcado ativo por engano.
   */
  async getActiveSource(
    familia: PdfTemplateFamilia = PdfTemplateFamilia.ORCAMENTO,
  ): Promise<string | null> {
    const active = await this.prisma.pdfTemplate.findFirst({
      where: { isActive: true, familia },
      orderBy: { updatedAt: "desc" },
      select: { source: true },
    });

    return active?.source ?? null;
  }
}
