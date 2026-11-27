import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { PdfTemplateFamilia } from "@prisma/client";
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

/**
 * Converte o texto recebido (query/body) para o enum PdfTemplateFamilia.
 * Ausente => ORCAMENTO (a tela atual de templates segue igual). Valor fora
 * do enum => 400 (D-22).
 */
function resolverFamilia(valor?: string): PdfTemplateFamilia {
  if (valor === undefined || valor === null || valor === "") {
    return PdfTemplateFamilia.ORCAMENTO;
  }
  const validas = Object.values(PdfTemplateFamilia) as string[];
  if (!validas.includes(valor)) {
    throw new BadRequestException(
      `Família de template inválida: "${valor}". Use ${validas.join(" ou ")}.`,
    );
  }
  return valor as PdfTemplateFamilia;
}

@Controller("pdf-templates")
export class PdfTemplatesController {
  constructor(
    private readonly pdfTemplatesService: PdfTemplatesService,
    private readonly quotesPdfStorageService: QuotesPdfStorageService,
  ) {}

  @Get()
  @AdminOnly()
  list(@Query("familia") familia?: string): Promise<PdfTemplateSummary[]> {
    return this.pdfTemplatesService.list(resolverFamilia(familia));
  }

  @Post()
  @AdminOnly()
  upload(
    @Body() body: { name: string; source: string; familia?: string },
  ): Promise<PdfTemplateSummary> {
    const familia = resolverFamilia(body.familia);
    return this.pdfTemplatesService.create({ name: body.name, source: body.source, familia });
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
    // Templates da família PROPOSTA não usam o payload mock de orçamento:
    // recusa e orienta o preview próprio de propostas (T-55-18).
    if (body.templateId) {
      const familia = await this.pdfTemplatesService.getFamilia(body.templateId);
      if (familia === PdfTemplateFamilia.PROPOSTA) {
        res.status(400).json({
          error:
            "Templates de proposta são pré-visualizados em /propostas/templates/preview; o payload de exemplo de orçamento não se aplica.",
        });
        return;
      }
    }

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
