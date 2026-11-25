import { BadRequestException, Injectable, InternalServerErrorException, Logger, Inject, forwardRef, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QuoteStatus } from "@prisma/client";
import axios, { AxiosInstance } from "axios";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";

import { PrismaService } from "../../database/prisma.service";
import { calcularPixAvista, calcularQuitacao } from "../../quotes/quote-payment.util";
import { QuotesService } from "../../quotes/quotes.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";
import { DadosComprovantePix, montarTextoComprovante, nomeArquivoComprovante } from "./pix-comprovante.util";
import { PixComprovanteService } from "./pix-comprovante.service";

@Injectable()
export class EfiService implements OnModuleInit {
  private readonly logger = new Logger(EfiService.name);
  private tokenCache: { accessToken: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => QuotesService))
    private readonly quotesService: QuotesService,
    private readonly chatwootService: ChatwootService,
    // Fase 54 (D-04): renderizador do comprovante de layout proprio; opcional para nao quebrar modulos de teste antigos.
    @Optional() private readonly pixComprovanteService?: PixComprovanteService,
  ) {}

  /** Prazo total do bloco do comprovante no webhook (T-54-10); propriedade de instancia para o teste reduzir. */
  private prazoComprovanteMs = 40_000;

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

    // Fallback simples para payload Ãºnico
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
   * Fase 51 (D-03): apos o commit do webhook, alinha as etiquetas da conversa do Chatwoot com o novo
   * status. Nunca lanca e nao bloqueia: sem conversationId nao faz nada; tolera QuotesService sem o
   * metodo (mock antigo); falha vira warn com so o id da cotacao e err.message (jamais token ou
   * objeto de erro do axios). Chamar SEMPRE depois do $transaction, nunca dentro dele.
   */
  private dispararEtiquetasChatwoot(quote: { id: string; conversationId?: unknown } | null | undefined): void {
    if (!quote?.conversationId) return;
    const registrar = (err: unknown) => {
      this.logger.warn(
        `Falha ao disparar etiquetas do Chatwoot quoteId=${quote.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    };
    try {
      if (typeof this.quotesService?.sincronizarEtiquetasChatwoot !== "function") return;
      Promise.resolve(this.quotesService.sincronizarEtiquetasChatwoot(quote.id)).catch(registrar);
    } catch (err) {
      registrar(err);
    }
  }

  /**
   * Carrega um PEM a partir de trÃªs fontes em ordem de prioridade:
   *   1. Texto PEM direto na variÃ¡vel (ex: EFI_CERT_PEM) â€” suporta \n literal
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
      this.logger.warn(`${label} nÃ£o encontrado em: ${resolved}`);
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
      if (!cert) this.logger.warn("Certificado EFI (cert) nÃ£o configurado.");
      if (!key)  this.logger.warn("Chave privada EFI (key) nÃ£o configurada.");
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
    /** Padrao verdadeiro. Falso no PIX 50/50: a entrada e metade do total sem desconto (D-02/D-13). */
    aplicarDescontoPix?: boolean;
  }) {
    const originalAmount = Number(input.amount);
    if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
      throw new BadRequestException("Valor invalido para gerar cobranca PIX.");
    }

    const aplicarDescontoPix = input.aplicarDescontoPix !== false;
    const pixOption = aplicarDescontoPix
      ? this.resolvePaymentOptions(originalAmount).options.find((o) => o.code === "PIX_AVISTA")
      : undefined;
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
      solicitacaoPagador: (input.payerMessage ?? `Pagamento do orÃ§amento ${input.quoteIdentifier}`).slice(0, 140),
    };
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
   * Gera um link de pagamento via API CobranÃ§as EFI (cartÃ£o de crÃ©dito parcelado).
   * Usa Basic Auth sem mTLS â€” endpoint: POST /v1/charge/one-step/link
   */
  async createCardPaymentLink(input: {
    quoteIdentifier: string;
    amount: number;
    customerName?: string | null;
    customerEmail?: string | null;
  }): Promise<{ paymentUrl: string; chargeId: number }> {
    const baseUrl = this.config.get<string>("EFI_COBRANCA_BASE_URL") ?? "https://cobrancas-h.api.efipay.com.br";
    const clientId = this.getRequiredConfig("EFI_CLIENT_ID");
    const clientSecret = this.getRequiredConfig("EFI_CLIENT_SECRET");
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const cobrancaClient = axios.create({ baseURL: baseUrl, timeout: 15_000 });

    // ObtÃ©m token da API CobranÃ§as (Basic Auth, sem mTLS)
    let token: string;
    try {
      const authResp = await cobrancaClient.post(
        "/v1/authorize",
        { grant_type: "client_credentials" },
        { headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" } },
      );
      token = authResp.data?.access_token;
      if (!token) throw new Error("Token nÃ£o retornado");
    } catch (e: any) {
      const detail = e?.response?.data ?? e?.message;
      this.logger.error(`Falha ao autenticar na API CobranÃ§as EFI. ${JSON.stringify(detail)}`);
      throw new InternalServerErrorException("NÃ£o foi possÃ­vel autenticar na API CobranÃ§as EFI.");
    }

    // Valor em centavos (inteiro)
    const valorCentavos = Math.round(Number(input.amount.toFixed(2)) * 100);
    const expireAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const webhookUrl = this.getCardWebhookUrl();
    const isPublicUrl = !/localhost|127\.0\.0\.1/.test(webhookUrl);

    const body: Record<string, unknown> = {
      items: [
        {
          name: `OrÃ§amento #${input.quoteIdentifier}`.slice(0, 255),
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
        ...(isPublicUrl ? { notification_url: webhookUrl } : {}),
      },
    };

    // customer.email Ã© obrigatÃ³rio pela API â€” incluir quando disponÃ­vel
    const email = input.customerEmail?.trim();
    if (email) {
      body.customer = {
        name: (input.customerName ?? "Cliente").slice(0, 80),
        email,
      };
    }

    try {
      const resp = await cobrancaClient.post(
        "/v1/charge/one-step/link",
        body,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
      );

      const paymentUrl: string = resp.data?.data?.payment_url;
      const chargeId: number = resp.data?.data?.charge_id;
      if (!paymentUrl) throw new Error("payment_url nÃ£o retornado pela EFI");
      return { paymentUrl, chargeId };
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data ?? e?.message;
      this.logger.error(`Falha ao criar link de pagamento (cartÃ£o) na EFI. status=${status} detalhe=${JSON.stringify(detail)}`);
      throw new InternalServerErrorException("NÃ£o foi possÃ­vel gerar o link de pagamento com cartÃ£o na EFI.");
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
      payerMessage: `Entrada 50% - OrÃ§amento #${input.quoteIdentifier}`,
      aplicarDescontoPix: false,
    });
    return { linkVisualizacao: result.linkVisualizacao, txid: result.txid, halfAmount };
  }

  resolvePaymentOptions(amount: number) {
    const value = Number.isFinite(amount) ? amount : 0;

    const { percentual: pixDiscountPercent, valorFinal: pixFinalAmount } = calcularPixAvista(value);

    const options = [
      {
        code: "PIX_AVISTA",
        label: "PIX Ã  vista",
        enabled: true,
        discountPercent: pixDiscountPercent,
        finalAmount: pixFinalAmount,
      },
      {
        code: "CARTAO_2X",
        label: "CartÃ£o de crÃ©dito em atÃ© 2x",
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
      return "Para valores acima de R$ 150,00 vocÃª pode parcelar em atÃ© 2x no cartÃ£o. No PIX Ã  vista, vocÃª recebe 5% de desconto.";
    }

    if (amount > 100) {
      return "Para valores acima de R$ 100,00, vocÃª pode pagar com 50% de entrada e 50% na loja.";
    }

    return "Para valores atÃ© R$ 100,00, o pagamento Ã© via PIX.";
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
          ? "IntegraÃ§Ã£o EFI configurada para implementaÃ§Ã£o da cobranÃ§a."
          : "Configure EFI_CLIENT_ID, EFI_CLIENT_SECRET, EFI_PIX_KEY e EFI_BASE_URL para ativar a integraÃ§Ã£o EFI.",
    };
  }

  private getPixWebhookUrl(): string {
    const base = this.config.get<string>("BACKEND_URL") ?? this.config.get<string>("APP_BASE_URL") ?? "http://localhost:4000/api";
    const baseNoTrailing = base.replace(/\/$/, "");
    return `${baseNoTrailing}/integrations/efi/webhook/payment/pix`;
  }

  private getCardWebhookUrl(): string {
    const base = this.config.get<string>("BACKEND_URL") ?? this.config.get<string>("APP_BASE_URL") ?? "http://localhost:4000/api";
    const baseNoTrailing = base.replace(/\/$/, "");
    return `${baseNoTrailing}/integrations/efi/webhook/payment/card`;
  }

  /**
   * Fase 54 (D-04): busca o comprovante oficial da EFI (GET /v2/gn/pix/comprovantes, escopo gn.receipts.read).
   * Nunca lanca: qualquer falha (escopo nao habilitado, 4xx/5xx, timeout, certificado ausente, corpo que nao
   * seja PNG/JPEG/PDF) devolve null e o chamador cai no comprovante de layout proprio.
   * O tipo devolvido e derivado dos primeiros bytes, nao do cabecalho da resposta.
   * Logs so com e2eId e status/mensagem curta (nunca token nem corpo da resposta, T-54-09).
   */
  async buscarComprovanteOficial(
    e2eId: string,
  ): Promise<{ buffer: Buffer; contentType: string; extensao: "png" | "jpg" | "pdf" } | null> {
    const id = String(e2eId ?? "").trim();
    if (!id) return null;

    try {
      const client = this.getHttpClient();
      const token = await this.getAccessToken(client);

      const response = await client.get("/v2/gn/pix/comprovantes", {
        params: { e2eId: id },
        responseType: "arraybuffer",
        timeout: 8000,
        headers: { Authorization: `Bearer ${token}` },
      });

      const data: unknown = response?.data;
      let buffer: Buffer | null = null;
      if (Buffer.isBuffer(data)) buffer = data;
      else if (data instanceof ArrayBuffer) buffer = Buffer.from(data);
      else if (ArrayBuffer.isView(data)) buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      if (!buffer || buffer.length < 4) {
        this.logger.warn(`Comprovante oficial EFI sem corpo binario valido e2eId=${id}`);
        return null;
      }

      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return { buffer, contentType: "image/png", extensao: "png" };
      }
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { buffer, contentType: "image/jpeg", extensao: "jpg" };
      }
      if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return { buffer, contentType: "application/pdf", extensao: "pdf" };
      }

      this.logger.warn(`Comprovante oficial EFI com formato inesperado e2eId=${id}`);
      return null;
    } catch (error: any) {
      const status = error?.response?.status;
      const motivo = status
        ? `status=${status}`
        : `erro=${String(error?.message ?? "desconhecido").slice(0, 120)}`;
      this.logger.warn(`Comprovante oficial EFI indisponivel e2eId=${id} ${motivo}`);
      return null;
    }
  }

  /**
   * Registra automaticamente a URL do webhook PIX na EFI (PUT /v2/webhook/{chave}).
   * Nunca lanca excecao — nao-bloqueante, o boot da aplicacao nao pode falhar por causa disto.
   */
  async registerPixWebhook(): Promise<{ registered: boolean; reason: string }> {
    const credentials = this.loadPemCredentials();
    if (!credentials) {
      return { registered: false, reason: "missing_credentials" };
    }

    const pixKey = this.config.get<string>("EFI_PIX_KEY")?.trim();
    if (!pixKey) {
      return { registered: false, reason: "missing_pix_key" };
    }

    const clientId = this.config.get<string>("EFI_CLIENT_ID")?.trim();
    const clientSecret = this.config.get<string>("EFI_CLIENT_SECRET")?.trim();
    if (!clientId || !clientSecret) {
      return { registered: false, reason: "missing_oauth_credentials" };
    }

    const webhookUrl = this.getPixWebhookUrl();
    const isPublicUrl = !/localhost|127\.0\.0\.1/.test(webhookUrl);
    if (!isPublicUrl) {
      return { registered: false, reason: "non_public_url" };
    }

    try {
      const client = this.getHttpClient();
      const token = await this.getAccessToken(client);

      await client.put(
        `/v2/webhook/${pixKey}`,
        { webhookUrl },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      this.logger.log(`Webhook PIX registrado automaticamente na EFI: ${webhookUrl}`);
      return { registered: true, reason: "ok" };
    } catch (error: any) {
      const status = error?.response?.status;
      const detail = error?.response?.data ?? error?.message;
      this.logger.error(`Falha ao registrar webhook PIX na EFI. status=${status ?? "n/a"} detalhe=${JSON.stringify(detail)}`);
      return { registered: false, reason: "efi_api_error" };
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.registerPixWebhook();
    } catch (error) {
      this.logger.error(`Falha inesperada ao registrar webhook PIX no boot: ${error instanceof Error ? error.message : String(error)}`);
    }
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

      // IdempotÃªncia por eventId
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

      // Fase 54 (D-01/D-02): o desconto de PIX a vista so vale no txid da cobranca a vista.
      const quoteTotal = this.toMoney((quote as any).total);
      const ehAvista = payment.txid === (quote as any).paymentExternalId;
      const descontoPix = ehAvista ? calcularPixAvista(quoteTotal).desconto : 0;
      const descontoConsiderado = ehAvista ? descontoPix : this.toMoney((quote as any).paymentDiscount);
      const quitacao = calcularQuitacao({
        total: quoteTotal,
        desconto: descontoConsiderado,
        pagoAntes: (quote as any).paidTotal,
        pagamento: payment.amount,
      });
      const nextPaid = quitacao.pago;
      const pending = quitacao.pendente;
      const fullyPaid = quitacao.quitado;
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
              desconto: descontoConsiderado,
              devido: quitacao.devido,
              horario: (payment.raw as any)?.horario ?? null,
              infoPagador: (payment.raw as any)?.infoPagador ?? null,
              pagador: (payment.raw as any)?.gnExtras?.pagador ?? null,
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
            // So no txid a vista com desconto: nunca zera nem sobrescreve em pagamento de outro txid (T-54-05).
            ...(ehAvista && descontoPix > 0
              ? { paymentDiscount: descontoPix.toFixed(2), paymentAmount: quitacao.devido.toFixed(2) }
              : {}),
            // Somente na quitacao: o util de pagamento classifica paymentConfirmedAt como pagamento integral.
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

      // Fase 51 (D-03): etiquetas da conversa, depois do commit e so quando o status mudou.
      if (nextStatus !== quote.status) this.dispararEtiquetasChatwoot(quote);

      // Numero do orcamento: declarado fora do try da mensagem para reutilizacao (comprovante, plano 54-04).
      let numeroOrcamento: unknown = null;
      let convIdComprovante: string | undefined;

      // Envio de mensagem automatica ao cliente via Chatwoot com dados do orcamento
      try {
        const mapped = await this.quotesService.getById(quote.id);
        const body = mapped.body ?? ({} as any);
        const convId = (mapped.chatwootConversationUrl || body.conversationId)
          ? String(body.conversationId ?? (mapped.body as any)?.conversationId ?? (quote as any).conversationId)
          : (quote as any).conversationId?.toString?.();

        if (convId) {
          convIdComprovante = String(convId);
          const clienteNome = (body.cliente as any)?.nome ?? (quote as any).customer?.fullName ?? "Cliente";
          const numero = (body as any).idorcamento ?? (body as any).idorcamento_interno ?? (quote as any).internalNumber ?? "-";
          numeroOrcamento = numero;
          const total = Number((body as any).totais?.valor ?? (quote as any).total ?? 0);
          const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const halfAmount = Number((Number(total) / 2).toFixed(2));
          const isHalf = Math.abs(payment.amount - halfAmount) < 0.01 || Number((quote as any).firstInstallmentAmount ?? 0) === payment.amount;

          let mensagem: string;
          if (fullyPaid && ehAvista && descontoPix > 0) {
            mensagem = `✅ Pagamento PIX recebido, ${clienteNome}!\n\nOrçamento #${numero}\nTotal do orçamento: ${fmt(total)}\nDesconto PIX à vista: ${fmt(descontoPix)}\nValor pago: ${fmt(nextPaid)}\n\nPagamento integral confirmado. Pedido confirmado! 😊`;
          } else if (fullyPaid) {
            mensagem = `✅ Pagamento PIX recebido, ${clienteNome}!\n\nOrçamento #${numero} — ${fmt(total)}\nComprovante gerado. Pedido confirmado! 😊`;
          } else {
            const remaining = pending;
            if (isHalf) {
              mensagem = `✅ ${clienteNome}, recebemos sua entrada PIX!\n\nOrçamento #${numero}\nEntrada: ${fmt(payment.amount)} — Restante: ${fmt(remaining)} a pagar na loja.\n\nSeu pedido entrará em produção em breve! 😊`;
            } else {
              mensagem = `⚠️ ${clienteNome}, recebemos um pagamento parcial PIX.\n\nOrçamento #${numero}\nPago: ${fmt(nextPaid)} de ${fmt(quitacao.devido)} — Restam: ${fmt(remaining)}.\n\nAguardamos o pagamento restante.`;
            }
          }

          await this.chatwootService.sendOutgoingMessage(convId, mensagem);
        }
      } catch (err) {
        this.logger.warn(`Falha ao notificar cliente via Chatwoot apos pagamento: ${err instanceof Error ? err.message : err}`);
      }

      // Fase 54 (D-04/D-05): comprovante como nota privada, depois do commit e da mensagem ao cliente.
      // Bloco independente: falha aqui nunca derruba o webhook (a EFI precisa receber 2xx para nao retentar).
      try {
        const convIdNota = convIdComprovante ?? (quote as any).conversationId?.toString?.();
        if (convIdNota) {
          await this.postarComprovantePix({
            quote,
            convId: String(convIdNota),
            payment,
            numeroOrcamento,
            totalOrcamento: quoteTotal,
            desconto: descontoPix,
            valorPago: payment.amount,
            totalPagoAcumulado: nextPaid,
            pendente: pending,
            quitado: fullyPaid,
          });
        }
      } catch (err) {
        this.logger.warn(`Falha no comprovante PIX quoteId=${quote.id} e2eId=${payment.externalId} ${this.erroCurto(err)}`);
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

  /** Mensagem de erro curta e segura para log (sem payload, token nem corpo de resposta). */
  private erroCurto(err: unknown): string {
    const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "erro desconhecido";
    return String(msg).replace(/\s+/g, " ").slice(0, 120);
  }

  /**
   * Fase 54 (D-04/D-05): posta o comprovante do PIX como nota PRIVADA na conversa do Chatwoot.
   * Nunca lanca e respeita o prazo total prazoComprovanteMs (T-54-10).
   */
  private async postarComprovantePix(ctx: {
    quote: any;
    convId: string;
    payment: { txid: string; externalId: string; amount: number; raw: unknown };
    numeroOrcamento: unknown;
    totalOrcamento: number;
    desconto: number;
    valorPago: number;
    totalPagoAcumulado: number;
    pendente: number;
    quitado: boolean;
  }): Promise<void> {
    const quoteId = String(ctx.quote?.id ?? "");
    const e2eId = ctx.payment.externalId;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const prazo = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("prazo do comprovante excedido")), this.prazoComprovanteMs);
      });
      await Promise.race([this.executarComprovantePix(ctx), prazo]);
    } catch (err) {
      this.logger.warn(`Falha no comprovante PIX quoteId=${quoteId} e2eId=${e2eId} ${this.erroCurto(err)}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async executarComprovantePix(ctx: {
    quote: any;
    convId: string;
    payment: { txid: string; externalId: string; amount: number; raw: unknown };
    numeroOrcamento: unknown;
    totalOrcamento: number;
    desconto: number;
    valorPago: number;
    totalPagoAcumulado: number;
    pendente: number;
    quitado: boolean;
  }): Promise<void> {
    const { quote, convId, payment } = ctx;
    const raw = (payment.raw ?? {}) as any;
    const pagador = raw?.gnExtras?.pagador ?? {};

    const numeroBruto = ctx.numeroOrcamento;
    const numero =
      numeroBruto !== null && numeroBruto !== undefined && String(numeroBruto).trim() !== "" && String(numeroBruto) !== "-"
        ? String(numeroBruto)
        : String(quote?.externalQuoteId ?? quote?.internalNumber ?? "");

    const dados: DadosComprovantePix = {
      numeroOrcamento: numero,
      valorPago: ctx.valorPago,
      desconto: ctx.desconto,
      totalOrcamento: ctx.totalOrcamento,
      totalPagoAcumulado: ctx.totalPagoAcumulado,
      pendente: ctx.pendente,
      quitado: ctx.quitado,
      e2eId: payment.externalId,
      txid: payment.txid,
      horario: typeof raw?.horario === "string" ? raw.horario : null,
      pagadorNome: typeof pagador?.nome === "string" ? pagador.nome : null,
      pagadorDocumento:
        typeof pagador?.cpf === "string" ? pagador.cpf : typeof pagador?.cnpj === "string" ? pagador.cnpj : null,
      infoPagador: typeof raw?.infoPagador === "string" ? raw.infoPagador : null,
    };
    const texto = montarTextoComprovante(dados);

    // 1) comprovante oficial da EFI; 2) layout proprio; 3) somente texto.
    let anexo: { buffer: Buffer; contentType: string; extensao: "png" | "jpg" | "pdf"; fonte: "oficial" | "proprio" } | null = null;
    try {
      const oficial = await this.buscarComprovanteOficial(payment.externalId);
      if (oficial) anexo = { ...oficial, fonte: "oficial" };
    } catch {
      anexo = null;
    }
    if (!anexo && typeof this.pixComprovanteService?.gerarPng === "function") {
      try {
        const png = await this.pixComprovanteService.gerarPng(dados);
        if (png && png.length > 0) anexo = { buffer: png, contentType: "image/png", extensao: "png", fonte: "proprio" };
      } catch (err) {
        this.logger.warn(`Comprovante PIX layout proprio indisponivel quoteId=${quote?.id} e2eId=${payment.externalId} ${this.erroCurto(err)}`);
      }
    }

    let fonte: "oficial" | "proprio" | "apenas-texto" = "apenas-texto";
    let enviado = false;
    if (anexo && typeof (this.chatwootService as any)?.sendAttachment === "function") {
      try {
        const resposta: any = await this.chatwootService.sendAttachment(
          convId,
          anexo.buffer,
          nomeArquivoComprovante(numero, payment.externalId, anexo.extensao),
          anexo.contentType,
          { private: true, content: texto },
        );
        // Chatwoot nao configurado devolve { enabled: false } sem lancar: tratar como falha para tentar a nota.
        enviado = resposta?.enabled !== false;
        if (enviado) fonte = anexo.fonte;
      } catch (err) {
        this.logger.warn(`Comprovante PIX anexo nao enviado quoteId=${quote?.id} e2eId=${payment.externalId} ${this.erroCurto(err)}`);
      }
    }

    if (!enviado) {
      if (typeof (this.chatwootService as any)?.postConversationNote !== "function") {
        throw new Error("postConversationNote indisponivel");
      }
      const resposta: any = await this.chatwootService.postConversationNote(convId, texto);
      if (resposta?.enabled === false) throw new Error("Chatwoot nao configurado");
      fonte = "apenas-texto";
    }

    this.logger.log(`Comprovante PIX postado quoteId=${quote?.id} e2eId=${payment.externalId} fonte=${fonte}`);
  }

  /**
   * Processa a notificacao de pagamento por cartao de credito (API Cobrancas EFI).
   * Segue o mesmo padrao de troca de token ja usado por CobrancaService.processarNotificacaoEFI():
   * a notificacao carrega apenas um token opaco, que precisa ser trocado por charge_id+status
   * via Basic Auth (sem mTLS). Nunca lanca excecao — o controller sempre retorna 200 para a EFI.
   */
  async processCardWebhook(token: string): Promise<void> {
    if (!token) {
      this.logger.warn("Webhook EFI (cartao) recebido sem token — ignorando.");
      return;
    }

    const baseUrl = this.config.get<string>("EFI_COBRANCA_BASE_URL") ?? "https://cobrancas-h.api.efipay.com.br";
    const clientId = this.getRequiredConfig("EFI_CLIENT_ID");
    const clientSecret = this.getRequiredConfig("EFI_CLIENT_SECRET");
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const cobrancaClient = axios.create({ baseURL: baseUrl, timeout: 15_000 });

    let efiToken: string;
    try {
      const authResp = await cobrancaClient.post(
        "/v1/authorize",
        { grant_type: "client_credentials" },
        { headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" } },
      );
      efiToken = authResp.data?.access_token as string;
      if (!efiToken) throw new Error("Token nao retornado");
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data ??
        (e as { message?: string })?.message;
      this.logger.error(`Webhook EFI (cartao): falha ao autenticar para consultar notificacao: ${JSON.stringify(detail)}`);
      return;
    }

    let chargeId: number;
    let status: string;
    try {
      const resp = await cobrancaClient.get(`/v1/notification/${token}`, {
        headers: { Authorization: `Bearer ${efiToken}` },
      });
      chargeId = resp.data?.data?.charge?.charge_id as number;
      status = resp.data?.data?.charge?.status as string;
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data ??
        (e as { message?: string })?.message;
      this.logger.error(`Webhook EFI (cartao): falha ao consultar notificacao token=${token}: ${JSON.stringify(detail)}`);
      return;
    }

    if (!chargeId) {
      this.logger.warn(`Webhook EFI (cartao): charge_id nao encontrado na notificacao token=${token}`);
      return;
    }

    const quote = await this.prisma.quote.findFirst({
      where: { cardChargeId: String(chargeId) },
    });

    if (!quote) {
      this.logger.warn(`Webhook EFI (cartao): Quote nao encontrada para chargeId=${chargeId}`);
      return;
    }

    if (status !== "paid") {
      this.logger.log(`Webhook EFI (cartao): notificacao recebida com status='${status}' para chargeId=${chargeId} — sem acao.`);
      return;
    }

    // Idempotencia (a): pagamento ja confirmado anteriormente
    if (quote.paymentConfirmedAt) {
      this.logger.log(`Webhook EFI (cartao): quote ${quote.id} ja possui paymentConfirmedAt — ignorando reenvio (idempotencia).`);
      return;
    }

    // Idempotencia (b): ja existe PaymentTransaction para este chargeId
    const existingTransaction = await this.prisma.paymentTransaction.findFirst({
      where: { externalId: String(chargeId) },
    });
    if (existingTransaction) {
      this.logger.log(`Webhook EFI (cartao): PaymentTransaction ja existe para chargeId=${chargeId} — ignorando reenvio (idempotencia).`);
      return;
    }

    const quoteTotal = this.toMoney(quote.total);
    const currentPaid = this.toMoney(quote.paidTotal);
    const paymentAmount = Math.max(quoteTotal - currentPaid, 0);
    const nextPaid = Number(Math.min(quoteTotal, currentPaid + paymentAmount).toFixed(2));
    const pending = Number(Math.max(quoteTotal - nextPaid, 0).toFixed(2));
    const fullyPaid = pending <= 0;
    const nextStatus = this.resolveNextQuoteStatus(quote.status, fullyPaid);

    const updated = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.create({
        data: {
          quoteId: quote.id,
          externalId: String(chargeId),
          eventId: `card-${chargeId}`,
          source: "EFI",
          method: "CARD",
          status: fullyPaid ? "PAID" : "PARTIAL",
          amount: paymentAmount.toFixed(2),
          metadata: { chargeId, token },
          webhookPayload: { chargeId, status } as any,
        },
      });

      const quoteUpdate = await tx.quote.update({
        where: { id: quote.id },
        data: {
          paymentSource: "EFI",
          paymentMethod: "CARD",
          paidTotal: nextPaid.toFixed(2),
          pendingTotal: pending.toFixed(2),
          paymentConfirmedAt: fullyPaid ? new Date() : quote.paymentConfirmedAt,
          status: nextStatus,
          updatedAt: new Date(),
        },
      });

      if (nextStatus !== quote.status) {
        await tx.quoteStatusHistory.create({
          data: {
            quoteId: quote.id,
            oldStatus: quote.status,
            newStatus: nextStatus,
            changedByName: "Webhook EFI (cartao)",
          },
        });
      }

      return { transaction, quoteUpdate };
    });

    // Fase 51 (D-03): etiquetas da conversa, depois do commit e so quando o status mudou.
    if (nextStatus !== quote.status) this.dispararEtiquetasChatwoot(quote);

    // Envio de mensagem automatica ao cliente via Chatwoot com dados do orcamento
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
        const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

        const mensagem = `✅ Pagamento com cartão de crédito recebido, ${clienteNome}!\n\nOrçamento #${numero} — ${fmt(total)}\nComprovante gerado. Pedido confirmado! 😊`;

        await this.chatwootService.sendOutgoingMessage(convId, mensagem);
      }
    } catch (err) {
      this.logger.warn(`Falha ao notificar cliente via Chatwoot apos pagamento com cartao: ${err instanceof Error ? err.message : err}`);
    }

    this.logger.log(`Webhook EFI (cartao): pagamento processado para quote ${quote.id} (chargeId=${chargeId}, status=${updated.quoteUpdate.status}).`);
  }

}
