import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { hojeSaoPaulo } from "../integrations/athos/athos-conta-receber-baixa.service";
import { AthosService } from "../integrations/athos/athos.service";
import {
  NOME_ITEM_JUROS,
  NOME_ITEM_MULTA,
  calcularBoletoAtualizado,
  configuracoesEfi,
  formatarDataBr,
  montarMensagemAtualizacao,
  novoVencimentoPermitido,
  TETO_JUROS_MES,
  TETO_MULTA_PERCENTUAL,
  validarTaxas,
  vencimentosPermitidos,
} from "./cobranca-boleto-atualizado.util";
import { CobrancaEncargosConfigService } from "./cobranca-encargos-config.service";
import { CobrancaService, ContextoEmissaoEfi } from "./cobranca.service";

export interface GerarBoletoAtualizadoInput {
  novoVencimento: string;
  taxaJurosMes?: number;
  multaPercentual?: number;
}

export interface GerarBoletoAtualizadoResultado {
  cobrancaId: number;
  cobrancaIdOriginal: number;
  chargeId: number;
  linkBoleto: string;
  barcodeLinhaDigitavel: string;
  expireAt: string;
  valor: number;
  principal: number;
  juros: number;
  multa: number;
  cancelamentoOriginal: "ok" | "falhou";
  aviso: string | null;
  reaproveitado: boolean;
}

export interface PreviaBoletoAtualizadoInput {
  novoVencimento?: string;
  taxaJurosMes?: number;
  multaPercentual?: number;
}

export interface PreviaBoletoAtualizado {
  cobrancaIdOriginal: number;
  hoje: string;
  vencimentosPermitidos: [string, string];
  novoVencimento: string;
  taxaJurosMes: number;
  multaPercentual: number;
  taxaJurosMesPadrao: number;
  multaPercentualPadrao: number;
  tetos: { taxaJurosMes: number; multaPercentual: number };
  titulos: Array<{
    idcontareceber: number;
    numerotitulo: string | null;
    vencimentoOriginal: string;
    diasAtraso: number;
    principal: number;
    juros: number;
    multa: number;
    total: number;
  }>;
  principal: number;
  juros: number;
  multa: number;
  total: number;
  mensagem: string[];
  sucessorAtivoId: number | null;
}

interface OriginalCarregado {
  id: number;
  txidEfi: string | null;
  idclienteAthos: number;
  status: string;
  athosBaixaStatus: string | null;
  titulos: Array<{ idcontareceber: number; valor: unknown }>;
}

interface Sucessor {
  id: number;
  status: string;
  txidEfi: string | null;
  valor: unknown;
  valorPrincipal: unknown;
  valorJuros: unknown;
  valorMulta: unknown;
  expireAt: string | null;
  linkBoleto: string | null;
}

interface ItemEfi {
  name: string;
  value: number;
  amount: number;
}

/**
 * Boleto atualizado com juros e multa (Fase 50). Ordem estrita (D-14): criar o novo na EFI -> persistir
 * -> cancelar o original (so code 200), sem apagar nenhuma linha. Nunca reutiliza `cancelarBoleto`, que
 * remove o registro e engole falha da EFI.
 */
