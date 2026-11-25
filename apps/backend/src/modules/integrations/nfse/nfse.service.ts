import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Quote } from "@prisma/client";
import { Client as MinioClient } from "minio";

import axios from "axios";

import { PrismaService } from "../../database/prisma.service";
import { findQuoteByIdentifierBasic } from "../../quotes/quote-identifier.util";
import {
  centavosParaReais,
  paraCentavos,
  resolverSituacaoPagamentoQuote,
  SituacaoPagamentoResolvida,
} from "../../quotes/quote-payment.util";
import { AthosService } from "../athos/athos.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";
import { DanfseNacionalPdfService } from "./danfse-nacional-pdf.service";
import { DanfsePdfService } from "./danfse-pdf.service";
import { EmitirNfseNacionalDto } from "./dto/emitir-nfse-nacional.dto";
import {
  LIMITE_FALHAS_GLOBAL,
  LIMITE_FALHAS_POR_IP,
  LimitadorFalhas,
  NFSE_OVERRIDE_ENV,
  sanitizarLiberadoPor,
  senhaConfere,
} from "./nfse-liberacao.util";
import { NfseNacionalService } from "./nfse-nacional.service";
import { ParsedNfse, parseNfseXml } from "./nfse-xml-parser.util";

export type UploadedXmlFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
};

export type { ParsedNfse };

/** Um PIX identificado do orcamento, na forma exposta a tela (sem payload cru nem dados do pagador). */
export type PagamentoIdentificadoQuote = {
  e2eId: string | null;
  txid: string | null;
  valor: number;
  pagoEm: string;
  metodo: string;
};

export type PagamentoQuoteResposta = SituacaoPagamentoResolvida & {
  pagoEm: string | null;
  pagamentos: PagamentoIdentificadoQuote[];
  pagamentoCaixa: string | null;
};

/** Origem da requisicao de emissao (auditoria da liberacao por senha, D-09). */
export type ContextoEmissaoNfse = { ip?: string; userAgent?: string };

type ResultadoLiberacao = "LIBERADO" | "SENHA_INVALIDA" | "NAO_CONFIGURADA" | "BLOQUEADO";

type DadosAuditoriaLiberacao = {
  quote: Quote;
  situacao: SituacaoPagamentoResolvida;
  resultado: ResultadoLiberacao;
  valorNota: number;
  liberadoPor: string;
  ip: string;
  userAgent?: string;
};

const CHAVE_LIMITADOR_GLOBAL = "global";
const MAX_USER_AGENT = 200;

// ---------------------------------------------------------------------------
// NfseService — a emissao automatica via SOAP (iiBrasil/ABRASF) foi
// descontinuada pela prefeitura de Ilhabela. A nota agora e emitida
// manualmente (fora do sistema) e o XML assinado (padrao nacional NBS) e
// anexado aqui: parseia os campos relevantes e guarda o arquivo no MinIO.
// ---------------------------------------------------------------------------
@Injectable()
export class NfseService {
  private readonly logger = new Logger(NfseService.name);

