/**
 * Fase 51 (plano 51-01): regras puras de etiquetas do Chatwoot por fase do orcamento.
 *
 * Decisoes registradas:
 * - D-15: PENDENTE = "orcamento-pendente" e ENVIADO = "orcamento-enviado" (substitui o mapa do D-01
 *   para esses dois status).
 * - D-04: o POST de labels do Chatwoot SUBSTITUI a lista inteira da conversa. Por isso o codigo sempre
 *   le as etiquetas atuais (GET), mescla preservando as manuais (fora do conjunto gerenciado) e so grava
 *   (POST) quando a lista mudou.
 * - "finalizado" NAO e gerenciado pela sincronizacao de status: so o fechamento da conversa (plano 51-04)
 *   escreve nele. Assim uma troca de status nunca remove nem recoloca "finalizado".
 * - D-05/D-18: este modulo nunca cria etiquetas de conta; elas ja existem nos dois Chatwoots.
 *
 * Sem Nest e sem Prisma: so tipos e funcoes puras, mais a aplicacao via uma API minima injetada.
 */
import type { QuoteStatus } from "@prisma/client";

/**
 * Kill-switch (mesmo padrao da Fase 43): so o texto "false" (qualquer caixa, com trim) desliga a
 * sincronizacao de etiquetas. Ausente ou qualquer outro valor mantem ligada.
 */
export const ENV_ETIQUETAS_ATIVAS = "CHATWOOT_ETIQUETAS_ATIVAS";

export const ETIQUETA_FASE_POR_STATUS: Record<QuoteStatus, string> = {
  PENDENTE: "orcamento-pendente",
  ENVIADO: "orcamento-enviado",
  PAGAMENTO_PARCIAL: "pagamento-parcial",
  APROVADO: "aprovado",
  EM_PRODUCAO: "em-producao",
  PRONTO_PARA_ENTREGA: "pronto-entrega",
  ENTREGUE: "entregue",
  CANCELADO: "cancelado",
};

export const ETIQUETA_CLIENTE_FREQUENTE = "cliente-frequente";
export const ETIQUETA_FINALIZADO = "finalizado";

/** As 8 etiquetas de fase (valores do mapa). */
export const ETIQUETAS_DE_FASE: readonly string[] = Object.values(ETIQUETA_FASE_POR_STATUS);

/** Conjunto que a sincronizacao de status controla. "finalizado" fica FORA de proposito. */
export const ETIQUETAS_GERENCIADAS: readonly string[] = [...ETIQUETAS_DE_FASE, ETIQUETA_CLIENTE_FREQUENTE];

/** Etiqueta da fase para um status; null quando o status e nulo, vazio ou desconhecido. */
export function etiquetaDaFase(status: QuoteStatus | null | undefined): string | null {
  if (!status) return null;
  return ETIQUETA_FASE_POR_STATUS[status] ?? null;
}

/**
 * Mescla as etiquetas atuais da conversa com as desejadas: mantem as manuais (fora de `gerenciadas`)
 * na ordem original, descarta as gerenciadas atuais e acrescenta as desejadas, sem duplicata.
 */
export function mesclarEtiquetas(
  atuais: string[],
  desejadas: string[],
  gerenciadas: readonly string[] = ETIQUETAS_GERENCIADAS,
): string[] {
  const manuais = atuais.filter((etiqueta) => !gerenciadas.includes(etiqueta));
  return [...new Set([...manuais, ...desejadas])];
}

/** Compara duas listas de etiquetas ignorando ordem e duplicatas. */
export function etiquetasIguais(a: string[], b: string[]): boolean {
  const conjuntoA = new Set(a);
  const conjuntoB = new Set(b);
  if (conjuntoA.size !== conjuntoB.size) return false;
  for (const etiqueta of conjuntoA) {
    if (!conjuntoB.has(etiqueta)) return false;
  }
  return true;
}

/** So o texto "false" (trim, qualquer caixa) desliga; ausente ou outro valor mantem ligada. */
export function etiquetasAtivas(valor: string | undefined | null): boolean {
  if (valor === undefined || valor === null) return true;
  return String(valor).trim().toLowerCase() !== "false";
}

/** API minima do Chatwoot usada aqui (ChatwootService satisfaz esta interface). */
export interface EtiquetasApi {
  getConversationLabels(conversationId: string): Promise<string[]>;
  addConversationLabels(conversationId: string, labels: string[]): Promise<unknown>;
}

/**
 * GET das etiquetas atuais -> mescla -> POST so quando a lista mudou. Nao captura erros: quem chama
 * decide o que fazer (o gancho de QuotesService registra warn e segue).
 */
export async function aplicarEtiquetasGerenciadas(
  api: EtiquetasApi,
  conversationId: string,
  desejadas: string[],
  gerenciadas: readonly string[] = ETIQUETAS_GERENCIADAS,
): Promise<{ alterou: boolean; etiquetas: string[] }> {
  const atuais = await api.getConversationLabels(conversationId);
  const mescladas = mesclarEtiquetas(atuais, desejadas, gerenciadas);
  if (etiquetasIguais(atuais, mescladas)) {
    return { alterou: false, etiquetas: atuais };
  }
  await api.addConversationLabels(conversationId, mescladas);
  return { alterou: true, etiquetas: mescladas };
}
