// Filtros da pagina de boletos consolidados (Fase 47, D-08/D-04): leitura da URL e filtragem da lista.
// Puro, sem imports e so com sintaxe TypeScript apagavel, para o script de checagem do Node importar direto.

export type FiltrosBoletos = {
  status: "" | "pendente" | "pago";
  situacao: "" | "a_vencer" | "atrasado";
  de: string;
  ate: string;
  busca: string;
};

const BUSCA_MAX = 80;

/** Minusculas e sem acentos (NFD), para comparar nomes. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** AAAA-MM-DD de data real; qualquer outra coisa vira "". */
function lerDataIso(valor: string | null | undefined): string {
  if (!valor) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return "";
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  const real = d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
  return real ? valor : "";
}

/** Le os filtros dos parametros da URL, aceitando so valores permitidos. */
export function lerFiltrosBoletos(valores: Record<string, string | null | undefined>): FiltrosBoletos {
  const status = valores.status === "pendente" || valores.status === "pago" ? valores.status : "";
  const situacao = valores.situacao === "a_vencer" || valores.situacao === "atrasado" ? valores.situacao : "";
  const busca = (valores.busca ?? "").trim().slice(0, BUSCA_MAX).trim();
  return {
    status,
    situacao,
    de: lerDataIso(valores.de),
    ate: lerDataIso(valores.ate),
    busca,
  };
}

/** Aplica os filtros mantendo a ordem original da lista. */
export function filtrarBoletos<
  T extends { status: string; diasParaVencer: number | null; expireAt: string | null; nomeCliente: string; idclienteAthos: number },
>(lista: T[], filtros: FiltrosBoletos): T[] {
  const termo = normalizarTexto(filtros.busca);
  const temPeriodo = filtros.de !== "" || filtros.ate !== "";
  return lista.filter((b) => {
    if (filtros.status && b.status !== filtros.status) return false;

    if (filtros.situacao === "a_vencer") {
      if (b.status !== "pendente" || b.diasParaVencer === null || b.diasParaVencer < 0) return false;
    } else if (filtros.situacao === "atrasado") {
      if (b.status !== "pendente" || b.diasParaVencer === null || b.diasParaVencer >= 0) return false;
    }

    if (temPeriodo) {
      if (!b.expireAt) return false;
      const venc = b.expireAt.slice(0, 10);
      if (filtros.de && venc < filtros.de) return false;
      if (filtros.ate && venc > filtros.ate) return false;
    }

    if (termo) {
      const noNome = normalizarTexto(b.nomeCliente).includes(termo);
      const noNumero = String(b.idclienteAthos).includes(termo);
      if (!noNome && !noNumero) return false;
    }

    return true;
  });
}
