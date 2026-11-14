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

const ROTULOS_NOTAS: Record<OrdemNotas, string> = { data: "Data de Emissão", nome: "Nome" };

const ROTULOS_DIRECAO_NOTAS: Record<OrdemNotas, { asc: string; desc: string }> = {
  data: { asc: "Mais Antiga Primeiro", desc: "Mais Recente Primeiro" },
  nome: { asc: "A a Z", desc: "Z a A" },
};

const DIRECAO_INICIAL_NOTAS: Record<OrdemNotas, Direcao> = { data: "desc", nome: "asc" };

/** Notas fiscais de /contas-receber/notas (D-01). Data = emissao; padrao: emissao mais recente primeiro. Sem "pago" (D-04). */
export const CONFIG_NOTAS: ConfigOrdenacao<OrdemNotas> = {
  permitidas: ["data", "nome"],
  padrao: { ordem: "data", dir: "desc" },
  direcaoInicial: DIRECAO_INICIAL_NOTAS,
  rotulos: ROTULOS_NOTAS,
  rotulosDirecao: ROTULOS_DIRECAO_NOTAS,
};

/** Aba Notas do cliente: um cliente so, sem "nome" (D-03). Mesmo tipo da lista geral. */
export const CONFIG_NOTAS_CLIENTE: ConfigOrdenacao<OrdemNotas> = {
  permitidas: ["data"],
  padrao: { ordem: "data", dir: "desc" },
  direcaoInicial: DIRECAO_INICIAL_NOTAS,
  rotulos: ROTULOS_NOTAS,
  rotulosDirecao: ROTULOS_DIRECAO_NOTAS,
};

/** Lista de clientes de /contas-receber (D-01). Padrao: total atrasado decrescente, como antes da Fase 48. */
export const CONFIG_CLIENTES: ConfigOrdenacao<OrdemClientes> = {
  permitidas: ["atrasado", "devido", "nome", "pago"],
  padrao: { ordem: "atrasado", dir: "desc" },
  direcaoInicial: { atrasado: "desc", devido: "desc", nome: "asc", pago: "desc" },
  rotulos: { atrasado: "Atrasado", devido: "Total Devido", nome: "Nome", pago: "Pago" },
  rotulosDirecao: {
    atrasado: { asc: "Menor Primeiro", desc: "Maior Primeiro" },
    devido: { asc: "Menor Primeiro", desc: "Maior Primeiro" },
    nome: { asc: "A a Z", desc: "Z a A" },
    pago: { asc: "Pagou Menos Primeiro", desc: "Pagou Mais Primeiro" },
  },
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

/** Numeros com null/undefined sempre por ultimo, nas duas direcoes. */
function compararNumeroNuloUltimo(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: Direcao,
): number {
  const na = a === null || a === undefined ? null : a;
  const nb = b === null || b === undefined ? null : b;
  if (na === nb) return 0;
  if (na === null) return 1;
  if (nb === null) return -1;
  const c = na < nb ? -1 : 1;
  return dir === "asc" ? c : -c;
}

/**
 * Ordena notas (copia). Data = dataEmissao como texto completo (ISO da NFS-e ou AAAA-MM-DD da NF-e), null por ultimo.
 * Empates: tipo ("NFS-e" antes de "NF-e") e numero na data; emissao mais recente e numero no nome.
 */
export function ordenarNotas<
  T extends { tipo: string; numero: string | null; nomeCliente: string; dataEmissao: string | null },
>(lista: readonly T[], o: Ordenacao<string>): T[] {
  const porNumero = (a: T, b: T) => compararTexto(a.numero ?? "", b.numero ?? "");
  return [...lista].sort((a, b) => {
    if (o.ordem === "nome") {
      const c = aplicarDirecao(compararTexto(a.nomeCliente, b.nomeCliente), o.dir);
      if (c !== 0) return c;
      const e = compararNuloUltimo(a.dataEmissao, b.dataEmissao, "desc");
      if (e !== 0) return e;
      return porNumero(a, b);
    }
    const e = compararNuloUltimo(a.dataEmissao, b.dataEmissao, o.dir);
    if (e !== 0) return e;
    if (a.tipo !== b.tipo) return a.tipo === "NFS-e" ? -1 : b.tipo === "NFS-e" ? 1 : compararTexto(a.tipo, b.tipo);
    return porNumero(a, b);
  });
}

/**
 * Ordena clientes devedores (copia). "atrasado" e "devido" desempatam pelo outro total (decrescente), depois nome e id,
 * o que reproduz a ordem do backend no padrao. "pago" deixa total_pago null/undefined por ultimo.
 */
export function ordenarClientes<
  T extends {
    idcliente: number;
    nome_cliente: string;
    total_devido: number;
    total_atrasado: number;
    total_pago?: number | null;
  },
>(lista: readonly T[], o: Ordenacao<string>): T[] {
  const nomeEId = (a: T, b: T) => {
    const n = compararTexto(a.nome_cliente, b.nome_cliente);
    return n !== 0 ? n : a.idcliente - b.idcliente;
  };
  return [...lista].sort((a, b) => {
    if (o.ordem === "nome") {
      const c = aplicarDirecao(compararTexto(a.nome_cliente, b.nome_cliente), o.dir);
      return c !== 0 ? c : a.idcliente - b.idcliente;
    }
    if (o.ordem === "pago") {
      const c = compararNumeroNuloUltimo(a.total_pago, b.total_pago, o.dir);
      return c !== 0 ? c : nomeEId(a, b);
    }
    const [campo, outro] =
      o.ordem === "devido"
        ? (["total_devido", "total_atrasado"] as const)
        : (["total_atrasado", "total_devido"] as const);
    const c = aplicarDirecao(a[campo] - b[campo], o.dir);
    if (c !== 0) return c;
    const d = b[outro] - a[outro];
    return d !== 0 ? d : nomeEId(a, b);
  });
}
