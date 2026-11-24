/**
 * Calculo PURO da venda do Athos a partir de um orcamento (Fase 53).
 *
 * Sem Nest, sem pg, sem I/O. Reproduz os valores observados nas capturas do PDV
 * (.planning/phases/53-*\/53-CAPTURAS.md, secoes 2 e 6): o desconto do cupom e rateado
 * entre os itens (`venda_item.vendaDesconto`), `valorvendaitem` guarda o preco unitario SEM
 * desconto e `venda.valor` e o total liquido. Todo dinheiro e calculado em inteiros (BigInt):
 * quantidade e preco em MILESIMOS, linhas e totais em CENTAVOS.
 */
import {
  centavosParaTexto,
  linhaCentavos,
  milliParaTexto,
  paraCentavos,
  paraMilli,
  percentualMilli,
  percentualTexto,
  ratear,
} from "./athos-orcamento-calc.util";

/** Unica forma de pagamento capturada: a vista (gera `recebimento_cartao` com status AVC). */
export const FORMA_PAGAMENTO_AVISTA = 5;

export type VendaAthosCodigo =
  | "FORMA_PAGAMENTO_NAO_SUPORTADA"
  | "DESCONTO_INVALIDO"
  | "ITEM_INVALIDO"
  | "RECURSO_DESLIGADO"
  | "ORCAMENTO_NAO_ENCONTRADO"
  | "ORCAMENTO_JA_LANCADO"
  | "CAIXA_FECHADO"
  | "PRODUTO_NAO_VENDAVEL"
  | "DESCONTO_ACIMA_DO_MAXIMO"
  | "ORCAMENTO_COM_DESCONTO_NAO_SUPORTADO"
  | "PERMISSAO_NEGADA"
  | "ESQUEMA_DIVERGENTE"
  | "ERRO_BANCO"
  | "CONFIG_INVALIDA"
  | "AMBIENTE_TESTE_HOST_REAL"
  | "ATHOS_INDISPONIVEL"
  | "ERRO_INTERNO";

export class VendaAthosError extends Error {
  constructor(
    public readonly codigo: VendaAthosCodigo,
    message: string,
    /** idvenda ja existente (ORCAMENTO_JA_LANCADO). */
    public readonly idvenda?: number,
  ) {
    super(message);
    this.name = "VendaAthosError";
  }
}

/** Dados fiscais copiados do cadastro do produto no momento da venda (observado, captura 1 e 2). */
export interface FiscalItem {
  origem: string;
  tributacao: string;
  csosn: string;
  cfop: string;
  cest: string;
  /** `venda_item.AliquotaECF` ('18', 'FF'...). */
  aliquotaEcf: string;
}

export interface ItemVendaEntrada {
  idproduto: number;
  /** Quantidade (ate 3 casas). */
  quantidade: number | string;
  /** Preco unitario de venda (ate 3 casas), vindo de `precovendaproduto()`/orcamento. */
  valorUnitario: number | string;
  /** `produto.custorealunitario` (ate 3 casas). */
  custoUnitario: number | string;
  fiscal: FiscalItem;
}

export interface ContextoVenda {
  /** Usuario logado no PDV (`idvendedor` e `idfuncionariousuario`). */
  idvendedor: number;
  /** Caixa aberto do terminal (`caixa_movimento.idcaixamovimento`). */
  idcaixaMovimento: number;
  idterminal: number;
  idorcamento: number;
  /** YYYY-MM-DD (data da venda e vencimento do recebimento de cartao). */
  data: string;
}

export interface MontarVendaEntrada {
  itens: ItemVendaEntrada[];
  /** Desconto total do cupom em R$ (ate 2 casas). Padrao 0. */
  descontoCupom?: number | string;
  idformapagamento: number;
  contexto: ContextoVenda;
}

export interface VendaMontada {
  /** `descontoRS`, `desconto` (%), `valor`: texto decimal. */
  descontoRS: string;
  desconto: string;
  valor: string;
  valorBruto: string;
}

export interface ItemVendaMontado {
  idproduto: number;
  sequenciaitem: number;
  quantidadeitem: string;
  valorcustoitem: string;
  /** Preco unitario SEM desconto. */
  valorvendaitem: string;
  /** Desconto vindo do orcamento: sempre 0 nesta fase (so o rateio do cupom). */
  valordesconto: string;
  /** Rateio do desconto do cupom (R$). */
  vendaDesconto: string;
  vendaValorFinalItem: string;
  fiscal: FiscalItem;
}

