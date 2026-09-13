// Funcoes puras (sem I/O) para validar o cupom fiscal (COO) do sorteio contra
// a tabela `venda` do Athos. Nenhuma funcao aqui toca o banco — a consulta em
// si vive em AthosService.verificarCupomFiscalSorteio.

const COO_MAX_LEN = 10;
// Mesmo charset permitido que promo/server/validate.js aplica ao campo nfce:
// digitos, espacos, hifens e pontos (separador de milhar do numero impresso).
// Qualquer letra ou outro simbolo reprova o valor inteiro, em vez de ser
// silenciosamente descartado por um replace(/\D/g, "").
const COO_CHARSET_REGEX = /^[\d\s.-]*$/;

/**
 * Reduz o valor recebido a somente digitos. Rejeita (devolve null) quando
 * vazio, quando o valor contem qualquer caractere fora de digito/espaco/
 * hifen/ponto (ex: letra), quando passa de 10 digitos (limite de
 * `coo varchar(10)`) ou quando o resultado e numericamente zero.
 */
export function normalizarCoo(valor: unknown): string | null {
  if (valor == null) return null;
  const bruto = String(valor).trim();
  if (!bruto) return null;
  if (!COO_CHARSET_REGEX.test(bruto)) return null;

  const digitos = bruto.replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.length > COO_MAX_LEN) return null;
  if (Number(digitos) === 0) return null;

  return digitos;
}

/**
 * Gera a lista (sem repeticao) de variantes de `coo` a comparar no banco:
 * o valor sem zeros a esquerda, o proprio valor, e zero-padded para 4, 5 e 6
 * digitos. Descarta qualquer candidato que ultrapasse 10 caracteres.
 */
export function cooCandidatos(coo: string): string[] {
  const semZerosEsquerda = coo.replace(/^0+/, "") || coo;
  const candidatosBrutos = [
    semZerosEsquerda,
    coo,
    semZerosEsquerda.padStart(4, "0"),
    semZerosEsquerda.padStart(5, "0"),
    semZerosEsquerda.padStart(6, "0"),
  ];

  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const candidato of candidatosBrutos) {
    if (candidato.length > COO_MAX_LEN) continue;
    if (vistos.has(candidato)) continue;
    vistos.add(candidato);
    resultado.push(candidato);
  }
  return resultado;
}

/**
 * Converte um valor monetario do Athos (number, "50", "50.00" ou "1234,56")
 * para number. Devolve null para null/undefined/valores nao numericos.
 */
export function parseValorMonetario(valor: unknown): number | null {
  if (valor == null) return null;
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }
  const texto = String(valor).trim();
  if (!texto) return null;
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Colunas booleanas deste Athos podem nao ser boolean de verdade (ver
 * comentario em athos.service.ts:2550/2618). Trata true, "t"/"T", "s"/"S",
 * 1, "1", "true" e "sim" como verdadeiro; qualquer outra coisa como falso.
 */
export function ehVerdadeiroAthos(valor: unknown): boolean {
  if (valor === true || valor === 1) return true;
  if (typeof valor === "string") {
    const normalizado = valor.trim().toLowerCase();
    return normalizado === "t" || normalizado === "s" || normalizado === "1" || normalizado === "true" || normalizado === "sim";
  }
  return false;
}

/**
 * Valor minimo de compra para concorrer ao sorteio. Le SORTEIO_VALOR_MINIMO
 * do ambiente; default 50 quando ausente, vazio, nao numerica ou <= 0.
 */
export function valorMinimoSorteio(env: NodeJS.ProcessEnv = process.env): number {
  const bruto = env.SORTEIO_VALOR_MINIMO;
  if (!bruto) return 50;
  const numero = Number(bruto);
  if (!Number.isFinite(numero) || numero <= 0) return 50;
  return numero;
}
