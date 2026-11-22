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

/**
 * Fase 51 (plano 51-02): cliente frequente (D-09, D-11, D-16).
 *
 * Criterio: o cliente (Quote.customerId) tem N ou mais orcamentos "concretizados" criados nos ultimos
 * M meses. Recalculado a cada sincronizacao; N e M vem de env com padrao 3 e 6.
 */
export const ENV_CLIENTE_FREQUENTE_MIN = "CHATWOOT_CLIENTE_FREQUENTE_MIN";
export const ENV_CLIENTE_FREQUENTE_MESES = "CHATWOOT_CLIENTE_FREQUENTE_MESES";
export const CLIENTE_FREQUENTE_MIN_PADRAO = 3;
export const CLIENTE_FREQUENTE_MESES_PADRAO = 6;

/**
 * D-16: so estes status contam como pedido. ENVIADO, PENDENTE, PAGAMENTO_PARCIAL e CANCELADO ficam
 * de fora. Risco aceito (T-51-10): APROVADO por link, sem pagamento, ja conta.
 */
export const STATUS_PEDIDO_CONCRETIZADO: readonly QuoteStatus[] = [
  "APROVADO",
  "EM_PRODUCAO",
  "PRONTO_PARA_ENTREGA",
  "ENTREGUE",
];

function inteiroPositivo(valor: string | undefined, padrao: number): number {
  const texto = (valor ?? "").trim();
  if (!/^\d+$/.test(texto)) return padrao;
  const numero = Number(texto);
  return Number.isSafeInteger(numero) && numero >= 1 ? numero : padrao;
}

/** Limiares por env; valor ausente, nao inteiro ou menor que 1 volta ao padrao. */
export function lerLimiaresClienteFrequente(get: (chave: string) => string | undefined): { min: number; meses: number } {
  return {
    min: inteiroPositivo(get(ENV_CLIENTE_FREQUENTE_MIN), CLIENTE_FREQUENTE_MIN_PADRAO),
    meses: inteiroPositivo(get(ENV_CLIENTE_FREQUENTE_MESES), CLIENTE_FREQUENTE_MESES_PADRAO),
  };
}

/** Inicio da janela: "agora" menos N meses, no mesmo horario (calculo em UTC, independe do fuso do servidor). */
export function inicioJanelaClienteFrequente(meses: number, agora: Date = new Date()): Date {
  const inicio = new Date(agora.getTime());
  inicio.setUTCMonth(inicio.getUTCMonth() - meses);
  return inicio;
}

/**
 * Uma unica contagem no Prisma (nunca no Athos). A janela usa createdAt de proposito: updatedAt e
 * alterado por leituras que gravam e inflaria a contagem. Sem indice novo (T-51-09, volume pequeno).
 */
export async function clienteEhFrequente(
  prisma: { quote: { count(args: any): Promise<number> } },
  customerId: string,
  get: (chave: string) => string | undefined,
  agora: Date = new Date(),
): Promise<boolean> {
  const { min, meses } = lerLimiaresClienteFrequente(get);
  const total = await prisma.quote.count({
    where: {
      customerId,
      status: { in: [...STATUS_PEDIDO_CONCRETIZADO] },
      createdAt: { gte: inicioJanelaClienteFrequente(meses, agora) },
    },
  });
  return total >= min;
}

/**
 * Fila por conversa (R1, R4): tarefas da MESMA conversa rodam em serie, na ordem de chegada; conversas
 * diferentes rodam em paralelo, com teto global de MAX_CONCORRENCIA_CHATWOOT execucoes (lote de 50 nao
 * gera rajada). So promises (sem setTimeout/setImmediate): funciona sob jest.useFakeTimers.
 * Limitacao residual (T-51-06): vale por processo; o deploy atual e instancia unica.
 */
export const MAX_CONCORRENCIA_CHATWOOT = 3;