export interface VendaMontadaCompleta {
  venda: VendaMontada & { idorcamento: number; idvendedor: number; idcaixaMovimento: number; idterminal: number; data: string };
  itens: ItemVendaMontado[];
  pagamento: { idformapagamento: number; valor: string; valorRecebido: string; idcondicaopagamento: number };
  recebimentoCartao: { valorparcelacartao: string; datavencimento: string; status: "AVC"; taxacobrada: string };
}

function mapear<T>(codigo: VendaAthosCodigo, mensagem: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof VendaAthosError) throw e;
    const detalhe = e instanceof Error ? e.message : String(e);
    throw new VendaAthosError(codigo, `${mensagem} ${detalhe}`);
  }
}

/**
 * Monta os valores a gravar em `venda`, `venda_item`, `forma_pagamento_venda` e `recebimento_cartao`.
 * Recusa forma de pagamento diferente de 5, item invalido e desconto negativo ou maior que o total.
 */
export function montarVenda(entrada: MontarVendaEntrada): VendaMontadaCompleta {
  if (entrada.idformapagamento !== FORMA_PAGAMENTO_AVISTA) {
    throw new VendaAthosError(
      "FORMA_PAGAMENTO_NAO_SUPORTADA",
      `Forma de pagamento ${entrada.idformapagamento} nao suportada: so a forma ${FORMA_PAGAMENTO_AVISTA} (a vista) foi capturada.`,
    );
  }
  if (entrada.itens.length === 0) {
    throw new VendaAthosError("ITEM_INVALIDO", "A venda precisa de ao menos um item.");
  }

  const linhas = entrada.itens.map((item, indice) =>
    mapear("ITEM_INVALIDO", `Item ${indice + 1} invalido:`, () => {
      const qMilli = paraMilli(item.quantidade);
      const vMilli = paraMilli(item.valorUnitario);
      const cMilli = paraMilli(item.custoUnitario);
      if (qMilli <= 0n) throw new VendaAthosError("ITEM_INVALIDO", `Item ${indice + 1} com quantidade zerada.`);
      const brutoC = linhaCentavos(qMilli, vMilli);
      if (brutoC <= 0n) throw new VendaAthosError("ITEM_INVALIDO", `Item ${indice + 1} com total zerado.`);
      return { item, qMilli, vMilli, cMilli, brutoC };
    }),
  );

  const descontoC = mapear("DESCONTO_INVALIDO", "Desconto invalido:", () => paraCentavos(entrada.descontoCupom ?? 0));
  const brutoTotalC = linhas.reduce((acc, l) => acc + l.brutoC, 0n);
  if (descontoC > brutoTotalC) {
    throw new VendaAthosError(
      "DESCONTO_INVALIDO",
      `Desconto de ${centavosParaTexto(descontoC)} maior que o total dos itens (${centavosParaTexto(brutoTotalC)}).`,
    );
  }

  const cotas = mapear("DESCONTO_INVALIDO", "Nao foi possivel ratear o desconto:", () =>
    ratear(
      descontoC,
      linhas.map((l) => l.brutoC),
    ),
  );

  const itens: ItemVendaMontado[] = linhas.map((l, i) => ({
    idproduto: l.item.idproduto,
    sequenciaitem: i + 1,
    quantidadeitem: milliParaTexto(l.qMilli),
    valorcustoitem: milliParaTexto(l.cMilli),
    valorvendaitem: milliParaTexto(l.vMilli),
    valordesconto: "0.00",
    vendaDesconto: centavosParaTexto(cotas[i]),
    vendaValorFinalItem: centavosParaTexto(l.brutoC - cotas[i]),
    fiscal: l.item.fiscal,
  }));

  const liquidoC = brutoTotalC - descontoC;
  const ctx = entrada.contexto;

  return {
    venda: {
      descontoRS: centavosParaTexto(descontoC),
      desconto: percentualTexto(percentualMilli(descontoC, brutoTotalC)),
      valor: centavosParaTexto(liquidoC),
      valorBruto: centavosParaTexto(brutoTotalC),
      idorcamento: ctx.idorcamento,
      idvendedor: ctx.idvendedor,
      idcaixaMovimento: ctx.idcaixaMovimento,
      idterminal: ctx.idterminal,
      data: ctx.data,
    },
    itens,
    pagamento: {
      idformapagamento: FORMA_PAGAMENTO_AVISTA,
      valor: centavosParaTexto(liquidoC),
      valorRecebido: centavosParaTexto(liquidoC),
      idcondicaopagamento: 0,
    },
    recebimentoCartao: {
      valorparcelacartao: centavosParaTexto(liquidoC),
      datavencimento: ctx.data,
      status: "AVC",
      taxacobrada: "0.00",
    },
  };
}
