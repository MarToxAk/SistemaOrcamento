/**
 * Fase 52 (quick 261122-rlb): variacao por IA dos textos da pesquisa (anti-spam leve).
 * Helpers puros: sem Nest, sem Prisma, sem rede. Importa apenas de ./pesquisa-regras.
 *
 * A saida da IA e tratada como entrada nao confiavel e so e usada depois de `validarVariacao`.
 */
import { type TipoTexto, validarTextoMensagem } from "./pesquisa-regras";

/** Flag que liga/desliga a variacao por IA (padrao ligada; so "false", "0" e "off" desligam). */
export const ENV_VARIACAO_IA = "PESQUISA_VARIACAO_IA";
/** Nivel da reescrita: "leve" (sinonimos/ordem) ou "forte" (outras palavras e estrutura, mesmo significado). */
export const ENV_VARIACAO_NIVEL = "PESQUISA_VARIACAO_NIVEL";
export type NivelVariacao = "leve" | "forte";
/** Ausente, vazio ou desconhecido = "forte"; so "leve" (sem diferenciar caixa) escolhe a reescrita leve. */
export function nivelVariacao(valor: string | null | undefined): NivelVariacao {
  return String(valor ?? "").trim().toLowerCase() === "leve" ? "leve" : "forte";
}

/** Teto da chamada a IA: o envio da mensagem nunca espera alem disso. */
export const TIMEOUT_VARIACAO_MS = 8000;
/** Faixa de tamanho aceita para a variacao (multiplicador sobre o tamanho do modelo). */
export const RAZAO_TAMANHO_MIN = 0.5;
export const RAZAO_TAMANHO_MAX = 1.8;

/** Tipos de texto que variam (a pagina publica nao sai por WhatsApp). */
export type TipoVariacao = Exclude<TipoTexto, "pagina">;

/**
 * [U4] Ausente, vazio ou qualquer valor desconhecido = true (ligado); so "false", "0" e "off"
 * (apos trim, sem diferenciar caixa) = false.
 */
export function variacaoAtiva(valor: string | null | undefined): boolean {
  if (valor === undefined || valor === null) return true;
  const texto = String(valor).trim();
  if (!texto) return true;
  const baixo = texto.toLowerCase();
  return baixo !== "false" && baixo !== "0" && baixo !== "off";
}

/** [U5] Diretrizes curtas de reescrita, sorteadas para forcar variedade entre chamadas. */
export const DIRETRIZES_VARIACAO = [
  "troque alguns sinônimos mantendo o sentido",
  "mude a frase de abertura",
  "inverta a ordem de duas frases",
  "reorganize as informações mantendo tudo",
  "varie a forma de agradecer ou convidar",
] as const;

/** Diretrizes do nivel "forte": estilos bem distintos entre si, mesmo significado. */
export const DIRETRIZES_VARIACAO_FORTE = [
  "escreva de forma mais direta e curta",
  "escreva de forma mais calorosa e informal, como numa conversa",
  "comece pelo benefício ou pelo pedido, não pela saudação",
  "use outra estrutura de frases e palavras totalmente diferentes",
  "escreva de forma educada e objetiva, como uma loja atenciosa",
] as const;

export function sortearDiretriz(sorteio: () => number = Math.random, nivel: NivelVariacao = "leve"): string {
  const lista = nivel === "forte" ? DIRETRIZES_VARIACAO_FORTE : DIRETRIZES_VARIACAO;
  const indice = Math.floor(sorteio() * lista.length);
  return lista[indice] ?? lista[0];
}

/** [U5] Prompt em portugues que pede reescrita LEVE; o modelo vai com os placeholders crus. */
export function montarPromptVariacao(
  modelo: string,
  tipo: TipoVariacao,
  diretriz: string,
  nivel: NivelVariacao = "leve",
): string {
  const abertura =
    nivel === "forte"
      ? `Reescreva a mensagem de WhatsApp abaixo (tipo: ${tipo}) com palavras e estrutura DIFERENTES, como se outra pessoa a escrevesse, mantendo exatamente o mesmo significado e todas as informações. Ela nao pode parecer a mesma mensagem.`
      : `Reescreva de forma LEVE a mensagem de WhatsApp abaixo (tipo: ${tipo}), para ela nao parecer sempre a mesma.`;
  return [
    abertura,
    `Diretriz de estilo: ${diretriz}.`,
    "Regras:",
    "- Mantenha um tom cordial, o tamanho aproximado e os emojis (se houver).",
    "- Mantenha TODOS os placeholders entre chaves exatamente como estao (ex: {codigo}, {link}, {link_google}).",
    "- Mantenha a palavra SAIR e as quebras de linha.",
    "- Nao invente link, numero, codigo nem valor.",
    "- Responda APENAS com o texto final, sem aspas, sem markdown e sem explicacao.",
    "",
    "MODELO:",
    modelo,
  ].join("\n");
}

const REGEX_PLACEHOLDER_VARIACAO = /\{([a-z_][a-z0-9_]*)\}/gi;
const ASPAS = ['"', "'", "‘", "’", "“", "”", "`"];