  /** D-09: falhas de senha por IP e globais (memoria; o backend roda em instancia unica). */
  private readonly limitadorPorIp = new LimitadorFalhas(LIMITE_FALHAS_POR_IP.max, LIMITE_FALHAS_POR_IP.janelaMs);
  private readonly limitadorGlobal = new LimitadorFalhas(LIMITE_FALHAS_GLOBAL.max, LIMITE_FALHAS_GLOBAL.janelaMs);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly nfseNacionalService: NfseNacionalService,
    private readonly danfsePdfService: DanfsePdfService,
    private readonly athosService: AthosService,
    private readonly danfseNacionalPdfService: DanfseNacionalPdfService,
    private readonly chatwootService: ChatwootService,
  ) {}

  /**
   * Resolve CPF/CNPJ, nome e endereco do tomador a partir do cliente Athos
   * vinculado ao orcamento, para pre-preencher o formulario de emissao
   * automatica. Todo o trecho Athos e best-effort: qualquer falha e apenas
   * logada e o metodo devolve tudo nulo, sem nunca lancar por causa do Athos.
   *
   * `motivo` diagnostica POR QUE o pre-preenchimento nao ocorreu (NFSEQ-01),
   * para a tela exibir um alerta em vez de ficar em silencio: null no
   * caminho feliz, "sem-vinculo-athos" quando o orcamento nao tem
   * externalQuoteId, "orcamento-nao-encontrado"/"athos-indisponivel" quando
   * a consulta ao orcamento no Athos falha, "cliente-nao-vinculado" quando o
   * orcamento existe mas nao aponta para um cliente, e "cliente-sem-cadastro"
   * quando o cliente apontado nao tem cadastro no Athos.
   *
   * O identificador de busca vem SOMENTE de `externalQuoteId` — o fallback
   * anterior para `internalNumber` (autoincrement local) foi removido porque
   * ele podia casar com um orcamento alheio na tabela `orcamento` do Athos e
   * pre-preencher o tomador de outro cliente num documento fiscal.
   */
  async resolverTomadorQuote(quoteId: string): Promise<{
    idclienteAthos: number | null;
    documento: string | null;
    nome: string | null;
    endereco: { logradouro: string; numero: string; bairro: string; cep: string; codigoMunicipio: string; uf: string } | null;
    motivo: string | null;
  }> {
    const quote = await this.carregarQuotePorIdentificador(quoteId);

    const externalQuoteId = (quote as any).externalQuoteId ?? null;
    if (externalQuoteId == null) {
      return { idclienteAthos: null, documento: null, nome: null, endereco: null, motivo: "sem-vinculo-athos" };
    }

    try {
      const lookupId = String(externalQuoteId);
      const athosData = await this.athosService.buscarOrcamentoPorNumero(lookupId);
      const mapped = (athosData as any)?.mapped ?? null;
      const idclienteAthos = mapped?.idcliente ?? mapped?.clienteid ?? null;

      if (!idclienteAthos) {
        return { idclienteAthos: null, documento: null, nome: null, endereco: null, motivo: "cliente-nao-vinculado" };
      }

      const cliente = await this.athosService.buscarClientePorId(idclienteAthos);
      if (!cliente) {
        return { idclienteAthos, documento: null, nome: null, endereco: null, motivo: "cliente-sem-cadastro" };
      }

      return {
        idclienteAthos,
        documento: cliente?.documento ?? null,
        nome: cliente?.name ?? null,
        endereco: cliente?.endereco ?? null,
        motivo: null,
      };
    } catch (err) {
      const motivo = err instanceof NotFoundException ? "orcamento-nao-encontrado" : "athos-indisponivel";
      this.logger.debug(
        `Falha ao resolver tomador Athos para o orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { idclienteAthos: null, documento: null, nome: null, endereco: null, motivo };
    }
  }

  /** Baixa o XML ja anexado/emitido e gera o DANFSe (PDF) para envio ao cliente. */
  async baixarDanfsePdf(quoteId: string): Promise<{ pdfBuffer: Buffer; nomeArquivo: string }> {
    const quote = await this.carregarQuotePorIdentificador(quoteId);
    if (!quote.nfseLink) throw new BadRequestException("Orcamento nao possui NFS-e anexada.");

    const xmlResp = await axios.get(quote.nfseLink, { responseType: "text", timeout: 15_000 });
    const pdfBuffer = await this.danfsePdfService.gerarPdfDoXml(xmlResp.data as string);

    return { pdfBuffer, nomeArquivo: `NFSe-${quote.nfseNumero ?? quote.id}.pdf` };
  }

  /**
   * Resolve o orcamento a partir de um identificador cru vindo da rota
   * (`internalNumber`, `externalQuoteId` ou UUID) usando a mesma ordem de
   * resolucao de `QuotesService.findQuoteByIdentifier` (fonte unica em
   * `quote-identifier.util.ts`). Lanca a mesma excecao/mensagem de antes
   * quando nao encontra, para nao mudar o contrato de erro do frontend.
   */
  private async carregarQuotePorIdentificador(identifier: string): Promise<Quote> {
    const quote = await findQuoteByIdentifierBasic(this.prisma, identifier);
    if (!quote) throw new NotFoundException("Orcamento nao encontrado.");
    return quote;
  }

  /**
   * Pagamento identificado do orcamento para a tela de NFS-e (D-07, D-08): situacao, valores, desconto,
   * data e E2E dos PIX. Usa a MESMA regra da trava de emissao (`resolverSituacaoPagamentoQuote`).
   * Expoe somente e2eId, txid, valor, pagoEm e metodo: nunca o webhookPayload cru nem o pagador.
   */
  async resolverPagamentoQuote(quoteId: string): Promise<PagamentoQuoteResposta> {
    const quote = await this.carregarQuotePorIdentificador(quoteId);
    const situacao = resolverSituacaoPagamentoQuote(quote);

    const transacoes = await this.prisma.paymentTransaction.findMany({
      where: { quoteId: quote.id },
      orderBy: { processedAt: "asc" },
    });

    const pagamentos: PagamentoIdentificadoQuote[] = transacoes
      .map((tx) => ({
        e2eId: tx.eventId ?? tx.externalId ?? null,
        txid: this.lerTextoJson(tx.metadata, "txid") ?? this.lerTextoJson(tx.webhookPayload, "txid"),
        valor: centavosParaReais(paraCentavos(tx.amount)),
        pagoEm: this.resolverDataPagamento(tx),
        metodo: tx.method,
      }))
      .sort((a, b) => a.pagoEm.localeCompare(b.pagoEm));

    const confirmadoEm = quote.paymentConfirmedAt ? quote.paymentConfirmedAt.toISOString() : null;
    const ultimoPix = pagamentos.length > 0 ? pagamentos[pagamentos.length - 1].pagoEm : null;
    const caixa = situacao.origem === "CAIXA";

    return {
      ...situacao,
      pagoEm: caixa ? (confirmadoEm ?? ultimoPix) : (ultimoPix ?? confirmadoEm),
      pagamentos,
      pagamentoCaixa: caixa ? (quote.paymentNote?.trim() || null) : null,
    };
  }

  private lerTextoJson(json: unknown, campo: string): string | null {
    if (!json || typeof json !== "object") return null;
    const valor = (json as Record<string, unknown>)[campo];
    return typeof valor === "string" && valor.trim() ? valor.trim() : null;
  }

  /** Data do PIX: `horario` do webhook (metadata ou payload) quando valido; senao o instante do processamento. */
  private resolverDataPagamento(tx: { metadata: unknown; webhookPayload: unknown; processedAt: Date }): string {
    for (const origem of [tx.metadata, tx.webhookPayload]) {
      const horario = this.lerTextoJson(origem, "horario");
      if (!horario) continue;
      const data = new Date(horario);
      if (!Number.isNaN(data.getTime())) return data.toISOString();
    }
    return tx.processedAt.toISOString();
  }

  /** Emite a NFS-e automaticamente via API do Sistema Nacional e anexa o resultado ao orcamento. */
  async emitirQuoteNfseAutomatica(quoteId: string, dto: EmitirNfseNacionalDto, contexto: ContextoEmissaoNfse = {}) {
    const quote = await this.carregarQuotePorIdentificador(quoteId);
    if (quote.nfseNumero) {
      throw new BadRequestException("Orcamento ja possui NFS-e emitida.");
    }

    // Fase 54 (D-06): trava de pagamento ANTES de qualquer chamada ao Athos ou a SEFIN (D-10: o
    // restante do fluxo Sistema Nacional/Sefin segue igual). O anexo manual de XML nao passa por aqui (D-16).
    const liberacao = await this.verificarTravaPagamento(quote, dto, contexto);

    // Precedencia de endereco (D-i7c-01): o endereco digitado manualmente no
    // formulario vence quando completo — logradouro, CEP e codigo do
    // municipio, os tres que a DPS realmente exige (xLgr/CEP/cMun); numero e
    // bairro ja tem default no builder. Sem os tres, usa o endereco resolvido
    // do cadastro Athos (comportamento anterior). Se nenhum dos dois existir,
    // o grupo <end> e omitido (best-effort, como hoje). O cadastro Athos ja
    // provou ser pouco confiavel para o codigo do municipio (260804-g0t);
    // deixar o operador sobrescrever mitiga esse mesmo risco no orcamento.
    const tomadorAthos = await this.resolverTomadorQuote(quote.id);

    const enderecoManualValido =
      Boolean(dto.enderecoLogradouro?.trim()) &&
      Boolean(dto.enderecoCep?.trim()) &&
      Boolean(dto.enderecoCodigoMunicipio?.trim());

    const enderecoManual = enderecoManualValido
      ? {
          logradouro: dto.enderecoLogradouro!.trim(),
          numero: dto.enderecoNumero?.trim() ?? "",
          bairro: dto.enderecoBairro?.trim() ?? "",
          cep: dto.enderecoCep!.replace(/\D/g, ""),
          codigoMunicipio: dto.enderecoCodigoMunicipio!.trim(),
        }
      : null;

    const enderecoAthos = tomadorAthos.endereco
      ? {
          logradouro: tomadorAthos.endereco.logradouro,
          numero: tomadorAthos.endereco.numero,
          bairro: tomadorAthos.endereco.bairro,
          cep: tomadorAthos.endereco.cep,
          codigoMunicipio: tomadorAthos.endereco.codigoMunicipio,
        }
      : undefined;

    const endereco = enderecoManual ?? enderecoAthos;

    const { chaveAcesso, nfseXml } = await this.nfseNacionalService.emitir({
      codigoServico: dto.codigoServico,
      descricaoServico: dto.descricaoServico,
      valorServico: dto.valorServico,
      incluirIbsCbs: dto.incluirIbsCbs,
      tomador: {
        cpf: dto.cpfTomador,
        cnpj: dto.cnpjTomador,
        nome: dto.nomeTomador,
        endereco,
      },
    });

    const buffer = Buffer.from(nfseXml, "utf-8");
    const parsed = this.parseXml(buffer);
    const { publicUrl } = await this.storeXml(buffer, parsed.numeroNfse ?? chaveAcesso, `quotes/${quote.id}`);

    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        nfseNumero: parsed.numeroNfse,
        nfseCodigoVerificacao: parsed.chaveAcesso ?? chaveAcesso,
        nfseLink: publicUrl,
        nfseEmitidaEm: parsed.dataEmissao ?? new Date(),
      },
    });

    this.logger.log(`NFS-e #${parsed.numeroNfse} emitida automaticamente para o orcamento ${quote.id}.`);

    if (liberacao.auditoriaId) {
      await this.vincularNfseALiberacao(liberacao.auditoriaId, parsed.numeroNfse ?? null);
    }

    const envioChatwoot = await this.enviarDanfseParaCliente(quote, nfseXml, parsed.numeroNfse ?? null);

    return {
      numero: parsed.numeroNfse,
      codigoVerificacao: parsed.chaveAcesso ?? chaveAcesso,
      link: publicUrl,
      dataEmissao: parsed.dataEmissao,
      valorServico: parsed.valorServico,
      envioChatwoot,
    };
  }

  /**
   * Trava de pagamento da emissao automatica (D-06, D-12, D-15). Decisao exclusivamente do backend,
   * calculada a partir do Quote (nenhum campo "pago" vem do front).
   *
   * - Pagamento integral (PIX com desconto ou confirmado no caixa): libera, ignorando qualquer senha.
   * - Caso contrario, sem senha no corpo: 403 PAGAMENTO_INTEGRAL_NAO_CONFIRMADO (sem auditoria).
   * - Com senha: liberacao auditada (D-09), ver `liberarPorSenha`.
   */
  private async verificarTravaPagamento(
    quote: Quote,
    dto: EmitirNfseNacionalDto,
    contexto: ContextoEmissaoNfse,
  ): Promise<{ auditoriaId: string | null }> {
    const situacao = resolverSituacaoPagamentoQuote(quote);

    if (situacao.situacao === "INTEGRAL") {
      this.validarTetoValorNota(dto.valorServico, situacao);
      return { auditoriaId: null };
    }

    const informouSenha = typeof dto.senhaLiberacao === "string" && dto.senhaLiberacao.length > 0;
    if (!informouSenha) {
      throw new ForbiddenException({
        code: "PAGAMENTO_INTEGRAL_NAO_CONFIRMADO",
        message: "Pagamento integral do orcamento nao confirmado. Informe a senha de liberacao para emitir a NFS-e.",
        situacao: situacao.situacao,
        valorPago: situacao.valorPago,
        valorDevido: situacao.valorDevido,
        exigeSenha: true,
      });
    }

    return this.liberarPorSenha(quote, dto, situacao, contexto);
  }

  /**
   * Liberacao por senha unica da empresa (D-09). Ordem: liberadoPor obrigatorio, limitador de forca
   * bruta, senha configurada, comparacao em tempo constante, teto do valor e, so entao, a linha
   * LIBERADO gravada ANTES de emitir (fail-closed). A senha nunca e persistida nem logada.
   */
  private async liberarPorSenha(
    quote: Quote,
    dto: EmitirNfseNacionalDto,
    situacao: SituacaoPagamentoResolvida,
    contexto: ContextoEmissaoNfse,
  ): Promise<{ auditoriaId: string | null }> {
    const liberadoPor = sanitizarLiberadoPor(dto.liberadoPor);
    if (!liberadoPor) {
      throw new BadRequestException({
        code: "LIBERADO_POR_OBRIGATORIO",
        message: "Informe o nome de quem esta liberando a emissao.",
      });
    }

    const ip = contexto.ip && contexto.ip.length > 0 ? contexto.ip : "desconhecido";
    const userAgent = contexto.userAgent ? contexto.userAgent.slice(0, MAX_USER_AGENT) : undefined;
    const registro = { quote, situacao, valorNota: dto.valorServico, liberadoPor, ip, userAgent };

    if (this.limitadorPorIp.bloqueado(ip) || this.limitadorGlobal.bloqueado(CHAVE_LIMITADOR_GLOBAL)) {
      await this.auditarLiberacaoBestEffort({ ...registro, resultado: "BLOQUEADO" });
      throw new HttpException(
        {
          code: "LIBERACAO_BLOQUEADA",
          message: "Muitas tentativas de senha incorretas. Aguarde alguns minutos e tente novamente.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const esperada = this.configService.get<string>(NFSE_OVERRIDE_ENV);
    if (typeof esperada !== "string" || esperada.trim().length === 0) {
      await this.auditarLiberacaoBestEffort({ ...registro, resultado: "NAO_CONFIGURADA" });
      throw new ForbiddenException({
        code: "LIBERACAO_NAO_CONFIGURADA",
        message: "A liberacao por senha nao esta configurada neste ambiente.",
      });
    }

    if (!senhaConfere(dto.senhaLiberacao, esperada)) {
      this.limitadorPorIp.registrarFalha(ip);
      this.limitadorGlobal.registrarFalha(CHAVE_LIMITADOR_GLOBAL);
      await this.auditarLiberacaoBestEffort({ ...registro, resultado: "SENHA_INVALIDA" });
      throw new ForbiddenException({
        code: "SENHA_LIBERACAO_INVALIDA",
        message: "Senha de liberacao incorreta.",
      });
    }

    this.limitadorPorIp.limpar(ip);
    this.validarTetoValorNota(dto.valorServico, situacao);

    // Fail-closed: nao existe liberacao sem rastro. Se a linha nao for gravada, nada e emitido.
    try {
      const criada = await this.gravarAuditoriaLiberacao({ ...registro, resultado: "LIBERADO" });
      return { auditoriaId: criada.id };
    } catch (err) {
      this.logger.error(
        `Liberacao de NFS-e abortada: falha ao gravar a auditoria do orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new InternalServerErrorException({
        code: "LIBERACAO_NAO_AUDITADA",
        message: "Nao foi possivel registrar a auditoria da liberacao. A NFS-e nao foi emitida.",
      });
    }
  }

  private gravarAuditoriaLiberacao(dados: DadosAuditoriaLiberacao): Promise<{ id: string }> {
    const numero = dados.quote.externalQuoteId ?? dados.quote.internalNumber;
    return this.prisma.nfseLiberacao.create({
      data: {
        quoteId: dados.quote.id,
        quoteNumero: numero == null ? null : String(numero),
        resultado: dados.resultado,
        situacao: dados.situacao.situacao,
        valorPago: dados.situacao.valorPago,
        valorDevido: dados.situacao.valorDevido,
        valorNota: dados.valorNota,
        liberadoPor: dados.liberadoPor,
        ip: dados.ip,
        userAgent: dados.userAgent ?? null,
      },
      select: { id: true },
    });
  }

  /** Auditoria das saidas negativas: best-effort (nunca troca a resposta 403/429 por um erro de banco). */
  private async auditarLiberacaoBestEffort(dados: DadosAuditoriaLiberacao): Promise<void> {
    try {
      await this.gravarAuditoriaLiberacao(dados);
    } catch (err) {
      this.logger.warn(
        `Falha ao gravar auditoria de liberacao de NFS-e (${dados.resultado}) do orcamento ${dados.quote.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Apos emitir, grava o numero da NFS-e na linha LIBERADO. Best-effort: a nota ja e definitiva na SEFIN. */
  private async vincularNfseALiberacao(auditoriaId: string, nfseNumero: string | null): Promise<void> {
    try {
      await this.prisma.nfseLiberacao.update({ where: { id: auditoriaId }, data: { nfseNumero } });
    } catch (err) {
      this.logger.warn(
        `Falha ao vincular a NFS-e #${nfseNumero} a auditoria de liberacao ${auditoriaId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** D-15: o valor do servico nunca pode superar o valor efetivamente pago (ou devido, na liberacao). Em centavos. */
  private validarTetoValorNota(valorServico: number, situacao: SituacaoPagamentoResolvida): void {
    if (paraCentavos(valorServico) > paraCentavos(situacao.valorMaximoNota)) {
      throw new UnprocessableEntityException({
        code: "VALOR_ACIMA_DO_PAGO",
        message: `O valor do servico nao pode ser maior que o valor pago (R$ ${situacao.valorMaximoNota.toFixed(2)}).`,
        valorMaximo: situacao.valorMaximoNota,
      });
    }
  }

  /**
   * Gera o DANFSe nacional a partir do XML assinado e entrega ao cliente pelo
   * Chatwoot, anexado a mensagem. Best-effort: nunca lanca — a nota ja esta
   * fiscalmente definitiva no SEFIN quando este metodo e chamado (D-04), e o
   * destino e resolvido exclusivamente por quote.conversationId (D-05,
   * T-HAL-01) — nunca por busca de contato por nome/documento.
   */
  private async enviarDanfseParaCliente(
    quote: { id: string; conversationId: bigint | null },
    nfseXml: string,
    numeroNfse: string | null,
  ): Promise<{ enviado: boolean; motivo?: string }> {
    const convId = quote.conversationId ? String(quote.conversationId) : undefined;
    if (!convId) {
      this.logger.debug(`Orcamento ${quote.id} sem conversationId no Chatwoot — DANFSe nao enviado ao cliente.`);
      return { enviado: false, motivo: "orcamento sem conversa vinculada no Chatwoot" };
    }

    try {
      const pdfBuffer = await this.danfseNacionalPdfService.gerar(nfseXml);
      const mensagem = `Sua Nota Fiscal de Servico (NFS-e) n. ${numeroNfse} foi emitida. O documento (DANFSe) esta em anexo.`;
      await this.chatwootService.sendOutgoingMessage(convId, mensagem);
      await this.chatwootService.sendAttachment(convId, pdfBuffer, `NFSe-${numeroNfse ?? quote.id}.pdf`, "application/pdf");
      return { enviado: true };
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao entregar DANFSe pelo Chatwoot para o orcamento ${quote.id}: ${motivo}`);
      return { enviado: false, motivo };
    }
  }

  parseXml(buffer: Buffer): ParsedNfse {
    const xml = buffer.toString("utf-8");
    const parsed = parseNfseXml(xml);
    if (!parsed.numeroNfse) {
      throw new BadRequestException(
        "XML da NFS-e invalido: numero da nota (nNFSe) nao encontrado. Confirme que o arquivo e o XML assinado da nota (padrao nacional NBS).",
      );
    }
    return parsed;
  }

  async storeXml(
    buffer: Buffer,
    numeroNfse: string,
    prefix: string,
  ): Promise<{ objectName: string; publicUrl: string | null }> {
    const client = this.buildMinioClient();
    const bucket = this.requireEnv("MINIO_BUCKET");
    await this.ensureBucket(client, bucket);

    const objectName = `${this.getPathPrefix()}/${prefix}/NFSe-${numeroNfse}-${randomUUID().slice(0, 8)}.xml`;
    await client.putObject(bucket, objectName, buffer, buffer.length, {
      "Content-Type": "application/xml",
    });

    return { objectName, publicUrl: this.buildPublicUrl(bucket, objectName) };
  }

  async anexarQuoteNfse(quoteId: string, file: UploadedXmlFile) {
    const quote = await this.carregarQuotePorIdentificador(quoteId);

    const parsed = this.parseXml(file.buffer);
    const { publicUrl } = await this.storeXml(file.buffer, parsed.numeroNfse!, `quotes/${quote.id}`);

    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        nfseNumero: parsed.numeroNfse,
        nfseCodigoVerificacao: parsed.chaveAcesso,
        nfseLink: publicUrl,
        nfseEmitidaEm: parsed.dataEmissao ?? new Date(),
      },
    });

    this.logger.log(`NFS-e #${parsed.numeroNfse} anexada manualmente ao orcamento ${quote.id}.`);

    return {
      numero: parsed.numeroNfse,
      codigoVerificacao: parsed.chaveAcesso,
      link: publicUrl,
      dataEmissao: parsed.dataEmissao,
      valorServico: parsed.valorServico,
    };
  }

  async removerQuoteNfse(quoteId: string): Promise<{ ok: boolean }> {
    const quote = await this.carregarQuotePorIdentificador(quoteId);

    await this.prisma.quote.update({
      where: { id: quote.id },
      data: { nfseNumero: null, nfseCodigoVerificacao: null, nfseLink: null, nfseEmitidaEm: null },
    });

    return { ok: true };
  }

  private buildMinioClient(): MinioClient {
    const endPointRaw = this.requireEnv("MINIO_ENDPOINT").replace(/\/$/, "");
    const useSSL = endPointRaw.startsWith("https://")
      ? true
      : endPointRaw.startsWith("http://")
        ? false
        : (this.configService.get<string>("MINIO_USE_SSL") ?? "true").toLowerCase() !== "false";
    const endPoint = endPointRaw.replace(/^https?:\/\//, "");
    const accessKey = this.requireEnv("MINIO_ACCESS_KEY");
    const secretKey = this.requireEnv("MINIO_SECRET_KEY");
    const port = Number(this.configService.get<string>("MINIO_PORT") ?? (useSSL ? 443 : 80));

    return new MinioClient({ endPoint, port, useSSL, accessKey, secretKey });
  }

  private async ensureBucket(client: MinioClient, bucket: string) {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      const region = this.configService.get<string>("MINIO_REGION") ?? "us-east-1";
      await client.makeBucket(bucket, region);
    }
  }

  private buildPublicUrl(bucket: string, objectName: string): string | null {
    const customBase = this.configService.get<string>("MINIO_PUBLIC_BASE_URL");
    if (customBase) {
      return `${customBase.replace(/\/$/, "")}/${bucket}/${objectName}`;
    }

    const endPoint = this.configService.get<string>("MINIO_ENDPOINT");
    if (!endPoint) return null;

    const useSSL = (this.configService.get<string>("MINIO_USE_SSL") ?? "true").toLowerCase() !== "false";
    const port = Number(this.configService.get<string>("MINIO_PORT") ?? (useSSL ? 443 : 80));
    const protocol = useSSL ? "https" : "http";
    const includePort = (useSSL && port !== 443) || (!useSSL && port !== 80);

    return `${protocol}://${endPoint}${includePort ? `:${port}` : ""}/${bucket}/${objectName}`;
  }

  private getPathPrefix(): string {
    return (this.configService.get<string>("MINIO_PATH_PREFIX_NFSE") ?? "nfse").replace(/^\/+|\/+$/g, "");
  }

  private requireEnv(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      throw new InternalServerErrorException(`Configuracao ausente para armazenamento de NFS-e: defina a variavel ${name}.`);
    }
    return value;
  }
}
