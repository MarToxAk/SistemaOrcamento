// Funcoes puras e utilitario de download das notas fiscais (Fase 47, D-09..D-12).
// Sem imports e so com sintaxe TypeScript apagavel, para o script de checagem do Node importar direto.
// Tipos do DOM (Response, RequestInit) aparecem apenas em anotacoes.

/** Maximo de notas por ZIP; espelha LIMITE_NOTAS_ZIP do backend e do proxy /api/cobranca/notas/zip. */
export const LIMITE_NOTAS_ZIP = 50;

/** Notas por pagina na lista de notas fiscais. */
export const NOTAS_POR_PAGINA = 50;

export type SituacaoXml = "salvo" | "link" | "indisponivel";

/** NFS-e da lista geral (GET /api/cobranca/notas, 47-03). */
export interface NotaNfseLista {
  tipo: "NFS-e";
  id: number;
  numero: string | null;
  idclienteAthos: number;
  nomeCliente: string;
  valor: number;
  dataEmissao: string;
  titulos: number[];
  xml: SituacaoXml;
}

/** NF-e vinculada a um boleto (GET /api/cobranca/notas, 47-03). */
export interface NotaNfeLista {
  tipo: "NF-e";
  cobrancaBoletoId: number;
  boletoStatus: string;
  numero: string;
  idclienteAthos: number;
  nomeCliente: string;
  valor: number | null;
  dataEmissao: string | null;
  titulos: number[];
}

export interface RespostaNotas {
  nfse: NotaNfseLista[];
  nfe: NotaNfeLista[];
  truncado: boolean;
  avisoNfe: string | null;
}

export type NotaSelecionavel =
  | { tipo: "NFS-e"; id: number }
  | { tipo: "NF-e"; cobrancaBoletoId: number; numero: string };

/** Chave estavel de uma nota: "nfse:74" ou "nfe:45:4521". */
export function chaveNota(n: NotaSelecionavel): string {
  return n.tipo === "NFS-e" ? `nfse:${n.id}` : `nfe:${n.cobrancaBoletoId}:${n.numero}`;
}

/** Corpo do POST /api/cobranca/notas/zip, sem notas repetidas. */
export function montarPayloadZip(notas: NotaSelecionavel[]): {
  nfseIds: number[];
  nfe: Array<{ cobrancaBoletoId: number; numero: string }>;
} {
  const vistos = new Set<string>();
  const nfseIds: number[] = [];
  const nfe: Array<{ cobrancaBoletoId: number; numero: string }> = [];
  for (const n of notas) {
    const chave = chaveNota(n);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (n.tipo === "NFS-e") {
      nfseIds.push(n.id);
    } else {
      nfe.push({ cobrancaBoletoId: n.cobrancaBoletoId, numero: n.numero });
    }
  }
  return { nfseIds, nfe };
}

/** Fica so com o nome apos a ultima barra e sem caracteres de controle. */
function sanitizarNomeArquivo(bruto: string): string {
  const semControle = bruto.replace(/[\u0000-\u001f\u007f]/g, "");
  const nome = semControle.slice(Math.max(semControle.lastIndexOf("/"), semControle.lastIndexOf("\\")) + 1).trim();
  return nome === "." || nome === ".." ? "" : nome;
}

/**
 * Nome do arquivo a partir do Content-Disposition (aceita `filename*=UTF-8''...` e `filename="..."`).
 * Sempre devolve so o nome (sem diretorios, sem caracteres de controle); vazio -> `padrao`.
 */
export function extrairNomeArquivo(contentDisposition: string | null, padrao: string): string {
  const reserva = sanitizarNomeArquivo(padrao) || "arquivo";
  if (!contentDisposition) return reserva;

  let bruto = "";
  const estendido = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(contentDisposition);
  if (estendido) {
    const codificado = estendido[1].trim();
    try {
      bruto = decodeURIComponent(codificado);
    } catch {
      bruto = codificado;
    }
  } else {
    const simples = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(contentDisposition);
    if (simples) bruto = (simples[1] ?? simples[2] ?? "").trim();
  }

  return sanitizarNomeArquivo(bruto) || reserva;
}

