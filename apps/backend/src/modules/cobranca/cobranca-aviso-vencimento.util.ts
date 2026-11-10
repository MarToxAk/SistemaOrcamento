/**
 * Util puro do aviso de vencimento/atraso de boletos (Fase 45, D-02/D-03/D-06).
 * Sem imports de Nest/Prisma: so aritmetica de datas YYYY-MM-DD e classificacao.
 */

/** Tipos de aviso (chave de idempotencia junto com o boleto). */
export const TIPOS_AVISO = ["D-3", "D-1", "A+2", "A+7", "A+14"] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

/** Janela em "dias para vencer" (positivo = faltam N dias). Disjuntas por construcao. */
export const JANELAS_AVISO: Readonly<Record<TipoAviso, { min: number; max: number }>> = {
  "D-3": { min: 2, max: 3 },
  "D-1": { min: 1, max: 1 },
  "A+2": { min: -6, max: -2 },
  "A+7": { min: -13, max: -7 },
  "A+14": { min: -20, max: -14 },
};

/** Menor "dias para vencer" coberto por alguma janela (limite do catch-up de atraso). */
export const AVISO_DIAS_MIN: number = Math.min(...TIPOS_AVISO.map((t) => JANELAS_AVISO[t].min));
/** Maior "dias para vencer" coberto por alguma janela (tambem o limite do destaque "Vence em Nd"). */
export const AVISO_DIAS_MAX: number = Math.max(...TIPOS_AVISO.map((t) => JANELAS_AVISO[t].max));

export type StatusAviso = "enviando" | "enviado" | "erro" | "sem_email";
export type SituacaoVencimento = "atrasado" | "vence_hoje" | "a_vencer";

const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

/** YYYY-MM-DD valido (formato e data existente) -> epoch ms em UTC-meia-noite; senao null. */
function paraUtcMs(dataISO: string | null | undefined): number | null {
  if (typeof dataISO !== "string") return null;
  const m = DATA_RE.exec(dataISO);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  // Ida e volta: rejeita datas inexistentes (ex.: 2026-02-30) que o Date normalizaria.
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return ms;
}

/**
 * Dias entre `hoje` e `expireAt` (positivo = faltam N dias; negativo = vencido ha N dias).
 * Ambos YYYY-MM-DD; entrada invalida devolve null.
 */
export function calcularDiasParaVencer(
  expireAt: string | null | undefined,
  hoje: string,
): number | null {
  const expireMs = paraUtcMs(expireAt);
  const hojeMs = paraUtcMs(hoje);
  if (expireMs === null || hojeMs === null) return null;
  return Math.round((expireMs - hojeMs) / MS_DIA);
}

/** Unico tipo cuja janela contem `dias`, ou null (dia do vencimento e fora das janelas nao avisam). */
export function tipoAvisoAplicavel(dias: number | null): TipoAviso | null {
  if (dias === null || !Number.isInteger(dias)) return null;
  for (const tipo of TIPOS_AVISO) {
    const { min, max } = JANELAS_AVISO[tipo];
    if (dias >= min && dias <= max) return tipo;
  }
  return null;
}

/** Soma `dias` (pode ser negativo) a uma data YYYY-MM-DD em UTC-meia-noite; devolve YYYY-MM-DD. */
export function somarDias(dataISO: string, dias: number): string {
  const ms = paraUtcMs(dataISO);
  if (ms === null) throw new RangeError(`Data invalida: ${dataISO}`);
  return new Date(ms + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Situacao para o alerta interno: so boleto pendente com data valida e dentro do destaque. */
export function classificarVencimento(
  dias: number | null,
  status: string,
): SituacaoVencimento | null {
  if (status !== "pendente" || dias === null) return null;
  if (dias < 0) return "atrasado";
  if (dias === 0) return "vence_hoje";
  if (dias <= AVISO_DIAS_MAX) return "a_vencer";
  return null;
}

/** "cob@x.com" -> "co***@x.com"; nulo/vazio/sem "@" -> "(sem e-mail)". Para logs e previa. */
export function mascararEmail(email: string | null | undefined): string {
  const valor = typeof email === "string" ? email.trim() : "";
  const arroba = valor.indexOf("@");
  if (!valor || arroba <= 0) return "(sem e-mail)";
  const local = valor.slice(0, arroba);
  const dominio = valor.slice(arroba + 1);
  const visivel = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visivel}***@${dominio}`;
}
