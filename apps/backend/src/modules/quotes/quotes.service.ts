import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, Inject, forwardRef } from "@nestjs/common";
import { randomBytes } from "crypto";
import { ConfigService } from "@nestjs/config";
import { AthosService } from "../integrations/athos/athos.service";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import { EfiService } from "../integrations/efi/efi.service";
import { PriceSource, Prisma, QuoteStatus } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";

const statusTransitions = {
  PENDENTE: ["ENVIADO", "PAGAMENTO_PARCIAL", "APROVADO", "CANCELADO"],
  PAGAMENTO_PARCIAL: ["APROVADO", "CANCELADO"],
  APROVADO: ["EM_PRODUCAO", "CANCELADO"],
  EM_PRODUCAO: ["PRONTO_PARA_ENTREGA", "CANCELADO"],
  PRONTO_PARA_ENTREGA: ["ENTREGUE", "CANCELADO"],
  ENTREGUE: [],
  ENVIADO: ["PAGAMENTO_PARCIAL", "APROVADO", "CANCELADO"],
  CANCELADO: [],
} as Record<QuoteStatus, QuoteStatus[]>;

const statusAliases = {
  pendente: "PENDENTE",
  pagamento_parcial: "PAGAMENTO_PARCIAL",
  pagamentoparcial: "PAGAMENTO_PARCIAL",
  "pagamento parcial": "PAGAMENTO_PARCIAL",
  aprovado: "APROVADO",
  emproducao: "EM_PRODUCAO",
  em_producao: "EM_PRODUCAO",
  "em producao": "EM_PRODUCAO",
  prontoparaentrega: "PRONTO_PARA_ENTREGA",
  pronto_para_entrega: "PRONTO_PARA_ENTREGA",
  "pronto para entrega": "PRONTO_PARA_ENTREGA",
  entregue: "ENTREGUE",
  enviado: "ENVIADO",
  cancelado: "CANCELADO",
} as unknown as Record<string, QuoteStatus>;