function nomesPlaceholders(texto: string): string[] {
  return [...texto.matchAll(REGEX_PLACEHOLDER_VARIACAO)].map((c) => c[1].toLowerCase());
}

function mesmoMulticonjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const restante = [...b];
  for (const item of a) {
    const indice = restante.indexOf(item);
    if (indice === -1) return false;
    restante.splice(indice, 1);
  }
  return restante.length === 0;
}

function contarOcorrencias(texto: string, alvo: string): number {
  let total = 0;
  let posicao = texto.indexOf(alvo);
  while (posicao !== -1) {
    total += 1;
    posicao = texto.indexOf(alvo, posicao + 1);
  }
  return total;
}

const REGEX_URL_NOVA = /(?:https?:\/\/[^\s]+|www\.[^\s]+|\b[a-z0-9-]+\.(?:com|net|org|br|io|app|me|ly|gl|page)\b)/gi;

function urlsDe(texto: string): string[] {
  return (texto.match(REGEX_URL_NOVA) ?? []).map((u) => u.toLowerCase());
}

const REGEX_NUMERO = /\d+/g;

function numerosDe(texto: string): string[] {
  return texto.match(REGEX_NUMERO) ?? [];
}

/** Palavras TODAS em caixa alta (>= 3 letras) do modelo, fora dos placeholders — protege o SAIR (D-49). */
function palavrasObrigatorias(modelo: string): string[] {
  const semPlaceholders = modelo.replace(REGEX_PLACEHOLDER_VARIACAO, "");
  return (semPlaceholders.match(/\b[\p{Lu}]{3,}\b/gu) ?? []).map((p) => p.toUpperCase());
}

export type ResultadoVariacao = { valido: true; texto: string } | { valido: false; motivo: string };

/**
 * [U2] Valida a saida da IA com motivos fixos (strings curtas, sem conteudo do texto).
 * Ordem das regras em (i)..(x). Aprovado devolve o texto sem espacos nas pontas.
 */
export function validarVariacao(modelo: string, variado: string, tipo: TipoVariacao): ResultadoVariacao {
  const texto = typeof variado === "string" ? variado.trim() : "";
  if (!texto) return { valido: false, motivo: "vazio" };

  // (iii) antes de (ii) de proposito: tres crases sao markdown, nao aspa simples.
  if (/```|\*\*|^#/m.test(texto)) return { valido: false, motivo: "markdown" };

  // (ii) comeca e termina com aspas (simples, duplas ou tipograficas) ou crase.
  if (texto.length >= 2 && ASPAS.includes(texto[0]) && ASPAS.includes(texto[texto.length - 1])) {
    return { valido: false, motivo: "envolvido_em_aspas" };
  }

  // (iv) tamanho fora da faixa 0.5x..1.8x do modelo.
  if (texto.length < modelo.length * RAZAO_TAMANHO_MIN || texto.length > modelo.length * RAZAO_TAMANHO_MAX) {
    return { valido: false, motivo: "tamanho" };
  }

  // (v) multiconjunto de nomes de placeholder identico (caixa diferente e aceita).
  if (!mesmoMulticonjunto(nomesPlaceholders(modelo), nomesPlaceholders(texto))) {
    return { valido: false, motivo: "placeholders" };
  }

  // (vi) mesma quantidade de chaves soltas (ex.: "{ link }" com espacos muda a contagem).
  if (
    contarOcorrencias(texto, "{") !== contarOcorrencias(modelo, "{") ||
    contarOcorrencias(texto, "}") !== contarOcorrencias(modelo, "}")
  ) {
    return { valido: false, motivo: "chaves_soltas" };
  }

  const modeloSemPlaceholders = modelo.replace(REGEX_PLACEHOLDER_VARIACAO, "");
  const variadoSemPlaceholders = texto.replace(REGEX_PLACEHOLDER_VARIACAO, "");

  // (vii) URL nova (link, www. ou dominio nu) que nao estava no modelo.
  const urlsModelo = urlsDe(modeloSemPlaceholders);
  if (urlsDe(variadoSemPlaceholders).some((u) => !urlsModelo.includes(u))) {
    return { valido: false, motivo: "url_nova" };
  }

  // (viii) sequencia numerica nova que nao estava no modelo.
  const numerosModelo = numerosDe(modeloSemPlaceholders);
  if (numerosDe(variadoSemPlaceholders).some((n) => !numerosModelo.includes(n))) {
    return { valido: false, motivo: "numero_novo" };
  }

  // (ix) palavra obrigatoria TODA em caixa alta (SAIR do opt-out) precisa continuar igual.
  for (const palavra of palavrasObrigatorias(modelo)) {
    if (!variadoSemPlaceholders.includes(palavra)) return { valido: false, motivo: "palavra_obrigatoria_ausente" };
  }

  // (x) mesmas regras do admin (sem emoji, convite sem cupom, cupom sem link, limite de 600).
  if (validarTextoMensagem(tipo, texto) !== null) return { valido: false, motivo: "regras_da_mensagem" };

  return { valido: true, texto };
}
