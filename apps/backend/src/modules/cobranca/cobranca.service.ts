import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import axios from "axios";
import { ConfigService } from "@nestjs/config";

import { AthosService } from "../integrations/athos/athos.service";
import { NfseService } from "../integrations/nfse/nfse.service";
import { PrismaService } from "../database/prisma.service";
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

    // Passo 4: Validar NF e calcular total
    const nfInfo = await this.athosService.verificarNFTitulos(dto.idcontasReceber);
    // Busca TODAS as NF-es de cada título (não apenas LIMIT 1) para criar item por NF-e
    const todasNfesRows = await this.athosService.buscarTodasNfesParaTitulos(dto.idcontasReceber);
    // Map: idcontareceber → [{ numero, valorNota }]
    const todasNfesMap = new Map<number, Array<{ numero: string; valorNota: number }>>();
    for (const row of todasNfesRows) {
      const arr = todasNfesMap.get(row.idcontareceber) ?? [];
      arr.push({ numero: row.numero, valorNota: row.valorNota });
      todasNfesMap.set(row.idcontareceber, arr);
    }

    // Buscar NFS-e do nosso sistema para TODOS os títulos (inclui valorServico para split)
    const todasNfse = await this.prisma.nfseEmitidaTitulo.findMany({
      where: {
        idcontareceber: { in: dto.idcontasReceber },
        nfseEmitida: { numeroNfse: { not: null } },
      },
      select: { idcontareceber: true, nfseEmitida: { select: { numeroNfse: true, valorServico: true } } },
    });
    const nfseMapTodos = new Map(todasNfse.map((t) => [t.idcontareceber, t.nfseEmitida]));

    // Buscar tipo-produto por venda (mesma lógica do modal NFS-e) para split sem NFS-e no nosso sistema
    const vendasParaVerificar = [...new Set(
      titulosFiltrados.map(t => t.idvenda).filter((v): v is number => v != null),
    )];
    const tipoPorVenda = new Map<number, { temProdutoFisico: boolean; valorServicos: number | null }>();
    await Promise.all(
      vendasParaVerificar.map(async (idv) => {
        try {
          const tipo = await this.athosService.verificarTipoProdutoVenda(idv);
          tipoPorVenda.set(idv, { temProdutoFisico: tipo.temProdutoFisico, valorServicos: tipo.valorServicos });
        } catch { /* falha silenciosa — split de fallback indisponível para esta venda */ }
      }),
    );

    // Complementar nfInfo: títulos sem NF no Athos mas com NFS-e no nosso sistema
    for (const item of nfInfo) {
      if (item.tipoNf === null && nfseMapTodos.has(item.idcontareceber)) {
        item.tipoNf = "NFS-e";
        item.numeroNf = nfseMapTodos.get(item.idcontareceber)!.numeroNfse ?? null;
      }
    }

    const semNf = nfInfo.filter((n) => n.tipoNf === null);
    if (semNf.length > 0) {
      throw new BadRequestException(
        `Os títulos ${semNf.map((n) => n.idcontareceber).join(", ")} não possuem nota fiscal emitida. ` +
        "Apenas títulos com NF-e ou NFS-e podem gerar boleto.",
      );
    }

    // Montar itens EFI: um item por NF-e + um item por NFS-e.
    // todasNfesMap contém TODAS as NF-es do venda (sem LIMIT 1).
    // Quando há NFS-e no sistema, o valor de serviço é reservado; o restante vai para NF-e(s).
    // Múltiplas NF-es do mesmo venda são distribuídas proporcionalmente pelo valor da nota.
    const itemMap = new Map<string, { name: string; valueCentavos: number }>();
    for (const titulo of titulosFiltrados) {
      const nf = nfInfo.find((n) => n.idcontareceber === titulo.idcontareceber);
      const nfse = nfseMapTodos.get(titulo.idcontareceber);
      const nfes = todasNfesMap.get(titulo.idcontareceber) ?? [];
      const tipoProd = titulo.idvenda ? tipoPorVenda.get(titulo.idvenda) : undefined;
      const valorTitulo = Number(titulo.valor);

      // Valor de serviço: prioriza NFS-e emitida pelo nosso sistema;
      // fallback para vendas mistas sem NFS-e: usa tipo-produto (mesma lógica do modal NFS-e).
      const valorServicoBruto = nfse
        ? Number(nfse.valorServico ?? 0)
        : (tipoProd?.temProdutoFisico && (tipoProd.valorServicos ?? 0) > 0 ? tipoProd.valorServicos! : 0);
      const valorNfse = Math.min(valorServicoBruto, valorTitulo);
      // Valor restante para NF-e(s) (produto físico)
      const valorFisico = Number((valorTitulo - valorNfse).toFixed(2));

      // Registra item de serviço: NFS-e emitida OU serviços separados via tipo-produto
      if (valorNfse > 0) {
        if (nfse) {
          const key = `NFS-e-${nfse.numeroNfse ?? ""}`;
          const prev = itemMap.get(key);
          itemMap.set(key, {
            name: nfse.numeroNfse ? `NFS-e #${nfse.numeroNfse}` : "NFS-e",
            valueCentavos: (prev?.valueCentavos ?? 0) + Math.round(valorNfse * 100),
          });
        } else {
          // Split via tipo-produto — serviços sem NFS-e emitida pelo nosso sistema
          const prev = itemMap.get("servicos");
          itemMap.set("servicos", {
            name: "Serviços",
            valueCentavos: (prev?.valueCentavos ?? 0) + Math.round(valorNfse * 100),
          });
        }
      }

      // Registra item(s) de produto (NF-e)
      if (nfes.length > 0 && valorFisico > 0) {
        // Distribui valorFisico proporcionalmente ao valor de cada nota.
        // Se todas as notas têm valor 0 (campo ausente), divide igualmente.
        const totalNotas = nfes.reduce((s, n) => s + n.valorNota, 0);
        let restante = Math.round(valorFisico * 100); // centavos
        nfes.forEach((nfRow, idx) => {
          const frac = totalNotas > 0 ? nfRow.valorNota / totalNotas : 1 / nfes.length;
          // Último recebe o restante para evitar arredondamento
          const centavos = idx === nfes.length - 1
            ? restante
            : Math.round(valorFisico * 100 * frac);
          restante -= centavos;
          if (centavos > 0 && nfRow.numero) {
            const key = `NF-e-${nfRow.numero}`;
            const prev = itemMap.get(key);
            itemMap.set(key, {
              name: `NF-e #${nfRow.numero}`,
              valueCentavos: (prev?.valueCentavos ?? 0) + centavos,
            });
          }
        });
      } else if (nfes.length === 0 && valorFisico > 0) {
        // Sem NF-e com chave no Athos: NFS-e puro ou NF sem chave de acesso registrada.
        // valorFisico já considera o split de serviço/produto acima.
        const tipoNf = nf?.tipoNf ?? "NF";
        const numeroItem = (tipoNf === "NFS-e" && nfse?.numeroNfse) ? nfse.numeroNfse : (nf?.numeroNf ?? null);
        const key = `${tipoNf}-${numeroItem ?? ""}`;
        const prev = itemMap.get(key);
        itemMap.set(key, {
          name: (numeroItem ? `${tipoNf} #${numeroItem}` : tipoNf).slice(0, 255),
          valueCentavos: (prev?.valueCentavos ?? 0) + Math.round(valorFisico * 100),
        });
      }
    }
    const efiItems = [...itemMap.values()].map((item) => ({
      name: item.name.slice(0, 255),
      value: item.valueCentavos,
      amount: 1 as const,
    }));

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
      items: efiItems,
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

  async emitirNfse(dto: EmitirNfseCobrancaDto): Promise<{
    nfseEmitidaId: number;
    numeroNfse: string;
    numeroRps: number;
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
    const idvenda = titulosFiltrados[0]?.idvenda ?? null;
    if (idvenda !== null) {
      const existente = await this.prisma.nfseEmitida.findFirst({ where: { idvenda } });
      if (existente) {
        throw new BadRequestException(
          `NFS-e já emitida para esta venda (Nº ${existente.numeroNfse})`,
        );
      }
    }

    // Passo 3: Emitir via NfseService (SOAP iiBrasil)
    let resultado: { numero: string; numeroRps: number; codigoVerificacao: string | null; link: string | null };
    try {
      resultado = await this.nfseService.emitirParaContaReceber({
        clienteAthosId: dto.idclienteAthos,
        valor: dto.valor,
        servicoCodigo: dto.servicoCodigo,
        discriminacao: dto.descricaoServico,
      });
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data ??
        (e as { message?: string })?.message;
      this.logger.error(
        `Falha ao emitir NFS-e. status=${status} detalhe=${JSON.stringify(detail)}`,
      );
      throw new InternalServerErrorException("Não foi possível emitir a NFS-e.");
    }

    // Passo 4: Persistir em NfseEmitida com nested write
    const nfseEmitida = await this.prisma.nfseEmitida.create({
      data: {
        numeroNfse: resultado.numero,
        numeroRps: resultado.numeroRps,
        idclienteAthos: dto.idclienteAthos,
        valorServico: dto.valor,
        idvenda: idvenda,
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

    // Salvar linkNfse via raw SQL — coluna adicionada em migração; Prisma client pode estar
    // desatualizado em ambientes onde o DLL engine está em uso e prisma generate não foi rodado.
    if (resultado.link) {
      await this.prisma.$executeRaw`UPDATE "NfseEmitida" SET "linkNfse" = ${resultado.link} WHERE id = ${nfseEmitida.id}`;
    }

    // Passo 5: Retornar resposta
    return {
      nfseEmitidaId: nfseEmitida.id,
      numeroNfse: resultado.numero,
      numeroRps: resultado.numeroRps,
      valor: dto.valor,
      linkNfse: resultado.link ?? null,
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

    const baseUrl = this.config.get<string>("EFI_COBRANCA_BASE_URL") ?? "https://cobrancas-h.api.efipay.com.br";
    const basic = Buffer.from(`${this.getRequiredConfig("EFI_CLIENT_ID")}:${this.getRequiredConfig("EFI_CLIENT_SECRET")}`).toString("base64");
    const cli = axios.create({ baseURL: baseUrl, timeout: 15_000 });
    const authResp = await cli.post("/v1/authorize", { grant_type: "client_credentials" }, {
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    });
    const token: string = authResp.data?.access_token;

    const resp = await cli.get(`/v1/charge/${cobranca.txidEfi}`, { headers: { Authorization: `Bearer ${token}` } });
    const efiStatus: string = resp.data?.data?.status ?? resp.data?.data?.[0]?.status ?? "desconhecido";
    const novoStatus = efiStatus === "paid" ? "pago" : efiStatus === "canceled" ? "cancelado" : cobranca.status;

    if (novoStatus !== cobranca.status) {
      await this.prisma.cobrancaBoleto.update({ where: { id: cobrancaId }, data: { status: novoStatus } });
      return { status: novoStatus, atualizado: true };
    }
    return { status: novoStatus, atualizado: false };
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

  /**
   * Cancela NFS-e na prefeitura (SOAP CancelarNfse) e remove todos os registros
   * com o mesmo numeroNfse do nosso banco — segurança: notas com mesmo número cancelam juntas.
   */
  async cancelarNfseEmitida(nfseEmitidaId: number): Promise<{ ok: boolean; mensagem: string; soapErros?: string[] }> {
    const nfse = await this.prisma.nfseEmitida.findUnique({ where: { id: nfseEmitidaId } });
    if (!nfse) throw new BadRequestException(`NFS-e emitida ${nfseEmitidaId} não encontrada.`);

    const numeroNfse = nfse.numeroNfse;
    let soapErros: string[] = [];
    let soapOk = !numeroNfse;

    // 1. Tentar cancelar na prefeitura via SOAP (se tiver número emitido)
    if (numeroNfse) {
      try {
        const resultado = await this.nfseService.cancelarNfse(numeroNfse);
        soapErros = resultado.erros;
        if (resultado.soapIndisponivel) {
          // Endpoint IIBR não implementa CancelarNfse neste município.
          // Prossegue com remoção local — usuário deve confirmar cancelamento na prefeitura.
          this.logger.warn(`SOAP CancelarNfse indisponível para #${numeroNfse}; removendo apenas do banco.`);
        } else if (!resultado.cancelada) {
          throw new BadRequestException(
            `Falha ao cancelar NFS-e #${numeroNfse} na prefeitura: ${resultado.erros.join(" | ") || "erro desconhecido"}`,
          );
        } else {
          soapOk = true;
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(
          `Erro ao comunicar com a prefeitura: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 2. Remover TODOS os registros com o mesmo numeroNfse do nosso banco (segurança)
    const registros = numeroNfse
      ? await this.prisma.nfseEmitida.findMany({ where: { numeroNfse }, select: { id: true } })
      : [{ id: nfseEmitidaId }];

    for (const r of registros) {
      await this.prisma.nfseEmitidaTitulo.deleteMany({ where: { nfseEmitidaId: r.id } });
      await this.prisma.nfseEmitida.delete({ where: { id: r.id } });
    }

    this.logger.log(`NFS-e #${numeroNfse ?? "?"} removida: ${registros.length} registro(s).`);

    const aviso = !soapOk && numeroNfse
      ? " Atenção: cancelamento na prefeitura não foi confirmado via SOAP — verifique manualmente se necessário."
      : "";
    return {
      ok: true,
      mensagem: `NFS-e #${numeroNfse ?? nfseEmitidaId}: ${registros.length} registro(s) removido(s) do banco.${aviso}`,
      soapErros: soapErros.length > 0 ? soapErros : undefined,
    };
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new InternalServerErrorException(`Variável de ambiente ${key} não configurada.`);
    }
    return value;
  }
}
