import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import axios from "axios";
import { ConfigService } from "@nestjs/config";

import { AthosService } from "../integrations/athos/athos.service";
import { PrismaService } from "../database/prisma.service";
import { CriarBoletoDto } from "./dto/criar-boleto.dto";

export interface CriarBoletoResponseDto {
  cobrancaId: number;
  chargeId: number;
  linkBoleto: string;
  barcodeLinhaDigitavel: string;
  valor: number;
  expireAt: string;
  nomeArquivo: string;
}

@Injectable()
export class CobrancaService {
  private readonly logger = new Logger(CobrancaService.name);

  constructor(
    private readonly athosService: AthosService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async criarBoleto(dto: CriarBoletoDto): Promise<CriarBoletoResponseDto> {
    // Passo 1: Buscar todos os títulos do cliente e filtrar pelos IDs solicitados
    const todosTitulos = await this.athosService.buscarTitulosClienteContasReceber(dto.idclienteAthos);
    const titulosFiltrados = todosTitulos.filter((t) =>
      dto.idcontasReceber.includes(t.idcontareceber),
    );

    for (const id of dto.idcontasReceber) {
      if (!titulosFiltrados.find((t) => t.idcontareceber === id)) {
        throw new BadRequestException(`Título ${id} não encontrado para este cliente.`);
      }
    }

    if (titulosFiltrados.length !== dto.idcontasReceber.length) {
      throw new BadRequestException("Alguns títulos solicitados não foram encontrados para este cliente.");
    }

    // Passo 3: Calcular total
    const totalValorRaw = titulosFiltrados.reduce((acc, t) => acc + Number(t.valor), 0);
    const totalValor = Number(totalValorRaw.toFixed(2));

    // Passo 4: Validar expireAt
    const hoje = new Date().toISOString().slice(0, 10);
    if (dto.expireAt < hoje) {
      throw new BadRequestException(
        "A data de vencimento informada já passou. Informe uma data futura.",
      );
    }

    // Passo 5: Buscar dados do cliente
    const dadosCliente = await this.athosService.buscarDadosClienteContasReceber(dto.idclienteAthos);
    const nomeCliente = dadosCliente?.nome_cliente ?? `Cliente ${dto.idclienteAthos}`;

    let cpfOuCnpj: Record<string, unknown> = {};
    try {
      const clienteCompleto = await this.athosService.buscarClientePorId(dto.idclienteAthos);
      const doc = clienteCompleto?.documento;
      if (doc) {
        const digitsOnly = doc.replace(/\D/g, "");
        if (digitsOnly.length === 11) {
          // PF: cpf direto no customer
          cpfOuCnpj = { cpf: digitsOnly };
        } else if (digitsOnly.length === 14) {
          // PJ: EFI exige juridical_person.cnpj (não cnpj diretamente)
          cpfOuCnpj = { juridical_person: { corporate_name: nomeCliente.slice(0, 80), cnpj: digitsOnly } };
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Não foi possível buscar documento do cliente ${dto.idclienteAthos}: ${String(err)}`);
    }

    // Passo 6: Criar boleto na EFI
    const baseUrl =
      this.config.get<string>("EFI_COBRANCA_BASE_URL") ??
      "https://cobrancas-h.api.efipay.com.br";

    const clientId = this.getRequiredConfig("EFI_CLIENT_ID");
    const clientSecret = this.getRequiredConfig("EFI_CLIENT_SECRET");
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const cobrancaClient = axios.create({ baseURL: baseUrl, timeout: 15_000 });

    let token: string;
    try {
      const authResp = await cobrancaClient.post(
        "/v1/authorize",
        { grant_type: "client_credentials" },
        { headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" } },
      );
      token = authResp.data?.access_token;
      if (!token) throw new Error("Token não retornado pela EFI");
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data ??
        (e as { message?: string })?.message;
      this.logger.error(`Falha ao autenticar na API Cobranças EFI: ${JSON.stringify(detail)}`);
      throw new InternalServerErrorException("Não foi possível autenticar na API Cobranças EFI.");
    }

    const valorCentavos = Math.round(Number(totalValor.toFixed(2)) * 100);

    const webhookBase =
      process.env["WEBHOOK_BASE_URL"] ?? process.env["APP_URL"] ?? "";
    const isPublicUrl = webhookBase.length > 0 && !/localhost|127\.0\.0\.1/.test(webhookBase);
    const notificationUrl = isPublicUrl
      ? `${webhookBase.replace(/\/$/, "")}/api/cobranca/boleto/notificacao`
      : undefined;

    const body: Record<string, unknown> = {
      items: [
        {
          name: `Cobrança #${dto.idclienteAthos}`.slice(0, 255),
          value: valorCentavos,
          amount: 1,
        },
      ],
      payment: {
        banking_billet: {
          expire_at: dto.expireAt,
          customer: cpfOuCnpj && "juridical_person" in cpfOuCnpj
            ? cpfOuCnpj  // PJ: { juridical_person: { corporate_name, cnpj } }
            : { name: nomeCliente.slice(0, 80), ...cpfOuCnpj }, // PF ou sem doc
        },
      },
      metadata: {
        custom_id: `cr-${dto.idclienteAthos}-${Date.now()}`.slice(0, 50),
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      },
    };

    let chargeId: number;
    let linkBoleto: string;
    let barcode: string;

    try {
      const resp = await cobrancaClient.post(
        "/v1/charge/one-step",
        body,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
      );

      chargeId = resp.data?.data?.charge_id as number;
      linkBoleto = resp.data?.data?.link as string;
      barcode = resp.data?.data?.barcode as string;

      if (!chargeId) throw new Error("charge_id não retornado pela EFI");
      if (!linkBoleto) throw new Error("link não retornado pela EFI");
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data ??
        (e as { message?: string })?.message;
      this.logger.error(
        `Falha ao criar boleto na EFI. status=${status} detalhe=${JSON.stringify(detail)}`,
      );
      throw new InternalServerErrorException("Não foi possível gerar o boleto na EFI.");
    }

    // Passo 7: Salvar no Prisma com nested write
    const boleto = await this.prisma.cobrancaBoleto.create({
      data: {
        txidEfi: String(chargeId),
        idclienteAthos: dto.idclienteAthos,
        valor: totalValor,
        status: "pendente",
        linkBoleto: linkBoleto,
        pixPayload: null,
        titulos: {
          createMany: {
            data: titulosFiltrados.map((t) => ({
              idcontareceber: t.idcontareceber,
              valor: t.valor,
            })),
          },
        },
      },
    });

    // Passo 8: Gerar nome do arquivo
    const nomeArquivo = `${dto.idclienteAthos} - ${nomeCliente.trim().toUpperCase()} ${dto.expireAt}.pdf`;

    // Passo 9: Retornar resposta
    return {
      cobrancaId: boleto.id,
      chargeId,
      linkBoleto,
      barcodeLinhaDigitavel: barcode ?? "",
      valor: totalValor,
      expireAt: dto.expireAt,
      nomeArquivo,
    };
  }

  async processarNotificacaoEFI(token: string): Promise<void> {
    if (!token) {
      this.logger.warn("Webhook EFI recebido sem token — ignorando.");
      return;
    }

    const baseUrl =
      this.config.get<string>("EFI_COBRANCA_BASE_URL") ??
      "https://cobrancas-h.api.efipay.com.br";

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
      if (!efiToken) throw new Error("Token não retornado");
    } catch (e: unknown) {
      this.logger.error(`Webhook EFI: falha ao autenticar para consultar notificação: ${String(e)}`);
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
      this.logger.error(
        `Webhook EFI: falha ao consultar notificação token=${token}: ${JSON.stringify(detail)}`,
      );
      return;
    }

    if (!chargeId) {
      this.logger.warn(`Webhook EFI: charge_id não encontrado na notificação token=${token}`);
      return;
    }

    const boleto = await this.prisma.cobrancaBoleto.findFirst({
      where: { txidEfi: String(chargeId) },
    });

    if (!boleto) {
      this.logger.warn(`Webhook EFI: CobrancaBoleto não encontrado para chargeId=${chargeId}`);
      return;
    }

    if (status === "paid") {
      if (boleto.status === "pago") {
        this.logger.log(`Webhook EFI: boleto ${boleto.id} já marcado como pago — idempotência OK.`);
        return;
      }
      await this.prisma.cobrancaBoleto.update({
        where: { id: boleto.id },
        data: { status: "pago" },
      });
      this.logger.log(`Webhook EFI: boleto ${boleto.id} (chargeId=${chargeId}) marcado como pago.`);
    } else {
      this.logger.log(
        `Webhook EFI: notificação recebida com status='${status}' para chargeId=${chargeId} — sem ação.`,
      );
    }
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new InternalServerErrorException(`Variável de ambiente ${key} não configurada.`);
    }
    return value;
  }
}
