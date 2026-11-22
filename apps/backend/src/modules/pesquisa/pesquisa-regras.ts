/**
 * Fase 52 (plano 52-01): regras puras da pesquisa de satisfacao.
 * Sem Nest e sem Prisma: tudo aqui e testavel sem infraestrutura.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const VARIANTES = ["ESTRELAS", "CARINHAS"] as const;
export type Variante = (typeof VARIANTES)[number];

/** D-02: token = randomBytes(24) em hex (192 bits, 48 caracteres minusculos). */
export const REGEX_TOKEN = /^[0-9a-f]{48}$/;

export function gerarToken(): string {
  return randomBytes(24).toString("hex");
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

/** Troca `{nome}` pelas variaveis recebidas (so essas chaves); chave ausente vira "". Sem logica. */
export function renderizarTexto(modelo: string, variaveis: Record<string, string>): string {
  return modelo.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (_trecho, chave: string) =>
    Object.prototype.hasOwnProperty.call(variaveis, chave) ? variaveis[chave] : "",
  );
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
