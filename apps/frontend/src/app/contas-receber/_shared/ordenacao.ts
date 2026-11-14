// Ordenacao das listas de contas a receber (Fase 48, D-01..D-08).
// Modulo PURO: sem imports e so com sintaxe TypeScript apagavel (sem enum, namespace ou parameter
// properties), para que scripts/checar-ordenacao.mjs o carregue direto no Node (type stripping).
// A ordem escolhida fica na URL como ?ordem=<criterio>&dir=asc|desc (D-07); o padrao nao grava parametros.

export type Direcao = "asc" | "desc";
export type OrdemBoletos = "data" | "nome" | "pago";
export type OrdemNotas = "data" | "nome";
export type OrdemClientes = "atrasado" | "devido" | "nome" | "pago";

export interface Ordenacao<O extends string> {
  ordem: O;
  dir: Direcao;
}

export interface ConfigOrdenacao<O extends string> {
  /** Criterios oferecidos ao usuario (na tela do cliente, "nome" nao aparece: D-03). */
  permitidas: readonly O[];
  /** Ordem aplicada quando a URL nao traz parametros validos (D-06). */
  padrao: Ordenacao<O>;
  /** Direcao usada ao escolher um criterio novo. */
  direcaoInicial: Record<O, Direcao>;
  rotulos: Record<O, string>;
  rotulosDirecao: Record<O, { asc: string; desc: string }>;
}

const ROTULOS_DIRECAO_BOLETOS: Record<OrdemBoletos, { asc: string; desc: string }> = {
  data: { asc: "Mais Cedo Primeiro", desc: "Mais Tarde Primeiro" },
  nome: { asc: "A a Z", desc: "Z a A" },
  pago: { asc: "Pendentes Primeiro", desc: "Pagos Primeiro" },
};

const ROTULOS_BOLETOS: Record<OrdemBoletos, string> = {
  data: "Data de Vencimento",
  nome: "Nome",
  pago: "Pago",
};

const DIRECAO_INICIAL_BOLETOS: Record<OrdemBoletos, Direcao> = {
  data: "asc",
  nome: "asc",
  pago: "desc",
};

/** Boletos consolidados de /contas-receber/boletos (D-01). Padrao: vencimento crescente, atrasados no topo. */
export const CONFIG_BOLETOS: ConfigOrdenacao<OrdemBoletos> = {
  permitidas: ["data", "nome", "pago"],
  padrao: { ordem: "data", dir: "asc" },
  direcaoInicial: DIRECAO_INICIAL_BOLETOS,
  rotulos: ROTULOS_BOLETOS,
  rotulosDirecao: ROTULOS_DIRECAO_BOLETOS,
};

/** Aba Boletos do cliente: um cliente so, sem "nome" (D-03). Mesmo tipo da lista geral. */
export const CONFIG_BOLETOS_CLIENTE: ConfigOrdenacao<OrdemBoletos> = {
  permitidas: ["data", "pago"],
  padrao: { ordem: "data", dir: "asc" },
  direcaoInicial: DIRECAO_INICIAL_BOLETOS,
  rotulos: ROTULOS_BOLETOS,
  rotulosDirecao: ROTULOS_DIRECAO_BOLETOS,
};

/** Interpreta ?ordem=&dir= da URL: ordem invalida volta ao padrao inteiro; direcao invalida usa a inicial do criterio. */
export function lerOrdenacao<O extends string>(
  ordem: string | null | undefined,
  dir: string | null | undefined,
  config: ConfigOrdenacao<O>,
): Ordenacao<O> {
  const valida = config.permitidas.find((o) => o === ordem);
  if (valida === undefined) return { ordem: config.padrao.ordem, dir: config.padrao.dir };
  const direcao: Direcao = dir === "asc" || dir === "desc" ? dir : config.direcaoInicial[valida];
  return { ordem: valida, dir: direcao };
}

/** Valores a gravar na URL: o padrao limpa os dois parametros. */
export function ordenacaoParaUrl<O extends string>(
  o: Ordenacao<O>,
  config: ConfigOrdenacao<O>,
): { ordem: string | null; dir: string | null } {
  if (o.ordem === config.padrao.ordem && o.dir === config.padrao.dir) return { ordem: null, dir: null };
  return { ordem: o.ordem, dir: o.dir };
}

/** Clique no cabecalho: mesmo criterio inverte a direcao; outro criterio entra com a direcao inicial dele. */
export function proximaOrdenacao<O extends string>(
  atual: Ordenacao<O>,
  clicada: O,
  config: ConfigOrdenacao<O>,
): Ordenacao<O> {
  if (atual.ordem === clicada) return { ordem: clicada, dir: atual.dir === "asc" ? "desc" : "asc" };
  return { ordem: clicada, dir: config.direcaoInicial[clicada] };
}

/** Texto A a Z sem diferenciar acento nem maiuscula (D-03). */
export function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
}

/** Compara textos AAAA-MM-DD (ou ISO) na direcao pedida; null fica SEMPRE por ultimo, nas duas direcoes. */
function compararNuloUltimo(a: string | null, b: string | null, dir: Direcao): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const c = a < b ? -1 : 1;
  return dir === "asc" ? c : -c;
}

function aplicarDirecao(c: number, dir: Direcao): number {
  return dir === "asc" ? c : -c;
}

function dia(valor: string | null | undefined): string | null {
  return valor ? valor.slice(0, 10) : null;
}

/**
 * Ordena boletos (copia; nunca altera a entrada). Vencimento = expireAt AAAA-MM-DD; pagamento so conta quando
 * status e "pago". Null sempre por ultimo. Em "pago", pendentes ficam sempre por vencimento crescente (D-04).
 */
export function ordenarBoletos<
  T extends { id: number; status: string; expireAt: string | null; nomeCliente?: string; dataPagamento?: string | null },
>(lista: readonly T[], o: Ordenacao<string>): T[] {
  const venc = (b: T) => dia(b.expireAt);
  const pagamento = (b: T) => (b.status === "pago" ? dia(b.dataPagamento) : null);
  const grupo = (b: T) => (b.status === "pago" ? 1 : 0);

  return [...lista].sort((a, b) => {
    if (o.ordem === "nome") {
      const c = aplicarDirecao(compararTexto(a.nomeCliente ?? "", b.nomeCliente ?? ""), o.dir);
      if (c !== 0) return c;
      const v = compararNuloUltimo(venc(a), venc(b), "asc");
      if (v !== 0) return v;
      return a.id - b.id;
    }
    if (o.ordem === "pago") {
      const ga = grupo(a);
      const gb = grupo(b);
      if (ga !== gb) return o.dir === "asc" ? ga - gb : gb - ga;
      if (ga === 1) {
        const p = compararNuloUltimo(pagamento(a), pagamento(b), o.dir);
        if (p !== 0) return p;
      } else {
        const v = compararNuloUltimo(venc(a), venc(b), "asc");
        if (v !== 0) return v;
      }
      return a.id - b.id;
    }
    // "data" (criterio padrao tambem para ordem desconhecida): vencimento na direcao.
    const v = compararNuloUltimo(venc(a), venc(b), o.dir);
    if (v !== 0) return v;
    return a.id - b.id;
  });
}
