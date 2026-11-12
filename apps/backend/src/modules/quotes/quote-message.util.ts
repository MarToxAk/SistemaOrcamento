// Fase 46 (plano 46-02): formatacao pura dos valores da mensagem de orcamento enviada ao cliente.
// Sem Nest, sem I/O: so recebe numeros e devolve texto.

export type ItemMensagem = {
  descricao: string;
  quantidade: number;
  total: number;
  desconto?: number;
};

export type ResumoValores = {
  subtotal: number;
  desconto: number;
  acrescimo: number;
  total: number;
  temAjuste: boolean;
  divergente: boolean;
};

const LIMITE_DESCONTO = 0.009;
const TOLERANCIA_DIVERGENCIA = 0.01;

const arredondar = (valor: number): number => {
  if (!Number.isFinite(valor)) return 0;
  return Math.round((valor + Number.EPSILON) * 100) / 100;
};

const numeroSeguro = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

// Mesmo formato de moeda usado na mensagem de hoje (inclui U+00A0 entre R$ e o numero).
export function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Sem desconto: `• desc (Qx) — R$ total`. Com desconto: `• desc (Qx) — ~R$ bruto~ R$ total`,
// onde bruto = total + desconto da linha (reconcilia por construcao).
export function formatarLinhaItem(item: ItemMensagem): string {
  const total = numeroSeguro(item.total);
  const desconto = numeroSeguro(item.desconto);
  const base = `• ${item.descricao} (${item.quantidade}x) — `;
  if (desconto > LIMITE_DESCONTO) {
    return `${base}~${formatarBRL(arredondar(total + desconto))}~ ${formatarBRL(total)}`;
  }
  return `${base}${formatarBRL(total)}`;
}

// subtotal = soma(total_i + desconto_i) de TODOS os itens; descontoItens = soma(desconto_i).
// Divergente quando |subtotal - descontoItens + acrescimo - total| > 0,01; nesse caso o desconto
// exibido e max(0, subtotal + acrescimo - total) para a mensagem sempre fechar.
export function calcularResumoValores(input: {
  itens: Array<{ total: number; desconto?: number }>;
  total: number;
  acrescimo?: number;
}): ResumoValores {
  const total = arredondar(numeroSeguro(input.total));
  const acrescimoBruto = numeroSeguro(input.acrescimo);
  const acrescimo = acrescimoBruto > 0 ? arredondar(acrescimoBruto) : 0;

  let subtotal = 0;
  let descontoItens = 0;
  for (const it of input.itens) {
    const desconto = Math.max(0, numeroSeguro(it.desconto));
    subtotal += numeroSeguro(it.total) + desconto;
    descontoItens += desconto;
  }
  subtotal = arredondar(subtotal);
  descontoItens = arredondar(descontoItens);

  const divergente = Math.abs(subtotal - descontoItens + acrescimo - total) > TOLERANCIA_DIVERGENCIA;
  const desconto = divergente ? arredondar(Math.max(0, subtotal + acrescimo - total)) : descontoItens;
  const temAjuste = desconto > LIMITE_DESCONTO || acrescimo > LIMITE_DESCONTO;

  return { subtotal, desconto, acrescimo, total, temAjuste, divergente };
}

// Linhas do bloco de total. Sem ajuste, so a linha de Total (como hoje).
export function montarLinhasTotal(resumo: ResumoValores): string[] {
  const linhaTotal = `💰 *Total: ${formatarBRL(resumo.total)}*`;
  if (!resumo.temAjuste) return [linhaTotal];

  const linhas = [`Subtotal: ${formatarBRL(resumo.subtotal)}`];
  if (resumo.desconto > LIMITE_DESCONTO) linhas.push(`Desconto: -${formatarBRL(resumo.desconto)}`);
  if (resumo.acrescimo > LIMITE_DESCONTO) linhas.push(`Acréscimo: +${formatarBRL(resumo.acrescimo)}`);
  linhas.push(linhaTotal);
  return linhas;
}
