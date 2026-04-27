import { BadRequestException, Injectable, InternalServerErrorException, Logger, Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QuoteStatus } from "@prisma/client";
import axios, { AxiosInstance } from "axios";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";

import { PrismaService } from "../../database/prisma.service";
import { QuotesService } from "../../quotes/quotes.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";

@Injectable()
export class EfiService {
  private readonly logger = new Logger(EfiService.name);
  private tokenCache: { accessToken: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => QuotesService))
    private readonly quotesService: QuotesService,
    private readonly chatwootService: ChatwootService,
  ) {}

  private toMoney(value: unknown): number {
    const parsed = Number(String(value ?? "0").replace(",", "."));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
  }

  private extractWebhookPayments(payload: unknown): Array<{
    txid: string;
    amount: number;
    externalId: string;
    raw: unknown;
  }> {
    if (!payload || typeof payload !== "object") return [];

    const data = payload as Record<string, any>;

    // Formato oficial comum do webhook Pix: { pix: [{ txid, endToEndId, valor, ... }] }
    if (Array.isArray(data.pix)) {
      return data.pix
        .map((item: any) => ({
          txid: String(item?.txid ?? "").trim(),
          amount: this.toMoney(item?.valor),
          externalId: String(item?.endToEndId ?? item?.e2eId ?? "").trim(),
          raw: item,
        }))
        .filter((p) => p.txid && p.amount > 0 && p.externalId);
    }

    // Fallback simples para payload único
    const txid = String(data.txid ?? "").trim();
    const externalId = String(data.endToEndId ?? data.e2eId ?? data.eventId ?? "").trim();
    const amount = this.toMoney(data.valor ?? data.amount);
    if (txid && externalId && amount > 0) {
      return [{ txid, externalId, amount, raw: data }];
    }

    return [];
  }

  private resolveNextQuoteStatus(current: QuoteStatus, fullyPaid: boolean): QuoteStatus {
    if (fullyPaid) {
      if (["PENDENTE", "ENVIADO", "PAGAMENTO_PARCIAL"].includes(current)) return "APROVADO" as QuoteStatus;
      return current as QuoteStatus;
    }

    if (["PENDENTE", "ENVIADO"].includes(current)) return "PAGAMENTO_PARCIAL" as QuoteStatus;
    return current as QuoteStatus;
  }

  /**
   * Carrega um PEM a partir de três fontes em ordem de prioridade:
   *   1. Texto PEM direto na variável (ex: EFI_CERT_PEM) — suporta \n literal
   *   2. Base64 do arquivo PEM (ex: EFI_CERT_BASE64)
   *   3. Caminho de arquivo no disco (ex: EFI_CERT_PATH)
   */
  private loadPem(pemEnv: string, base64Env: string, pathEnv: string, label: string): string | null {
    // 1. Texto PEM direto (\n literal vira quebra de linha real)
    const pemText = this.config.get<string>(pemEnv);
    if (pemText && pemText.trim().length > 0) {
      return pemText.replace(/\\n/g, "\n");
    }

    // 2. Base64
    const base64 = this.config.get<string>(base64Env);
    if (base64 && base64.trim().length > 0) {
      return Buffer.from(base64.trim(), "base64").toString("utf8");
    }

    // 3. Arquivo
    const filePath = this.config.get<string>(pathEnv);
    if (filePath && filePath.trim().length > 0) {
      const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);
      if (fs.existsSync(resolved)) {
        return fs.readFileSync(resolved, "utf8");
      }
      this.logger.warn(`${label} não encontrado em: ${resolved}`);
    }

    return null;
  }

  /**
   * Retorna o par cert+key PEM para uso no httpsAgent (mTLS com a EFI).
   * Prioridade por campo:
   *   cert: EFI_CERT_PEM > EFI_CERT_BASE64 > EFI_CERT_PATH
   *   key:  EFI_KEY_PEM  > EFI_KEY_BASE64  > EFI_KEY_PATH
   */
  loadPemCredentials(): { cert: string; key: string } | null {
    const cert = this.loadPem("EFI_CERT_PEM", "EFI_CERT_BASE64", "EFI_CERT_PATH", "Certificado EFI");
    const key  = this.loadPem("EFI_KEY_PEM",  "EFI_KEY_BASE64",  "EFI_KEY_PATH",  "Chave privada EFI");

    if (!cert || !key) {
      if (!cert) this.logger.warn("Certificado EFI (cert) não configurado.");
      if (!key)  this.logger.warn("Chave privada EFI (key) não configurada.");
      return null;
    }

    return { cert, key };
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new BadRequestException(`Variavel ${key} nao configurada para integrar com EFI.`);
    }
    return value;
  }

  private getHttpClient(): AxiosInstance {
    const credentials = this.loadPemCredentials();
    if (!credentials) {
      throw new BadRequestException("Certificado e chave da EFI nao configurados (EFI_CERT_* e EFI_KEY_*). ");
    }

    const httpsAgent = new https.Agent({
      cert: credentials.cert,
      key: credentials.key,
      rejectUnauthorized: true,
    });

    return axios.create({
      baseURL: this.getRequiredConfig("EFI_BASE_URL"),
      httpsAgent,
      timeout: 15_000,
    });
  }

  private async getAccessToken(client: AxiosInstance): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && now < this.tokenCache.expiresAt) {
      return this.tokenCache.accessToken;
    }

    const clientId = this.getRequiredConfig("EFI_CLIENT_ID");
    const clientSecret = this.getRequiredConfig("EFI_CLIENT_SECRET");
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    try {
      const response = await client.post(
        "/oauth/token",
        "grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const accessToken = response.data?.access_token as string | undefined;
      const expiresIn = Number(response.data?.expires_in ?? 3600);
      if (!accessToken) {
        throw new Error("Resposta da EFI sem access_token.");
      }

      this.tokenCache = {
        accessToken,
        expiresAt: now + Math.max((expiresIn - 60) * 1000, 30_000),
      };

      return accessToken;
    } catch (error: any) {
      const status = error?.response?.status;
      const detail = error?.response?.data ?? error?.message;
      this.logger.error(`Falha ao obter token OAuth EFI. status=${status ?? "n/a"} detalhe=${JSON.stringify(detail)}`);
      throw new InternalServerErrorException("Nao foi possivel autenticar na EFI para gerar o link de pagamento.");
    }
  }

  private buildTxid(quoteIdentifier: string): string {
    const normalized = quoteIdentifier.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
    const ts = Date.now().toString(36); // ~8 chars
    const rand = Math.random().toString(36).slice(2, 9); // 7 chars
    const raw = `orc${normalized}${ts}${rand}`;
    return raw.slice(0, 35).padEnd(26, "0");
  }

  async createPixPaymentLink(input: {
    quoteIdentifier: string;
    amount: number;
    customerName?: string | null;
    payerMessage?: string | null;
    customerDocument?: string | null;
  }) {
    const originalAmount = Number(input.amount);
    if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
      throw new BadRequestException("Valor invalido para gerar cobranca PIX.");
    }

    const pixOption = this.resolvePaymentOptions(originalAmount).options.find((o) => o.code === "PIX_AVISTA");
    const finalAmount = Number((pixOption?.finalAmount ?? originalAmount).toFixed(2));
    const discountAmount = Number((originalAmount - finalAmount).toFixed(2));

    const client = this.getHttpClient();
    const token = await this.getAccessToken(client);
    const pixKey = this.getRequiredConfig("EFI_PIX_KEY");
    const txid = this.buildTxid(input.quoteIdentifier);

    const devedorBase = (input as any).customerDocument
      ? (String((input as any).customerDocument).replace(/\D/g, "").length === 14
        ? { cnpj: String((input as any).customerDocument).replace(/\D/g, ""), nome: (input.customerName ?? "").slice(0, 200) }
        : { cpf: String((input as any).customerDocument).replace(/\D/g, "").slice(0, 11), nome: (input.customerName ?? "").slice(0, 200) })
      : undefined;

    const body: Record<string, unknown> = {
      calendario: { expiracao: 3600 },
      valor: { original: finalAmount.toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: (input.payerMessage ?? `Pagamento do orçamento ${input.quoteIdentifier}`).slice(0, 140),
    };
    // Tenta incluir notification_url/metadata para que a EFI envie webhook específico por cobrança
    try {
      const webhookUrl = this.getWebhookUrl();
      (body as any).metadata = {
        notification_url: webhookUrl,
        custom_id: `orc-${String(input.quoteIdentifier).slice(0, 40)}`,
      };
    } catch (e) {
      // Não falhar caso a configuração não exista
    }
    if (devedorBase) body.devedor = devedorBase;

    try {
      const chargeResponse = await client.put(`/v2/cob/${txid}`, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const locId = chargeResponse.data?.loc?.id as number | undefined;
      let linkVisualizacao: string | null = chargeResponse.data?.loc?.location ?? null;
      let pixCopiaECola: string | null = null;

      if (locId) {
        const qrResponse = await client.get(`/v2/loc/${locId}/qrcode`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        linkVisualizacao = qrResponse.data?.linkVisualizacao ?? linkVisualizacao;
        pixCopiaECola = qrResponse.data?.qrcode ?? null;
      }

      if (!linkVisualizacao) {
        throw new Error("Resposta da EFI sem linkVisualizacao.");
      }

      return {
        txid,
        amount: finalAmount,
        originalAmount: Number(originalAmount.toFixed(2)),
        discountAmount,
        locId: locId ?? null,
        linkVisualizacao,
        pixCopiaECola,
      };
    } catch (error: any) {
      const status = error?.response?.status;
      const detail = error?.response?.data ?? error?.message;
      this.logger.error(`Falha ao criar cobranca PIX na EFI. status=${status ?? "n/a"} detalhe=${JSON.stringify(detail)}`);
      throw new InternalServerErrorException("Nao foi possivel gerar o link de pagamento PIX na EFI.");
    }
  }

  /** @deprecated use loadPemCredentials() */
  loadCertBuffer(): Buffer | null {
    const pem = this.loadPem("EFI_CERT_PEM", "EFI_CERT_BASE64", "EFI_CERT_PATH", "Certificado EFI");
    return pem ? Buffer.from(pem, "utf8") : null;
  }

  /**
   * Gera um link de pagamento via API Cobranças EFI (cartão de crédito parcelado).
   * Usa Basic Auth sem mTLS — endpoint: POST /v1/charge/one-step/link
   */
  async createCardPaymentLink(input: {
    quoteIdentifier: string;
    amount: number;
  }): Promise<{ paymentUrl: string; chargeId: number }> {
    const baseUrl = this.config.get<string>("EFI_COBRANCA_BASE_URL") ?? "https://cobrancas-h.api.efipay.com.br";
    const clientId = this.getRequiredConfig("EFI_CLIENT_ID");
    const clientSecret = this.getRequiredConfig("EFI_CLIENT_SECRET");
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const cobrancaClient = axios.create({ baseURL: baseUrl, timeout: 15_000 });

    // Obtém token da API Cobranças (Basic Auth, sem mTLS)
    let token: string;
    try {
      const authResp = await cobrancaClient.post(
        "/v1/authorize",
        { grant_type: "client_credentials" },
        { headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" } },
      );
      token = authResp.data?.access_token;
      if (!token) throw new Error("Token não retornado");
    } catch (e: any) {
      const detail = e?.response?.data ?? e?.message;
      this.logger.error(`Falha ao autenticar na API Cobranças EFI. ${JSON.stringify(detail)}`);
      throw new InternalServerErrorException("Não foi possível autenticar na API Cobranças EFI.");
    }

    // Valor em centavos (inteiro)
    const valorCentavos = Math.round(Number(input.amount.toFixed(2)) * 100);
    const expireAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const resp = await cobrancaClient.post(
        "/v1/charge/one-step/link",
        {
          items: [
            {
              name: `Orçamento #${input.quoteIdentifier}`.slice(0, 255),
              value: valorCentavos,
              amount: 1,
            },
          ],
          settings: {
            payment_method: "credit_card",
            expire_at: expireAt,
            request_delivery_address: false,
          },
          metadata: {
            custom_id: `orc-${String(input.quoteIdentifier).slice(0, 40)}`,
            notification_url: this.getWebhookUrl(),
          },
        },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
      );

      const paymentUrl: string = resp.data?.data?.payment_url;
      const chargeId: number = resp.data?.data?.charge_id;
      if (!paymentUrl) throw new Error("payment_url não retornado pela EFI");
      return { paymentUrl, chargeId };
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data ?? e?.message;
      this.logger.error(`Falha ao criar link de pagamento (cartão) na EFI. status=${status} detalhe=${JSON.stringify(detail)}`);
      throw new InternalServerErrorException("Não foi possível gerar o link de pagamento com cartão na EFI.");
    }
  }

  /**
   * Gera um link PIX para 50% do valor (usado no parcelamento 50% entrada + 50% na loja).
   */
  async createPix5050Link(input: {
    quoteIdentifier: string;
    totalAmount: number;
    customerName?: string | null;
  }): Promise<{ linkVisualizacao: string; txid: string; halfAmount: number }> {
    const halfAmount = Number((input.totalAmount / 2).toFixed(2));
    const result = await this.createPixPaymentLink({
      quoteIdentifier: `${input.quoteIdentifier}E`,
      amount: halfAmount,
      customerName: input.customerName,
      payerMessage: `Entrada 50% - Orçamento #${input.quoteIdentifier}`,
    });
    return { linkVisualizacao: result.linkVisualizacao, txid: result.txid, halfAmount };
  }

  resolvePaymentOptions(amount: number) {
    const value = Number.isFinite(amount) ? amount : 0;

    const pixDiscountPercent = value > 150 ? 5 : 0;
    const pixFinalAmount = Number((value * (1 - pixDiscountPercent / 100)).toFixed(2));

    const options = [
      {
        code: "PIX_AVISTA",
        label: "PIX à vista",
        enabled: true,
        discountPercent: pixDiscountPercent,
        finalAmount: pixFinalAmount,
      },
      {
        code: "CARTAO_2X",
        label: "Cartão de crédito em até 2x",
        enabled: value >= 150,
        discountPercent: 0,
        finalAmount: Number(value.toFixed(2)),
      },
      {
        code: "ENTRADA_50_LOJA_50",
        label: "50% entrada + 50% na loja",
        enabled: value > 100,
        discountPercent: 0,
        firstInstallmentAmount: Number((value * 0.5).toFixed(2)),
        secondInstallmentAmount: Number((value * 0.5).toFixed(2)),
      },
    ];

    return {
      amount: Number(value.toFixed(2)),
      currency: "BRL",
      rules: {
        pixOnlyUpTo100: value <= 100,
        pixOr5050Between100And150: value > 100 && value < 150,
        pixCard2xOr5050From150: value >= 150,
      },
      options,
      customerMessage: this.buildCommercialMessage(value),
    };
  }

  buildCommercialMessage(amount: number) {
    if (amount > 150) {
      return "Para valores acima de R$ 150,00 você pode parcelar em até 2x no cartão. No PIX à vista, você recebe 5% de desconto.";
    }

    if (amount > 100) {
      return "Para valores acima de R$ 100,00, você pode pagar com 50% de entrada e 50% na loja.";
    }

    return "Para valores até R$ 100,00, o pagamento é via PIX.";
  }

  getIntegrationStatus() {
    const clientId = this.config.get<string>("EFI_CLIENT_ID");
    const clientSecret = this.config.get<string>("EFI_CLIENT_SECRET");
    const pixKey = this.config.get<string>("EFI_PIX_KEY");
    const baseUrl = this.config.get<string>("EFI_BASE_URL");
    const certSource = this.config.get<string>("EFI_CERT_PEM")
      ? "texto PEM (env)"
      : this.config.get<string>("EFI_CERT_BASE64")
        ? "base64 (env)"
        : this.config.get<string>("EFI_CERT_PATH")
          ? "arquivo (EFI_CERT_PATH)"
          : null;
    const keySource = this.config.get<string>("EFI_KEY_PEM")
      ? "texto PEM (env)"
      : this.config.get<string>("EFI_KEY_BASE64")
        ? "base64 (env)"
        : this.config.get<string>("EFI_KEY_PATH")
          ? "arquivo (EFI_KEY_PATH)"
          : null;
    const pemCredentials = this.loadPemCredentials();

    return {
      enabled: Boolean(clientId && clientSecret && pixKey && baseUrl),
      baseUrl: baseUrl ?? null,
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      hasPixKey: Boolean(pixKey),
      hasCert: pemCredentials !== null,
      certSource,
      keySource,
      message:
        clientId && clientSecret && pixKey && baseUrl
          ? "Integração EFI configurada para implementação da cobrança."
          : "Configure EFI_CLIENT_ID, EFI_CLIENT_SECRET, EFI_PIX_KEY e EFI_BASE_URL para ativar a integração EFI.",
    };
  }

  private getWebhookUrl(): string {
    const base = this.config.get<string>("BACKEND_URL") ?? this.config.get<string>("APP_BASE_URL") ?? "http://localhost:4000/api";
    const baseNoTrailing = base.replace(/\/$/, "");
    return `${baseNoTrailing}/integrations/efi/webhook/payment`;
  }

  async processWebhook(payload: unknown, signature?: string) {
    const payments = this.extractWebhookPayments(payload);

    if (payments.length === 0) {
      this.logger.warn(`Webhook EFI sem pagamentos reconhecidos. payload=${JSON.stringify(payload)}`);
      return {
        received: true,
        validated: Boolean(signature),
        signature: signature ?? null,
        processed: 0,
        ignored: true,
        reason: "payload_sem_pagamentos_reconhecidos",
      };
    }

    const results: Array<Record<string, unknown>> = [];

    for (const payment of payments) {
      const eventId = payment.externalId;

      // Idempotência por eventId
      const existing = await (this.prisma as any).paymentTransaction.findFirst({
        where: {
          OR: [
            { eventId },
            { externalId: payment.externalId },
          ],
        },
      });

      if (existing) {
        results.push({
          txid: payment.txid,
          eventId,
          status: "ignored_duplicate",
          paymentTransactionId: existing.id,
        });
        continue;
      }

      const quote = await this.prisma.quote.findFirst({
        where: ({
          OR: [
            { paymentExternalId: payment.txid },
            { secondInstallmentExternalId: payment.txid },
          ],
        } as any),
      });

      if (!quote) {
        this.logger.warn(`Webhook EFI sem quote vinculada para txid=${payment.txid}`);
        results.push({ txid: payment.txid, eventId, status: "quote_not_found" });
        continue;
      }

      const quoteTotal = this.toMoney((quote as any).total);
      const currentPaid = this.toMoney((quote as any).paidTotal);
      const nextPaid = Number(Math.min(quoteTotal, currentPaid + payment.amount).toFixed(2));
      const pending = Number(Math.max(quoteTotal - nextPaid, 0).toFixed(2));
      const fullyPaid = pending <= 0;
      const nextStatus = this.resolveNextQuoteStatus(quote.status, fullyPaid);

      const updated = await this.prisma.$transaction(async (tx) => {
        const transaction = await (tx as any).paymentTransaction.create({
          data: {
            quoteId: quote.id,
            externalId: payment.externalId,
            eventId,
            source: "EFI",
            method: "PIX",
            status: fullyPaid ? "PAID" : "PARTIAL",
            amount: payment.amount.toFixed(2),
            metadata: {
              txid: payment.txid,
              signature: signature ?? null,
            },
            webhookPayload: payment.raw as any,
          },
        });

        const quoteUpdate = await (tx as any).quote.update({
          where: { id: quote.id },
          data: {
            paymentSource: "EFI",
            paymentMethod: "PIX",
            paymentEventId: eventId,
            paidTotal: nextPaid.toFixed(2),
            pendingTotal: pending.toFixed(2),
            paymentConfirmedAt: fullyPaid ? new Date() : (quote as any).paymentConfirmedAt,
            status: nextStatus,
            updatedAt: new Date(),
          },
        });

        if (nextStatus !== quote.status) {
          await (tx as any).quoteStatusHistory.create({
            data: {
              quoteId: quote.id,
              oldStatus: quote.status,
              newStatus: nextStatus,
              changedByName: "Webhook EFI",
            },
          });
        }

        return { transaction, quoteUpdate };
      });

      // Envio de mensagem automática ao cliente via Chatwoot com dados do orçamento
      try {
        const mapped = await this.quotesService.getById(quote.id);
        const body = mapped.body ?? ({} as any);
        const convId = (mapped.chatwootConversationUrl || body.conversationId)
          ? String(body.conversationId ?? (mapped.body as any)?.conversationId ?? (quote as any).conversationId)
          : (quote as any).conversationId?.toString?.();

        if (convId) {
          const clienteNome = (body.cliente as any)?.nome ?? (quote as any).customer?.fullName ?? "Cliente";
          const numero = (body as any).idorcamento ?? (body as any).idorcamento_interno ?? (quote as any).internalNumber ?? "-";
          const total = Number((body as any).totais?.valor ?? (quote as any).total ?? 0);
          const itensList = ((body as any).itens ?? []).slice(0, 10).map((it: any) => `• ${it.produto?.descricaoproduto ?? it.produto?.descricaocurta ?? "Item"} (${it.quantidadeitem}x) — ${Number(it.orcamentovalorfinalitem ?? it.orcamentovalorfinalitem ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
          const itensText = itensList.length > 0 ? itensList.join("\n") : "(sem itens listados)";
          const temArte = ((body as any).carimbos?.quantidade_total ?? (body as any).carimbos?.itens?.length ?? 0) > 0;
          const pdfUrl = (mapped as any).latestPdfUrl ?? (body as any).latestPdfUrl ?? ((body as any).documentoPdf ? (body as any).documentoPdf.publicUrl : null);
          const safePdfUrl = pdfUrl ? encodeURI(String(pdfUrl)) : null;

          const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          let mensagem = `Olá, ${String(clienteNome).split(" ")[0]}! 👋\n\n`;
          // Detecta se o pagamento recebido corresponde à metade do total (entrada 50%)
          const halfAmount = Number((Number(total) / 2).toFixed(2));
          const isHalf = Math.abs(payment.amount - halfAmount) < 0.01 || Number((quote as any).firstInstallmentAmount ?? 0) === payment.amount;

          if (fullyPaid) {
            mensagem += `Pagamento recebido com sucesso.`;
          } else {
            const remaining = Number(Math.max(Number(total) - Number(payment.amount), 0).toFixed(2));
            if (isHalf) {
              mensagem += `Recebemos a entrada de ${fmt(payment.amount)}. Restam ${fmt(remaining)} para pagar na loja.`;
            } else {
              mensagem += `Recebemos um pagamento parcial de ${fmt(payment.amount)}. Restam ${fmt(remaining)} para pagar.`;
            }
          }

          mensagem += `\n\n📋 Orçamento #${numero}`;
          mensagem += `\n${itensText}`;
          mensagem += `\n\n💰 Total: ${fmt(total)}`;
          mensagem += "\n\n";
          if (temArte) {
            mensagem += "Sua arte será enviada para aprovação. Assim que aprovada, daremos continuidade à produção.";
          } else if (isHalf) {
            mensagem += "Seu pedido será enviado para produção. O restante do pagamento deverá ser realizado na loja no momento da retirada.";
          } else if (fullyPaid) {
            mensagem += "Seu pedido será enviado para produção.";
          } else {
            mensagem += "Aguardaremos a confirmação do restante do pagamento para prosseguir.";
          }
          if (safePdfUrl) {
            mensagem += `\n\n📄 PDF: ${safePdfUrl}`;
          }
          mensagem += "\n\nPrecisa de CNPJ ou CPF na nota? Precisa de nota fiscal?";

          await this.chatwootService.sendOutgoingMessage(convId, mensagem);
        }
      } catch (err) {
        this.logger.warn(`Falha ao notificar cliente via Chatwoot após pagamento: ${err instanceof Error ? err.message : err}`);
      }

      results.push({
        txid: payment.txid,
        eventId,
        status: "processed",
        quoteId: quote.id,
        quoteStatus: updated.quoteUpdate.status,
        paidTotal: nextPaid,
        pendingTotal: pending,
        paymentTransactionId: updated.transaction.id,
      });
    }

    return {
      received: true,
      validated: Boolean(signature),
      signature: signature ?? null,
      processed: results.filter((r) => r.status === "processed").length,
      duplicates: results.filter((r) => r.status === "ignored_duplicate").length,
      notFound: results.filter((r) => r.status === "quote_not_found").length,
      results,
    };
  }
}
