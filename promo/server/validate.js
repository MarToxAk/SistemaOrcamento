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

  // O campo nfce carrega o COO (Codigo de Operacao) do cupom fiscal, exigido
  // pela integracao com o Athos (D-01). Ordem das regras: primeiro rejeita
  // qualquer caractere fora de digito/espaco/hifen (pega "ABC-123" antes de
  // reduzir a digitos), depois reduz a somente digitos, depois exige de 1 a
  // 10 digitos (limite de `coo varchar(10)` no Athos — nao 44 caracteres) e
  // recusa numericamente zero.
  const nfceBruto = String(body?.nfce ?? '').trim()
  if (!NFCE_REGEX.test(nfceBruto)) {
    return { ok: false, campo: 'nfce', erro: 'informe apenas numeros do cupom fiscal (COO)' }
  }
  const nfceDigitos = nfceBruto.replace(/\D/g, '')
  if (nfceDigitos.length < 1 || nfceDigitos.length > 10 || Number(nfceDigitos) === 0) {
    return { ok: false, campo: 'nfce', erro: 'informe o numero do COO impresso no seu cupom fiscal (1 a 10 digitos)' }
  }

  return {
    ok: true,
    valor: {
      cupom: cupomBruto,
      nome,
      telefone: telefoneDigitos,
      nfce: nfceDigitos,
    },
  }
}
