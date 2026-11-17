/**
 * Encargos de atraso da baixa de contas a receber no Athos (Fase 43 / plano 43-02, D-02).
 *
 * Funcoes PURAS (sem banco, sem rede) e sem import do servico de baixa (evita ciclo).
 * Aritmetica em centavos inteiros: nunca soma de floats.
 *
 * ------------------------------------------------------------------------------------
 * STATUS DE VALIDACAO DA FORMULA (leia antes de alterar)
 * ------------------------------------------------------------------------------------
 * O usuario proibiu consultar o Athos real; portanto a introspeccao (Q4 conf_financeiro,
 * Q5 casos dourados) NAO foi coletada. A formula abaixo foi derivada de apenas 2 casos
 * capturados do Athos, ambos com 10 dias de atraso:
 *   principal 457,00  -> juros 1,51  multa 9,14  valorpago 467,65
 *   principal 252,93  -> juros 0,83  multa 5,06  valorpago 258,82
 * Variante adotada (unica, entre as testadas, que reproduz AMBOS centavo a centavo):
 *   - dias cobraveis = atraso inteiro (dataPagamento - vencimento), sem subtrair carencia;
 *   - taxa diaria (% ao dia) = taxajurosmes / 30 arredondada a 3 casas (milesimos de %);
 *   - juros = principal * taxa diaria * dias, arredondado meio para cima em centavos;
 *   - multa = principal * percentualMulta%, arredondada meio para cima em centavos, sempre
 *     que ha atraso fora da carencia.
 * Descartadas pelos 2 casos: taxa diaria sem arredondar (1,52 / 0,84), truncamento (1,50),
 * arredondamento para cima (0,84), base 365/12 e base 30,4 (1,50).
 *
 * LIMITES CONHECIDOS (pendentes de dados reais do Athos):
 *   1. Com 2 pontos a formula esta SUB-DETERMINADA: taxajurosmes=1 (ou 0,99) e carencia=0
 *      foram ASSUMIDOS; o valor real vem de conf_financeiro em tempo de execucao.
 *   2. A unidade de taxajurosmes (1 = 1% ou 0,01 = 1%) e presumida em PERCENTUAL.
 *   3. A coluna do percentual de multa em conf_financeiro e desconhecida: usa-se
 *      percentualMulta configuravel (env ATHOS_BAIXA_MULTA_PERCENTUAL, padrao 2).
 *   4. Atraso positivo ate a carencia (0 < atraso <= carenciaDias) nunca foi observado:
 *      NAO se calcula; o chamador deve rejeitar (ATRASO_REQUER_ENCARGOS, baixa manual).
 * ------------------------------------------------------------------------------------
 */

export interface ConfFinanceiroEncargos {
  /** % ao mes (1 = 1%) */
  taxaJurosMes: number;
  /** dias de carencia (juros so a partir de atraso > carencia) */
  carenciaDias: number;
  /** % de multa sobre o principal (2 = 2%) */
  percentualMulta: number;
}

/**
 * Identificadores FIXOS das colunas de conf_financeiro usadas em SQL (nunca vindos de entrada
 * externa). O percentual de multa NAO consta aqui: a coluna e desconhecida (ver cabecalho).
 */
export const CONF_FINANCEIRO_COLUNAS = {
  taxaJurosMes: "taxajurosmes",
  carenciaDias: "carenciadiascobrancajuros",
} as const;

export const PERCENTUAL_MULTA_PADRAO = 2; // % (multa ~ 2% do principal observada no Athos)
export const TOLERANCIA_PAGAMENTO_PADRAO = 0.1; // R$, comparacao com o valor pago da EFI

const MS_DIA = 86_400_000;