/** Mensagem para o usuario a partir do status HTTP e do corpo JSON (se houver) de um download com falha. */
export function mensagemErroDownload(status: number, corpo: unknown): string {
  if (status === 0) return "Falha na conexão.";
  if (status === 401) return "Sessão de administrador necessária.";

  if (corpo && typeof corpo === "object") {
    const o = corpo as { message?: unknown; error?: unknown };
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (Array.isArray(o.message)) {
      const partes = o.message.filter((m): m is string => typeof m === "string" && m.trim() !== "");
      if (partes.length > 0) return partes.join("; ");
    }
    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
  }

  if (status === 404) return "Arquivo indisponível.";
  return `Erro ao baixar (HTTP ${status}).`;
}

/** True quando o backend respondeu 404 dizendo que a NFS-e nao tem XML salvo (D-11). */
export function xmlIndisponivel(status: number, mensagem: string): boolean {
  return status === 404 && /xml indispon[ií]vel/i.test(mensagem);
}

/** Campos usados pelo filtro de exibicao (NFS-e e NF-e da lista). */
export interface NotaFiltravel {
  tipo: "NFS-e" | "NF-e";
  numero: string | null;
  nomeCliente: string;
  idclienteAthos: number;
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Filtra por tipo e por busca (nome do cliente, numero da nota ou id do cliente; sem acentos nem maiusculas). */
export function filtrarNotasExibicao<T extends NotaFiltravel>(
  lista: T[],
  filtros: { tipo: "" | "nfse" | "nfe"; busca: string },
): T[] {
  const termo = semAcento(filtros.busca.trim());
  return lista.filter((n) => {
    if (filtros.tipo === "nfse" && n.tipo !== "NFS-e") return false;
    if (filtros.tipo === "nfe" && n.tipo !== "NF-e") return false;
    if (!termo) return true;
    return (
      semAcento(n.nomeCliente).includes(termo) ||
      semAcento(n.numero ?? "").includes(termo) ||
      String(n.idclienteAthos).includes(termo)
    );
  });
}

/** Pagina `pagina` (1..N) de `lista`; pagina fora do intervalo vai para a mais proxima valida. */
export function paginar<T>(
  lista: T[],
  pagina: number,
  porPagina: number,
): { itens: T[]; totalPaginas: number; pagina: number } {
  const tamanho = Number.isInteger(porPagina) && porPagina > 0 ? porPagina : 1;
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanho));
  const pedida = Number.isFinite(pagina) ? Math.trunc(pagina) : 1;
  const atual = Math.min(Math.max(pedida, 1), totalPaginas);
  return { itens: lista.slice((atual - 1) * tamanho, atual * tamanho), totalPaginas, pagina: atual };
}

/** DD/MM/AAAA. Data pura (AAAA-MM-DD) nao passa por Date para nao deslocar o dia pelo fuso. */
export function formatarDataEmissao(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/**
 * Baixa um arquivo pelo navegador: fetch -> blob -> link temporario com `download`.
 * Em falha devolve o status e a mensagem (do corpo JSON do backend, quando houver); nunca cria arquivo falso.
 */
export async function baixarArquivo(
  url: string,
  init: RequestInit | undefined,
  nomePadrao: string,
): Promise<{ ok: true; nome: string } | { ok: false; status: number; mensagem: string }> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, mensagem: mensagemErroDownload(0, null) };
  }

  if (!res.ok) {
    const corpo: unknown = await res.json().catch(() => null);
    return { ok: false, status: res.status, mensagem: mensagemErroDownload(res.status, corpo) };
  }

  try {
    const blob = await res.blob();
    const nome = extrairNomeArquivo(res.headers.get("content-disposition"), nomePadrao);
    const objeto = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objeto;
    link.download = nome;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objeto), 1000);
    return { ok: true, nome };
  } catch {
    return { ok: false, status: 0, mensagem: mensagemErroDownload(0, null) };
  }
}
