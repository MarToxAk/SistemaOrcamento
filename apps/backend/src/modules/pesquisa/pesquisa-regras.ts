/**
 * Fase 52: regras puras da pesquisa de satisfacao.
 * Plano 52-01: token, telefone, variante, renderizacao, formatadores e limitadores.
 * Plano 52-03: codigo de cupom, dinheiro em centavos, mes de Sao Paulo, situacao derivada, opt-out,
 * mascara de telefone, contraste, link do Google, validacao de mensagens/config e padroes por empresa.
 *
 * Sem Nest e sem Prisma: tudo aqui e testavel sem infraestrutura.
 */
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const VARIANTES = ["ESTRELAS", "CARINHAS"] as const;
export type Variante = (typeof VARIANTES)[number];

/** D-02: token = randomBytes(24) em hex (192 bits, 48 caracteres minusculos). */
export const REGEX_TOKEN = /^[0-9a-f]{48}$/;

export function gerarToken(): string {
  return randomBytes(24).toString("hex");
}

/** Nota da pesquisa: inteiro de 1 a 5 (D-06/UI-D05). */
export function notaValida(nota: unknown): boolean {
  return typeof nota === "number" && Number.isInteger(nota) && nota >= 1 && nota <= 5;
}

/**
 * D-32: so digitos; 10 ou 11 digitos ganham o prefixo 55; so `55` + 10 ou 11 digitos e valido.
 * Nao tenta casar numero sem o 9 nem adivinhar DDD.
 */
export function normalizarTelefone(bruto: string | null | undefined): string | null {
  if (typeof bruto !== "string") return null;
  let digitos = bruto.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  return /^55\d{10,11}$/.test(digitos) ? digitos : null;
}

/** D-04: ESTRELAS e CARINHAS fixos; AB sorteia 50/50; modo desconhecido cai em ESTRELAS. */
export function sortearVariante(modo: string, rnd: () => number = Math.random): Variante {
  if (modo === "CARINHAS") return "CARINHAS";
  if (modo === "AB") return rnd() < 0.5 ? "ESTRELAS" : "CARINHAS";
  return "ESTRELAS";
}

/**
 * Troca `{nome}` pelas variaveis recebidas (so essas chaves); a chave e comparada sem diferenciar
 * maiusculas de minusculas (`{LINK}`, `{Link}` e `{link}` sao a mesma variavel) e chave ausente do
 * mapa vira "". Sem logica.
 */
export function renderizarTexto(modelo: string, variaveis: Record<string, string>): string {
  return modelo.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (_trecho, chave: string) => {
    const chaveNormalizada = chave.toLowerCase();
    return Object.prototype.hasOwnProperty.call(variaveis, chaveNormalizada)
      ? variaveis[chaveNormalizada]
      : "";
  });
}

function paraNumero(valor: number | string): number {
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** "R$ 2,00" (pt-BR, 2 casas, espaco comum). */
export function formatarReais(valor: number | string): string {
  const texto = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    paraNumero(valor),
  );
  return `R$ ${texto}`;
}

/** "10%" quando inteiro; "7,5%" quando nao. */
export function formatarPercentual(valor: number | string): string {
  const n = paraNumero(valor);
  const texto = Number.isInteger(n)
    ? String(n)
    : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  return `${texto}%`;
}