const statusLabels = {
  PENDENTE: "Pendente",
  PAGAMENTO_PARCIAL: "Pagamento parcial",
  APROVADO: "Aprovado",
  EM_PRODUCAO: "Em producao",
  PRONTO_PARA_ENTREGA: "Pronto para entrega",
  ENTREGUE: "Entregue",
  ENVIADO: "Enviado",
  CANCELADO: "Cancelado",
} as Record<QuoteStatus, string>;

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly athosService: AthosService,
    private readonly quotesPdfStorageService: QuotesPdfStorageService,
    private readonly configService: ConfigService,
    private readonly chatwootService: ChatwootService,
    @Inject(forwardRef(() => EfiService))
    private readonly efiService: EfiService,
  ) {}

  async buscarNoAthosPorNumero(numero: string, format: "raw" | "mapped" = "raw") {
    // Se já existe um orcamento salvo com esse externalQuoteId, preferir os dados do banco
    const parsed = Number(numero);
    if (Number.isFinite(parsed)) {
      const externalId = this.toBigInt(parsed);
      if (externalId) {
        const quote = await this.prisma.quote.findFirst({
          where: { externalQuoteId: externalId },
          include: {
            customer: true,
            items: {
              where: { parentItemId: null },
              orderBy: { sequence: "asc" },
              include: { children: { orderBy: { sequence: "asc" } } },
            },
            stamps: { orderBy: { number: "asc" } },
            documents: {
              orderBy: { generatedAt: "desc" },
              take: 1,
            },
          },
        });

        if (quote) {
          const mapped = this.mapQuoteToAthosMapped(quote);
          return format === "mapped" ? mapped : [mapped];
        }
      }
    }

    const data = await this.athosService.buscarOrcamentoPorNumero(numero);
    return format === "mapped" ? data.mapped : data.rawRows;
  }

  async testarConexaoAthos() {
    return this.athosService.testarConexao();
  }

  async list(
    status?: string,
    take?: number,
    skip?: number,
    conversationId?: number,
    chatwootContactId?: number,
  ) {
    const where: Prisma.QuoteWhereInput = {};
    if (status) {
      const parsedStatuses = status
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .flatMap((entry) => {
          try {
            return [this.normalizeStatus(entry)];
          } catch {
            return [];
          }
        });

      if (parsedStatuses.length === 1) {
        where.status = parsedStatuses[0];
      } else if (parsedStatuses.length > 1) {
        where.status = { in: parsedStatuses };
      }
    }

    const parsedConversationId = this.toBigInt(conversationId);
    if (parsedConversationId) {
      where.conversationId = parsedConversationId;
    }

    const parsedChatwootContactId = this.toBigInt(chatwootContactId);
    if (parsedChatwootContactId) {
      where.chatwootContactId = parsedChatwootContactId;
    }

    const args: Prisma.QuoteFindManyArgs = {
      where,
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
        documents: {
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
      },
    };

    if (typeof take === "number") args.take = take;
    if (typeof skip === "number") args.skip = skip;

    const quotes = await this.prisma.quote.findMany(args);
    return (quotes as any[]).map((quote: any) => this.mapQuoteBody(quote));
  }

  async getById(identifier: string) {
    const quote = await this.findQuoteByIdentifier(identifier);
    if (!quote) {
      throw new NotFoundException("Orcamento nao encontrado");
    }

    let resolvedQuote: any = quote;

    if (!resolvedQuote.saleExternalId && resolvedQuote.externalQuoteId) {
      try {
        const athosData = await this.athosService.buscarOrcamentoPorNumero(String(Number(resolvedQuote.externalQuoteId)));
        const numeroVenda = Number((athosData as any)?.mapped?.numeroVenda);

        if (Number.isFinite(numeroVenda)) {
          await this.prisma.quote.update({
            where: { id: resolvedQuote.id },
            data: { saleExternalId: this.toBigInt(numeroVenda) },
          });

          resolvedQuote = {
            ...resolvedQuote,
            saleExternalId: this.toBigInt(numeroVenda),
          };
        }
      } catch (error) {
        this.logger.warn(
          `Nao foi possivel preencher idvenda automaticamente para o orcamento ${resolvedQuote.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const mapped = this.mapQuoteBody(resolvedQuote);

    // Busca documentos salvos (including publicUrl do banco)
    const documents = await this.prisma.quoteDocument.findMany({
      where: { quoteId: quote.id },
      orderBy: { generatedAt: "desc" },
    });

    return {
      ...mapped,
      body: {
        ...mapped.body,
        id: resolvedQuote.id,
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

  async checkPaymentStatus(identifier: string) {
    const quote = await this.findQuoteByIdentifier(identifier);
    if (!quote) {
      throw new NotFoundException("Orcamento nao encontrado");
    }

    const mapped = this.mapQuoteBody(quote);
    const idOrcamento = mapped.body.idorcamento ?? mapped.body.idorcamento_interno;
    const idVenda = mapped.body.idvenda;

    const payment = await this.athosService.verificarPagamentoPorOrcamento(String(idOrcamento ?? quote.internalNumber), idVenda);
    let resolvedIdVenda = idVenda ?? payment.idVenda;

    if (!idVenda && Number.isFinite(Number(payment.idVenda))) {
      try {
        const parsedIdVenda = Number(payment.idVenda);
        await this.prisma.quote.update({
          where: { id: quote.id },
          data: { saleExternalId: this.toBigInt(parsedIdVenda) },
        });
        resolvedIdVenda = parsedIdVenda;
      } catch (error) {
        this.logger.warn(
          `Nao foi possivel persistir idvenda (${payment.idVenda}) para o orcamento ${quote.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    let statusUpdated = false;
    let previousStatus = quote.status;
    let currentStatus = quote.status;
    let statusSyncError: string | null = null;

    if (payment.paid && ["PENDENTE", "ENVIADO"].includes(quote.status)) {
      try {
        await this.changeStatus(quote.id, "APROVADO", "Verificacao de pagamento Athos");
        statusUpdated = true;
        currentStatus = "APROVADO" as QuoteStatus;
      } catch (error) {
        statusSyncError = error instanceof Error ? error.message : "Falha ao sincronizar status";
        this.logger.warn(
          `Pagamento detectado, mas status nao foi atualizado automaticamente para o orcamento ${quote.id}: ${statusSyncError}`,
        );
      }
    }

    return {
      quoteId: quote.id,
      idorcamento: idOrcamento,
      idvenda: resolvedIdVenda,
      payment,
      statusSync: {
        updated: statusUpdated,
        previousStatusKey: previousStatus,
        previousStatusLabel: statusLabels[previousStatus],
        currentStatusKey: currentStatus,
        currentStatusLabel: statusLabels[currentStatus],
        error: statusSyncError,
      },
    };
  }

  async create(payload: CreateQuoteDto) {
    // Validação Chatwoot: se informado, deve ser válido
    this.validateChatwootContext(payload);

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
      const externalId = this.toBigInt(payload.idorcamento);

      if (externalId) {
        const existing = await tx.quote.findFirst({ where: { externalQuoteId: externalId } });
        if (existing) {
          // Atualiza metadados do orçamento existente
          const updated = await tx.quote.update({
            where: { id: existing.id },
            data: {
              source: payload.source ?? "MANUAL",
              status: initialStatus,
              customerId: customer.id,
              sellerExternalId: this.toBigInt(payload.idvendedor),
              saleExternalId: this.toBigInt(payload.idvenda),
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
            },
          });

          // Remove itens e carimbos antigos e recria com os novos dados
          await tx.quoteItem.deleteMany({ where: { quoteId: updated.id } });
          await tx.quoteStampItem.deleteMany({ where: { quoteId: updated.id } });

          for (const item of calculatedItems) {
            const parent = await tx.quoteItem.create({
              data: {
                quoteId: updated.id,
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
                  quoteId: updated.id,
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

          const stampsData = (payload.carimbos?.itens ?? []).map((stamp) => ({
            quoteId: updated.id,
            number: stamp.numero,
            stampType: stamp.carimbo,
            dimensions: stamp.dimensoes,
            description: stamp.descricao,
          }));

          if (stampsData.length > 0) {
            await tx.quoteStampItem.createMany({ data: stampsData });
          }

          await tx.quoteStatusHistory.create({
            data: {
              quoteId: updated.id,
              oldStatus: null,
              newStatus: initialStatus,
              changedByName: payload.vendedorNome ?? "sistema",
            },
          });

          const fullQuote = await tx.quote.findUnique({
            where: { id: updated.id },
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
            throw new NotFoundException("Orcamento nao encontrado apos atualizacao");
          }

          return fullQuote;
        }
      }

      // Se não existe externalId ou não foi encontrado, cria novo
      const createdQuote = await tx.quote.create({
        data: {
          externalQuoteId: this.toBigInt(payload.idorcamento),
          source: payload.source ?? "MANUAL",
          status: initialStatus,
          customerId: customer.id,
          sellerExternalId: this.toBigInt(payload.idvendedor),
          saleExternalId: this.toBigInt(payload.idvenda),
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
          documents: {
            orderBy: { generatedAt: "desc" },
            take: 1,
          },
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

    // Bloqueia avanço para EM_PRODUCAO se não aprovado e cliente não for associado
    if (newStatus === "EM_PRODUCAO") {
      const isAssociated = Boolean((quote as any).customer?.isAssociated ?? false) || Boolean(quote.notes && String(quote.notes).includes("__associated__"));
      if (!quote.approved && !isAssociated) {
        throw new BadRequestException("Orçamento precisa ser aprovado pelo cliente antes de entrar em produção");
      }
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
        documents: {
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
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
        publicUrl: stored.publicUrl,
        generatedBy: "sistema",
      },
    });

    return {
      quoteId: quote.id,
      idorcamento_interno: quote.internalNumber,
      idorcamento: quote.externalQuoteId ? Number(quote.externalQuoteId) : undefined,
      filename: document.fileName,
      contentType: document.contentType,
      storagePath: document.storagePath,
      publicUrl: stored.publicUrl,
      generatedAt: document.generatedAt,
      message: "PDF gerado e salvo com sucesso.",
    };
  }

  async resendPdfToChatwoot(identifier: string) {
    const quote = await this.findQuoteByIdentifier(identifier);
    if (!quote) throw new NotFoundException("Orcamento nao encontrado");

    const convId = quote.conversationId ? String(quote.conversationId) : undefined;
    if (!convId) throw new BadRequestException("conversationId ausente no orcamento");

    // Tentar pegar o documento PDF mais recente
    let latestDocument = await this.prisma.quoteDocument.findFirst({ where: { quoteId: quote.id }, orderBy: { generatedAt: "desc" } });

    let fileBuffer: Buffer | null = null;
    let fileName = latestDocument?.fileName ?? `Orcamento-${quote.internalNumber}.pdf`;
    let contentType = latestDocument?.contentType ?? "application/pdf";

    if (latestDocument && latestDocument.storagePath) {
      try {
        fileBuffer = await this.quotesPdfStorageService.downloadObjectBuffer(latestDocument.storagePath);
      } catch (err) {
        this.logger.warn(`Falha ao baixar PDF do storage para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
        fileBuffer = null;
      }
    }

    // Se nao temos buffer do storage, gerar e salvar um novo PDF
          if (!fileBuffer) {
            try {
              // Para gerar o PDF, use o formato esperado pelo gerador (mapQuoteBody)
              const stored = await this.quotesPdfStorageService.generateAndStore(this.mapQuoteBody(quote).body);

        // Persistir registro de documento
        try {
          await this.prisma.quoteDocument.create({
            data: {
              quoteId: quote.id,
              fileName: stored.fileName,
              contentType: stored.contentType,
              storagePath: stored.objectName,
              publicUrl: stored.publicUrl,
              generatedBy: "resend",
            },
          });
        } catch (err) {
          this.logger.debug(`Falha ao persistir QuoteDocument apos gerar PDF para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
        }

        fileBuffer = await this.quotesPdfStorageService.downloadObjectBuffer(stored.objectName);
        fileName = stored.fileName;
        contentType = stored.contentType;
      } catch (err) {
        this.logger.warn(`Falha ao gerar PDF para reenvio do orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
        throw new BadRequestException("Falha ao obter/gerar PDF para reenvio");
      }
    }

    // Envia o anexo para o Chatwoot
    try {
      await this.chatwootService.sendAttachment(convId, fileBuffer as Buffer, fileName, contentType);
    } catch (err) {
      this.logger.warn(`Falha ao enviar PDF ao Chatwoot para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException("Falha ao enviar PDF ao Chatwoot");
    }

    return { sent: true, message: "PDF reenviado ao Chatwoot" };
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

  private validateChatwootContext(payload: CreateQuoteDto): void {
    // Se conversationId ou chatwootContactId forem informados, devem ser válidos (> 0)
    if (payload.conversationId !== undefined && payload.conversationId !== null) {
      if (!Number.isFinite(payload.conversationId) || payload.conversationId <= 0) {
        throw new BadRequestException("conversationId invalido: deve ser um número positivo");
      }
    }

    if (payload.chatwootContactId !== undefined && payload.chatwootContactId !== null) {
      if (!Number.isFinite(payload.chatwootContactId) || payload.chatwootContactId <= 0) {
        throw new BadRequestException("chatwootContactId invalido: deve ser um número positivo");
      }
    }

    // Validação adicional: se tem um, é bom ter os dois
    const hasChatContext = payload.conversationId || payload.chatwootContactId;
    if (hasChatContext && !(payload.conversationId && payload.chatwootContactId)) {
      console.warn(
        `[Chatwoot] Contexto incompleto: conversationId=${payload.conversationId}, chatwootContactId=${payload.chatwootContactId}`,
      );
    }
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
    const numericIdentifier = /^\d+$/.test(identifier) ? Number(identifier) : null;

    if (numericIdentifier !== null) {
      const byExternalQuoteId = await this.prisma.quote.findFirst({
        where: { externalQuoteId: BigInt(numericIdentifier) },
        include: {
          customer: true,
          items: {
            where: { parentItemId: null },
            orderBy: { sequence: "asc" },
            include: { children: { orderBy: { sequence: "asc" } } },
          },
          stamps: { orderBy: { number: "asc" } },
          documents: {
            orderBy: { generatedAt: "desc" },
            take: 1,
          },
        },
      });

      if (byExternalQuoteId) {
        return byExternalQuoteId;
      }

      return this.prisma.quote.findFirst({
        where: { internalNumber: numericIdentifier },
        include: {
          customer: true,
          items: {
            where: { parentItemId: null },
            orderBy: { sequence: "asc" },
            include: { children: { orderBy: { sequence: "asc" } } },
          },
          stamps: { orderBy: { number: "asc" } },
          documents: {
            orderBy: { generatedAt: "desc" },
            take: 1,
          },
        },
      });
    }

    return this.prisma.quote.findFirst({
      where: { id: identifier },
      include: {
        customer: true,
        items: {
          where: { parentItemId: null },
          orderBy: { sequence: "asc" },
          include: { children: { orderBy: { sequence: "asc" } } },
        },
        stamps: { orderBy: { number: "asc" } },
        documents: {
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
      },
    });
  }

  // Lista externalQuoteId duplicados com as ids das entradas
  async listDuplicates() {
    const rows: Array<{ externalQuoteId: string | null; ids: string[]; count: string }> =
      await this.prisma.$queryRaw`
        SELECT "externalQuoteId", array_agg(id) AS ids, COUNT(*) AS count
        FROM "Quote"
        WHERE "externalQuoteId" IS NOT NULL
        GROUP BY "externalQuoteId"
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
      `;

    return rows.map((r) => ({
      externalQuoteId: r.externalQuoteId ? Number(r.externalQuoteId) : null,
      ids: r.ids,
      count: Number(r.count),
    }));
  }

  // Mescla duplicatas identificadas por externalQuoteId
  async mergeDuplicates(payload: { externalQuoteId: number; keepId?: string; strategy?: "oldest" | "newest" }) {
    if (!payload?.externalQuoteId) {
      throw new BadRequestException("externalQuoteId é obrigatório");
    }

    const externalId = BigInt(Math.trunc(payload.externalQuoteId));

    const quotes = await this.prisma.quote.findMany({
      where: { externalQuoteId: externalId },
      include: {
        customer: true,
        items: { where: { parentItemId: null }, orderBy: { sequence: "asc" }, include: { children: { orderBy: { sequence: "asc" } } } },
        stamps: { orderBy: { number: "asc" } },
        statusHistory: true,
        documents: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!quotes || quotes.length < 2) {
      throw new NotFoundException("Nenhuma duplicata encontrada para esse externalQuoteId");
    }

    let keepId: string;
    const ids = quotes.map((q) => q.id);
    if (payload.keepId) {
      if (!ids.includes(payload.keepId)) throw new BadRequestException("keepId informado não pertence ao grupo de duplicatas");
      keepId = payload.keepId;
    } else {
      const strategy = payload.strategy ?? "newest";
      keepId = strategy === "oldest" ? quotes[quotes.length - 1].id : quotes[0].id;
    }

    const otherIds = ids.filter((id) => id !== keepId);

    const merged = await this.prisma.$transaction(async (tx) => {
      // Reunir todos os itens (pais e filhos)
      const allParents: Array<any> = [];
      for (const q of quotes) {
        for (const parent of q.items) {
          allParents.push({
            ...parent,
            children: parent.children ?? [],
          });
        }
      }

      // Recreate items on keepId: delete existing items for all involved quotes then create merged set
      await tx.quoteItem.deleteMany({ where: { quoteId: { in: ids } } });

      let seq = 1;
      for (const parent of allParents) {
        const createdParent = await tx.quoteItem.create({
          data: {
            quoteId: keepId,
            sequence: seq++,
            externalItemId: parent.externalItemId ?? undefined,
            productExternalId: parent.productExternalId ?? undefined,
            reference: parent.reference ?? undefined,
            shortDescription: parent.shortDescription ?? parent.description ?? "",
            description: parent.description ?? "",
            quantity: parent.quantity ?? new Prisma.Decimal(0),
            unitPrice: parent.unitPrice ?? new Prisma.Decimal(0),
            discount: parent.discount ?? new Prisma.Decimal(0),
            finalPrice: parent.finalPrice ?? new Prisma.Decimal(0),
            priceSource: parent.priceSource ?? "MANUAL",
          },
        });

        for (const child of parent.children ?? []) {
          await tx.quoteItem.create({
            data: {
              quoteId: keepId,
              parentItemId: createdParent.id,
              sequence: child.sequence ?? 0,
              externalItemId: child.externalItemId ?? undefined,
              productExternalId: child.productExternalId ?? undefined,
              reference: child.reference ?? undefined,
              shortDescription: child.shortDescription ?? child.description ?? "",
              description: child.description ?? "",
              quantity: child.quantity ?? new Prisma.Decimal(0),
              unitPrice: child.unitPrice ?? new Prisma.Decimal(0),
              discount: child.discount ?? new Prisma.Decimal(0),
              finalPrice: child.finalPrice ?? new Prisma.Decimal(0),
              priceSource: child.priceSource ?? "MANUAL",
            },
          });
        }
      }

      // Mesclar carimbos
      const allStamps = quotes.flatMap((q) => q.stamps ?? []);
      await tx.quoteStampItem.deleteMany({ where: { quoteId: { in: ids } } });
      if (allStamps.length > 0) {
        const stampsData = allStamps.map((stamp, idx) => ({ quoteId: keepId, number: idx + 1, stampType: stamp.stampType, dimensions: stamp.dimensions ?? undefined, description: stamp.description ?? undefined }));
        await tx.quoteStampItem.createMany({ data: stampsData });
      }

      // Reatribuir documentos e historicos para keepId
      await tx.quoteDocument.updateMany({ where: { quoteId: { in: otherIds } }, data: { quoteId: keepId } });
      await tx.quoteStatusHistory.updateMany({ where: { quoteId: { in: otherIds } }, data: { quoteId: keepId } });

      // Atualizar metadados do orçamento (totais calculados com base nos itens criados)
      const recomputed = await tx.$queryRaw<Array<{ subtotal: string; discount: string; surcharge: string; total: string }>>`
        SELECT COALESCE(SUM("finalPrice"::numeric),0) AS subtotal FROM "QuoteItem" WHERE "quoteId" = ${keepId}
      `;

      // Simplesmente atualiza updatedAt e mantém outros metadados do keep quote
      await tx.quote.update({ where: { id: keepId }, data: { updatedAt: new Date() } });

      // Deletar as entradas duplicadas (exclui as quotes que não são a keep)
      for (const id of otherIds) {
        await tx.quote.delete({ where: { id } });
      }

      const fullQuote = await tx.quote.findUnique({
        where: { id: keepId },
        include: {
          customer: true,
          items: {
            where: { parentItemId: null },
            orderBy: { sequence: "asc" },
            include: { children: { orderBy: { sequence: "asc" } } },
          },
          stamps: { orderBy: { number: "asc" } },
          documents: {
            orderBy: { generatedAt: "desc" },
            take: 1,
          },
        },
      });

      if (!fullQuote) throw new NotFoundException("Erro ao recuperar orcamento mesclado");

      return fullQuote;
    });

    return this.mapQuoteBody(merged);
  }

  private mapQuoteBody(quote: {
    id: string;
    internalNumber: number;
    externalQuoteId: bigint | null;
    budgetDate: Date | null;
    sellerExternalId: bigint | null;
    saleExternalId?: bigint | null;
    sellerName: string | null;
    conversationId: bigint | null;
    chatwootContactId: bigint | null;
    status: QuoteStatus;
    notes: string | null;
    validity: string | null;
    deliveryDate: Date | null;
    paymentTerms: string | null;
    createdAt: Date;
    updatedAt: Date;
    editedAt: Date | null;
    discount: Prisma.Decimal;
    surcharge: Prisma.Decimal;
    total: Prisma.Decimal;
    customer: { fullName: string; phone: string | null; email: string | null };
    documents?: Array<{ fileName: string; publicUrl: string | null; generatedAt: Date }>;
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
    const latestDocument = quote.documents?.[0];

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
      id: quote.id,
      internalNumber: quote.internalNumber,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString(),
      statusKey: quote.status,
      statusLabel: statusLabels[quote.status],
      latestPdfUrl: latestDocument?.publicUrl ?? null,
      latestPdfFileName: latestDocument?.fileName ?? null,
      chatwootConversationUrl: this.buildChatwootConversationUrl(quote.conversationId),
      chatwootContactUrl: this.buildChatwootContactUrl(quote.chatwootContactId),
      availableNextStatuses: statusTransitions[quote.status].map((status) => ({
        value: status,
        label: statusLabels[status],
      })),
      body: {
        idorcamento_interno: quote.internalNumber,
        idorcamento: quote.externalQuoteId ? Number(quote.externalQuoteId) : undefined,
        dataorcamento: quote.budgetDate?.toISOString(),
        idvendedor: quote.sellerExternalId ? Number(quote.sellerExternalId) : undefined,
        idvenda: quote.saleExternalId ? Number(quote.saleExternalId) : undefined,
        vendedorNome: quote.sellerName,
        conversationId: quote.conversationId ? Number(quote.conversationId) : undefined,
        chatwootContactId: quote.chatwootContactId ? Number(quote.chatwootContactId) : undefined,
        status: statusLabels[quote.status],
        cliente: {
          nome: quote.customer.fullName,
          nomefantasia: quote.customer.fullName, // Ajuste para compatibilidade com o frontend
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

  private buildChatwootConversationUrl(conversationId: bigint | null): string | null {
    if (!conversationId) {
      return null;
    }

    const baseUrl = this.configService.get<string>("CHATWOOT_BASE_URL");
    const accountId = this.configService.get<string>("CHATWOOT_ACCOUNT_ID");

    if (!baseUrl || !accountId) {
      return null;
    }

    return `${baseUrl.replace(/\/$/, "")}/app/accounts/${accountId}/conversations/${conversationId.toString()}`;
  }

  private buildChatwootContactUrl(contactId: bigint | null): string | null {
    if (!contactId) return null;

    const baseUrl = this.configService.get<string>("CHATWOOT_BASE_URL");
    const accountId = this.configService.get<string>("CHATWOOT_ACCOUNT_ID");

    if (!baseUrl || !accountId) return null;

    return `${baseUrl.replace(/\/$/, "")}/app/accounts/${accountId}/contacts/${contactId.toString()}`;
  }

  private buildPaymentMessage(
    clienteNome: string,
    numero: string | number,
    total: number,
    itens: Array<{ descricao: string; quantidade: number; total: number }>,
    pixPayment: {
      linkVisualizacao: string;
      amount: number;
      originalAmount: number;
      discountAmount: number;
      pixCopiaECola?: string | null;
    },
    paymentOptions: ReturnType<typeof this.efiService.resolvePaymentOptions>,
    extra: {
      pix5050Link?: string;
      pix5050Half?: number;
      cardLink?: string;
    } = {},
  ): string {
    const fmt = (v: number) =>
      v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const linhasItens = itens
      .slice(0, 10)
      .map((it) => `• ${it.descricao} (${it.quantidade}x) — ${fmt(it.total)}`)
      .join("\n");

    const maisItens = itens.length > 10 ? `\n...e mais ${itens.length - 10} item(ns)` : "";

    const opts = paymentOptions.options;
    const pix = opts.find((o) => o.code === "PIX_AVISTA")!;
    const meia = opts.find((o) => o.code === "ENTRADA_50_LOJA_50");
    const cartao = opts.find((o) => o.code === "CARTAO_2X");

    const linhasPagamento: string[] = [];

    // PIX (sempre disponível)
    const pixFinal = pix.finalAmount ?? pixPayment.amount;
    const pixDiscount = pix.discountPercent ?? 0;
    const pixLabel = pixDiscount > 0
      ? `*1️⃣ PIX à vista* — ${fmt(pixFinal)} _(${pixDiscount}% de desconto)_`
      : `*1️⃣ PIX à vista* — ${fmt(pixFinal)}`;
    linhasPagamento.push(pixLabel);
    linhasPagamento.push(`👉 ${pixPayment.linkVisualizacao}`);
    if (pixPayment.pixCopiaECola) {
      linhasPagamento.push(`Pix Copia e Cola:`);
      linhasPagamento.push(pixPayment.pixCopiaECola);
    }

    // 50/50
    if (meia?.enabled) {
      const metade = fmt(extra.pix5050Half ?? Number((total * 0.5).toFixed(2)));
      linhasPagamento.push(`\n*2️⃣ 50% entrada + 50% na loja*`);
      linhasPagamento.push(`Entrada de ${metade} via PIX:`);
      if (extra.pix5050Link) {
        linhasPagamento.push(`👉 ${extra.pix5050Link}`);
      }
      linhasPagamento.push(`Restante (${metade}) na retirada do pedido.`);
    }

    // Cartão
    if (cartao?.enabled) {
      linhasPagamento.push(`\n*3️⃣ Cartão de crédito em até 2x*`);
      if (extra.cardLink) {
        linhasPagamento.push(`👉 ${extra.cardLink}`);
      } else {
        linhasPagamento.push(`Processamos na maquininha na retirada (${fmt(cartao.finalAmount ?? total)} em até 2x).`);
      }
    }

    return [
      `Olá, ${clienteNome.split(" ")[0]}! 👋 Segue o resumo do seu pedido:`,
      ``,
      `📋 *Orçamento #${numero}*`,
      linhasItens + maisItens,
      ``,
      `💰 *Total: ${fmt(total)}*`,
      ``,
      `💳 *Formas de pagamento disponíveis:*`,
      ...linhasPagamento,
      ``,
      `Qualquer dúvida, é só chamar! 😊`,
    ].join("\n");
  }

  async enviarParaCliente(quoteId: string) {
    const quote = await this.findQuoteByIdentifier(quoteId);
    if (!quote) {
      throw new NotFoundException("Orçamento não encontrado");
    }

    if (statusTransitions[quote.status]?.includes("ENVIADO" as QuoteStatus)) {
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: "ENVIADO" as QuoteStatus,
          editedAt: new Date(),
          statusHistory: {
            create: {
              oldStatus: quote.status,
              newStatus: "ENVIADO" as QuoteStatus,
              changedByName: "envio ao cliente",
            },
          },
        },
      });
    }

    // Tenta resolver idcliente e nome (prioriza dados persistidos)
    let clienteId: any = undefined;
    let clienteNome = quote.customer?.fullName;

    let athosMapped: any = null;
    if (!clienteId) {
      try {
        const lookupId = String(quote.externalQuoteId ?? quote.internalNumber ?? "");
        const athosData = await this.athosService.buscarOrcamentoPorNumero(lookupId);
        athosMapped = (athosData as any)?.mapped ?? null;
        clienteId = athosMapped?.idcliente ?? athosMapped?.clienteid ?? clienteId;
        clienteNome = clienteNome ?? athosMapped?.cliente_juridico ?? athosMapped?.cliente_fisico ?? athosMapped?.cliente;
      } catch (err) {
        // Não bloquear o envio se a consulta ao Athos falhar; apenas logar
        this.logger.debug(`Athos lookup falhou para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Prepara dados do orçamento para montar a mensagem
    const mappedQuote = this.mapQuoteToAthosMapped(quote);
    const numero = mappedQuote.numero ?? quote.internalNumber;
    const itens = Array.isArray(mappedQuote.itens) ? mappedQuote.itens : [];
    const total = Number(quote.total ?? 0);

    // Preparar opções de pagamento e gerar links via EFI (se possível)
    let paymentOptions: ReturnType<typeof this.efiService.resolvePaymentOptions> | null = null;
    try {
      paymentOptions = this.efiService.resolvePaymentOptions(total);
    } catch (err) {
      this.logger.warn(`Falha ao resolver opcoes de pagamento EFI para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
      paymentOptions = null;
    }

    let pixPayment: any = null;
    let pix5050: any = null;
    let cardLink: string | null = null;

    if (paymentOptions) {
      try {
        pixPayment = await this.efiService.createPixPaymentLink({
          quoteIdentifier: String(numero),
          amount: total,
          customerName: clienteNome ?? undefined,
        });
      } catch (err) {
        this.logger.warn(`Falha ao gerar PIX EFI para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
        pixPayment = null;
      }

      const meia = paymentOptions.options.find((o) => o.code === "ENTRADA_50_LOJA_50");
      if (meia?.enabled) {
        try {
          const res = await this.efiService.createPix5050Link({ quoteIdentifier: String(numero), totalAmount: total, customerName: clienteNome ?? undefined });
          pix5050 = res;
        } catch (err) {
          this.logger.warn(`Falha ao gerar PIX 50% EFI para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
          pix5050 = null;
        }
      }

      const cartao = paymentOptions.options.find((o) => o.code === "CARTAO_2X");
      if (cartao?.enabled) {
        try {
          const card = await this.efiService.createCardPaymentLink({ quoteIdentifier: String(numero), amount: total });
          cardLink = card.paymentUrl;
        } catch (err) {
          this.logger.warn(`Falha ao gerar link de cartao EFI para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
          cardLink = null;
        }
      }
    }

    // Se houver idcliente, garantir token de aprovacao e montar link de aprovacao
    let approvalToken: string | undefined = undefined;
    let approvalLink: string | undefined = undefined;
    if (clienteId) {
      if (quote.approvalToken && quote.approvalExpiresAt && new Date(quote.approvalExpiresAt) > new Date()) {
        approvalToken = quote.approvalToken;
      } else {
        approvalToken = randomBytes(12).toString("hex");
        const hours = Number(this.configService.get<number>("APP_APPROVAL_EXPIRES_HOURS") ?? 24 * 7);
        const expiresAt = new Date(Date.now() + Math.max(1, hours) * 3600 * 1000);
        try {
          await this.prisma.quote.update({
            where: { id: quote.id },
            data: { approvalToken, approvalRequestedAt: new Date(), approvalExpiresAt: expiresAt },
          });
        } catch (err) {
          this.logger.warn(`Falha ao persistir approvalToken para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
          approvalToken = undefined;
        }
      }

      if (approvalToken) {
        const base = this.configService.get<string>("APP_BASE_URL") ?? "http://localhost:3000";
        approvalLink = `${base.replace(/\/$/, "")}/api/quotes/${quote.id}/approve?token=${approvalToken}`;
      }
    }

    // Monta mensagem principal (pagamento)
    let paymentMsg = "";
    if (paymentOptions && pixPayment) {
      paymentMsg = this.buildPaymentMessage(clienteNome ?? "Cliente", numero, total, itens, pixPayment, paymentOptions, {
        pix5050Link: pix5050?.linkVisualizacao ?? undefined,
        pix5050Half: pix5050?.halfAmount ?? undefined,
        cardLink: cardLink ?? undefined,
      });
    } else if (paymentOptions) {
      // Fallback textual quando não for possível gerar links
      paymentMsg = `Olá, ${String(clienteNome ?? "Cliente").split(" ")[0]}! 👋\\n\\n📋 *Orçamento #${numero}*\\n\\n💰 *Total: R$ ${total.toFixed(2)}*\\n\\n${paymentOptions.customerMessage}\\n\\nQualquer dúvida, é só chamar! 😊`;
    } else {
      paymentMsg = `Olá, ${String(clienteNome ?? "Cliente").split(" ")[0]}! 👋\\n\\n📋 *Orçamento #${numero}*\\n\\n💰 *Total: R$ ${total.toFixed(2)}*\\n\\nQualquer dúvida, é só chamar! 😊`;
    }

    // Observacao sobre orcamento associado (se identificado)
    let observacao = "";
    const note = String(quote.notes ?? "");
    if (note.includes("__associated__")) {
      // Tentar obter nome mais preciso do cliente a partir do Athos (cliente_juridico / cliente_fisico)
      let associatedName = clienteNome;
      try {
        if (clienteId) {
          const clientInfo = await this.athosService.buscarClientePorId(clienteId);
          if (clientInfo && clientInfo.name) associatedName = clientInfo.name;
        }
      } catch (err) {
        this.logger.debug(`buscarClientePorId falhou para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
      }

      observacao = `*Observação:* identificamos que este orçamento está associado a "${associatedName ?? ""}".\n\n`;
    }

    // Compor mensagem final: observacao + paymentMsg + opcional link de aprovacao
    let finalMessage = observacao + paymentMsg;
    if (approvalLink) {
      finalMessage += `\\n\\nSe estiver de acordo, aprove o orçamento aqui:\\n${approvalLink}`;
    }

    // Envia a mensagem ao Chatwoot (não bloquear se falhar)
    try {
      const convId = quote.conversationId ? String(quote.conversationId) : undefined;
      if (convId) {
        await this.chatwootService.sendOutgoingMessage(convId, finalMessage);

        // Tentar anexar o PDF: usar documento salvo ou gerar um novo se necessário
        try {
          let latestDocument = await this.prisma.quoteDocument.findFirst({ where: { quoteId: quote.id }, orderBy: { generatedAt: "desc" } });

          let fileBuffer: Buffer | null = null;
          let fileName = latestDocument?.fileName ?? `Orcamento-${quote.internalNumber}.pdf`;
          let contentType = latestDocument?.contentType ?? "application/pdf";

          if (latestDocument && latestDocument.storagePath) {
            try {
              fileBuffer = await this.quotesPdfStorageService.downloadObjectBuffer(latestDocument.storagePath);
            } catch (err) {
              this.logger.warn(`Falha ao baixar PDF do storage para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
              fileBuffer = null;
            }
          }

          if (!fileBuffer) {
            try {
              // Gerar PDF a partir do formato interno esperado pelo gerador
              const stored = await this.quotesPdfStorageService.generateAndStore(this.mapQuoteBody(quote).body);

              try {
                await this.prisma.quoteDocument.create({
                  data: {
                    quoteId: quote.id,
                    fileName: stored.fileName,
                    contentType: stored.contentType,
                    storagePath: stored.objectName,
                    publicUrl: stored.publicUrl,
                    generatedBy: "enviar",
                  },
                });
              } catch (err) {
                this.logger.debug(`Falha ao persistir QuoteDocument apos gerar PDF para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
              }

              fileBuffer = await this.quotesPdfStorageService.downloadObjectBuffer(stored.objectName);
              fileName = stored.fileName;
              contentType = stored.contentType;
            } catch (err) {
              this.logger.warn(`Falha ao gerar PDF para anexo no enviarParaCliente ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          if (fileBuffer) {
            try {
              await this.chatwootService.sendAttachment(convId, fileBuffer, fileName, contentType);
            } catch (err) {
              this.logger.warn(`Falha ao enviar anexo PDF ao Chatwoot para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } catch (err) {
          this.logger.debug(`Erro no fluxo de anexo de PDF para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (quote.conversationId) {
        await this.chatwootService.sendOutgoingMessage(String(quote.conversationId), finalMessage);
      }
    } catch (err) {
      this.logger.warn(`Falha ao enviar mensagem ao Chatwoot para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { message: "Mensagem enviada (ou tentativa realizada).", approvalLink: approvalLink ?? null };
  }

  async approveByToken(identifier: string, token: string) {
    const quote = await this.findQuoteByIdentifier(identifier);
    if (!quote) throw new NotFoundException("Orcamento nao encontrado");

    // Valida token usando campos dedicados
    if (!quote.approvalToken) throw new BadRequestException("Token de aprovacao nao encontrado");
    if (quote.approvalToken !== token) throw new BadRequestException("Token de aprovacao invalido");
    if (quote.approvalExpiresAt && new Date(quote.approvalExpiresAt) < new Date()) throw new BadRequestException("Token expirado");

    // Atualiza status para EM_PRODUCAO e marca aprovado
    const nextStatus = "EM_PRODUCAO" as QuoteStatus;

    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: nextStatus,
        approved: true,
        approvedAt: new Date(),
        approvalToken: null,
        updatedAt: new Date(),
        // registra historico
        statusHistory: { create: { oldStatus: quote.status, newStatus: nextStatus, changedByName: "Aprovacao pelo cliente" } },
      },
      include: { customer: true },
    });

    // Notifica via Chatwoot (inclui nome completo do cliente e número correto do orçamento)
    try {
      const convId = quote.conversationId ? String(quote.conversationId) : undefined;
      if (convId) {
        // Tentativa de resolver nome do cliente: preferir nome persistido no cliente, senão buscar no Athos
        let clienteNome = (updated as any)?.customer?.fullName ?? (quote as any).customer?.fullName ?? undefined;

        // Obter mapeamento para número do orçamento e dados auxiliares
        const mapped = this.mapQuoteToAthosMapped(quote);
        // Preferir externalQuoteId (número visível), depois mapped.numero, depois internalNumber
        const numero = quote.externalQuoteId ?? mapped?.numero ?? quote.internalNumber ?? "";

        // Se ainda não tivermos nome, tentar obter a partir do mapeamento Athos ou buscar por idcliente
        if (!clienteNome) {
          if (mapped && mapped.cliente) clienteNome = mapped.cliente;

          // tentar descobrir idcliente e buscar nome
                let clienteIdForLookup: any = null;
          if (!clienteIdForLookup) {
            // tentar extrair do mapped (caso venha de uma consulta anterior)
            try {
              const lookupId = String(quote.externalQuoteId ?? quote.internalNumber ?? "");
              const athosData = await this.athosService.buscarOrcamentoPorNumero(lookupId);
              const athosMapped = (athosData as any)?.mapped ?? null;
              clienteIdForLookup = clienteIdForLookup ?? athosMapped?.idcliente ?? athosMapped?.clienteid ?? null;
              if (!clienteNome && athosMapped) clienteNome = athosMapped?.cliente_juridico ?? athosMapped?.cliente_fisico ?? athosMapped?.cliente ?? clienteNome;
            } catch (err) {
              this.logger.debug(`Consulta Athos falhou durante resolucao de nome apos aprovacao: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          if (!clienteNome && clienteIdForLookup) {
            try {
              const clientInfo = await this.athosService.buscarClientePorId(clienteIdForLookup);
              if (clientInfo && clientInfo.name) clienteNome = clientInfo.name;
            } catch (err) {
              this.logger.debug(`buscarClientePorId falhou apos aprovacao para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

        // Obter data prevista de entrega a partir do mapeamento (se disponível)
        let entregaTexto = "";
        const prazoRaw = mapped?.prazoEntrega ?? mapped?.validade ?? mapped?.data ?? null;
        if (prazoRaw) {
          let prazoFmt = String(prazoRaw);
          try {
            const parsed = new Date(prazoRaw);
            if (!isNaN(parsed.getTime())) prazoFmt = parsed.toLocaleDateString("pt-BR");
          } catch (e) {}
          entregaTexto = `\n\n📅 Previsão de entrega: ${prazoFmt} (conforme consta no orçamento)`;
        }

        const mensagem = `Olá, ${clienteNome ?? "Cliente"}! 👋\n\nAgradecemos pela parceria. Vamos dar sequência ao seu pedido: agendaremos a execução do serviço ou separaremos o(s) produto(s) e avisaremos assim que estiver pronto.${entregaTexto}\n\n📋 Orçamento #${numero}\n\n💰 Total: ${fmt(Number(quote.total ?? 0))}\n\nSe tiver alguma dúvida, responda por esta conversa — estamos à disposição.`;
        await this.chatwootService.sendOutgoingMessage(convId, mensagem);
      }
    } catch (err) {
      this.logger.warn(`Falha ao notificar via Chatwoot apos aprovacao: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { approved: true, quoteId: quote.id, status: updated.status };
  }

  async approveByConversation(conversationId: string, token: string) {
    const convBig = this.toBigInt(Number(conversationId));
    if (!convBig) throw new BadRequestException("conversationId invalido");

    const quote = await this.prisma.quote.findFirst({ where: { conversationId: convBig } });
    if (!quote) throw new NotFoundException("Orcamento para essa conversa nao encontrado");

    return this.approveByToken(quote.id, token);
  }

  // Converte um registro de Quote (do banco) para o formato semelhante ao 'mapped' retornado pelo AthosService
  private mapQuoteToAthosMapped(quote: any) {
    const mappedBody = this.mapQuoteBody(quote).body;

    const rawItems = Array.isArray(mappedBody.itens) ? mappedBody.itens : [];

    const itensDetalhados = rawItems.map((it: any) => {
      const produto = it?.produto ?? {};
      const descricao = it?.descricao ?? produto?.descricaoproduto ?? produto?.descricaocurta ?? "";
      const quantidade = Number(it?.quantidadeitem ?? it?.quantidade ?? 0);
      const valor = Number(it?.valoritem ?? it?.valor ?? 0);
      const desconto = Number(it?.valordesconto ?? it?.desconto ?? 0);
      const total = Number(it?.orcamentovalorfinalitem ?? it?.total ?? (quantidade * valor - desconto));

      return {
        ...it,
        descricao,
        produto,
        quantidade,
        valor,
        desconto,
        total,
        itemRaw: it,
      };
    });

    const itens = itensDetalhados.map((it: any) => ({
      descricao: it.descricao,
      quantidade: it.quantidade,
      valor: it.valor,
      desconto: it.desconto,
      total: it.total,
    }));

    const carimbosItens = Array.isArray(mappedBody.carimbos?.itens) ? mappedBody.carimbos.itens : [];

    return {
      numero: mappedBody.idorcamento ?? String(mappedBody.idorcamento_interno ?? ""),
      data: mappedBody.dataorcamento,
      cliente: mappedBody.cliente?.nome ?? "",
      telefone: mappedBody.cliente?.telefone ?? "",
      email: mappedBody.cliente?.email ?? "",
      vendedor: mappedBody.vendedorNome ?? undefined,
      numeroVenda: mappedBody.idvenda ?? undefined,
      validade: mappedBody.validade ?? undefined,
      prazoEntrega: mappedBody.prazoEntrega ?? undefined,
      condPagamento: mappedBody.condicaoPagamento ?? undefined,
      observacoes: mappedBody.observacoes ?? undefined,
      itens,
      itensDetalhados,
      carimbos: carimbosItens.map((c: any) => ({ numero: c.numero, carimbo: c.carimbo, dimensoes: c.dimensions ?? c.dimensoes, descricao: c.description ?? c.descricao })),
      carimbosDetalhados: carimbosItens.map((c: any) => ({ ...c, carimboRaw: null })),
  funcionario: mappedBody.vendedorNome ?? null,
      athosRaw: null,
    };
  }
}
