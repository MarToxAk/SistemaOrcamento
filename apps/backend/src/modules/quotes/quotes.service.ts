import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AthosService } from "../integrations/athos/athos.service";
import { PriceSource, Prisma, QuoteStatus } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";

const statusTransitions: Record<QuoteStatus, QuoteStatus[]> = {
  PENDENTE: ["APROVADO", "CANCELADO"],
  APROVADO: ["EM_PRODUCAO", "CANCELADO"],
  EM_PRODUCAO: ["PRONTO_PARA_ENTREGA", "CANCELADO"],
  PRONTO_PARA_ENTREGA: ["ENTREGUE", "CANCELADO"],
  ENTREGUE: [],
  CANCELADO: [],
};

const statusAliases: Record<string, QuoteStatus> = {
  pendente: "PENDENTE",
  aprovado: "APROVADO",
  emproducao: "EM_PRODUCAO",
  em_producao: "EM_PRODUCAO",
  "em producao": "EM_PRODUCAO",
  prontoparaentrega: "PRONTO_PARA_ENTREGA",
  pronto_para_entrega: "PRONTO_PARA_ENTREGA",
  "pronto para entrega": "PRONTO_PARA_ENTREGA",
  entregue: "ENTREGUE",
  cancelado: "CANCELADO",
};