/** dd/mm/aaaa em America/Sao_Paulo. */
export function formatarDataBR(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

const MAX_CHAVES_LIMITADOR = 10_000;
const INTERVALO_LIMPEZA_MS = 1_000;

/** Janela fixa por chave, em memoria. Descarta entradas vencidas e guarda no maximo 10000 chaves. */
export class LimitadorJanela {
  private readonly entradas = new Map<string, { inicio: number; contagem: number }>();
  private ultimaLimpeza = 0;

  constructor(
    private readonly max: number,
    private readonly janelaMs: number,
    private readonly agora: () => number = Date.now,
  ) {}

  /** Conta a chamada e devolve true enquanto a chave estiver dentro do limite da janela. */
  permitir(chave: string): boolean {
    const agora = this.agora();
    this.limparVencidas(agora);

    let entrada = this.entradas.get(chave);
    if (!entrada || agora - entrada.inicio >= this.janelaMs) {
      entrada = { inicio: agora, contagem: 0 };
      this.entradas.delete(chave);
      this.entradas.set(chave, entrada);
    }
    entrada.contagem += 1;

    while (this.entradas.size > MAX_CHAVES_LIMITADOR) {
      const maisAntiga = this.entradas.keys().next().value;
      if (maisAntiga === undefined) break;
      this.entradas.delete(maisAntiga);
    }

    return entrada.contagem <= this.max;
  }

  private limparVencidas(agora: number): void {
    if (agora - this.ultimaLimpeza < INTERVALO_LIMPEZA_MS && this.entradas.size <= MAX_CHAVES_LIMITADOR) return;
    this.ultimaLimpeza = agora;
    for (const [chave, entrada] of this.entradas) {
      if (agora - entrada.inicio >= this.janelaMs) this.entradas.delete(chave);
    }
  }
}

/** D-37: limites proprios da rota publica (o throttler global por IP nao conta esta rota). */
export const LIMITES_PESQUISA_PUBLICA = {
  porIpReal: { max: 60, janelaMs: 60_000 },
  porIpSocketCompartilhado: { max: 20, janelaMs: 60_000 },
  porToken: { max: 30, janelaMs: 3_600_000 },
  tetoDaRota: { max: 300, janelaMs: 60_000 },
} as const;

/** Comparacao em tempo constante; falso se faltar qualquer uma das chaves ou se os tamanhos diferirem. */
export function chaveInternaValida(fornecida: string | undefined, esperada: string | undefined): boolean {
  if (!fornecida || !esperada) return false;
  const a = Buffer.from(fornecida, "utf8");
  const b = Buffer.from(esperada, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * O IP encaminhado (`x-client-ip`, enviado pelo proxy do Next) so vale com a chave interna valida
 * e sendo um IP de verdade; senao vale o IP do socket, que e o do proxy (balde compartilhado).
 */
export function resolverIpCliente(e: {
  ipSocket?: string;
  ipEncaminhado?: string;
  chaveValida: boolean;
}): { ip: string; confiavel: boolean } {
  if (e.chaveValida && typeof e.ipEncaminhado === "string" && isIP(e.ipEncaminhado) !== 0) {
    return { ip: e.ipEncaminhado, confiavel: true };
  }
  return { ip: e.ipSocket ?? "desconhecido", confiavel: false };
}

// -------------------------------------------------------------------------------------------------
// Plano 52-03: cupom, dinheiro, mes, situacao, opt-out, contraste, link, mensagens e config
// -------------------------------------------------------------------------------------------------

/** D-45: alfabeto sem 0, 1, I, L e O (31 simbolos) para o codigo do cupom. */
export const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** D-45: PREFIXO (1 a 6) + hifen + 6 simbolos nao ambiguos. */
export const REGEX_CODIGO = /^[A-Z0-9]{1,6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/** D-45: codigo do cupom gerado com crypto.randomInt (nunca Math.random). */
export function gerarCodigoCupom(prefixo: string, sorteio: (max: number) => number = randomInt): string {
  let sufixo = "";
  for (let i = 0; i < 6; i += 1) sufixo += ALFABETO_CODIGO[sorteio(ALFABETO_CODIGO.length)];
  return `${prefixo}-${sufixo}`;
}

/** Codigo digitado pelo balcao: sem espacos, em maiusculas. */
export function normalizarCodigo(texto: string): string {
  return String(texto ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Reais (number ou string do Prisma) para centavos inteiros; NaN quando a entrada nao e numero. */
export function paraCentavos(valor: number | string): number {
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
}

/** Centavos inteiros para string decimal com ponto ("0.05"), na borda do Prisma. */
export function deCentavos(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/**
 * D-15/UI-D10: desconto em centavos com percentual em pontos-base (10% = 1000).
 * Arredonda SEMPRE para baixo e limita ao teto e ao valor da compra; nunca negativo.
 */
export function calcularDescontoCentavos(
  compraCentavos: number,
  percentualBps: number,
  tetoCentavos: number,
): number {
  if (![compraCentavos, percentualBps, tetoCentavos].every((n) => Number.isFinite(n))) return 0;
  const bruto = Math.floor((compraCentavos * percentualBps) / 10_000);
  return Math.max(0, Math.min(bruto, Math.floor(tetoCentavos), Math.floor(compraCentavos)));
}

const FORMATADOR_MES_SAO_PAULO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
});

/**
 * D-31/P11: janela do mes em America/Sao_Paulo. Sao Paulo e UTC-3 fixo desde 2019 (sem horario de
 * verao), por isso a meia-noite local e 03:00Z. `inicio` inclusivo e `fim` exclusivo.
 */
export function janelaMesSaoPaulo(agora: Date = new Date()): { inicio: Date; fim: Date; rotulo: string } {
  const partes = FORMATADOR_MES_SAO_PAULO.formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1, 3)),
    fim: new Date(Date.UTC(ano, mes, 1, 3)),
    rotulo: `${ano}-${String(mes).padStart(2, "0")}`,
  };
}

export type SituacaoCupom = "EMITIDO" | "SUSPENSO" | "USADO" | "EXPIRADO" | "CANCELADO";

/**
 * UI-D09: "SUSPENSO" e derivado (nunca persistido). O status gravado manda; EMITIDO vencido vira
 * EXPIRADO e EMITIDO com o teto do mes atingido vira SUSPENSO.
 */
export function situacaoCupom(
  cupom: { status: string; validadeAte: Date },
  agora: Date,
  gastoMesCentavos: number,
  tetoMensalCentavos: number,
): SituacaoCupom {
  const status = String(cupom.status).toUpperCase();
  if (status === "USADO" || status === "CANCELADO" || status === "EXPIRADO") return status;
  if (cupom.validadeAte.getTime() < agora.getTime()) return "EXPIRADO";
  if (gastoMesCentavos >= tetoMensalCentavos) return "SUSPENSO";
  return "EMITIDO";
}

/** D-49: "SAIR" normalizado (sem acento, sem pontuacao, caixa alta). "SAIR 2" e "sair por favor" nao valem. */
export function ehOptOut(texto: string): boolean {
  const normal = String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .toLowerCase();
  return normal === "sair";
}

/** D-32/T-52-20: mascara com DDD e os quatro ultimos digitos; invalido vira "*****". */
export function mascararTelefone(telefone: string | null | undefined): string {
  if (typeof telefone !== "string") return "*****";
  const digitos = telefone.replace(/\D/g, "");
  if (!/^55\d{10,11}$/.test(digitos)) return "*****";
  return `(${digitos.slice(2, 4)}) *****-${digitos.slice(-4)}`;
}

function canalLinear(valor: number): number {
  const s = valor / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminancia(hex: string): number {
  const casamento = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!casamento) return Number.NaN;
  let valor = casamento[1];
  if (valor.length === 3) valor = valor.split("").map((c) => c + c).join("");
  const r = parseInt(valor.slice(0, 2), 16);
  const g = parseInt(valor.slice(2, 4), 16);
  const b = parseInt(valor.slice(4, 6), 16);
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}

/** UI: contraste WCAG 2.x do hex contra branco; NaN quando o formato nao e #rgb nem #rrggbb. */
export function razaoContraste(hex: string): number {
  const l = luminancia(hex);
  if (!Number.isFinite(l)) return Number.NaN;
  return 1.05 / (l + 0.05);
}

/** UI: abaixo de 4,5:1 (ou formato invalido) usa o fallback e sinaliza `ajustada`. */
export function corPrimariaAcessivel(
  hex: string | undefined,
  fallback = "#0d6efd",
): { cor: string; ajustada: boolean } {
  if (typeof hex === "string") {
    const razao = razaoContraste(hex);
    if (Number.isFinite(razao) && razao >= 4.5) return { cor: hex, ajustada: false };
  }
  return { cor: fallback, ajustada: true };
}

/** D-39/T-52-17: allowlist de hosts do Google (comparacao exata, sem sufixo). */
export const HOSTS_GOOGLE = ["g.page", "search.google.com", "maps.google.com", "business.google.com"] as const;

const MSG_LINK_HTTPS = "Informe um link que comece com https://.";
const MSG_LINK_GOOGLE =
  "Use um link do Google (g.page, search.google.com, maps.google.com ou business.google.com).";

/** null = valido (vazio tambem desliga o convite); senao a mensagem em portugues. */
export function validarLinkGoogle(url: string | null | undefined): string | null {
  if (url === null || url === undefined) return null;
  const texto = String(url).trim();
  if (!texto) return null;

  let alvo: URL;
  try {
    alvo = new URL(texto);
  } catch {
    return MSG_LINK_HTTPS;
  }
  if (alvo.protocol !== "https:") return MSG_LINK_HTTPS;
  return (HOSTS_GOOGLE as readonly string[]).includes(alvo.host) ? null : MSG_LINK_GOOGLE;
}

/** UI-SPEC: lista fechada de placeholders (sem Handlebars, sem logica). */
export const PLACEHOLDERS_VALIDOS = [
  "link",
  "percentual",
  "teto",
  "compra_minima",
  "validade",
  "codigo",
  "link_google",
  "nome_empresa",
] as const;

export type TipoTexto = "fechamento" | "semRecompensa" | "posResposta" | "convite" | "pagina";

const MAX_TEXTO_MENSAGEM = 600;
const LISTA_PLACEHOLDERS = PLACEHOLDERS_VALIDOS.join(", ");
const REGEX_PLACEHOLDER = /\{([a-z_][a-z0-9_]*)\}/gi;

/** UI-SPEC: null = valido; senao a mensagem exata do campo. */
export function validarTextoMensagem(tipo: TipoTexto, texto: string): string | null {
  const conteudo = typeof texto === "string" ? texto : "";
  if (conteudo.length > MAX_TEXTO_MENSAGEM) return "Máximo de 600 caracteres.";
  if (/\p{Extended_Pictographic}/u.test(conteudo)) return "Remova emoji. Mensagens usam só texto.";

  for (const casamento of conteudo.matchAll(REGEX_PLACEHOLDER)) {
    const chave = casamento[1].toLowerCase();
    if (!(PLACEHOLDERS_VALIDOS as readonly string[]).includes(chave)) {
      return `Campo {${casamento[1]}} não existe. Use: ${LISTA_PLACEHOLDERS}.`;
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
    // P18: o convite do Google nao se liga ao cupom.
    if (baixo.includes("{codigo}") || baixo.includes("cupom")) return "O convite do Google não pode falar de cupom.";
    if (!baixo.includes("{link_google}")) return "Inclua {link_google} para o convite do Google.";
  }
  return null;
}

/** D-24: campos editaveis da configuracao (numeros já convertidos de Decimal na borda). */
export interface ConfigEntrada {
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
  varianteVisual: string;
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

/** UI-D15/T-52-16: mapa campo -> mensagem em portugues; vazio = valida. */
export function validarConfig(c: ConfigEntrada): Record<string, string> {
  const erros: Record<string, string> = {};

  const numero = (campo: string, valor: number, minimo: number, maximo: number, msgMin: string, msgMax: string) => {
    if (typeof valor !== "number" || !Number.isFinite(valor)) {
      erros[campo] = "Informe um número.";
      return;
    }
    if (valor < 0) {
      erros[campo] = "Não pode ser negativo.";
      return;
    }
    if (valor < minimo) {
      erros[campo] = msgMin;
      return;
    }
    if (valor > maximo) erros[campo] = msgMax;
  };

  numero("percentualDesconto", c.percentualDesconto, 1, 50, "Mínimo de 1%.", "Máximo de 50%.");
  numero("tetoDesconto", c.tetoDesconto, 0, Number.MAX_SAFE_INTEGER, "Não pode ser negativo.", "Informe um número.");
  numero("compraMinima", c.compraMinima, 0, Number.MAX_SAFE_INTEGER, "Não pode ser negativo.", "Informe um número.");
  numero("tetoMensal", c.tetoMensal, 0, Number.MAX_SAFE_INTEGER, "Não pode ser negativo.", "Informe um número.");
  numero("validadeCupomDias", c.validadeCupomDias, 1, 180, "Mínimo de 1 dia.", "Máximo de 180 dias.");
  numero("validadeLinkDias", c.validadeLinkDias, 1, 14, "Mínimo de 1 dia.", "Máximo de 14 dias.");
  numero("intervaloDias", c.intervaloDias, 0, 365, "Não pode ser negativo.", "Máximo de 365 dias.");

  const prefixo = typeof c.prefixoCupom === "string" ? c.prefixoCupom.trim() : "";
  if (!/^[A-Z0-9]{1,6}$/.test(prefixo.toUpperCase()) || /\s/.test(prefixo)) {
    erros.prefixoCupom = "Use de 1 a 6 letras ou números, sem espaços.";
  }

  if (!["ESTRELAS", "CARINHAS", "AB"].includes(c.varianteVisual)) {
    erros.varianteVisual = "Escolha uma variante válida.";
  }

  const linkErro = validarLinkGoogle(c.linkGoogle);
  if (linkErro) erros.linkGoogle = linkErro;

  const textos: Array<[keyof ConfigEntrada, TipoTexto]> = [
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
    const mensagem = validarTextoMensagem(tipo, String(c[campo] ?? ""));
    if (mensagem) erros[campo] = mensagem;
  }

  return erros;
}

/** D-26/UI-SPEC: copy padrao dos textos editaveis. Sem emoji; o convite nunca cita cupom. */
export const TEXTOS_PADRAO: Pick<
  ConfigEntrada,
  | "textoFechamento"
  | "textoSemRecompensa"
  | "textoPosResposta"
  | "textoConviteGoogle"
  | "paginaTitulo"
  | "paginaSubtitulo"
  | "paginaObrigadoSemRecompensa"
  | "paginaGoogleTitulo"
  | "paginaGoogleCorpo"
> = {
  textoFechamento:
    "Olá! Como foi seu atendimento? Responda nossa pesquisa e ganhe {percentual} de desconto na próxima compra, até {teto}, com compra mínima de {compra_minima}.\n{link}\nNão quer receber? Responda SAIR.",
  textoSemRecompensa:
    "Olá! Como foi seu atendimento? Sua opinião ajuda a melhorar o nosso atendimento.\n{link}\nNão quer receber? Responda SAIR.",
  textoPosResposta:
    "Obrigado por responder! Seu cupom na {nome_empresa}: {percentual} de desconto, até {teto}, com compra mínima de {compra_minima}. Use o código {codigo} até {validade}. Uso único.",
  textoConviteGoogle:
    "Quer compartilhar sua experiência? Sua avaliação no Google ajuda outros clientes a conhecerem a {nome_empresa}.\n{link_google}",
  paginaTitulo: "Como foi seu atendimento?",
  paginaSubtitulo: "Leva menos de 1 minuto. Sua opinião ajuda a melhorar o atendimento.",
  paginaObrigadoSemRecompensa: "Obrigado por responder. Sua opinião é muito importante para nós.",
  paginaGoogleTitulo: "Quer compartilhar sua experiência?",
  paginaGoogleCorpo: "Sua avaliação no Google ajuda outros clientes a nos conhecerem.",
};

function numeroEnv(get: (chave: string) => string | undefined, chave: string, padrao: number): number {
  const bruto = get(chave);
  if (bruto === undefined || bruto === null || String(bruto).trim() === "") return padrao;
  const n = Number(String(bruto).trim());
  return Number.isFinite(n) && n >= 0 ? n : padrao;
}

/**
 * D-24/D-26/D-42: config que nasce no primeiro acesso. Padroes da empresa vêm das envs por instancia
 * (PESQUISA_*_PADRAO) ou dos padroes do codigo; ativo false e todos os textos preenchidos.
 */
export function montarConfigPadrao(get: (chave: string) => string | undefined): ConfigEntrada {
  const prefixoBruto = (get("PESQUISA_PREFIXO_PADRAO") ?? "").trim().toUpperCase();
  return {
    ativo: false,
    percentualDesconto: numeroEnv(get, "PESQUISA_PERCENTUAL_PADRAO", 10),
    tetoDesconto: numeroEnv(get, "PESQUISA_TETO_PADRAO", 5),
    compraMinima: numeroEnv(get, "PESQUISA_COMPRA_MINIMA_PADRAO", 30),
    validadeCupomDias: 30,
    validadeLinkDias: 7,
    intervaloDias: 90,
    tetoMensal: numeroEnv(get, "PESQUISA_TETO_MENSAL_PADRAO", 300),
    prefixoCupom: /^[A-Z0-9]{1,6}$/.test(prefixoBruto) ? prefixoBruto : "BC",
    linkGoogle: null,
    varianteVisual: "AB",
    ...TEXTOS_PADRAO,
  };
}
