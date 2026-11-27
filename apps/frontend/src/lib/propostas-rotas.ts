/**
 * Lista permitida do proxy de propostas (Fase 55, T-55-39 e T-55-40).
 *
 * Modulo PURO e sem imports: roda no Next e tambem direto no Node (type stripping) pela checagem
 * executavel `scripts/checar-propostas-rotas.mjs`. A rota do Next so chama `decidirAcessoProxy`.
 *
 * Somente as rotas que o backend ja tem estao liberadas: as do plano 55-06 (cabecalho e itens) e, a partir do
 * plano 55-18, as de ciclo de vida e PDF (gerar do 55-08, recuperar do 55-17, duplicar, status, pdf e previa do
 * 55-13). A de templates/preview entra no plano 55-15.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INTEIRO = /^[0-9]{1,10}$/;

function ehUuid(segmento: string | undefined): boolean {
  return typeof segmento === "string" && UUID.test(segmento);
}

function ehInteiro(segmento: string | undefined): boolean {
  return typeof segmento === "string" && INTEIRO.test(segmento);
}

/** Aceita APENAS as combinacoes metodo + caminho da lista permitida; qualquer outra e recusada. */
export function rotaPropostaPermitida(metodo: string, segmentos: string[]): boolean {
  const m = String(metodo).toUpperCase();
  const n = segmentos.length;

  if (n === 0) return m === "GET" || m === "POST";

  if (n === 1) {
    const [a] = segmentos;
    if (m === "GET" && (a === "produtos" || a === "assinantes")) return true;
    if (ehUuid(a)) return m === "GET" || m === "PATCH";
    return false;
  }

  if (n === 2) {
    const [a, b] = segmentos;
    if (a === "clientes") return m === "GET" && ehInteiro(b);
    if (ehUuid(a) && b === "itens") return m === "POST";
    if (ehUuid(a) && b === "aplicar-percentual") return m === "POST";
    // Ciclo de vida da proposta (plano 55-18): cada rota com UM metodo.
    if (ehUuid(a) && (b === "gerar" || b === "recuperar" || b === "duplicar")) return m === "POST";
    if (ehUuid(a) && b === "status") return m === "PATCH";
    if (ehUuid(a) && (b === "pdf" || b === "previa")) return m === "GET";
    return false;
  }

  if (n === 3) {
    const [a, b, c] = segmentos;
    if (ehUuid(a) && b === "itens" && ehUuid(c)) return m === "PATCH" || m === "DELETE";
    return false;
  }

  return false;
}

// Caracteres seguros de uma query string ja codificada pelo navegador (sem "#", espaco ou controle).
const QUERY_SEGURA = /^\?[A-Za-z0-9._~%&=+,:@!*'()-]*$/;

/**
 * Junta `/propostas` + segmentos (ja validados por `rotaPropostaPermitida`) + a query string.
 * Uma query com caracteres fora do conjunto seguro e descartada em vez de repassada.
 */
export function montarCaminhoBackend(segmentos: string[], search: string): string {
  const base = segmentos.length > 0 ? `/propostas/${segmentos.join("/")}` : "/propostas";
  const query = search && search !== "?" && QUERY_SEGURA.test(search) ? search : "";
  return `${base}${query}`;
}

export type DecisaoProxy =
  | { ok: true; caminho: string }
  | { ok: false; status: 401 | 404; mensagem: string };

export interface EntradaProxy {
  temSessao: boolean;
  metodo: string;
  segmentos: string[];
  search: string;
}

/**
 * Decide o acesso ao proxy. ORDEM: sem sessao e SEMPRE 401 (qualquer metodo e qualquer caminho,
 * inclusive nao listado, para nao revelar quais rotas existem); com sessao e combinacao nao
 * listada e 404; com sessao e combinacao listada devolve o caminho do backend.
 */
export function decidirAcessoProxy(entrada: EntradaProxy): DecisaoProxy {
  if (!entrada.temSessao) {
    return { ok: false, status: 401, mensagem: "Sessao expirada ou nao autenticada." };
  }
  if (!rotaPropostaPermitida(entrada.metodo, entrada.segmentos)) {
    return { ok: false, status: 404, mensagem: "Rota de propostas nao encontrada." };
  }
  return { ok: true, caminho: montarCaminhoBackend(entrada.segmentos, entrada.search) };
}
