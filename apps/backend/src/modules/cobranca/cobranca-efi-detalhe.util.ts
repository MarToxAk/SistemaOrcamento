/**
 * Leitura defensiva da resposta de GET /v1/charge/{id} da EFI (API de Cobrancas) - Fase 47, D-06.
 *
 * O caminho exato vem da documentacao da EFI (payment.banking_billet.barcode para a linha digitavel e
 * payment.banking_billet.pix.qrcode para o PIX copia e cola do boleto com PIX) e ainda nao foi conferido
 * com um boleto real; por isso o parse aceita tambem `data` como array e os campos na raiz de `data`
 * (formato da criacao one-step). Somente strings nao vazias sao aceitas.
 */

export interface DadosPagamentoEfi {
  linhaDigitavel: string | null;
  pixCopiaECola: string | null;
}

type Objeto = Record<string, unknown>;

function ehObjeto(valor: unknown): valor is Objeto {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function textoNaoVazio(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

/** `corpo.data` como objeto (ou o primeiro item quando vier em array). */
function dadosDaCobranca(corpo: unknown): Objeto | null {
  if (!ehObjeto(corpo)) return null;
  const data = corpo.data;
  if (Array.isArray(data)) return ehObjeto(data[0]) ? data[0] : null;
  return ehObjeto(data) ? data : null;
}

function bankingBillet(corpo: unknown): Objeto | null {
  const dados = dadosDaCobranca(corpo);
  const payment = dados?.payment;
  if (!ehObjeto(payment)) return null;
  return ehObjeto(payment.banking_billet) ? payment.banking_billet : null;
}

function qrcodeDoPix(pix: unknown): string | null {
  return ehObjeto(pix) ? textoNaoVazio(pix.qrcode) : null;
}

export function extrairDadosPagamentoEfi(corpo: unknown): DadosPagamentoEfi {
  const dados = dadosDaCobranca(corpo);
  const billet = bankingBillet(corpo);
  return {
    linhaDigitavel: textoNaoVazio(billet?.barcode) ?? textoNaoVazio(dados?.barcode),
    pixCopiaECola: qrcodeDoPix(billet?.pix) ?? qrcodeDoPix(dados?.pix),
  };
}

/** Chaves de payment.banking_billet (apenas os NOMES, nunca os valores), para diagnostico em log. */
export function chavesBoletoEfi(corpo: unknown): string[] {
  const billet = bankingBillet(corpo);
  return billet ? Object.keys(billet) : [];
}
