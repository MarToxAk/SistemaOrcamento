import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import axios from "axios";
import { ConfigService } from "@nestjs/config";

import { AthosService } from "../integrations/athos/athos.service";
import { DanfsePdfService } from "../integrations/nfse/danfse-pdf.service";
import { NfseNacionalService } from "../integrations/nfse/nfse-nacional.service";
import { NfseService, UploadedXmlFile } from "../integrations/nfse/nfse.service";
import { PrismaService } from "../database/prisma.service";
import { AnexarNfseCobrancaDto } from "./dto/anexar-nfse-cobranca.dto";
import { CriarBoletoDto } from "./dto/criar-boleto.dto";
import { EmitirNfseCobrancaDto } from "./dto/emitir-nfse-cobranca.dto";

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
    private readonly nfseService: NfseService,
    private readonly nfseNacionalService: NfseNacionalService,
    private readonly danfsePdfService: DanfsePdfService,
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

    // Passo 3: Verificar duplicidade — títulos já com boleto pendente/pago
    const titulosJaUsados = await this.prisma.cobrancaBoletoTitulo.findMany({
      where: {
        idcontareceber: { in: dto.idcontasReceber },
        cobrancaBoleto: { status: { in: ["pendente", "pago"] } },
      },
      select: { idcontareceber: true, cobrancaBoleto: { select: { id: true, status: true } } },
    });
    if (titulosJaUsados.length > 0) {
      const ids = [...new Set(titulosJaUsados.map((t) => t.idcontareceber))];
      throw new BadRequestException(
        `Os títulos ${ids.join(", ")} já possuem boleto ${titulosJaUsados[0].cobrancaBoleto.status}. ` +
        "Cancele o boleto anterior antes de gerar um novo.",
      );
    }

    // Passo 4: Validar NF emitida (mantém regra "boleto requer NF" mesmo com itens vindos de venda_item)
    const nfInfo = await this.athosService.verificarNFTitulos(dto.idcontasReceber);
    const nfseEmitidasTitulos = await this.prisma.nfseEmitidaTitulo.findMany({
      where: {
        idcontareceber: { in: dto.idcontasReceber },
        nfseEmitida: { numeroNfse: { not: null } },
      },
      select: { idcontareceber: true },
    });
    const titulosComNfseLocal = new Set(nfseEmitidasTitulos.map((t) => t.idcontareceber));
    for (const item of nfInfo) {
      if (item.tipoNf === null && titulosComNfseLocal.has(item.idcontareceber)) {
        item.tipoNf = "NFS-e";
      }
    }
    // Títulos de valor negativo (desconto/abatimento) reduzem o total do boleto
    // e não representam produto ou serviço próprio — não exigem NF.
    const idsValorNegativo = new Set(
      titulosFiltrados.filter((t) => Number(t.valor) < 0).map((t) => t.idcontareceber),
    );
    const semNf = nfInfo.filter((n) => n.tipoNf === null && !idsValorNegativo.has(n.idcontareceber));
    if (semNf.length > 0) {
      throw new BadRequestException(
        `Os títulos ${semNf.map((n) => n.idcontareceber).join(", ")} não possuem nota fiscal emitida. ` +
        "Apenas títulos com NF-e ou NFS-e podem gerar boleto.",
      );
    }

    const totalValorRaw = titulosFiltrados.reduce((acc, t) => acc + Number(t.valor), 0);
    const totalValor = Number(totalValorRaw.toFixed(2));

    // Montar itens EFI a partir de venda_item do Athos (1 EFI item por produto/serviço da venda)
    const itemMap = await this.montarItensEfiPorVendaItem(titulosFiltrados, totalValor);

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

    // Montar itens EFI a partir dos venda_item do Athos
    const valorCentavos = Math.round(totalValor * 100);
    const efiItems = [...itemMap.values()].map((item) => ({
      name: item.name.slice(0, 255),
      value: item.valueCentavos,
      amount: item.amount,
    }));

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

    // APP_BASE_URL e a variavel efetivamente injetada no container em producao
    // (docker-compose.vps.yml / stack.env.example). WEBHOOK_BASE_URL/APP_URL nunca
    // sao definidas no deploy — mantidas como fallback legado, mas sem elas a
    // notification_url ficava sempre undefined e o boleto nunca era confirmado
    // automaticamente (dependia de clique manual em "verificar pagamento").
    const webhookBase =
      this.config.get<string>("APP_BASE_URL") ??
      process.env["WEBHOOK_BASE_URL"] ??
      process.env["APP_URL"] ??
      "";
    const isPublicUrl = webhookBase.length > 0 && !/localhost|127\.0\.0\.1/.test(webhookBase);
    const notificationUrl = isPublicUrl
      ? `${webhookBase.replace(/\/$/, "")}/api/cobranca/boleto/notificacao`
      : undefined;

    const body: Record<string, unknown> = {
      items: efiItems,
      payment: {
        banking_billet: {
          expire_at: dto.expireAt,
          customer: cpfOuCnpj && "juridical_person" in cpfOuCnpj
            ? cpfOuCnpj  // PJ: { juridical_person: { corporate_name, cnpj } }
            : { name: nomeCliente.slice(0, 80), ...cpfOuCnpj }, // PF ou sem doc
          ...(dto.observacao?.trim() ? { message: dto.observacao.trim().slice(0, 255) } : {}),
        },
      },
      metadata: {
        custom_id: `cr-${dto.idclienteAthos}-${Date.now()}`.slice(0, 50),
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      },
    };

    this.logger.log(`EFI boleto payload: items=${JSON.stringify(body.items)} valorCentavos=${valorCentavos}`);

    let chargeId: number;
    let linkBoleto: string;
    let barcode: string;

    try {
      const resp = await cobrancaClient.post(
        "/v1/charge/one-step",
        body,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
      );

      // EFI /v1/charge/one-step retorna data como array: { data: [{ charge_id, pdf: { charge: url }, barcode, ... }] }
      const item = Array.isArray(resp.data?.data) ? resp.data.data[0] : resp.data?.data;
      chargeId = item?.charge_id as number;
      // PDF URL direto em pdf.charge (ex: https://download.sejaefi.com.br/...)
      linkBoleto = (item?.pdf?.charge ?? item?.pdf ?? item?.link) as string;
      barcode = item?.barcode as string;

      this.logger.log(`EFI response item: ${JSON.stringify({ chargeId, linkBoleto: linkBoleto?.slice(0, 60), barcode: barcode?.slice(0, 20) })}`);

      if (!chargeId) throw new Error("charge_id não retornado pela EFI");
      if (!linkBoleto) throw new Error("PDF URL não retornada pela EFI (pdf.charge ausente)");
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data ??
        (e as { message?: string })?.message;
      this.logger.error(
        `Falha ao criar boleto na EFI. status=${status} detalhe=${JSON.stringify(detail)}`,
      );
      const efiCode = (detail as { code?: string | number })?.code;
      if (String(efiCode) === "4600210") {
        throw new BadRequestException(
          "A EFI bloqueou a emissão: muitas tentativas com os mesmos dados (cliente + valor + vencimento). " +
          "Aguarde alguns minutos e tente novamente com uma data de vencimento diferente, ou entre em contato com o suporte da EFI.",
        );
      }
      throw new InternalServerErrorException("Não foi possível gerar o boleto na EFI.");
    }

    // Passo 7: Gerar nome do arquivo antes de salvar
    const nomeArquivo = `${dto.idclienteAthos} - ${nomeCliente.trim().toUpperCase()} ${dto.expireAt}.pdf`;

    // Passo 8: Salvar no Prisma com nested write
    const boleto = await this.prisma.cobrancaBoleto.create({
      data: {
        txidEfi: String(chargeId),
        idclienteAthos: dto.idclienteAthos,
        valor: totalValor,
        status: "pendente",
        linkBoleto: linkBoleto,
        pixPayload: null,
        nomeArquivo: nomeArquivo,
        expireAt: dto.expireAt,
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

  /**
   * Anexa manualmente o XML da NFS-e (emissao SOAP descontinuada pela prefeitura)
   * aos títulos selecionados de um cliente.
   */
  async anexarNfse(dto: AnexarNfseCobrancaDto, file: UploadedXmlFile): Promise<{
    nfseEmitidaId: number;
    numeroNfse: string;
    valor: number;
    linkNfse: string | null;
  }> {
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

    // Passo 2: Verificação de duplicidade por idvenda (D-08, D-09, D-10)
    const idvendasUnicas = [...new Set(titulosFiltrados.map((t) => t.idvenda).filter((v): v is number => v != null))];
    for (const idvenda of idvendasUnicas) {
      const existente = await this.prisma.nfseEmitida.findFirst({ where: { idvenda } });
      if (existente) {
        throw new BadRequestException(
          `NFS-e já anexada para venda ${idvenda} (Nº ${existente.numeroNfse})`,
        );
      }
    }

    // Passo 3: Parsear XML e guardar arquivo no MinIO
    const parsed = this.nfseService.parseXml(file.buffer);
    const { publicUrl, objectName } = await this.nfseService.storeXml(
      file.buffer,
      parsed.numeroNfse!,
      `cobranca/${dto.idclienteAthos}`,
    );

    const valorTotal = parsed.valorServico ?? titulosFiltrados.reduce((s, t) => s + t.valor, 0);

    // Passo 4: Persistir em NfseEmitida com nested write
    const nfseEmitida = await this.prisma.nfseEmitida.create({
      data: {
        numeroNfse: parsed.numeroNfse,
        idclienteAthos: dto.idclienteAthos,
        valorServico: valorTotal,
        idvenda: idvendasUnicas[0] ?? null,
        chaveAcesso: parsed.chaveAcesso,
        linkNfse: publicUrl,
        arquivoPath: objectName,
        arquivoNome: file.originalname,
        dataEmissao: parsed.dataEmissao ?? new Date(),
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

    this.logger.log(`NFS-e #${parsed.numeroNfse} anexada manualmente — ${titulosFiltrados.length} título(s).`);

    return {
      nfseEmitidaId: nfseEmitida.id,
      numeroNfse: parsed.numeroNfse!,
      valor: valorTotal,
      linkNfse: publicUrl,
    };
  }

  /** Resolve CPF/CNPJ, nome e endereço do tomador direto do Athos, para pre-preencher a emissao automatica. */
  async buscarTomadorNfse(idclienteAthos: number): Promise<{
    documento: string | null;
    nome: string | null;
    endereco: { logradouro: string; numero: string; bairro: string; cep: string; codigoMunicipio: string; uf: string } | null;
  }> {
    const cliente = await this.athosService.buscarClientePorId(idclienteAthos);
    return {
      documento: cliente?.documento ?? null,
      nome: cliente?.name ?? null,
      endereco: cliente?.endereco ?? null,
    };
  }

  /** Emite a NFS-e automaticamente via API do Sistema Nacional e vincula aos títulos selecionados. */
  async emitirNfseAutomatica(dto: EmitirNfseCobrancaDto): Promise<{
    nfseEmitidaId: number;
    numeroNfse: string;
    valor: number;
    linkNfse: string | null;
  }> {
    const todosTitulos = await this.athosService.buscarTitulosClienteContasReceber(dto.idclienteAthos);
    const titulosFiltrados = todosTitulos.filter((t) => dto.idcontasReceber.includes(t.idcontareceber));

    for (const id of dto.idcontasReceber) {
      if (!titulosFiltrados.find((t) => t.idcontareceber === id)) {
        throw new BadRequestException(`Título ${id} não encontrado para este cliente.`);
      }
    }

    const idvendasUnicas = [...new Set(titulosFiltrados.map((t) => t.idvenda).filter((v): v is number => v != null))];
    for (const idvenda of idvendasUnicas) {
      const existente = await this.prisma.nfseEmitida.findFirst({ where: { idvenda } });
      if (existente) {
        throw new BadRequestException(`NFS-e já anexada para venda ${idvenda} (Nº ${existente.numeroNfse})`);
      }
    }

    const valorTotal = dto.valorServico ?? titulosFiltrados.reduce((s, t) => s + t.valor, 0);

    // Endereco sempre resolvido aqui no backend a partir do Athos (nunca do
    // que o frontend mandar) para nao divergir do cadastro oficial do cliente.
    const clienteAthos = await this.athosService.buscarClientePorId(dto.idclienteAthos);
    const endereco = clienteAthos?.endereco
      ? {
          logradouro: clienteAthos.endereco.logradouro,
          numero: clienteAthos.endereco.numero,
          bairro: clienteAthos.endereco.bairro,
          cep: clienteAthos.endereco.cep,
          codigoMunicipio: clienteAthos.endereco.codigoMunicipio,
        }
      : undefined;

    const { chaveAcesso, nfseXml } = await this.nfseNacionalService.emitir({
      codigoServico: dto.codigoServico,
      descricaoServico: dto.descricaoServico,
      valorServico: valorTotal,
      incluirIbsCbs: dto.incluirIbsCbs,
      tomador: { cpf: dto.cpfTomador, cnpj: dto.cnpjTomador, nome: dto.nomeTomador, endereco },
    });

    const buffer = Buffer.from(nfseXml, "utf-8");
    const parsed = this.nfseService.parseXml(buffer);
    const { publicUrl, objectName } = await this.nfseService.storeXml(
      buffer,
      parsed.numeroNfse ?? chaveAcesso,
      `cobranca/${dto.idclienteAthos}`,
    );

    const nfseEmitida = await this.prisma.nfseEmitida.create({
      data: {
        numeroNfse: parsed.numeroNfse,
        idclienteAthos: dto.idclienteAthos,
        valorServico: valorTotal,
        idvenda: idvendasUnicas[0] ?? null,
        chaveAcesso: parsed.chaveAcesso ?? chaveAcesso,
        linkNfse: publicUrl,
        arquivoPath: objectName,
        arquivoNome: `NFSe-${parsed.numeroNfse ?? chaveAcesso}.xml`,
        dataEmissao: parsed.dataEmissao ?? new Date(),
        titulos: {
          createMany: {
            data: titulosFiltrados.map((t) => ({ idcontareceber: t.idcontareceber, valor: t.valor })),
          },
        },
      },
    });

    this.logger.log(`NFS-e #${parsed.numeroNfse} emitida automaticamente — ${titulosFiltrados.length} título(s).`);

    return {
      nfseEmitidaId: nfseEmitida.id,
      numeroNfse: parsed.numeroNfse!,
      valor: valorTotal,
      linkNfse: publicUrl,
    };
  }

  /**
   * Retorna o PDF de uma NFS-e emitida para cobrança.
   *
   * O `linkNfse` tem duas naturezas conforme a origem da nota:
   *  - NFS-e da era iiBrasil (Ilhabela, `chaveAcesso` nulo): o link já devolve
   *    um PDF pronto do provedor — repassamos os bytes como estão.
   *  - NFS-e do padrão Nacional (XML anexado/assinado): o link devolve XML e o
   *    DANFSe é renderizado localmente a partir dele.
   * Faz sniff dos primeiros bytes (`%PDF`) para decidir, sem depender só de
   * `chaveAcesso`.
   */
  async baixarDanfsePdf(nfseEmitidaId: number): Promise<{ pdfBuffer: Buffer; nomeArquivo: string }> {
    const nfseEmitida = await this.prisma.nfseEmitida.findUnique({ where: { id: nfseEmitidaId } });
    if (!nfseEmitida) throw new BadRequestException(`NFS-e ${nfseEmitidaId} não encontrada.`);
    if (!nfseEmitida.linkNfse) throw new BadRequestException(`NFS-e ${nfseEmitidaId} não possui documento armazenado.`);

    const nomeArquivo = `NFSe-${nfseEmitida.numeroNfse ?? nfseEmitidaId}.pdf`;
    const resp = await axios.get<ArrayBuffer>(nfseEmitida.linkNfse, {
      responseType: "arraybuffer",
      timeout: 15_000,
    });
    const raw = Buffer.from(resp.data);

    // O provedor iiBrasil já entrega PDF pronto — repassa direto.
    if (raw.subarray(0, 5).toString("latin1") === "%PDF-") {
      return { pdfBuffer: raw, nomeArquivo };
    }

    // Padrão Nacional: o link é XML, renderiza o DANFSe localmente.
    const pdfBuffer = await this.danfsePdfService.gerarPdfDoXml(raw.toString("utf8"));
    return { pdfBuffer, nomeArquivo };
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

  async buscarTitulosComBoletoAtivo(idcontasReceber: number[]): Promise<Array<{
    idcontareceber: number;
    cobrancaId: number;
    status: string;
  }>> {
    if (idcontasReceber.length === 0) return [];
    const rows = await this.prisma.cobrancaBoletoTitulo.findMany({
      where: {
        idcontareceber: { in: idcontasReceber },
        cobrancaBoleto: { status: { in: ["pendente", "pago"] } },
      },
      select: {
        idcontareceber: true,
        cobrancaBoleto: { select: { id: true, status: true, linkBoleto: true, nomeArquivo: true } },
      },
    });
    return rows.map((r) => ({
      idcontareceber: r.idcontareceber,
      cobrancaId: r.cobrancaBoleto.id,
      status: r.cobrancaBoleto.status,
      linkBoleto: r.cobrancaBoleto.linkBoleto,
      nomeArquivo: r.cobrancaBoleto.nomeArquivo,
    }));
  }

  async downloadBoletoPdf(cobrancaId: number): Promise<{ pdfBuffer: Buffer; nomeArquivo: string }> {
    const cobranca = await this.prisma.cobrancaBoleto.findUnique({ where: { id: cobrancaId } });
    if (!cobranca) {
      throw new BadRequestException(`Cobrança ${cobrancaId} não encontrada.`);
    }
    if (!cobranca.linkBoleto) {
      throw new BadRequestException(`Cobrança ${cobrancaId} não possui URL do PDF armazenada.`);
    }

    // URL do PDF já salva em linkBoleto (ex: https://download.sejaefi.com.br/...)
    // Busca o PDF diretamente pela URL sem precisar de nova autenticação EFI
    const pdfResp = await axios.get(cobranca.linkBoleto, { responseType: "arraybuffer", timeout: 30_000 });

    const nomeArquivo = cobranca.nomeArquivo
      ?? (cobranca.txidEfi
        ? `${cobranca.idclienteAthos} - boleto-${cobranca.txidEfi}.pdf`
        : `${cobranca.idclienteAthos} - boleto-${cobrancaId}.pdf`);
    return { pdfBuffer: Buffer.from(pdfResp.data as ArrayBuffer), nomeArquivo };
  }

  /** Cancela boleto na EFI e marca como cancelado no banco */
  async cancelarBoleto(cobrancaId: number): Promise<{ ok: boolean; mensagem: string }> {
    const cobranca = await this.prisma.cobrancaBoleto.findUnique({
      where: { id: cobrancaId },
      include: { titulos: true },
    });
    if (!cobranca) throw new BadRequestException(`Cobrança ${cobrancaId} não encontrada.`);
    if (cobranca.status === "cancelado") return { ok: true, mensagem: "Boleto já estava cancelado." };

    // Cancelar na EFI via PUT /v1/charge/:chargeId/cancel
    // Doc: https://dev.efipay.com.br/docs/api-cobrancas/boleto
    // Statuses canceláveis: new, waiting, unpaid, link
    if (cobranca.txidEfi) {
      try {
        const baseUrl = this.config.get<string>("EFI_COBRANCA_BASE_URL") ?? "https://cobrancas-h.api.efipay.com.br";
        const basic = Buffer.from(`${this.getRequiredConfig("EFI_CLIENT_ID")}:${this.getRequiredConfig("EFI_CLIENT_SECRET")}`).toString("base64");
        const cli = axios.create({ baseURL: baseUrl, timeout: 15_000 });
        const authResp = await cli.post("/v1/authorize", { grant_type: "client_credentials" }, {
          headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
        });
        const token: string = authResp.data?.access_token;
        if (token) {
          const cancelResp = await cli.put(
            `/v1/charge/${cobranca.txidEfi}/cancel`,
            {},
            { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
          );
          if (cancelResp.data?.code === 200) {
            this.logger.log(`EFI: boleto chargeId=${cobranca.txidEfi} cancelado com sucesso (code 200).`);
          } else {
            this.logger.warn(`EFI: resposta inesperada ao cancelar chargeId=${cobranca.txidEfi}: ${JSON.stringify(cancelResp.data)}`);
          }
        }
      } catch (e: unknown) {
        const detail = (e as { response?: { data?: unknown } })?.response?.data;
        this.logger.warn(`Falha ao cancelar boleto na EFI (prosseguindo com remoção do banco): ${JSON.stringify(detail ?? String(e))}`);
        // Não bloqueia: mesmo se EFI falhar, remove do banco para liberar os títulos
      }
    }

    // Cancela e remove do banco — libera títulos para novo boleto
    await this.prisma.cobrancaBoletoTitulo.deleteMany({ where: { cobrancaBoletoId: cobrancaId } });
    await this.prisma.cobrancaBoleto.delete({ where: { id: cobrancaId } });
    return { ok: true, mensagem: "Boleto cancelado e removido. Títulos disponíveis para novo boleto." };
  }

  /** Verifica status do boleto na EFI e atualiza o banco */
  async verificarPagamentoBoleto(cobrancaId: number): Promise<{ status: string; atualizado: boolean }> {
    const cobranca = await this.prisma.cobrancaBoleto.findUnique({ where: { id: cobrancaId } });
    if (!cobranca) throw new BadRequestException(`Cobrança ${cobrancaId} não encontrada.`);
    if (!cobranca.txidEfi) return { status: cobranca.status, atualizado: false };

    try {
      const baseUrl = this.config.get<string>("EFI_COBRANCA_BASE_URL") ?? "https://cobrancas-h.api.efipay.com.br";
      const basic = Buffer.from(`${this.getRequiredConfig("EFI_CLIENT_ID")}:${this.getRequiredConfig("EFI_CLIENT_SECRET")}`).toString("base64");
      const cli = axios.create({ baseURL: baseUrl, timeout: 15_000 });
      const authResp = await cli.post("/v1/authorize", { grant_type: "client_credentials" }, {
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
      });
      const token: string = authResp.data?.access_token;
      if (!token) throw new Error("Token não retornado pela EFI");

      const resp = await cli.get(`/v1/charge/${cobranca.txidEfi}`, { headers: { Authorization: `Bearer ${token}` } });
      const efiStatus: string = resp.data?.data?.status ?? resp.data?.data?.[0]?.status ?? "desconhecido";
      const novoStatus = efiStatus === "paid" ? "pago" : efiStatus === "canceled" ? "cancelado" : cobranca.status;

      if (novoStatus !== cobranca.status) {
        await this.prisma.cobrancaBoleto.update({ where: { id: cobrancaId }, data: { status: novoStatus } });
        return { status: novoStatus, atualizado: true };
      }
      return { status: novoStatus, atualizado: false };
    } catch (err) {
      this.logger.error(`Erro ao verificar pagamento do boleto ${cobrancaId} na EFI: ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException(`Erro ao verificar pagamento na EFI: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Remove boleto do banco (cleanup) — libera títulos para novo boleto */
  async removerBoletoBanco(cobrancaId: number): Promise<{ ok: boolean }> {
    const cobranca = await this.prisma.cobrancaBoleto.findUnique({ where: { id: cobrancaId } });
    if (!cobranca) throw new BadRequestException(`Cobrança ${cobrancaId} não encontrada.`);
    await this.prisma.cobrancaBoletoTitulo.deleteMany({ where: { cobrancaBoletoId: cobrancaId } });
    await this.prisma.cobrancaBoleto.delete({ where: { id: cobrancaId } });
    this.logger.log(`CobrancaBoleto ${cobrancaId} removido do banco (cleanup).`);
    return { ok: true };
  }

  /** Busca boletos de um cliente com seus títulos vinculados */
  async buscarBoletosCliente(idclienteAthos: number): Promise<Array<{
    id: number; status: string; valor: number; expireAt: string | null;
    linkBoleto: string | null; nomeArquivo: string | null; txidEfi: string | null;
    criadoEm: Date; titulos: Array<{ idcontareceber: number; valor: number }>;
  }>> {
    const boletos = await this.prisma.cobrancaBoleto.findMany({
      where: { idclienteAthos },
      orderBy: { criadoEm: "desc" },
      include: { titulos: { select: { idcontareceber: true, valor: true } } },
    });
    return boletos.map((b) => ({
      id: b.id, status: b.status, valor: Number(b.valor),
      expireAt: b.expireAt, linkBoleto: b.linkBoleto, nomeArquivo: b.nomeArquivo,
      txidEfi: b.txidEfi, criadoEm: b.criadoEm,
      titulos: b.titulos.map((t) => ({ idcontareceber: t.idcontareceber, valor: Number(t.valor) })),
    }));
  }

  /** Retorna quais idcontareceber já possuem NFS-e emitida no nosso banco */
  async buscarNfseEmitidaParaTitulos(idcontasReceber: number[]): Promise<Array<{
    idcontareceber: number;
    nfseEmitidaId: number;
    numeroNfse: string | null;
    linkNfse: string | null;
  }>> {
    if (idcontasReceber.length === 0) return [];
    const rows = await this.prisma.nfseEmitidaTitulo.findMany({
      where: { idcontareceber: { in: idcontasReceber } },
      select: {
        idcontareceber: true,
        nfseEmitidaId: true,
        nfseEmitida: { select: { numeroNfse: true, linkNfse: true } },
      },
    });
    return rows.map((r) => ({
      idcontareceber: r.idcontareceber,
      nfseEmitidaId: r.nfseEmitidaId,
      numeroNfse: r.nfseEmitida.numeroNfse ?? null,
      linkNfse: r.nfseEmitida.linkNfse ?? null,
    }));
  }

  /** Busca todas as NFS-e emitidas de um cliente com seus títulos vinculados */
  async buscarNfseEmitidaCliente(idclienteAthos: number): Promise<Array<{
    id: number; numeroNfse: string | null; numeroRps: number | null;
    valorServico: number; linkNfse: string | null; dataEmissao: Date;
    titulos: number[];
  }>> {
    const nfses = await this.prisma.nfseEmitida.findMany({
      where: { idclienteAthos },
      orderBy: { dataEmissao: "desc" },
      include: { titulos: { select: { idcontareceber: true } } },
    });
    return nfses.map((n) => ({
      id: n.id,
      numeroNfse: n.numeroNfse ?? null,
      numeroRps: n.numeroRps,
      valorServico: Number(n.valorServico),
      linkNfse: n.linkNfse ?? null,
      dataEmissao: n.dataEmissao,
      titulos: n.titulos.map((t) => t.idcontareceber),
    }));
  }

  /**
   * Remove o anexo local da NFS-e (todos os registros com o mesmo numeroNfse —
   * segurança para notas duplicadas). Não cancela a nota na prefeitura: a
   * emissão agora é manual, então o cancelamento também deve ser feito lá.
   */
  async cancelarNfseEmitida(nfseEmitidaId: number): Promise<{ ok: boolean; mensagem: string }> {
    const nfse = await this.prisma.nfseEmitida.findUnique({ where: { id: nfseEmitidaId } });
    if (!nfse) throw new BadRequestException(`NFS-e emitida ${nfseEmitidaId} não encontrada.`);

    const numeroNfse = nfse.numeroNfse;
    const registros = numeroNfse
      ? await this.prisma.nfseEmitida.findMany({ where: { numeroNfse }, select: { id: true } })
      : [{ id: nfseEmitidaId }];

    await this.prisma.$transaction(async (tx) => {
      for (const r of registros) {
        await tx.nfseEmitidaTitulo.deleteMany({ where: { nfseEmitidaId: r.id } });
        await tx.nfseEmitida.delete({ where: { id: r.id } });
      }
    });

    this.logger.log(`NFS-e #${numeroNfse ?? "?"} removida: ${registros.length} registro(s).`);

    return {
      ok: true,
      mensagem: `NFS-e #${numeroNfse ?? nfseEmitidaId}: ${registros.length} registro(s) removido(s) do banco. Isso não cancela a nota na prefeitura.`,
    };
  }

  /** Calcula os itens que serão enviados à EFI sem criar o boleto — usado para preview no frontend. */
  async previewBoleto(idclienteAthos: number, idcontasReceber: number[]): Promise<{
    nomeCliente: string;
    total: number;
    itens: Array<{ nome: string; valor: number; quantidade: number }>;
  }> {
    const todosTitulos = await this.athosService.buscarTitulosClienteContasReceber(idclienteAthos);
    const titulosFiltrados = todosTitulos.filter(t => idcontasReceber.includes(t.idcontareceber));

    const total = Number(titulosFiltrados.reduce((acc, t) => acc + Number(t.valor), 0).toFixed(2));
    const itemMap = await this.montarItensEfiPorVendaItem(titulosFiltrados, total);

    const dadosCliente = await this.athosService.buscarDadosClienteContasReceber(idclienteAthos);
    const nomeCliente = dadosCliente?.nome_cliente ?? `Cliente ${idclienteAthos}`;

    return {
      nomeCliente,
      total,
      itens: [...itemMap.values()].map(item => ({
        nome: item.name,
        valor: item.valueCentavos / 100,
        quantidade: item.amount,
      })),
    };
  }

  /**
   * Monta os itens EFI com UM item por Nota Fiscal (cada NFS-e e cada NF-e).
   * Para cada título:
   *  - Split serviço/produto via venda_item.tipoFisico (mesma lógica do NFS-e).
   *  - Parte de serviço alocada à(s) NFS-e do título (uma por número).
   *  - Parte de produto alocada à(s) NF-e do título (distribuição igual entre NF-es do mesmo venda).
   * Resultado: Map<numeroNF, item>, agregando o mesmo número que apareça em vários títulos.
   * Garante Σ valueCentavos == round(totalValor * 100) aplicando delta de arredondamento no último item.
   */
  private async montarItensEfiPorVendaItem(
    titulos: Array<{ idcontareceber: number; idvenda: number | null; valor: number }>,
    totalValor: number,
  ): Promise<Map<string, { name: string; valueCentavos: number; amount: number }>> {
    const idsContas = titulos.map((t) => t.idcontareceber);

    // Busca NFS-e do nosso banco — inclui valorServico (fonte autoritativa do valor de serviço)
    const nfseRows = await this.prisma.nfseEmitidaTitulo.findMany({
      where: { idcontareceber: { in: idsContas }, nfseEmitida: { numeroNfse: { not: null } } },
      select: {
        idcontareceber: true,
        nfseEmitida: { select: { numeroNfse: true, valorServico: true } },
      },
    });
    this.logger.log(
      `[SPLIT-BOLETO-RAW-NFSE-DB] ${JSON.stringify(
        nfseRows.map(r => ({ idcr: r.idcontareceber, nfse: r.nfseEmitida.numeroNfse, valorServico: Number(r.nfseEmitida.valorServico ?? 0) }))
      )}`,
    );

    const nfseInfoPorTitulo = new Map<number, Array<{ numero: string; valorServico: number }>>();
    for (const row of nfseRows) {
      const num = row.nfseEmitida.numeroNfse;
      if (!num) continue;
      const arr = nfseInfoPorTitulo.get(row.idcontareceber) ?? [];
      if (!arr.find((x) => x.numero === num)) {
        arr.push({ numero: num, valorServico: Number(row.nfseEmitida.valorServico ?? 0) });
      }
      nfseInfoPorTitulo.set(row.idcontareceber, arr);
    }

    // Busca números de NF-e (do Athos) por idcontareceber
    const nfesRows = await this.athosService.buscarTodasNfesParaTitulos(idsContas);
    this.logger.log(`[SPLIT-BOLETO-RAW-NFE-ATHOS] ${JSON.stringify(nfesRows)}`);

    const nfeNumsPorTitulo = new Map<number, string[]>();
    for (const r of nfesRows) {
      if (!r.numero) continue;
      const arr = nfeNumsPorTitulo.get(r.idcontareceber) ?? [];
      if (!arr.includes(r.numero)) arr.push(r.numero);
      nfeNumsPorTitulo.set(r.idcontareceber, arr);
    }

    // LOG: resumo por título — id, idvenda, valor, nfse[], nfe[]
    {
      const debugTitulos = titulos.map(t => ({
        id: t.idcontareceber,
        idvenda: t.idvenda,
        valor: t.valor,
        nfse: (nfseInfoPorTitulo.get(t.idcontareceber) ?? []).map(n => n.numero),
        nfe: nfeNumsPorTitulo.get(t.idcontareceber) ?? [],
      }));
      this.logger.log(`[SPLIT-BOLETO-TITULOS-RECEBIDOS] ${JSON.stringify(debugTitulos)}`);
    }

    // Agrupa títulos por idvenda + busca venda_item (com tipoFisico) e valortotal
    const vendasUnicas = [...new Set(titulos.map((t) => t.idvenda).filter((v): v is number => v != null))];
    const dadosPorVenda = new Map<number, {
      itens: Array<{ nome: string; quantidade: number; valor: number; tipoFisico: boolean; sequencia: number }>;
      valorTotal: number;
    }>();
    await Promise.all(
      vendasUnicas.map(async (idv) => {
        const itens = await this.athosService.buscarItensVenda(idv);
        // Calcula valorTotal direto da soma dos itens — evita dependência
        // de coluna "valortotal" que não existe em todas as versões do Athos.
        const valorTotal = itens.reduce((s, i) => s + i.valor, 0);
        dadosPorVenda.set(idv, { itens, valorTotal });
      }),
    );

    // Novo: 1 item por nota fiscal, mas só valor de produto (NF-e) ou serviço (NFS-e) conforme o tipo
    const notaToCentavos = new Map<string, number>();
    const notaToLabel = new Map<string, string>();
    let totalCentavos = 0;
    for (const titulo of titulos) {
      const valorTituloCent = Math.round(Number(titulo.valor) * 100);
      totalCentavos += valorTituloCent;
      const dados = titulo.idvenda != null ? dadosPorVenda.get(titulo.idvenda) : undefined;
      const itensVenda = dados?.itens ?? [];
      const valorTotalVenda = dados?.valorTotal ?? 0;
      const nfseInfos = nfseInfoPorTitulo.get(titulo.idcontareceber) ?? [];
      const nfeNums = nfeNumsPorTitulo.get(titulo.idcontareceber) ?? [];

      // Split produto/serviço igual ao anterior
      const somaValorServicoNfse = nfseInfos.reduce((s, n) => s + n.valorServico, 0);
      let servCent = 0;
      let prodCent = 0;
      if (itensVenda.length > 0 && valorTotalVenda > 0) {
        const fator = Number(titulo.valor) / valorTotalVenda;
        const totalSrv = itensVenda.filter((i) => !i.tipoFisico).reduce((s, i) => s + i.valor, 0);
        const totalPrd = itensVenda.filter((i) => i.tipoFisico).reduce((s, i) => s + i.valor, 0);
        servCent = Math.round(totalSrv * fator * 100);
        prodCent = Math.round(totalPrd * fator * 100);
        const delta = valorTituloCent - (servCent + prodCent);
        if (delta !== 0) {
          if (prodCent > 0) prodCent += delta;
          else servCent += delta;
        }
      } else if (nfseInfos.length > 0 && somaValorServicoNfse > 0) {
        servCent = Math.min(Math.round(somaValorServicoNfse * 100), valorTituloCent);
        prodCent = valorTituloCent - servCent;
      } else {
        if (nfseInfos.length > 0 && nfeNums.length === 0) servCent = valorTituloCent;
        else if (nfseInfos.length === 0 && nfeNums.length > 0) prodCent = valorTituloCent;
        else prodCent = valorTituloCent;
      }

      // LOG: detalhes do split por título
      this.logger.log(
        `[SPLIT-BOLETO-TITULO] idcontareceber=${titulo.idcontareceber} valor=${valorTituloCent}` +
        ` NF-es=[${nfeNums.join(",")}] NFS-es=[${nfseInfos.map(n => n.numero).join(",")}]` +
        ` prodCent=${prodCent} servCent=${servCent}`,
      );

      // Serviço vai para cada NFS-e do título
      if (servCent > 0 && nfseInfos.length > 0) {
        let restante = servCent;
        const usaProporcional = somaValorServicoNfse > 0;
        nfseInfos.forEach((nfse, idx) => {
          const frac = usaProporcional
            ? nfse.valorServico / somaValorServicoNfse
            : 1 / nfseInfos.length;
          const parte = idx === nfseInfos.length - 1
            ? restante
            : Math.round(servCent * frac);
          restante -= parte;
          const key = `NFS-e-${nfse.numero}`;
          notaToCentavos.set(key, (notaToCentavos.get(key) ?? 0) + parte);
          notaToLabel.set(key, `NFS-e #${nfse.numero}`);
        });
      }

      // Produto vai para cada NF-e do título (sempre distribui entre todas as NF-es associadas)
      if (prodCent > 0) {
        if (nfeNums.length > 0) {
          let restante = prodCent;
          nfeNums.forEach((num, idx) => {
            const parte = idx === nfeNums.length - 1
              ? restante
              : Math.round(prodCent / nfeNums.length);
            restante -= parte;
            const key = `NF-e-${num}`;
            notaToCentavos.set(key, (notaToCentavos.get(key) ?? 0) + parte);
            notaToLabel.set(key, `NF-e #${num}`);
          });
        } else {
          // Se não tem NF-e, mas tem produto, agrupa em "Produtos"
          const key = `PRODUTOS-TIT-${titulo.idcontareceber}`;
          notaToCentavos.set(key, (notaToCentavos.get(key) ?? 0) + prodCent);
          notaToLabel.set(key, "Produtos");
        }
      }

      // Se não tem nota nenhuma, agrupa em "Outros"
      if (nfseInfos.length === 0 && nfeNums.length === 0 && prodCent === 0 && servCent === 0) {
        const key = `OUTROS-TIT-${titulo.idcontareceber}`;
        notaToCentavos.set(key, (notaToCentavos.get(key) ?? 0) + valorTituloCent);
        notaToLabel.set(key, "Outros");
      }
    }

    // Monta o itemMap final
    const itemMap = new Map<string, { name: string; valueCentavos: number; amount: number }>();
    for (const [key, cent] of notaToCentavos.entries()) {
      if (cent <= 0) continue;
      itemMap.set(key, { name: notaToLabel.get(key)!, valueCentavos: cent, amount: 1 });
    }

    // Ajuste final: garante Σ items.value === round(totalValor * 100)
    const target = Math.round(totalValor * 100);
    const soma = [...itemMap.values()].reduce((s, i) => s + i.valueCentavos, 0);
    const diff = target - soma;
    if (diff !== 0) {
      if (itemMap.size > 0) {
        const ultimaKey = [...itemMap.keys()].pop()!;
        const it = itemMap.get(ultimaKey)!;
        itemMap.set(ultimaKey, { ...it, valueCentavos: it.valueCentavos + diff });
      } else if (target > 0) {
        itemMap.set("cobranca", { name: "Cobrança", valueCentavos: target, amount: 1 });
      }
    }

    // LOG DETALHADO DO RESULTADO FINAL
    this.logger.log(`[SPLIT-BOLETO-FINAL] Itens do boleto: ${JSON.stringify([...itemMap.values()])}`);

    return itemMap;
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new InternalServerErrorException(`Variável de ambiente ${key} não configurada.`);
    }
    return value;
  }
}