const caudasPorConversa = new Map<string, Promise<void>>();
let execucoesAtivas = 0;
const esperaSemaforo: Array<() => void> = [];

function adquirirSemaforo(): Promise<void> {
  if (execucoesAtivas < MAX_CONCORRENCIA_CHATWOOT) {
    execucoesAtivas++;
    return Promise.resolve();
  }
  // A vaga e transferida diretamente por liberarSemaforo (contador nao muda).
  return new Promise<void>((resolver) => esperaSemaforo.push(resolver));
}

function liberarSemaforo(): void {
  const proximo = esperaSemaforo.shift();
  if (proximo) proximo();
  else execucoesAtivas--;
}

export function enfileirarPorConversa<T>(conversationId: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = caudasPorConversa.get(conversationId) ?? Promise.resolve();
  const resultado = anterior.then(async () => {
    await adquirirSemaforo();
    try {
      return await tarefa();
    } finally {
      liberarSemaforo();
    }
  });
  // A cauda nunca rejeita: a falha de uma tarefa nao trava a proxima da mesma conversa.
  const cauda = resultado.then(
    () => undefined,
    () => undefined,
  );
  caudasPorConversa.set(conversationId, cauda);
  void cauda.then(() => {
    if (caudasPorConversa.get(conversationId) === cauda) caudasPorConversa.delete(conversationId);
  });
  return resultado;
}

/** Resolve quando a fila esvaziar (uso em testes); ignora rejeicoes. */
export async function aguardarFilaEtiquetas(): Promise<void> {
  while (caudasPorConversa.size > 0) {
    await Promise.all([...caudasPorConversa.values()]);
  }
}

/**
 * Fase 51 (plano 51-04): atraso "humano" da mensagem de encerramento (D-12, D-20, D-22).
 *
 * O envio e agendado por setTimeout em processo, com um timer por conversa. Premissa: instancia unica
 * por tenant. Reiniciar o processo perde a mensagem agendada (aceito, D-12 e D-24): as etiquetas ja
 * ficaram aplicadas na hora e so a despedida se perde.
 */
export const ENV_FECHAMENTO_ATRASO_MIN_S = "CHATWOOT_FECHAMENTO_ATRASO_MIN_S";
export const ENV_FECHAMENTO_ATRASO_MAX_S = "CHATWOOT_FECHAMENTO_ATRASO_MAX_S";
export const ATRASO_FECHAMENTO_MIN_PADRAO_S = 45;
export const ATRASO_FECHAMENTO_MAX_PADRAO_S = 180;
export const ATRASO_FECHAMENTO_TETO_S = 900;

function segundosPositivos(valor: string | undefined, padrao: number): number {
  const texto = (valor ?? "").trim();
  if (texto === "") return padrao;
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero <= 0) return padrao;
  return Math.min(numero, ATRASO_FECHAMENTO_TETO_S);
}

/** Cada valor: numero finito > 0, senao padrao; limitado a 900 s; troca min e max se vierem invertidos. */
export function lerAtrasoFechamentoS(get: (chave: string) => string | undefined): { minS: number; maxS: number } {
  const a = segundosPositivos(get(ENV_FECHAMENTO_ATRASO_MIN_S), ATRASO_FECHAMENTO_MIN_PADRAO_S);
  const b = segundosPositivos(get(ENV_FECHAMENTO_ATRASO_MAX_S), ATRASO_FECHAMENTO_MAX_PADRAO_S);
  return a <= b ? { minS: a, maxS: b } : { minS: b, maxS: a };
}

/**
 * Distribuicao triangular (media de dois sorteios uniformes): concentra o atraso no meio do intervalo e
 * evita o padrao plano de um uniforme, que parece robotico. Devolve milissegundos inteiros.
 */
export function sortearAtrasoHumanoMs(minS: number, maxS: number, rnd: () => number = Math.random): number {
  const menor = Math.min(minS, maxS);
  const maior = Math.max(minS, maxS);
  const u = (rnd() + rnd()) / 2;
  return Math.round((menor + u * (maior - menor)) * 1000);
}