function utcDeIso(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Dias corridos entre duas datas YYYY-MM-DD (UTC); negativo se fim anterior ao inicio. */
export function diasEntre(inicioISO: string, fimISO: string): number {
  return Math.round((utcDeIso(fimISO) - utcDeIso(inicioISO)) / MS_DIA);
}

function paraCentavos(valor: number): number {
  return Math.round(valor * 100);
}

function deCentavos(centavos: number): number {
  return centavos / 100;
}

function confValida(conf: ConfFinanceiroEncargos): boolean {
  return (
    Number.isFinite(conf?.taxaJurosMes) &&
    conf.taxaJurosMes >= 0 &&
    Number.isFinite(conf?.carenciaDias) &&
    conf.carenciaDias >= 0 &&
    Number.isFinite(conf?.percentualMulta) &&
    conf.percentualMulta >= 0
  );
}

interface EncargosCentavos {
  atraso: number;
  jurosCentavos: number;
  multaCentavos: number;
  dentroCarencia: boolean;
}

function encargosEmCentavos(input: {
  principalCentavos: number;
  vencimento: string;
  dataPagamento: string;
  conf: ConfFinanceiroEncargos;
}): EncargosCentavos {
  const { principalCentavos, vencimento, dataPagamento, conf } = input;
  if (!confValida(conf)) throw new Error("Configuracao de encargos invalida.");
  const atraso = diasEntre(vencimento, dataPagamento);
  if (!Number.isFinite(atraso)) throw new Error("Data invalida no calculo de encargos.");
  if (atraso <= 0) return { atraso: 0, jurosCentavos: 0, multaCentavos: 0, dentroCarencia: false };
  if (atraso <= conf.carenciaDias) {
    return { atraso, jurosCentavos: 0, multaCentavos: 0, dentroCarencia: true };
  }
  // taxa diaria em milesimos de % (1% ao mes -> 33 = 0,033% ao dia)
  const taxaDiariaMilesimos = Math.round((conf.taxaJurosMes * 1000) / 30);
  // principalCentavos * (milesimos / 1000 / 100) * dias, meio para cima, em inteiros
  const jurosCentavos = Math.floor((principalCentavos * taxaDiariaMilesimos * atraso + 50_000) / 100_000);
  // multa: percentual em pontos-base (2% -> 200); principal * bp / 10000, meio para cima
  const multaBp = Math.round(conf.percentualMulta * 100);
  const multaCentavos = Math.floor((principalCentavos * multaBp + 5_000) / 10_000);
  return { atraso, jurosCentavos, multaCentavos, dentroCarencia: false };
}

/**
 * Encargos de um titulo. atraso <= 0 -> tudo zero. `dentroCarencia` = true indica a regiao NAO
 * validada (0 < atraso <= carencia): os valores vem zerados e NAO devem ser gravados.
 * Lanca Error para configuracao ou datas invalidas.
 */
export function calcularEncargosTitulo(input: {
  principal: number;
  vencimento: string;
  dataPagamento: string;
  conf: ConfFinanceiroEncargos;
}): { atraso: number; juros: number; multa: number; dentroCarencia: boolean } {
  const e = encargosEmCentavos({
    principalCentavos: paraCentavos(input.principal),
    vencimento: input.vencimento,
    dataPagamento: input.dataPagamento,
    conf: input.conf,
  });
  return {
    atraso: e.atraso,
    juros: deCentavos(e.jurosCentavos),
    multa: deCentavos(e.multaCentavos),
    dentroCarencia: e.dentroCarencia,
  };
}

export type ModoValorBaixa = "com_encargos" | "nominal";

export interface TituloValorBaixa {
  idcontareceber: number;
  principal: number;
  juros: number;
  multa: number;
  atraso: number;
  valorPago: number;
}

export type DecisaoValoresBaixa =
  | { ok: true; modo: ModoValorBaixa; titulos: TituloValorBaixa[]; valorTotal: number }
  | { ok: false; codigo: "VALOR_INCOMPATIVEL" | "ATRASO_REQUER_ENCARGOS"; mensagem: string };

function brl(centavos: number): string {
  const abs = Math.abs(centavos);
  return `${centavos < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Decide o valor efetivamente gravado (D-02):
 *  - EFI sem valor: principal + encargos calculados (com_encargos);
 *  - EFI ~ principal + encargos (tolerancia): com_encargos (preferido quando ambos coincidem);
 *  - EFI ~ soma dos principais com algum atraso (pagou o valor nominal): nominal, juros e multa
 *    zerados, atraso preenchido, valorPago = principal (caixa bate com o dinheiro recebido);
 *  - senao: VALOR_INCOMPATIVEL (nada deve ser escrito).
 * Atraso dentro da carencia (regiao nao validada) -> ATRASO_REQUER_ENCARGOS.
 */
export function decidirValoresBaixa(input: {
  titulos: Array<{ idcontareceber: number; principal: number; vencimento: string }>;
  dataPagamento: string;
  conf: ConfFinanceiroEncargos;
  valorPagoEfi: number | null;
  tolerancia?: number;
}): DecisaoValoresBaixa {
  const calculados = input.titulos.map((t) => {
    const principalCentavos = paraCentavos(t.principal);
    const e = encargosEmCentavos({
      principalCentavos,
      vencimento: t.vencimento,
      dataPagamento: input.dataPagamento,
      conf: input.conf,
    });
    return { id: t.idcontareceber, principalCentavos, ...e };
  });

  const emCarencia = calculados.find((c) => c.dentroCarencia);
  if (emCarencia) {
    return {
      ok: false,
      codigo: "ATRASO_REQUER_ENCARGOS",
      mensagem:
        `Titulo ${emCarencia.id} com atraso de ${emCarencia.atraso} dia(s) dentro da carencia: ` +
        "encargos nao validados contra o Athos; baixar manualmente.",
    };
  }

  const somaPrincipal = calculados.reduce((s, c) => s + c.principalCentavos, 0);
  const somaComEncargos = calculados.reduce((s, c) => s + c.principalCentavos + c.jurosCentavos + c.multaCentavos, 0);
  const algumAtraso = calculados.some((c) => c.atraso > 0);

  const comEncargos = (): DecisaoValoresBaixa => ({
    ok: true,
    modo: "com_encargos",
    valorTotal: deCentavos(somaComEncargos),
    titulos: calculados.map((c) => ({
      idcontareceber: c.id,
      principal: deCentavos(c.principalCentavos),
      juros: deCentavos(c.jurosCentavos),
      multa: deCentavos(c.multaCentavos),
      atraso: c.atraso,
      valorPago: deCentavos(c.principalCentavos + c.jurosCentavos + c.multaCentavos),
    })),
  });

  if (input.valorPagoEfi === null || input.valorPagoEfi === undefined) return comEncargos();

  const efiCentavos = paraCentavos(input.valorPagoEfi);
  const tol = paraCentavos(input.tolerancia ?? TOLERANCIA_PAGAMENTO_PADRAO);

  if (Math.abs(efiCentavos - somaComEncargos) <= tol) return comEncargos();

  if (algumAtraso && Math.abs(efiCentavos - somaPrincipal) <= tol) {
    return {
      ok: true,
      modo: "nominal",
      valorTotal: deCentavos(somaPrincipal),
      titulos: calculados.map((c) => ({
        idcontareceber: c.id,
        principal: deCentavos(c.principalCentavos),
        juros: 0,
        multa: 0,
        atraso: c.atraso,
        valorPago: deCentavos(c.principalCentavos),
      })),
    };
  }

  return {
    ok: false,
    codigo: "VALOR_INCOMPATIVEL",
    mensagem:
      `Valor pago informado pela EFI (${brl(efiCentavos)}) nao confere com principal mais encargos ` +
      `(${brl(somaComEncargos)}) nem com o principal (${brl(somaPrincipal)}).`,
  };
}

// ---------------------------------------------------------------------------
// Fase 50 / plano 50-02 (D-09, D-12): baixa do boleto atualizado com encargos FIXOS
// ---------------------------------------------------------------------------

/** Titulo cujo juros/multa/atraso ja foram cobrados no boleto atualizado (snapshot de 50-01). */
export interface TituloEncargosFixos {
  idcontareceber: number;
  principal: number;
  juros: number;
  multa: number;
  atraso: number;
}

/** Encargos que a EFI cobra se o boleto atualizado for pago depois do novo vencimento (D-12). */
export interface PosVencimentoBoleto {
  /** novo vencimento do boleto atualizado (YYYY-MM-DD) */
  vencimento: string;
  /** % ao mes (0.99 = 0,99%) */
  taxaJurosMes: number;
  /** % de multa (2 = 2%) */
  multaPercentual: number;
}

function posVencimentoValido(p: PosVencimentoBoleto | null | undefined): p is PosVencimentoBoleto {
  return (
    !!p &&
    Number.isFinite(utcDeIso(p.vencimento)) &&
    Number.isFinite(p.taxaJurosMes) &&
    p.taxaJurosMes >= 0 &&
    Number.isFinite(p.multaPercentual) &&
    p.multaPercentual >= 0
  );
}

/** Reparte `total` proporcionalmente a `pesos`; o ultimo recebe o resto (soma exata). */
function ratear(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  const partes: number[] = [];
  let acumulado = 0;
  pesos.forEach((peso, i) => {
    if (i === pesos.length - 1) {
      partes.push(total - acumulado);
    } else {
      const parte = soma > 0 ? Math.round((total * peso) / soma) : 0;
      partes.push(parte);
      acumulado += parte;
    }
  });
  return partes;
}

/**
 * Decide os valores da baixa quando juros e multa JA foram cobrados no boleto (snapshot), sem consultar
 * conf_financeiro do Athos (que usa taxa/carencia proprias e recusaria o valor).
 *  1. EFI sem valor: snapshot;
 *  2. EFI ~ principal + juros + multa do snapshot (tolerancia): snapshot;
 *  3. pago DEPOIS do novo vencimento com valor acima do snapshot: excedente aceito ate o teto dos
 *     encargos pos-vencimento (multa + juros diarios + tolerancia), somado como multa (ate a multa
 *     teorica) e juros, rateado pelo valor atualizado de cada titulo; atraso += dias apos o vencimento;
 *  4. qualquer outro caso: VALOR_INCOMPATIVEL (nada deve ser escrito). Nunca lanca.
 */
export function decidirValoresBaixaFixos(input: {
  titulos: TituloEncargosFixos[];
  dataPagamento: string;
  valorPagoEfi: number | null;
  posVencimento?: PosVencimentoBoleto | null;
  tolerancia?: number;
}): DecisaoValoresBaixa {
  const base = input.titulos.map((t) => ({
    id: t.idcontareceber,
    principal: paraCentavos(t.principal),
    juros: paraCentavos(t.juros),
    multa: paraCentavos(t.multa),
    atraso: t.atraso,
  }));
  const baseItem = (b: (typeof base)[number]): number => b.principal + b.juros + b.multa;
  const somaBase = base.reduce((s, b) => s + baseItem(b), 0);

  const snapshot = (): DecisaoValoresBaixa => ({
    ok: true,
    modo: "com_encargos",
    valorTotal: deCentavos(somaBase),
    titulos: base.map((b) => ({
      idcontareceber: b.id,
      principal: deCentavos(b.principal),
      juros: deCentavos(b.juros),
      multa: deCentavos(b.multa),
      atraso: b.atraso,
      valorPago: deCentavos(baseItem(b)),
    })),
  });

  if (input.valorPagoEfi === null || input.valorPagoEfi === undefined) return snapshot();

  const efi = paraCentavos(input.valorPagoEfi);
  const tol = paraCentavos(input.tolerancia ?? TOLERANCIA_PAGAMENTO_PADRAO);
  if (Math.abs(efi - somaBase) <= tol) return snapshot();

  const pos = input.posVencimento;
  let tetoTexto = "";
  if (posVencimentoValido(pos) && efi > somaBase) {
    const dias = diasEntre(pos.vencimento, input.dataPagamento);
    if (Number.isFinite(dias) && dias > 0) {
      const multaMax = Math.floor((somaBase * Math.round(pos.multaPercentual * 100) + 5_000) / 10_000);
      const taxaDiariaMilesimos = Math.round((pos.taxaJurosMes * 1000) / 30);
      const jurosMax = Math.floor((somaBase * taxaDiariaMilesimos * dias + 50_000) / 100_000);
      const excedente = efi - somaBase;
      if (excedente <= multaMax + jurosMax + tol) {
        const multaExtra = Math.min(excedente, multaMax);
        const jurosExtra = excedente - multaExtra;
        const pesos = base.map(baseItem);
        const multas = ratear(multaExtra, pesos);
        const juros = ratear(jurosExtra, pesos);
        const titulos = base.map((b, i) => {
          const j = b.juros + juros[i];
          const m = b.multa + multas[i];
          return {
            idcontareceber: b.id,
            principal: deCentavos(b.principal),
            juros: deCentavos(j),
            multa: deCentavos(m),
            atraso: b.atraso + dias,
            valorPago: deCentavos(b.principal + j + m),
          };
        });
        return { ok: true, modo: "com_encargos", titulos, valorTotal: deCentavos(efi) };
      }
      tetoTexto = ` nem com o teto pos-vencimento (${brl(somaBase + multaMax + jurosMax)})`;
    }
  }

  return {
    ok: false,
    codigo: "VALOR_INCOMPATIVEL",
    mensagem:
      `Valor pago informado pela EFI (${brl(efi)}) nao confere com o valor do boleto atualizado ` +
      `(${brl(somaBase)})${tetoTexto}.`,
  };
}
