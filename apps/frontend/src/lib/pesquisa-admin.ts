/**
 * Fase 52 (plano 52-08): contrato e utilitários compartilhados das telas admin de pesquisa.
 *
 * Sem imports de servidor: é usado pelos Client Components dos planos 52-08, 52-09 e 52-10.
 * A validação daqui apenas ajuda no cliente; o servidor (`validarConfig`) é a fonte final.
 */

export const MSG_SESSAO = "Sessão expirada. Recarregue a página e digite a senha.";

/** Aceita vírgula ou ponto como separador decimal; devolve NaN para vazio ou texto inválido. */
export function lerNumero(texto: string): number {
  const t = texto.trim().replace(",", ".");
  if (!/^-?\d*\.?\d*$/.test(t)) return Number.NaN;
  return t === "" ? Number.NaN : Number(t);
}

/** dd/mm/aaaa, hh:mm em America/Sao_Paulo; "" quando a data é inválida. */
export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** "R$ 2,00" em pt-BR (espaço comum, não NBSP). */
export function formatarReais(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(valor)
    .replace(/ /g, " ");
}

/** "10%" sem casas quando inteiro; até 2 casas caso contrário. */
export function formatarPercentual(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  const casas = Number.isInteger(valor) ? 0 : 2;
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export type VarianteVisual = "ESTRELAS" | "CARINHAS" | "AB";

export interface ConfigAdmin {
  ativo: boolean;
  percentualDesconto: number;
  tetoDesconto: number;
  compraMinima: number;
  validadeCupomDias: number;
  validadeLinkDias: number;
  intervaloDias: number;
  tetoMensal: number;
  prefixoCupom: string;
  linkGoogle: string | null;
  varianteVisual: VarianteVisual;
  textoFechamento: string;
  textoSemRecompensa: string;
  textoPosResposta: string;
  textoConviteGoogle: string;
  paginaTitulo: string;
  paginaSubtitulo: string;
  paginaObrigadoSemRecompensa: string;
  paginaGoogleTitulo: string;
  paginaGoogleCorpo: string;
}

export interface LimitesConfig {
  percentualMin: number;
  percentualMax: number;
  validadeCupomMin: number;
  validadeCupomMax: number;
  validadeLinkMin: number;
  validadeLinkMax: number;
  intervaloMin: number;
  intervaloMax: number;
  textoMax: number;
}

export interface PadroesConfig {
  percentualDesconto: number;
  tetoDesconto: number;
  compraMinima: number;
  tetoMensal: number;
  prefixoCupom: string;
}

export interface RespostaConfigAdmin {
  config: ConfigAdmin;
  padroes: PadroesConfig;
  limites: LimitesConfig;
  placeholders: string[];
  hostsGoogle: string[];
  atualizadoEm: string | null;
}

/** Troca apenas as chaves conhecidas ({chave}); placeholders desconhecidos ficam como estão. */
export function renderizarPrevia(modelo: string, variaveis: Record<string, string>): string {
  const conhecidas = new Map(Object.entries(variaveis).map(([k, v]) => [k.toLowerCase(), v]));
  return String(modelo ?? "").replace(/\{([a-z_][a-z0-9_]*)\}/gi, (casamento, chave: string) => {
    const valor = conhecidas.get(chave.toLowerCase());
    return valor === undefined ? casamento : valor;
  });
}

const REGEX_PLACEHOLDER = /\{([a-z_][a-z0-9_]*)\}/gi;
const REGEX_EMOJI = /\p{Extended_Pictographic}/u;

function validarNumero(
  valor: number,
  minimo: number,
  maximo: number,
  msgMin: string,
  msgMax: string,
): string {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "Informe um número.";
  if (valor < 0) return "Não pode ser negativo.";
  if (valor < minimo) return msgMin;
  if (valor > maximo) return msgMax;
  return "";
}

type TipoTexto = "fechamento" | "semRecompensa" | "posResposta" | "convite" | "pagina";

function validarTexto(
  tipo: TipoTexto,
  texto: string,
  placeholders: string[],
  textoMax: number,
): string {
  const conteudo = typeof texto === "string" ? texto : "";
  if (conteudo.length > textoMax) return `Máximo de ${textoMax} caracteres.`;
  if (REGEX_EMOJI.test(conteudo)) return "Remova emoji. Mensagens usam só texto.";

  for (const casamento of conteudo.matchAll(REGEX_PLACEHOLDER)) {
    const chave = casamento[1].toLowerCase();
    if (!placeholders.includes(chave)) {
      return `Campo {${casamento[1]}} não existe. Use: ${placeholders.join(", ")}.`;
    }
  }

  const baixo = conteudo.toLowerCase();
  if (tipo === "fechamento" || tipo === "semRecompensa") {
    if (!baixo.includes("{link}")) return "Inclua {link} para o cliente encontrar a pesquisa.";
  }
  if (tipo === "posResposta") {
    if (baixo.includes("{link}") || baixo.includes("{link_google}") || baixo.includes("http")) {
      return "Não inclua link aqui. O convite do Google tem mensagem própria.";
    }
    if (!baixo.includes("{codigo}")) return "Inclua {codigo} para o cliente ver o cupom.";
  }
  if (tipo === "convite") {
    if (baixo.includes("{codigo}") || baixo.includes("cupom")) {
      return "O convite do Google não pode falar de cupom.";
    }
    if (!baixo.includes("{link_google}")) return "Inclua {link_google} para o convite do Google.";
  }
  return "";
}

/**
 * Espelha as regras do UI-SPEC e do servidor (`validarConfig`): mapa campo -> mensagem.
 * Vazio significa válido. O servidor continua sendo o juiz final.
 */
export function validarConfigCliente(
  c: ConfigAdmin,
  limites: LimitesConfig,
  placeholders: string[],
): Record<string, string> {
  const erros: Record<string, string> = {};

  const percentual = validarNumero(
    c.percentualDesconto,
    limites.percentualMin,
    limites.percentualMax,
    "Mínimo de 1%.",
    "Máximo de 50%.",
  );
  if (percentual) erros.percentualDesconto = percentual;

  const teto = validarNumero(c.tetoDesconto, 0, Number.MAX_SAFE_INTEGER, "Não pode ser negativo.", "Informe um número.");
  if (teto) erros.tetoDesconto = teto;

  const compra = validarNumero(c.compraMinima, 0, Number.MAX_SAFE_INTEGER, "Não pode ser negativo.", "Informe um número.");
  if (compra) erros.compraMinima = compra;

  const tetoMensal = validarNumero(c.tetoMensal, 0, Number.MAX_SAFE_INTEGER, "Não pode ser negativo.", "Informe um número.");
  if (tetoMensal) erros.tetoMensal = tetoMensal;

  const validadeCupom = validarNumero(
    c.validadeCupomDias,
    limites.validadeCupomMin,
    limites.validadeCupomMax,
    "Mínimo de 1 dia.",
    "Máximo de 180 dias.",
  );
  if (validadeCupom) erros.validadeCupomDias = validadeCupom;

  const validadeLink = validarNumero(
    c.validadeLinkDias,
    limites.validadeLinkMin,
    limites.validadeLinkMax,
    "Mínimo de 1 dia.",
    "Máximo de 14 dias.",
  );
  if (validadeLink) erros.validadeLinkDias = validadeLink;

  const intervalo = validarNumero(
    c.intervaloDias,
    limites.intervaloMin,
    limites.intervaloMax,
    "Não pode ser negativo.",
    `Máximo de ${limites.intervaloMax} dias.`,
  );
  if (intervalo) erros.intervaloDias = intervalo;

  const prefixo = typeof c.prefixoCupom === "string" ? c.prefixoCupom.trim() : "";
  if (!/^[A-Z0-9]{1,6}$/.test(prefixo.toUpperCase()) || /\s/.test(prefixo)) {
    erros.prefixoCupom = "Use de 1 a 6 letras ou números, sem espaços.";
  }

  if (!["ESTRELAS", "CARINHAS", "AB"].includes(c.varianteVisual)) {
    erros.varianteVisual = "Escolha uma variante válida.";
  }

  const link = typeof c.linkGoogle === "string" ? c.linkGoogle.trim() : "";
  if (link) {
    let ok = false;
    try {
      ok = new URL(link).protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) erros.linkGoogle = "Informe um link que comece com https://.";
  }

  const textos: Array<[keyof ConfigAdmin, TipoTexto]> = [
    ["textoFechamento", "fechamento"],
    ["textoSemRecompensa", "semRecompensa"],
    ["textoPosResposta", "posResposta"],
    ["textoConviteGoogle", "convite"],
    ["paginaTitulo", "pagina"],
    ["paginaSubtitulo", "pagina"],
    ["paginaObrigadoSemRecompensa", "pagina"],
    ["paginaGoogleTitulo", "pagina"],
    ["paginaGoogleCorpo", "pagina"],
  ];
  for (const [campo, tipo] of textos) {
    const mensagem = validarTexto(tipo, String(c[campo] ?? ""), placeholders, limites.textoMax);
    if (mensagem) erros[campo] = mensagem;
  }

  return erros;
}
