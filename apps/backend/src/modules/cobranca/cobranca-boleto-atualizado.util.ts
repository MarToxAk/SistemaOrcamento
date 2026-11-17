/**
 * Regras puras do boleto atualizado com juros e multa (Fase 50).
 *
 * Sem imports de Nest/Prisma: so aritmetica de datas YYYY-MM-DD, calculo em centavos inteiros e
 * montagem do texto informativo. O calculo por titulo reaproveita `calcularEncargosTitulo` (a mesma
 * aritmetica da baixa no Athos), com carencia 0.
 */
import { calcularEncargosTitulo } from "../integrations/athos/athos-baixa-encargos.util";
import { somarDias } from "./cobranca-aviso-vencimento.util";

export const JUROS_MES_PADRAO = 0.99; // % a.m. (D-04/D-07)
export const MULTA_PERCENTUAL_PADRAO = 2; // % (D-05/D-07)
export const TETO_JUROS_MES = 1; // % a.m. (D-16)
export const TETO_MULTA_PERCENTUAL = 2; // % (D-16)
export const NOME_ITEM_JUROS = "Juros de mora"; // D-11
export const NOME_ITEM_MULTA = "Multa por atraso"; // D-11
export const MENSAGEM_EFI_MAX_LINHAS = 4;
export const MENSAGEM_EFI_MAX_CARACTERES_LINHA = 100;

const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true somente para YYYY-MM-DD que existe no calendario (ida e volta em UTC). */
function dataIsoValida(dataISO: unknown): dataISO is string {
  if (typeof dataISO !== "string") return false;
  const m = DATA_RE.exec(dataISO);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === dataISO;
}

/** D-02: proximo dia de segunda a sexta depois de `dataISO` (feriados nao sao considerados). */
export function proximoDiaUtil(dataISO: string): string {
  let d = somarDias(dataISO, 1);
  for (;;) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = domingo, 6 = sabado
    if (dow >= 1 && dow <= 5) return d;
    d = somarDias(d, 1);
  }
}

/** D-01: unicas duas datas aceitas como novo vencimento. */
export function vencimentosPermitidos(hoje: string): [string, string] {
  return [hoje, proximoDiaUtil(hoje)];
}

/** Data valida e igual a uma das duas datas permitidas; nunca lanca para entrada invalida. */
export function novoVencimentoPermitido(novo: string, hoje: string): boolean {
  if (!dataIsoValida(novo) || !dataIsoValida(hoje)) return false;
  return vencimentosPermitidos(hoje).includes(novo);
}

/** Valor em reais -> "1.022,64" (trabalha em centavos inteiros). */
export function formatarReais(valor: number): string {
  const centavosTotal = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(centavosTotal / 100);
  const centavos = centavosTotal % 100;
  const milhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sinal = valor < 0 && centavosTotal > 0 ? "-" : "";
  return `${sinal}${milhar},${String(centavos).padStart(2, "0")}`;
}

/** Percentual sem zeros a direita: 0.99 -> "0,99"; 2 -> "2"; 1.5 -> "1,5". */
export function formatarPercentual(valor: number): string {
  return String(Number(valor.toFixed(4))).replace(".", ",");
}

