// Fase 54 (plano 54-03): utilitarios puros do comprovante interno do PIX (D-04/D-05).
// Sem Nest/Prisma/I-O. O texto vai como nota privada no Chatwoot (nunca ao cliente).

export interface DadosComprovantePix {
  numeroOrcamento: string;
  valorPago: number;
  desconto: number;
  totalOrcamento: number;
  totalPagoAcumulado: number;
  pendente: number;
  quitado: boolean;
  e2eId: string;
  txid: string;
  horario?: string | null;
  pagadorNome?: string | null;
  pagadorDocumento?: string | null;
  infoPagador?: string | null;
}

const FUSO = "America/Sao_Paulo";

/** R$ 1.234,50 (separadores pt-BR, espaco comum em vez de espaco nao quebravel). */
export function formatarBRL(valor: number): string {
  const n = Number.isFinite(valor) ? valor : 0;
  // \s cobre o espaco nao quebravel (U+00A0) e o estreito (U+202F) que o ICU pode usar.
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n).replace(/\s/g, " ");
}

/** DD/MM/AAAA HH:mm em America/Sao_Paulo, montado por partes (independe do separador do ICU). */
export function formatarDataHoraSaoPaulo(data: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}

/**
 * Texto livre de terceiros (pagador) para a nota/PNG: sem quebras, sem URL clicavel,
 * sem markdown, truncado (T-54-07).
 */
export function sanitizarTextoLivre(texto: string | null | undefined, max = 140): string {
  if (texto === null || texto === undefined) return "";
  const limpo = String(texto)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f-\x9f]+/g, " ")
    .replace(/[`*_~[\]()<>#|]/g, "")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "[link]")
    // \s tambem cobre U+2028/U+2029 (separadores de linha unicode).
    .replace(/\s+/g, " ")
    .trim();
  return limpo.slice(0, Math.max(0, max)).trim();
}

/** Nome de arquivo seguro: comprovante-pix-<numero>-<e2e>.<ext> (png, jpg ou pdf; senao png). */
export function nomeArquivoComprovante(numero: string, e2eId: string, extensao: string = "png"): string {
  const seguro = (v: string) => String(v ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  const ext = extensao === "pdf" || extensao === "jpg" || extensao === "png" ? extensao : "png";
  const partes = ["comprovante-pix", seguro(numero), seguro(e2eId)].filter(Boolean);
  return `${partes.join("-")}.${ext}`;
}

function resolverHorario(horario: string | null | undefined, agora: () => Date): Date {
  if (horario) {
    const d = new Date(horario);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return agora();
}

/** Texto da nota privada (D-04): campos minimos do comprovante interno. */
export function montarTextoComprovante(dados: DadosComprovantePix, agora: () => Date = () => new Date()): string {
  const linhas: string[] = [];
  linhas.push(`Pagamento PIX confirmado - Orcamento #${sanitizarTextoLivre(dados.numeroOrcamento, 20)}`);
  linhas.push(`Valor pago: ${formatarBRL(dados.valorPago)}`);
  if (dados.desconto > 0) {
    linhas.push(`Desconto PIX a vista aplicado: ${formatarBRL(dados.desconto)}`);
  }
  linhas.push(`Total do orcamento: ${formatarBRL(dados.totalOrcamento)}`);
  linhas.push(
    dados.quitado
      ? "Situacao: pagamento integral"
      : `Situacao: pagamento parcial (entrada) - pendente ${formatarBRL(dados.pendente)}`,
  );
  linhas.push(`E2E: ${sanitizarTextoLivre(dados.e2eId, 60)}`);
  linhas.push(`TXID: ${sanitizarTextoLivre(dados.txid, 60)}`);
  linhas.push(`Data/hora: ${formatarDataHoraSaoPaulo(resolverHorario(dados.horario, agora))}`);

  const nome = sanitizarTextoLivre(dados.pagadorNome, 80);
  // Documento vem mascarado com asteriscos (markdown): trocar por bolinha antes de sanitizar.
  const doc = sanitizarTextoLivre(String(dados.pagadorDocumento ?? "").replace(/\*/g, "\u2022"), 30);
  if (nome || doc) {
    linhas.push(`Pagador: ${[nome, doc].filter(Boolean).join(" - ")}`);
  }
  const info = sanitizarTextoLivre(dados.infoPagador);
  if (info) {
    linhas.push(`Mensagem do pagador: ${info}`);
  }
  return linhas.join("\n");
}
