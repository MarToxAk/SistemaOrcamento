import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpressResponse = any;

import { AdminOnly } from "../security/admin.decorator";
import { QuotesPdfStorageService } from "../quotes/quotes-pdf-storage.service";
import { PdfTemplatesService } from "./pdf-templates.service";
import { PdfTemplateSummary } from "./pdf-templates.types";

/**
 * Payload de orçamento MOCK usado exclusivamente no preview (D-08).
 * Nunca persiste nada no banco/MinIO — apenas alimenta o render hardened
 * para o admin visualizar o layout do template antes de ativar/salvar.
 */
const MOCK_QUOTE_PAYLOAD = {
  idorcamento_interno: 999999,
  idorcamento: 999999,
  dataorcamento: new Date().toISOString(),
  cliente: { nome: "Cliente Exemplo", telefone: "(12) 99999-9999", email: "cliente@exemplo.com" },
  vendedorNome: "Vendedor Exemplo",
  validade: "10 dias",
  prazoEntrega: "5 dias úteis",
  condicaoPagamento: "50% entrada + 50% na entrega",
  observacoes: "Orçamento de exemplo gerado apenas para preview de template.",
  itens: [
    {
      sequenciaitem: 1,
      produto: { descricaoproduto: "Produto Exemplo A", descricaocurta: "Exemplo A" },
      quantidadeitem: 2,
      valoritem: 50,
      valordesconto: 0,
      orcamentovalorfinalitem: 100,
    },
    {
      sequenciaitem: 2,
      produto: { descricaoproduto: "Produto Exemplo B", descricaocurta: "Exemplo B" },
      quantidadeitem: 1,
      valoritem: 75,
      valordesconto: 0,
      orcamentovalorfinalitem: 75,
    },
  ],
  carimbos: {
    itens: [{ numero: 1, carimbo: "BORRACHA", dimensoes: "10x5cm", descricao: "Exemplo de carimbo" }],
  },
  totais: { valor: 175, desconto: 0, valoracrescimo: 0 },
};

@Controller("pdf-templates")
export class PdfTemplatesController {
  constructor(
    private readonly pdfTemplatesService: PdfTemplatesService,
    private readonly quotesPdfStorageService: QuotesPdfStorageService,
  ) {}

  @Get()
  @AdminOnly()
  list(): Promise<PdfTemplateSummary[]> {
    return this.pdfTemplatesService.list();
  }

  @Post()
  @AdminOnly()
  upload(@Body() body: { name: string; source: string }): Promise<PdfTemplateSummary> {
    return this.pdfTemplatesService.create(body);
  }

  @Patch(":id/activate")
  @AdminOnly()
  activate(@Param("id") id: string): Promise<PdfTemplateSummary> {
    return this.pdfTemplatesService.activate(id);
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id") id: string): Promise<{ success: true }> {
    await this.pdfTemplatesService.remove(id);
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // POST /pdf-templates/preview — D-08
  //
  // Renderiza um PDF a partir de um `source` Handlebars/HTML explícito OU de
  // um `templateId` de um template já salvo (galeria), usando dados de
  // orçamento MOCK. Usa o caminho de render hardened (compile restrito +
  // rede bloqueada) — nunca persiste nada (sem MinIO, sem Prisma write).
  // ---------------------------------------------------------------------------
  @Post("preview")
  @AdminOnly()
  async preview(
    @Body() body: { source?: string; templateId?: string },
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const source = body.templateId
      ? await this.pdfTemplatesService.getSource(body.templateId)
      : body.source;

    if (!source) {
      res.status(400).json({ error: "Informe 'source' ou 'templateId' para gerar o preview." });
      return;
    }

    const pdfBuffer = await this.quotesPdfStorageService.renderPreviewPdf(MOCK_QUOTE_PAYLOAD, source);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  }
}
