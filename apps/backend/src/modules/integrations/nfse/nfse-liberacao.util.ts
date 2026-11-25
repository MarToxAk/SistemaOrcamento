import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/**
 * Fase 54 (D-09): utilitarios puros da liberacao da NFS-e por senha. Este modulo NAO le env nem
 * guarda segredo: a senha esperada chega por parametro (vinda de process.env[NFSE_OVERRIDE_ENV]).
 */

/** Nome da variavel de ambiente com a senha unica da empresa (valor definido fora do repositorio). */
export const NFSE_OVERRIDE_ENV = "NFSE_OVERRIDE_PASSWORD";

/** D-09: no maximo 5 falhas por IP a cada 15 minutos. */
export const LIMITE_FALHAS_POR_IP = { max: 5, janelaMs: 900_000 } as const;

/** D-09: no maximo 20 falhas somadas (todas as origens) a cada 15 minutos. */
export const LIMITE_FALHAS_GLOBAL = { max: 20, janelaMs: 900_000 } as const;

const MAX_CHAVES_LIMITADOR = 10_000;
const MAX_LIBERADO_POR = 80;

function sha256(texto: string): Buffer {
  return createHash("sha256").update(texto, "utf8").digest();
}

/**
 * Compara a senha informada com a esperada em tempo constante. Os dois textos passam por sha256
 * antes de timingSafeEqual, entao os buffers tem sempre 32 bytes e o tamanho nao vaza. Qualquer
 * lado vazio ou ausente devolve false: sem senha configurada, nunca libera por omissao.
 */
export function senhaConfere(informada: string | undefined | null, esperada: string | undefined | null): boolean {
  if (typeof informada !== "string" || informada.length === 0) return false;
  if (typeof esperada !== "string" || esperada.length === 0) return false;
  return timingSafeEqual(sha256(informada), sha256(esperada));
}

type EntradaFalhas = { contagem: number; expiraEm: number };

/**
 * Limitador de falhas em memoria (janela fixa por chave). So conta falhas registradas: consultar
 * `bloqueado` nunca incrementa. Mantem no maximo 10000 chaves, descartando as mais antigas
 * (a ordem de insercao do Map). O backend roda em instancia unica, entao o estado em memoria basta.
 */
export class LimitadorFalhas {
  private readonly entradas = new Map<string, EntradaFalhas>();

  constructor(
    private readonly max: number,
    private readonly janelaMs: number,
    private readonly agora: () => number = Date.now,
  ) {}

  bloqueado(chave: string): boolean {
    const entrada = this.entradas.get(chave);
    if (!entrada) return false;
    if (entrada.expiraEm <= this.agora()) {
      this.entradas.delete(chave);
      return false;
    }
    return entrada.contagem >= this.max;
  }

  registrarFalha(chave: string): void {
    const agora = this.agora();
    const atual = this.entradas.get(chave);
    if (atual && atual.expiraEm > agora) {
      atual.contagem += 1;
      return;
    }
    // Janela nova (ou vencida): reinsere para a chave ir ao fim da ordem de insercao.
    this.entradas.delete(chave);
    this.entradas.set(chave, { contagem: 1, expiraEm: agora + this.janelaMs });
    this.podar(agora);
  }

  limpar(chave: string): void {
    this.entradas.delete(chave);
  }

  /** Quantidade de chaves em memoria (uso em testes e diagnostico). */
  tamanho(): number {
    return this.entradas.size;
  }

  private podar(agora: number): void {
    if (this.entradas.size <= MAX_CHAVES_LIMITADOR) return;
    for (const [chave, entrada] of this.entradas) {
      if (entrada.expiraEm <= agora) this.entradas.delete(chave);
    }
    while (this.entradas.size > MAX_CHAVES_LIMITADOR) {
      const maisAntiga = this.entradas.keys().next();
      if (maisAntiga.done) break;
      this.entradas.delete(maisAntiga.value);
    }
  }
}

/**
 * IP do operador para a auditoria. O IP encaminhado (x-client-ip enviado pelo proxy do Next) e
 * confiavel porque a rota fica atras do InternalAuthGuard; se nao for um IP valido, cai no socket.
 */
export function resolverIpOperador(e: { ipEncaminhado?: string; ipSocket?: string }): string {
  if (typeof e.ipEncaminhado === "string" && isIP(e.ipEncaminhado) !== 0) return e.ipEncaminhado;
  if (typeof e.ipSocket === "string" && e.ipSocket.length > 0) return e.ipSocket;
  return "desconhecido";
}

/** Normaliza o nome digitado de quem libera: sem controle/quebras, espacos colapsados, ate 80 chars. */
export function sanitizarLiberadoPor(texto: string | null | undefined): string {
  if (typeof texto !== "string") return "";
  return texto
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LIBERADO_POR)
    .trim();
}
