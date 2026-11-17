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
  validarTaxas,
  vencimentosPermitidos,
} from "./cobranca-boleto-atualizado.util";
import { CobrancaEncargosConfigService } from "./cobranca-encargos-config.service";
import { CobrancaService } from "./cobranca.service";

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

  async gerar(cobrancaId: number, input: GerarBoletoAtualizadoInput): Promise<GerarBoletoAtualizadoResultado> {
    // a. Boleto original: precisa existir e estar pendente.
    const original = await this.prisma.cobrancaBoleto.findUnique({
      where: { id: cobrancaId },
      include: { titulos: true },
    });
    if (!original) throw new NotFoundException(`Boleto ${cobrancaId} não encontrado.`);
    if (original.status !== "pendente") {
      throw new ConflictException(
        `Boleto ${cobrancaId} está ${original.status}; só boleto pendente pode ser atualizado.`,
      );
    }

    // b. Novo vencimento: hoje (Sao Paulo) ou o proximo dia util (D-01).
    const hoje = this.hoje();
    if (!novoVencimentoPermitido(input.novoVencimento, hoje)) {
      const [d1, d2] = vencimentosPermitidos(hoje);
      throw new BadRequestException(
        `Novo vencimento inválido. Só é permitido ${formatarDataBr(d1)} (hoje) ou ${formatarDataBr(d2)} (próximo dia útil).`,
      );
    }

    // c. Taxas: padrao configurado, sobreposto pelo corpo (D-06); teto validado de novo alem do DTO (D-16).
    const padrao = await this.encargosConfig.obter();
    const taxaJurosMes = input.taxaJurosMes ?? padrao.taxaJurosMes;
    const multaPercentual = input.multaPercentual ?? padrao.multaPercentual;
    const erroTaxas = validarTaxas({ taxaJurosMes, multaPercentual });
    if (erroTaxas) throw new BadRequestException(erroTaxas);

    // d. Titulos no Athos (so em aberto): principal e vencimento original vem de la (D-13).
    const titulosAthos = await this.athosService.buscarTitulosClienteContasReceber(original.idclienteAthos);
    const porId = new Map(titulosAthos.map((t) => [t.idcontareceber, t]));
    const titulosDoBoleto = original.titulos.map((t) => {
      const athos = porId.get(t.idcontareceber);
      if (!athos) {
        throw new BadRequestException(`Título ${t.idcontareceber} não está mais em aberto no Athos.`);
      }
      return athos;
    });

    // e. Calculo por titulo; sem titulo vencido nao ha o que cobrar.
    const calculo = calcularBoletoAtualizado({
      titulos: titulosDoBoleto.map((t) => ({
        idcontareceber: t.idcontareceber,
        principal: Number(t.valor),
        vencimentoOriginal: t.datavencimento,
      })),
      novoVencimento: input.novoVencimento,
      taxaJurosMes,
      multaPercentual,
    });
    if (!calculo.algumTituloVencido) {
      throw new UnprocessableEntityException(
        "Nenhum título vencido até o novo vencimento; não há juros nem multa a cobrar.",
      );
    }

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
    const linhasMensagem = montarMensagemAtualizacao({
      juros: calculo.juros,
      multa: calculo.multa,
      vencimentosOriginais: calculo.titulos.map((t) => t.vencimentoOriginal),
      novoVencimento: input.novoVencimento,
      taxaJurosMesPosVencimento: padrao.taxaJurosMes,
      multaPercentualPosVencimento: padrao.multaPercentual,
    });
    const mensagem = linhasMensagem.join("\n");
    const configuracoes = configuracoesEfi({
      taxaJurosMes: padrao.taxaJurosMes,
      multaPercentual: padrao.multaPercentual,
    });
    const headers = { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" };
    const body: Record<string, unknown> = {
      items: itens,
      payment: {
        banking_billet: {
          expire_at: input.novoVencimento,
          customer: ctx.customer,
          message: mensagem,
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
    const nomeArquivo = `${original.idclienteAthos} - ${ctx.nomeCliente.trim().toUpperCase()} ${input.novoVencimento} atualizado.pdf`;
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
          expireAt: input.novoVencimento,
          boletoOrigemId: cobrancaId,
          valorPrincipal: calculo.principal,
          valorJuros: calculo.juros,
          valorMulta: calculo.multa,
          taxaJurosMesAplicada: taxaJurosMes,
          multaPercentualAplicada: multaPercentual,
          taxaJurosMesPosVencimento: padrao.taxaJurosMes,
          multaPercentualPosVencimento: padrao.multaPercentual,
          mensagemAtualizacao: mensagem,
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
      throw new InternalServerErrorException(
        `O boleto foi gerado na EFI (charge ${chargeId}) mas não pôde ser gravado. Original ${cobrancaId} mantido.`,
      );
    }

    // j. Cancelamento estrito do original: so code 200 conta; nunca apaga linhas (D-08, D-14).
    let cancelamentoOriginal: "ok" | "falhou" = "falhou";
    let aviso: string | null = null;
    try {
      const cancelResp = await ctx.cli.put(`/v1/charge/${original.txidEfi}/cancel`, {}, { headers });
      if (cancelResp?.data?.code === 200) {
        await this.prisma.cobrancaBoleto.update({ where: { id: cobrancaId }, data: { status: "cancelado" } });
        cancelamentoOriginal = "ok";
      } else {
        this.logger.error(
          `EFI nao confirmou o cancelamento do original=${cobrancaId} (novo=${novo.id}): code=${String(cancelResp?.data?.code)}`,
        );
      }
    } catch (e: unknown) {
      this.logger.error(
        `Falha ao cancelar o original=${cobrancaId} na EFI (novo=${novo.id}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (cancelamentoOriginal === "falhou") {
      aviso = `O boleto original #${cobrancaId} continua ativo na EFI. Cancele-o manualmente ou tente atualizar de novo.`;
    }

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
      expireAt: input.novoVencimento,
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
