// Formatadores compartilhados da area de contas a receber (pt-BR). Puro, sem imports.

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function formatDateHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatMesAno(mes: string): string {
  const [ano, m] = mes.split("-");
  if (!ano || !m) return mes;
  return `${m}/${ano}`;
}