/** "2026-11-10" -> "10/11/2026". */
export function formatarDataBr(iso: string): string {
  const m = DATA_RE.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Mensagem pt-BR de recusa, ou null quando as taxas sao aceitaveis (D-16). */
export function validarTaxas(t: { taxaJurosMes: number; multaPercentual: number }): string | null {
  if (
    !Number.isFinite(t.taxaJurosMes) ||
    !Number.isFinite(t.multaPercentual) ||
    t.taxaJurosMes < 0 ||
    t.multaPercentual < 0
  ) {
    return "Juros e multa devem ser números maiores ou iguais a zero.";
  }
  if (t.taxaJurosMes > TETO_JUROS_MES) {
    return `Juros acima do limite de ${formatarPercentual(TETO_JUROS_MES)}% ao mês.`;
  }
  if (t.multaPercentual > TETO_MULTA_PERCENTUAL) {
    return `Multa acima do limite de ${formatarPercentual(TETO_MULTA_PERCENTUAL)}%.`;
  }
  return null;
}

export interface TituloParaAtualizar {
  idcontareceber: number;
  principal: number;
  vencimentoOriginal: string;
}

export interface TituloAtualizado extends TituloParaAtualizar {
  diasAtraso: number;
  juros: number;
  multa: number;
  total: number;
}

export interface CalculoBoletoAtualizado {
  novoVencimento: string;
  taxaJurosMes: number;
  multaPercentual: number;
  titulos: TituloAtualizado[];
  principal: number;
  juros: number;
  multa: number;
  total: number; // somados em centavos inteiros
  algumTituloVencido: boolean;
}

function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Juros pro rata e multa por titulo, desde o vencimento original de cada titulo ate o novo vencimento
 * (D-03, D-04, D-05, D-13). Propaga o erro de `calcularEncargosTitulo` para datas invalidas.
 */
export function calcularBoletoAtualizado(input: {
  titulos: TituloParaAtualizar[];
  novoVencimento: string;
  taxaJurosMes: number;
  multaPercentual: number;
}): CalculoBoletoAtualizado {
  const { novoVencimento, taxaJurosMes, multaPercentual } = input;
  let principalCent = 0;
  let jurosCent = 0;
  let multaCent = 0;
  const titulos: TituloAtualizado[] = input.titulos.map((t) => {
    // Titulo de desconto/abatimento (principal <= 0) nao gera encargos.
    const base = t.principal > 0 ? t.principal : 0;
    const e = calcularEncargosTitulo({
      principal: base,
      vencimento: t.vencimentoOriginal,
      dataPagamento: novoVencimento,
      conf: { taxaJurosMes, carenciaDias: 0, percentualMulta: multaPercentual },
    });
    const principalC = emCentavos(t.principal);
    const jurosC = emCentavos(e.juros);
    const multaC = emCentavos(e.multa);
    principalCent += principalC;
    jurosCent += jurosC;
    multaCent += multaC;
    return {
      idcontareceber: t.idcontareceber,
      principal: t.principal,
      vencimentoOriginal: t.vencimentoOriginal,
      diasAtraso: e.atraso,
      juros: jurosC / 100,
      multa: multaC / 100,
      total: (principalC + jurosC + multaC) / 100,
    };
  });
  return {
    novoVencimento,
    taxaJurosMes,
    multaPercentual,
    titulos,
    principal: principalCent / 100,
    juros: jurosCent / 100,
    multa: multaCent / 100,
    total: (principalCent + jurosCent + multaCent) / 100,
    algumTituloVencido: titulos.some((t) => t.diasAtraso > 0),
  };
}

/**
 * `configurations` do boleto EFI (D-12): fine em centesimos de % (200 = 2%), interest em milesimos de %
 * ao dia (33 = 0,033% ao dia, arredondado). Chave omitida quando o valor e 0.
 */
export function configuracoesEfi(t: { taxaJurosMes: number; multaPercentual: number }): {
  fine?: number;
  interest?: number;
} {
  const fine = Math.round(t.multaPercentual * 100);
  const interest = Math.round((t.taxaJurosMes * 1000) / 30);
  return {
    ...(fine > 0 ? { fine } : {}),
    ...(interest > 0 ? { interest } : {}),
  };
}

/** Quebra `texto` em linhas de ate `max` caracteres, por palavra. */
function quebrarPorPalavra(texto: string, max: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    if (atual === "") atual = palavra;
    else if (atual.length + 1 + palavra.length <= max) atual = `${atual} ${palavra}`;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual !== "") linhas.push(atual);
  return linhas;
}

/**
 * Texto informativo do boleto atualizado (campo `message` da EFI e e-mail, D-12). Linhas ASCII, cada
 * uma com no maximo 100 caracteres e no maximo 4 linhas.
 */
export function montarMensagemAtualizacao(input: {
  juros: number;
  multa: number;
  vencimentosOriginais: string[];
  novoVencimento: string;
  taxaJurosMesPosVencimento: number;
  multaPercentualPosVencimento: number;
}): string[] {
  const datas = [...new Set(input.vencimentosOriginais)].sort();
  const referente =
    datas.length <= 1
      ? `referentes ao vencimento original ${formatarDataBr(datas[0] ?? input.novoVencimento)}.`
      : `referentes aos vencimentos originais de ${formatarDataBr(datas[0])} a ${formatarDataBr(datas[datas.length - 1])}.`;
  const juros = formatarPercentual(input.taxaJurosMesPosVencimento);
  const multa = formatarPercentual(input.multaPercentualPosVencimento);
  const linhas = [
    `Valor atualizado com juros de R$ ${formatarReais(input.juros)} e multa de R$ ${formatarReais(input.multa)}`,
    referente,
    `Em caso de novo atraso apos ${formatarDataBr(input.novoVencimento)}, incidirao juros de ${juros}% a.m.`,
    `e multa de ${multa}% sobre o valor atualizado.`,
  ];
  if (linhas.every((l) => l.length <= MENSAGEM_EFI_MAX_CARACTERES_LINHA)) return linhas;

  // Algum valor muito grande estourou a linha: refaz o fluxo por palavra e, se preciso, encurta o texto fixo.
  let fluxo = quebrarPorPalavra(linhas.join(" "), MENSAGEM_EFI_MAX_CARACTERES_LINHA);
  if (fluxo.length > MENSAGEM_EFI_MAX_LINHAS) {
    const curto = [linhas[0], referente, `Em novo atraso apos ${formatarDataBr(input.novoVencimento)}: juros de ${juros}% a.m. e multa de ${multa}%.`];
    fluxo = quebrarPorPalavra(curto.join(" "), MENSAGEM_EFI_MAX_CARACTERES_LINHA);
  }
  return fluxo.slice(0, MENSAGEM_EFI_MAX_LINHAS);
}