const timersFechamento = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Agenda a tarefa em `delayMs`. Um timer por conversa: um novo agendamento substitui o anterior.
 * O timer nao segura o processo (unref) e a tarefa nunca vira rejeicao nao tratada (quem agenda deve
 * registrar o proprio log de erro).
 */
export function agendarEnvioFechamento(conversationId: string, delayMs: number, tarefa: () => Promise<void>): void {
  const anterior = timersFechamento.get(conversationId);
  if (anterior) clearTimeout(anterior);

  const timer = setTimeout(() => {
    if (timersFechamento.get(conversationId) === timer) timersFechamento.delete(conversationId);
    void Promise.resolve()
      .then(tarefa)
      .catch(() => undefined);
  }, delayMs);
  const comUnref = timer as unknown as { unref?: () => void };
  if (typeof comUnref.unref === "function") comUnref.unref();
  timersFechamento.set(conversationId, timer);
}

export function cancelarEnvioFechamento(conversationId: string): boolean {
  const timer = timersFechamento.get(conversationId);
  if (!timer) return false;
  clearTimeout(timer);
  timersFechamento.delete(conversationId);
  return true;
}

export function cancelarTodosEnviosFechamento(): void {
  for (const timer of timersFechamento.values()) clearTimeout(timer);
  timersFechamento.clear();
}

export function enviosFechamentoPendentes(): number {
  return timersFechamento.size;
}

/**
 * Fase 51 (plano 51-04, D-13): avaliacao de resposta do cliente no re-check do disparo.
 *
 * A guarda FECHA: so "sem_resposta" libera o envio. Formato desconhecido (mensagens que nao sao lista,
 * mensagem de entrada com created_at ilegivel) vira "indeterminado" e a despedida e descartada.
 * `created_at` pode vir em segundos (< 1e11), milissegundos, string numerica ou ISO (premissa A3,
 * confirmada por sonda de leitura no roteiro de homologacao).
 */
export interface MensagemConversaChatwoot {
  message_type?: number | string;
  created_at?: number | string;
  private?: boolean;
}

export type AvaliacaoRespostaCliente = "resposta_nova" | "sem_resposta" | "indeterminado";

function ehMensagemDeEntrada(mensagem: MensagemConversaChatwoot): boolean {
  return mensagem.message_type === 0 || mensagem.message_type === "incoming";
}

function criadaEmMs(valor: unknown): number | null {
  let numero: number;
  if (typeof valor === "number") {
    numero = valor;
  } else if (typeof valor === "string") {
    const texto = valor.trim();
    if (texto === "") return null;
    numero = /^\d+(\.\d+)?$/.test(texto) ? Number(texto) : Date.parse(texto);
    // ISO ja vem em ms; so numero puro precisa da heuristica de segundos.
    if (!/^\d+(\.\d+)?$/.test(texto)) return Number.isFinite(numero) ? numero : null;
  } else {
    return null;
  }
  if (!Number.isFinite(numero) || numero < 0) return null;
  return numero < 1e11 ? numero * 1000 : numero;
}

export function avaliarRespostaDoCliente(mensagens: unknown, resolvidaEmMs: number): AvaliacaoRespostaCliente {
  if (!Array.isArray(mensagens)) return "indeterminado";

  let indeterminado = false;
  for (const item of mensagens) {
    if (item === null || typeof item !== "object") continue;
    const mensagem = item as MensagemConversaChatwoot;
    if (mensagem.private === true || !ehMensagemDeEntrada(mensagem)) continue;
    const quando = criadaEmMs(mensagem.created_at);
    if (quando === null) {
      indeterminado = true;
    } else if (quando > resolvidaEmMs) {
      return "resposta_nova";
    }
  }
  return indeterminado ? "indeterminado" : "sem_resposta";
}