@Injectable()
export class CobrancaBoletoAtualizadoService {
  private readonly logger = new Logger(CobrancaBoletoAtualizadoService.name);
  private readonly gerando = new Set<number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly athosService: AthosService,
    private readonly cobrancaService: CobrancaService,
    private readonly encargosConfig: CobrancaEncargosConfigService,
  ) {}

  /** "Hoje" no calendario de America/Sao_Paulo; ponto de substituicao nos testes. */
  hoje(): string {
    return hojeSaoPaulo();
  }

  /**
   * Boleto original, ja recusado quando nao pode ser atualizado (404/409/400), mais o boleto atualizado
   * ativo (nao cancelado) que descende dele, se existir. Usado pela previa e pela geracao.
   */
  private async carregarOriginal(cobrancaId: number): Promise<{ original: OriginalCarregado; sucessor: Sucessor | null }> {
    const original = (await this.prisma.cobrancaBoleto.findUnique({
      where: { id: cobrancaId },
      include: { titulos: true },
    })) as OriginalCarregado | null;
    if (!original) throw new NotFoundException(`Boleto ${cobrancaId} não encontrado.`);

    const buscarSucessor = async (): Promise<Sucessor | null> =>
      (await this.prisma.cobrancaBoleto.findFirst({
        where: { boletoOrigemId: cobrancaId, status: { not: "cancelado" } },
        select: {
          id: true,
          status: true,
          txidEfi: true,
          valor: true,
          valorPrincipal: true,
          valorJuros: true,
          valorMulta: true,
          expireAt: true,
          linkBoleto: true,
        },
      })) as Sucessor | null;

    if (original.status === "pago") {
      throw new ConflictException(`Boleto ${cobrancaId} já foi pago; não pode ser atualizado.`);
    }
    if (original.status === "cancelado") {
      const ativo = await buscarSucessor();
      throw new ConflictException(
        ativo
          ? `Boleto ${cobrancaId} já foi cancelado; o boleto atualizado ativo é o #${ativo.id}.`
          : `Boleto ${cobrancaId} está cancelado; só boleto pendente pode ser atualizado.`,
      );
    }
    if (original.status !== "pendente") {
      throw new ConflictException(
        `Boleto ${cobrancaId} está ${original.status}; só boleto pendente pode ser atualizado.`,
      );
    }
    if (original.athosBaixaStatus === "baixado" || original.athosBaixaStatus === "ja_baixado") {
      throw new ConflictException(`Boleto ${cobrancaId} já foi baixado no Athos; não pode ser atualizado.`);
    }
    if (!original.txidEfi) {
      throw new BadRequestException(`Boleto ${cobrancaId} não tem cobrança na EFI; não pode ser atualizado.`);
    }
    return { original, sucessor: await buscarSucessor() };
  }

  /**
   * Validacao e calculo compartilhados pela previa e pela geracao: data (hoje ou proximo dia util), taxas
   * (padrao configurado sobreposto pelo corpo, com teto), titulos ainda em aberto e inalterados no Athos
   * e pelo menos um titulo vencido ate o novo vencimento.
   */
  private async resolverCalculo(original: OriginalCarregado, input: PreviaBoletoAtualizadoInput) {
    const hoje = this.hoje();
    const permitidos = vencimentosPermitidos(hoje);
    const novoVencimento = input.novoVencimento ?? permitidos[1];
    if (!novoVencimentoPermitido(novoVencimento, hoje)) {
      throw new BadRequestException(
        `Novo vencimento inválido. Só é permitido ${formatarDataBr(permitidos[0])} (hoje) ou ${formatarDataBr(permitidos[1])} (próximo dia útil).`,
      );
    }

    const padrao = await this.encargosConfig.obter();
    const taxaJurosMes = input.taxaJurosMes ?? padrao.taxaJurosMes;
    const multaPercentual = input.multaPercentual ?? padrao.multaPercentual;
    const erroTaxas = validarTaxas({ taxaJurosMes, multaPercentual });
    if (erroTaxas) throw new BadRequestException(erroTaxas);

    const titulosAthos = await this.athosService.buscarTitulosClienteContasReceber(original.idclienteAthos);
    const porId = new Map(titulosAthos.map((t) => [t.idcontareceber, t]));
    const titulosDoBoleto = original.titulos.map((t) => {
      const athos = porId.get(t.idcontareceber);
      if (!athos) {
        throw new BadRequestException(`Título ${t.idcontareceber} não está mais em aberto no Athos.`);
      }
      if (Math.abs(Number(athos.valor) - Number(t.valor)) > 0.01) {
        throw new BadRequestException(`O valor do título ${t.idcontareceber} mudou no Athos; gere um boleto novo.`);
      }
      return athos;
    });

    const calculo = calcularBoletoAtualizado({
      titulos: titulosDoBoleto.map((t) => ({
        idcontareceber: t.idcontareceber,
        principal: Number(t.valor),
        vencimentoOriginal: t.datavencimento,
      })),
      novoVencimento,
      taxaJurosMes,
      multaPercentual,
    });
    if (!calculo.algumTituloVencido) {
      throw new UnprocessableEntityException(
        "Nenhum título vencido até o novo vencimento; não há juros nem multa a cobrar.",
      );
    }

    const mensagem = montarMensagemAtualizacao({
      juros: calculo.juros,
      multa: calculo.multa,
      vencimentosOriginais: calculo.titulos.map((t) => t.vencimentoOriginal),
      novoVencimento,
      taxaJurosMesPosVencimento: padrao.taxaJurosMes,
      multaPercentualPosVencimento: padrao.multaPercentual,
    });
    return { hoje, permitidos, novoVencimento, padrao, taxaJurosMes, multaPercentual, titulosDoBoleto, calculo, mensagem };
  }

  /**
   * Previa (D-06): detalhamento por titulo, totais, datas permitidas, taxas e mensagem. Nunca chama a EFI
   * nem grava nada.
   */
  async previa(cobrancaId: number, input: PreviaBoletoAtualizadoInput): Promise<PreviaBoletoAtualizado> {
    const { original, sucessor } = await this.carregarOriginal(cobrancaId);
    const r = await this.resolverCalculo(original, input);
    const numeroPorId = new Map(r.titulosDoBoleto.map((t) => [t.idcontareceber, t.numerotitulo ?? null]));
    return {
      cobrancaIdOriginal: cobrancaId,
      hoje: r.hoje,
      vencimentosPermitidos: r.permitidos,
      novoVencimento: r.novoVencimento,
      taxaJurosMes: r.taxaJurosMes,
      multaPercentual: r.multaPercentual,
      taxaJurosMesPadrao: r.padrao.taxaJurosMes,
      multaPercentualPadrao: r.padrao.multaPercentual,
      tetos: { taxaJurosMes: TETO_JUROS_MES, multaPercentual: TETO_MULTA_PERCENTUAL },
      titulos: r.calculo.titulos.map((t) => ({
        idcontareceber: t.idcontareceber,
        numerotitulo: numeroPorId.get(t.idcontareceber) ?? null,
        vencimentoOriginal: t.vencimentoOriginal,
        diasAtraso: t.diasAtraso,
        principal: t.principal,
        juros: t.juros,
        multa: t.multa,
        total: t.total,
      })),
      principal: r.calculo.principal,
      juros: r.calculo.juros,
      multa: r.calculo.multa,
      total: r.calculo.total,
      mensagem: r.mensagem,
      sucessorAtivoId: sucessor?.id ?? null,
    };
  }

  async gerar(cobrancaId: number, input: GerarBoletoAtualizadoInput): Promise<GerarBoletoAtualizadoResultado> {
    // Mutex por processo contra duplo clique: a segunda chamada simultanea recebe 409. Risco residual com
    // varias replicas do backend: a ultima barreira e a EFI, que recusa payload identico com 4600210.
    if (this.gerando.has(cobrancaId)) {
      throw new ConflictException(`Já existe uma atualização em andamento para o boleto ${cobrancaId}.`);
    }
    this.gerando.add(cobrancaId);
    try {
      return await this.gerarSerializado(cobrancaId, input);
    } finally {
      this.gerando.delete(cobrancaId);
    }
  }

  /**
   * Cancelamento estrito do original na EFI: so code 200 conta e so entao o status local vira cancelado.
   * Nunca apaga linhas (D-08, D-14).
   */
  private async cancelarOriginalEstrito(
    ctx: Pick<ContextoEmissaoEfi, "cli">,
    headers: Record<string, string>,
    original: { id: number; txidEfi: string | null },
    novoId: number,
  ): Promise<{ cancelamentoOriginal: "ok" | "falhou"; aviso: string | null }> {
    let cancelamentoOriginal: "ok" | "falhou" = "falhou";
    try {
      const cancelResp = await ctx.cli.put(`/v1/charge/${original.txidEfi}/cancel`, {}, { headers });
      if (cancelResp?.data?.code === 200) {
        await this.prisma.cobrancaBoleto.update({ where: { id: original.id }, data: { status: "cancelado" } });
        cancelamentoOriginal = "ok";
      } else {
        this.logger.error(
          `EFI nao confirmou o cancelamento do original=${original.id} (novo=${novoId}): code=${String(cancelResp?.data?.code)}`,
        );
      }
    } catch (e: unknown) {
      this.logger.error(
        `Falha ao cancelar o original=${original.id} na EFI (novo=${novoId}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return {
      cancelamentoOriginal,
      aviso:
        cancelamentoOriginal === "falhou"
          ? `O boleto original #${original.id} continua ativo na EFI. Cancele-o manualmente ou tente atualizar de novo.`
          : null,
    };
  }

  /**
   * Retentativa (D-14): o boleto atualizado ja existe e o original continua pendente (o cancelamento
   * falhou antes). Nao cria outro boleto: so confere o original na EFI e repete o cancelamento estrito.
   */
  private async retentarCancelamento(
    original: OriginalCarregado,
    sucessor: Sucessor,
  ): Promise<GerarBoletoAtualizadoResultado> {
    const situacao = await this.cobrancaService.verificarPagamentoBoleto(original.id);
    if (situacao.status === "pago") {
      throw new ConflictException(
        `O boleto original #${original.id} foi pago e o boleto atualizado #${sucessor.id} continua ativo; verifique pagamento em dobro.`,
      );
    }

    let cancelamentoOriginal: "ok" | "falhou" = "ok";
    let aviso: string | null = null;
    if (situacao.status !== "cancelado") {
      const ctx = await this.cobrancaService.prepararEmissaoEfi(original.idclienteAthos);
      const headers = { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" };
      ({ cancelamentoOriginal, aviso } = await this.cancelarOriginalEstrito(ctx, headers, original, sucessor.id));
    }

    this.logger.log(
      `Boleto atualizado reaproveitado: original=${original.id} novo=${sucessor.id} cancelamentoOriginal=${cancelamentoOriginal}`,
    );
    return {
      cobrancaId: sucessor.id,
      cobrancaIdOriginal: original.id,
      chargeId: Number(sucessor.txidEfi),
      linkBoleto: sucessor.linkBoleto ?? "",
      barcodeLinhaDigitavel: "",
      expireAt: sucessor.expireAt ?? "",
      valor: Number(sucessor.valor),
      principal: Number(sucessor.valorPrincipal ?? 0),
      juros: Number(sucessor.valorJuros ?? 0),
      multa: Number(sucessor.valorMulta ?? 0),
      cancelamentoOriginal,
      aviso,
      reaproveitado: true,
    };
  }

  private async gerarSerializado(
    cobrancaId: number,
    input: GerarBoletoAtualizadoInput,
  ): Promise<GerarBoletoAtualizadoResultado> {
    // a. Original elegivel (404/409/400); com boleto atualizado ja ativo e retentativa, sem nova emissao.
    const { original, sucessor } = await this.carregarOriginal(cobrancaId);
    if (sucessor) return this.retentarCancelamento(original, sucessor);

    // b-e. Data, taxas, titulos do Athos e calculo (mesma validacao da previa).
    const r = await this.resolverCalculo(original, input);
    const { padrao, taxaJurosMes, multaPercentual, titulosDoBoleto, calculo, mensagem } = r;

    // f. Sincroniza com a EFI: pago/cancelado ja resolvidos la nao geram novo boleto.
    const situacao = await this.cobrancaService.verificarPagamentoBoleto(cobrancaId);
    if (situacao.status === "pago" || situacao.status === "cancelado") {
      throw new ConflictException(
        `Boleto ${cobrancaId} está ${situacao.status} na EFI; não é possível gerar boleto atualizado.`,
      );
    }

    // g. Itens: uma linha por nota + juros + multa; a soma precisa bater com o total em centavos.
    const itemMap = await this.cobrancaService.montarItensEfiPorVendaItem(
      titulosDoBoleto.map((t) => ({ idcontareceber: t.idcontareceber, idvenda: t.idvenda, valor: Number(t.valor) })),
      calculo.principal,
    );
    const itens: ItemEfi[] = [...itemMap.values()].map((i) => ({
      name: i.name.slice(0, 255),
      value: i.valueCentavos,
      amount: i.amount,
    }));
    const jurosCent = Math.round(calculo.juros * 100);
    const multaCent = Math.round(calculo.multa * 100);
    if (jurosCent > 0) itens.push({ name: NOME_ITEM_JUROS, value: jurosCent, amount: 1 });
    if (multaCent > 0) itens.push({ name: NOME_ITEM_MULTA, value: multaCent, amount: 1 });
    const somaItens = itens.reduce((s, i) => s + i.value * i.amount, 0);
    if (somaItens !== Math.round(calculo.total * 100)) {
      this.logger.error(
        `Boleto atualizado: soma dos itens (${somaItens}) diverge do total (${Math.round(calculo.total * 100)}) cobrancaId=${cobrancaId}`,
      );
      throw new InternalServerErrorException("Os itens do boleto atualizado não conferem com o total calculado.");
    }

    // h. Emissao na EFI. As taxas pos-vencimento sao as PADRAO configuradas (D-12).
    const ctx = await this.cobrancaService.prepararEmissaoEfi(original.idclienteAthos);
    const textoMensagem = mensagem.join("\n");
    const configuracoes = configuracoesEfi({
      taxaJurosMes: padrao.taxaJurosMes,
      multaPercentual: padrao.multaPercentual,
    });
    const headers = { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" };
    const body: Record<string, unknown> = {
      items: itens,
      payment: {
        banking_billet: {
          expire_at: r.novoVencimento,
          customer: ctx.customer,
          message: textoMensagem,
          ...(Object.keys(configuracoes).length > 0 ? { configurations: configuracoes } : {}),
        },
      },
      metadata: {
        custom_id: `cr-${original.idclienteAthos}-atu${cobrancaId}-${Date.now()}`.slice(0, 50),
        ...(ctx.notificationUrl ? { notification_url: ctx.notificationUrl } : {}),
      },
    };

    let chargeId: number;
    let linkBoleto: string;
    let barcode: string;
    try {
      const resp = await ctx.cli.post("/v1/charge/one-step", body, { headers });
      const item = Array.isArray(resp.data?.data) ? resp.data.data[0] : resp.data?.data;
      chargeId = item?.charge_id as number;
      linkBoleto = (item?.pdf?.charge ?? item?.pdf ?? item?.link) as string;
      barcode = item?.barcode as string;
      if (!chargeId) throw new Error("charge_id não retornado pela EFI");
      if (!linkBoleto) throw new Error("PDF URL não retornada pela EFI (pdf.charge ausente)");
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const detail =
        (e as { response?: { data?: unknown }; message?: string })?.response?.data ??
        (e as { message?: string })?.message;
      this.logger.error(
        `Falha ao criar boleto atualizado na EFI. original=${cobrancaId} status=${status} detalhe=${JSON.stringify(detail)}`,
      );
      if (String((detail as { code?: string | number })?.code) === "4600210") {
        throw new BadRequestException(
          "A EFI bloqueou a emissão: muitas tentativas com os mesmos dados (cliente + valor + vencimento). " +
            "Aguarde alguns minutos e tente novamente.",
        );
      }
      throw new InternalServerErrorException("Não foi possível gerar o boleto atualizado na EFI.");
    }

    // i. Persistir o novo boleto com vinculo ao original e snapshot por titulo (valor = principal).
    const nomeArquivo = `${original.idclienteAthos} - ${ctx.nomeCliente.trim().toUpperCase()} ${r.novoVencimento} atualizado.pdf`;
    let novo: { id: number };
    try {
      novo = await this.prisma.cobrancaBoleto.create({
        data: {
          txidEfi: String(chargeId),
          idclienteAthos: original.idclienteAthos,
          valor: calculo.total,
          status: "pendente",
          linkBoleto,
          pixPayload: null,
          nomeArquivo,
          expireAt: r.novoVencimento,
          boletoOrigemId: cobrancaId,
          valorPrincipal: calculo.principal,
          valorJuros: calculo.juros,
          valorMulta: calculo.multa,
          taxaJurosMesAplicada: taxaJurosMes,
          multaPercentualAplicada: multaPercentual,
          taxaJurosMesPosVencimento: padrao.taxaJurosMes,
          multaPercentualPosVencimento: padrao.multaPercentual,
          mensagemAtualizacao: textoMensagem,
          titulos: {
            createMany: {
              data: calculo.titulos.map((t) => ({
                idcontareceber: t.idcontareceber,
                valor: t.principal,
                juros: t.juros,
                multa: t.multa,
                diasAtraso: t.diasAtraso,
                vencimentoOriginal: t.vencimentoOriginal,
              })),
            },
          },
        },
      });
    } catch (e: unknown) {
      this.logger.error(
        `Boleto atualizado criado na EFI (chargeId=${chargeId}) mas nao gravado. original=${cobrancaId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      // Compensacao: cancela o boleto NOVO na EFI para nao deixar cobranca orfa; o original fica intocado.
      let compensado = false;
      try {
        const r2 = await ctx.cli.put(`/v1/charge/${chargeId}/cancel`, {}, { headers });
        compensado = r2?.data?.code === 200;
        if (!compensado) {
          this.logger.error(
            `Compensacao: EFI nao confirmou o cancelamento do charge novo ${chargeId}: code=${String(r2?.data?.code)}`,
          );
        }
      } catch (e2: unknown) {
        this.logger.error(
          `Compensacao falhou ao cancelar o charge novo ${chargeId}: ${e2 instanceof Error ? e2.message : String(e2)}`,
        );
      }
      throw new InternalServerErrorException(
        compensado
          ? "O boleto foi criado na EFI mas não pôde ser gravado; ele foi cancelado na EFI. Tente novamente."
          : `O boleto foi criado na EFI (charge ${chargeId}) mas não pôde ser gravado, e o cancelamento na EFI também falhou. Cancele o charge ${chargeId} manualmente. O boleto original ${cobrancaId} foi mantido.`,
      );
    }

    // j. Cancelamento estrito do original (so code 200; nunca apaga linhas).
    const { cancelamentoOriginal, aviso } = await this.cancelarOriginalEstrito(ctx, headers, original, novo.id);

    this.logger.log(
      `Boleto atualizado: original=${cobrancaId} novo=${novo.id} chargeId=${chargeId} total=${calculo.total} juros=${calculo.juros} multa=${calculo.multa} cancelamentoOriginal=${cancelamentoOriginal}`,
    );

    // k. Resposta.
    return {
      cobrancaId: novo.id,
      cobrancaIdOriginal: cobrancaId,
      chargeId,
      linkBoleto,
      barcodeLinhaDigitavel: barcode ?? "",
      expireAt: r.novoVencimento,
      valor: calculo.total,
      principal: calculo.principal,
      juros: calculo.juros,
      multa: calculo.multa,
      cancelamentoOriginal,
      aviso,
      reaproveitado: false,
    };
  }
}
