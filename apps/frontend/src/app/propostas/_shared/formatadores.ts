/**
 * Formatadores puros pt-BR da area de propostas (Fase 55). Sem imports e so com sintaxe apagavel pelo type
 * stripping do Node (sem enum nem namespace), para a checagem executavel importar o modulo direto.
 *
 * O navegador NAO calcula preco (D-02): estas funcoes so formatam o texto que o servidor devolveu e traduzem
 * flags do servidor em estado de tela (`podeEditar`, `linhaEstado`).
 */

const SEM_VALOR = "—";

interface DecimalTexto {
  negativo: boolean;
  inteiro: string;
  fracao: string;
}

/** Le um decimal em texto ("-3.45", "10", "0.250"). Invalido ou vazio = null. Sem ponto flutuante. */
function lerDecimal(texto: unknown): DecimalTexto | null {
  if (typeof texto !== "string") return null;
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(texto.trim());
  if (!m) return null;
  return { negativo: m[1] === "-", inteiro: m[2], fracao: m[3] ?? "" };
}

/** Arredonda half-up (sobre o modulo) para `casas` casas usando BigInt; devolve inteiro e fracao em texto. */
function arredondar(d: DecimalTexto, casas: number): { negativo: boolean; inteiro: string; fracao: string } {
  const fracao = d.fracao.padEnd(casas + 1, "0");
  const escala = 10n ** BigInt(casas);
  let valor = BigInt(d.inteiro) * escala + BigInt(fracao.slice(0, casas) || "0");
  if (Number(fracao[casas] ?? "0") >= 5) valor += 1n;
  const inteiro = (valor / escala).toString();
  const resto = (valor % escala).toString().padStart(casas, "0");
  // Zero arredondado nunca leva sinal ("-0,0%" confunde).
  const negativo = d.negativo && valor !== 0n;
  return { negativo, inteiro, fracao: casas > 0 ? resto : "" };
}

function agruparMilhares(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "3.85" = "R$ 3,85"; "1234567.89" = "R$ 1.234.567,89"; "-3.45" = "-R$ 3,45"; vazio ou invalido = "—". */
export function formatarDinheiro(texto: string): string {
  const d = lerDecimal(texto);
  if (!d) return SEM_VALOR;
  const r = arredondar(d, 2);
  return `${r.negativo ? "-" : ""}R$ ${agruparMilhares(r.inteiro)},${r.fracao}`;
}

/** "2.000" = "2"; "1.500" = "1,5"; "0.250" = "0,25"; invalido = "—". Mostra o texto do servidor sem zeros finais. */
export function formatarQuantidade(texto: string): string {
  const d = lerDecimal(texto);
  if (!d) return SEM_VALOR;
  const fracao = d.fracao.replace(/0+$/, "");
  const inteiro = agruparMilhares(d.inteiro.replace(/^0+(?=\d)/, ""));
  const ehZero = /^0*$/.test(d.inteiro) && fracao === "";
  return `${d.negativo && !ehZero ? "-" : ""}${inteiro}${fracao ? `,${fracao}` : ""}`;
}

/** Half-up para 1 casa: "66.675" = "66,7%"; "-3.448" = "-3,4%"; "0.000" = "0,0%"; null ou invalido = "—". */
export function formatarMargem(texto: string | null): string {
  const d = lerDecimal(texto);
  if (!d) return SEM_VALOR;
  const r = arredondar(d, 1);
  return `${r.negativo ? "-" : ""}${agruparMilhares(r.inteiro)},${r.fracao}%`;
}

/** Rotulo de exibicao do status; status desconhecido volta como veio. */
export function rotuloStatus(status: string): string {
  switch (status) {
    case "RASCUNHO":
      return "Rascunho";
    case "LANCANDO":
      return "Lançando";
    case "ENVIADA":
      return "Enviada";
    case "FECHADA":
      return "Fechada";
    case "CANCELADA":
      return "Cancelada";
    default:
      return status;
  }
}

/** Classes Bootstrap de cor do badge por status; status desconhecido = neutra. */
export function classeStatus(status: string): string {
  switch (status) {
    case "RASCUNHO":
      return "bg-secondary";
    case "LANCANDO":
      return "bg-warning text-dark";
    case "ENVIADA":
      return "bg-primary";
    case "FECHADA":
      return "bg-success";
    case "CANCELADA":
      return "bg-danger";
    default:
      return "bg-light text-dark border";
  }
}

/** Mensagem de erro do corpo da API: prefere `mensagem`, depois `error`, depois o padrao. */
export function mensagemDeErro(corpo: unknown, padrao: string): string {
  if (corpo === null || typeof corpo !== "object") return padrao;
  const c = corpo as { mensagem?: unknown; error?: unknown };
  if (typeof c.mensagem === "string" && c.mensagem.trim() !== "") return c.mensagem;
  if (typeof c.error === "string" && c.error.trim() !== "") return c.error;
  return padrao;
}

/** Montagem so e permitida em RASCUNHO, texto exato (D-08). Qualquer outra coisa = somente leitura. */
export function podeEditar(status: string | null | undefined): boolean {
  return status === "RASCUNHO";
}

/**
 * Apresentacao da linha do item. A decisao vem do servidor (`abaixoDoCusto`, calculada por `calcularMargem`);
 * esta funcao NAO compara preco, custo ou margem e nunca indica bloqueio (D-13): so destaca.
 */
export function linhaEstado(item: { abaixoDoCusto?: boolean | null }): { classe: string; alerta: string | null } {
  if (item.abaixoDoCusto === true) {
    return { classe: "table-danger", alerta: "Preço abaixo do custo" };
  }
  return { classe: "", alerta: null };
}