const statusLabels: Record<QuoteStatus, string> = {
  PENDENTE: "Pendente",
  APROVADO: "Aprovado",
  EM_PRODUCAO: "Em producao",
  PRONTO_PARA_ENTREGA: "Pronto para entrega",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly athosService: AthosService,
    private readonly quotesPdfStorageService: QuotesPdfStorageService,
  ) {}

  async buscarNoAthosPorNumero(numero: string, format: "raw" | "mapped" = "raw") {
    const data = await this.athosService.buscarOrcamentoPorNumero(numero);
    return format === "mapped" ? data.mapped : data.rawRows;
  }

  async list() {
    const quotes = await this.prisma.quote.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        customer: true,
        items: {
          where: { parentItemId: null },
          orderBy: { sequence: "asc" },
          include: {
            children: { orderBy: { sequence: "asc" } },
          },
        },
        stamps: { orderBy: { number: "asc" } },
      },
    });

    return quotes.map((quote) => this.mapQuoteBody(quote));
  }

  async getById(identifier: string) {
    const quote = await this.findQuoteByIdentifier(identifier);
    if (!quote) {
      throw new NotFoundException("Orcamento nao encontrado");
    }

    const mapped = this.mapQuoteBody(quote);

    // Busca documentos salvos (including publicUrl do banco)
    const documents = await this.prisma.quoteDocument.findMany({
      where: { quoteId: quote.id },
      orderBy: { generatedAt: "desc" },
    });

    return {
      ...mapped,
      body: {
        ...mapped.body,
        id: quote.id,
        documentoPdf: documents.map((doc) => ({
          filename: doc.fileName,
          contentType: doc.contentType,
          storagePath: doc.storagePath,
          publicUrl: doc.publicUrl,
          generatedAt: doc.generatedAt,
        })),
      },
    };
  }

  async create(payload: CreateQuoteDto) {
    const customerInput = payload.cliente ?? payload.customer;
    const itemsInput = payload.itens ?? payload.items;
    if (!customerInput || !itemsInput || itemsInput.length === 0) {
      throw new BadRequestException("Payload invalido: informe cliente/customer e itens/items");
    }

    const initialStatus = this.normalizeStatus(payload.status);

    const calculatedItems = itemsInput.map((item) => {
      const itemDiscount = Number(item.valordesconto ?? 0);
      const finalPrice = Number(
        (item.orcamentovalorfinalitem ?? item.quantidadeitem * item.valoritem - itemDiscount).toFixed(2),
      );

      const children = (item.filhos ?? []).map((child) => {
        const childDiscount = Number(child.valordesconto ?? 0);
        const childFinalPrice = Number(
          (child.orcamentovalorfinalitem ?? child.quantidadeitem * child.valoritem - childDiscount).toFixed(2),
        );

        const childPriceSource: PriceSource = child.produto.idproduto ? "PDV" : "MANUAL";

        return {
          sequence: child.sequenciaitem ?? 0,
          externalItemId: this.toBigInt(child.idorcamentoitem),
          productExternalId: this.toBigInt(child.produto.idproduto),
          reference: child.produto.referencia,
          shortDescription: child.produto.descricaocurta ?? child.produto.descricaoproduto,
          description: child.produto.descricaoproduto,
          quantity: this.toDecimal(child.quantidadeitem),
          unitPrice: this.toDecimal(child.valoritem),
          discount: this.toDecimal(childDiscount),
          finalPrice: this.toDecimal(childFinalPrice),
          priceSource: childPriceSource,
        };
      });

      const itemPriceSource: PriceSource = item.produto.idproduto ? "PDV" : "MANUAL";

      return {
        sequence: item.sequenciaitem ?? 0,
        externalItemId: this.toBigInt(item.idorcamentoitem),
        productExternalId: this.toBigInt(item.produto.idproduto),
        reference: item.produto.referencia,
        shortDescription: item.produto.descricaocurta ?? item.produto.descricaoproduto,
        description: item.produto.descricaoproduto,
        quantity: this.toDecimal(item.quantidadeitem),
        unitPrice: this.toDecimal(item.valoritem),
        discount: this.toDecimal(itemDiscount),
        finalPrice: this.toDecimal(finalPrice),
        priceSource: itemPriceSource,
        children,
      };
    });

    const computedSubtotal = calculatedItems.reduce((acc, item) => {
      const current = Number(item.finalPrice.toString());
      const childrenTotal = item.children.reduce((childAcc, child) => childAcc + Number(child.finalPrice.toString()), 0);
      return acc + current + childrenTotal;
    }, 0);

    const discount = Number(payload.totais?.desconto ?? 0);
    const surcharge = Number(payload.totais?.valoracrescimo ?? 0);
    const total = Number(payload.totais?.valor ?? computedSubtotal - discount + surcharge);

    const customer = await this.resolveCustomer(payload, customerInput);

    const quote = await this.prisma.$transaction(async (tx) => {
      const createdQuote = await tx.quote.create({
        data: {
          externalQuoteId: this.toBigInt(payload.idorcamento),
          source: payload.source ?? "MANUAL",
          status: initialStatus,
          customerId: customer.id,
          sellerExternalId: this.toBigInt(payload.idvendedor),
          sellerName: payload.vendedorNome,
          conversationId: this.toBigInt(payload.conversationId),
          chatwootContactId: this.toBigInt(payload.chatwootContactId),
          validity: payload.validade,
          deliveryDate: payload.prazoEntrega ? new Date(payload.prazoEntrega) : undefined,
          paymentTerms: payload.condicaoPagamento,
          notes: payload.observacoes,
          budgetDate: payload.dataorcamento ? new Date(payload.dataorcamento) : undefined,
          editedAt: payload.dataEdicao ? new Date(payload.dataEdicao) : undefined,
          subtotal: this.toDecimal(computedSubtotal),
          discount: this.toDecimal(discount),
          surcharge: this.toDecimal(surcharge),
          total: this.toDecimal(total),
          stamps: {
            create: (payload.carimbos?.itens ?? []).map((stamp) => ({
              number: stamp.numero,
              stampType: stamp.carimbo,
              dimensions: stamp.dimensoes,
              description: stamp.descricao,
            })),
          },
          statusHistory: {
            create: {
              oldStatus: null,
              newStatus: initialStatus,
              changedByName: payload.vendedorNome ?? "sistema",
            },
          },
        },
      });

      for (const item of calculatedItems) {
        const parent = await tx.quoteItem.create({
          data: {
            quoteId: createdQuote.id,
            sequence: item.sequence,
            externalItemId: item.externalItemId,
            productExternalId: item.productExternalId,
            reference: item.reference,
            shortDescription: item.shortDescription,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            finalPrice: item.finalPrice,
            priceSource: item.priceSource,
          },
        });

        if (item.children.length > 0) {
          await tx.quoteItem.createMany({
            data: item.children.map((child) => ({
              quoteId: createdQuote.id,
              parentItemId: parent.id,
              sequence: child.sequence,
              externalItemId: child.externalItemId,
              productExternalId: child.productExternalId,
              reference: child.reference,
              shortDescription: child.shortDescription,
              description: child.description,
              quantity: child.quantity,
              unitPrice: child.unitPrice,
              discount: child.discount,
              finalPrice: child.finalPrice,
              priceSource: child.priceSource,
            })),
          });
        }
      }

      const fullQuote = await tx.quote.findUnique({
        where: { id: createdQuote.id },
        include: {
          customer: true,
          items: {
            where: { parentItemId: null },
            orderBy: { sequence: "asc" },
            include: { children: { orderBy: { sequence: "asc" } } },
          },
          stamps: { orderBy: { number: "asc" } },
        },
      });

      if (!fullQuote) {
        throw new NotFoundException("Orcamento nao encontrado apos criacao");
      }

      return fullQuote;
    });

    const mappedQuote = this.mapQuoteBody(quote);

    try {
      const stored = await this.quotesPdfStorageService.generateAndStore(mappedQuote.body);

      const document = await this.prisma.quoteDocument.create({
        data: {
          quoteId: quote.id,
          fileName: stored.fileName,
          contentType: stored.contentType,
          storagePath: stored.objectName,
          publicUrl: stored.publicUrl,
          generatedBy: payload.vendedorNome ?? "sistema",
        },
      });

      return {
        ...mappedQuote,
        body: {
          ...mappedQuote.body,
          id: quote.id,
          documentoPdf: {
            filename: document.fileName,
            contentType: document.contentType,
            storagePath: document.storagePath,
            publicUrl: document.publicUrl,
            generatedAt: document.generatedAt,
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Falha ao gerar PDF.";

      return {
        ...mappedQuote,
        body: {
          ...mappedQuote.body,
          documentoPdf: {
            error: errorMessage,
          },
        },
      };
    }
  }

  async changeStatus(identifier: string, newStatusInput: string, changedBy: string) {
    const quote = await this.findQuoteByIdentifier(identifier);
    if (!quote) {
      throw new NotFoundException("Orcamento nao encontrado");
    }

    const newStatus = this.normalizeStatus(newStatusInput);
    const allowed = statusTransitions[quote.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transicao de status invalida: ${statusLabels[quote.status]} -> ${statusLabels[newStatus]}`,
      );
    }

    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: newStatus,
        editedAt: new Date(),
        statusHistory: {
          create: {
            oldStatus: quote.status,
            newStatus,
            changedByName: changedBy,
          },
        },
      },
      include: {
        customer: true,
        items: {
          where: { parentItemId: null },
          orderBy: { sequence: "asc" },
          include: { children: { orderBy: { sequence: "asc" } } },
        },
        stamps: { orderBy: { number: "asc" } },
      },
    });

    return this.mapQuoteBody(updated);
  }

  async generatePdf(identifier: string) {
    const quote = await this.findQuoteByIdentifier(identifier);
    if (!quote) {
      throw new NotFoundException("Orcamento nao encontrado");
    }

    const mapped = this.mapQuoteBody(quote);
    const stored = await this.quotesPdfStorageService.generateAndStore(mapped.body);

    const document = await this.prisma.quoteDocument.create({
      data: {
        quoteId: quote.id,
        fileName: stored.fileName,
        contentType: stored.contentType,
        storagePath: stored.objectName,
        generatedBy: "sistema",
      },
    });

    return {
      quoteId: quote.id,
      idorcamento_interno: quote.internalNumber,
      filename: document.fileName,
      contentType: document.contentType,
      storagePath: document.storagePath,
      publicUrl: stored.publicUrl,
      generatedAt: document.generatedAt,
      message: "PDF gerado e salvo com sucesso.",
    };
  }

  private async resolveCustomer(payload: CreateQuoteDto, customerInput: { nome: string; telefone?: string; email?: string }) {
    const phone = customerInput.telefone?.trim();
    const email = customerInput.email?.trim();
    const filters = [phone ? { phone } : null, email ? { email } : null].filter(Boolean) as Prisma.CustomerWhereInput[];

    if (filters.length === 0) {
      return this.prisma.customer.create({
        data: {
          fullName: customerInput.nome,
          source: payload.source ?? "MANUAL",
          chatwootContactId: this.toBigInt(payload.chatwootContactId),
        },
      });
    }

    const existing = await this.prisma.customer.findFirst({
      where: { OR: filters },
    });

    if (!existing) {
      return this.prisma.customer.create({
        data: {
          fullName: customerInput.nome,
          phone,
          email,
          source: payload.source ?? "MANUAL",
          chatwootContactId: this.toBigInt(payload.chatwootContactId),
        },
      });
    }

    return this.prisma.customer.update({
      where: { id: existing.id },
      data: {
        fullName: customerInput.nome,
        phone: phone ?? existing.phone,
        email: email ?? existing.email,
        chatwootContactId: this.toBigInt(payload.chatwootContactId) ?? existing.chatwootContactId,
      },
    });
  }

  private normalizeStatus(input?: string): QuoteStatus {
    if (!input) {
      return "PENDENTE";
    }

    const normalized = input
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    const compact = normalized.replace(/\s+/g, "");

    const mapped = statusAliases[normalized] ?? statusAliases[compact];
    if (!mapped) {
      throw new BadRequestException(`Status invalido: ${input}`);
    }
    return mapped;
  }

  private toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(Number(value.toFixed(2)));
  }

  private toBigInt(value?: number): bigint | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    return BigInt(Math.trunc(value));
  }

  private async findQuoteByIdentifier(identifier: string) {
    const where = /^\d+$/.test(identifier)
      ? { internalNumber: Number(identifier) }
      : { id: identifier };

    return this.prisma.quote.findFirst({
      where,
      include: {
        customer: true,
        items: {
          where: { parentItemId: null },
          orderBy: { sequence: "asc" },
          include: { children: { orderBy: { sequence: "asc" } } },
        },
        stamps: { orderBy: { number: "asc" } },
      },
    });
  }

  private mapQuoteBody(quote: {
    id: string;
    internalNumber: number;
    externalQuoteId: bigint | null;
    budgetDate: Date | null;
    sellerExternalId: bigint | null;
    sellerName: string | null;
    conversationId: bigint | null;
    chatwootContactId: bigint | null;
    status: QuoteStatus;
    notes: string | null;
    validity: string | null;
    deliveryDate: Date | null;
    paymentTerms: string | null;
    editedAt: Date | null;
    discount: Prisma.Decimal;
    surcharge: Prisma.Decimal;
    total: Prisma.Decimal;
    customer: { fullName: string; phone: string | null; email: string | null };
    items: Array<{
      externalItemId: bigint | null;
      sequence: number;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      discount: Prisma.Decimal;
      finalPrice: Prisma.Decimal;
      reference: string | null;
      description: string;
      shortDescription: string;
      productExternalId: bigint | null;
      children: Array<{
        externalItemId: bigint | null;
        sequence: number;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        discount: Prisma.Decimal;
        finalPrice: Prisma.Decimal;
        reference: string | null;
        description: string;
        shortDescription: string;
        productExternalId: bigint | null;
      }>;
    }>;
    stamps: Array<{ number: number; stampType: string; dimensions: string | null; description: string | null }>;
  }) {
    const items = quote.items.map((item) => ({
      idorcamentoitem: item.externalItemId ? Number(item.externalItemId) : undefined,
      sequenciaitem: item.sequence,
      produto: {
        idproduto: item.productExternalId ? Number(item.productExternalId) : undefined,
        descricaoproduto: item.description,
        descricaocurta: item.shortDescription,
        referencia: item.reference,
      },
      quantidadeitem: Number(item.quantity.toString()),
      valoritem: Number(item.unitPrice.toString()),
      valordesconto: Number(item.discount.toString()),
      orcamentovalorfinalitem: Number(item.finalPrice.toString()),
      filhos: item.children.map((child) => ({
        idorcamentoitem: child.externalItemId ? Number(child.externalItemId) : undefined,
        sequenciaitem: child.sequence,
        produto: {
          idproduto: child.productExternalId ? Number(child.productExternalId) : undefined,
          descricaoproduto: child.description,
          descricaocurta: child.shortDescription,
          referencia: child.reference,
        },
        quantidadeitem: Number(child.quantity.toString()),
        valoritem: Number(child.unitPrice.toString()),
        valordesconto: Number(child.discount.toString()),
        orcamentovalorfinalitem: Number(child.finalPrice.toString()),
      })),
    }));

    return {
      body: {
        idorcamento_interno: quote.internalNumber,
        idorcamento: quote.externalQuoteId ? Number(quote.externalQuoteId) : undefined,
        dataorcamento: quote.budgetDate?.toISOString(),
        idvendedor: quote.sellerExternalId ? Number(quote.sellerExternalId) : undefined,
        vendedorNome: quote.sellerName,
        conversationId: quote.conversationId ? Number(quote.conversationId) : undefined,
        chatwootContactId: quote.chatwootContactId ? Number(quote.chatwootContactId) : undefined,
        status: statusLabels[quote.status],
        cliente: {
          nome: quote.customer.fullName,
          telefone: quote.customer.phone,
          email: quote.customer.email,
        },
        observacoes: quote.notes,
        validade: quote.validity,
        prazoEntrega: quote.deliveryDate?.toISOString().slice(0, 10),
        condicaoPagamento: quote.paymentTerms,
        itens: items,
        carimbos: {
          quantidade_total: quote.stamps.length,
          itens: quote.stamps.map((stamp) => ({
            numero: stamp.number,
            carimbo: stamp.stampType,
            dimensoes: stamp.dimensions,
            descricao: stamp.description,
          })),
        },
        totais: {
          desconto: Number(quote.discount.toString()),
          valoracrescimo: Number(quote.surcharge.toString()),
          valor: Number(quote.total.toString()),
        },
        dataEdicao: quote.editedAt?.toISOString(),
      },
    };
  }
}
