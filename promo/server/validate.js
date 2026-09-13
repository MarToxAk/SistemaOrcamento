// Validacao pura do cadastro do sorteio — testavel sem HTTP.

const CUPOM_REGEX = /^\d{1,10}$/
const NFCE_REGEX = /^[\d\s-]*$/

export function validarCadastro(body) {
  const cupomBruto = String(body?.cupom ?? '').trim()
  if (!CUPOM_REGEX.test(cupomBruto) || Number(cupomBruto) === 0) {
    return { ok: false, campo: 'cupom', erro: 'cupom invalido' }
  }

  const nome = String(body?.nome ?? '').trim()
  if (nome.length < 2 || nome.length > 80) {
    return { ok: false, campo: 'nome', erro: 'nome deve ter entre 2 e 80 caracteres' }
  }

  const telefoneBruto = String(body?.telefone ?? '')
  const telefoneDigitos = telefoneBruto.replace(/\D/g, '')
  if (telefoneDigitos.length !== 10 && telefoneDigitos.length !== 11) {
    return { ok: false, campo: 'telefone', erro: 'telefone deve ter 10 ou 11 digitos (DDD + numero)' }
  }

  const nfceBruto = body?.nfce != null ? String(body.nfce).trim() : ''
  if (nfceBruto.length > 44 || !NFCE_REGEX.test(nfceBruto)) {
    return { ok: false, campo: 'nfce', erro: 'nfce deve ter ate 44 caracteres, apenas digitos/espacos/hifens' }
  }

  return {
    ok: true,
    valor: {
      cupom: cupomBruto,
      nome,
      telefone: telefoneDigitos,
      nfce: nfceBruto || null,
    },
  }
}
