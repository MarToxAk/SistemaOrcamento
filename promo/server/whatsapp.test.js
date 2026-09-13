import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarEnviadorWhatsapp, lerConfigWhatsapp, montarMensagemSorteio, normalizarNumeroWhatsapp } from './whatsapp.js'

const ENV_COMPLETA = {
  PROMO_WHATSAPP_HOST: 'https://evolution.exemplo.com',
  PROMO_WHATSAPP_INSTANCE: 'bomcusto',
  PROMO_WHATSAPP_API_KEY: 'apikey-teste',
}

function loggerMudo() {
  return { warn: () => {} }
}

test('normalizarNumeroWhatsapp com 11 digitos recebe prefixo 55', () => {
  assert.equal(normalizarNumeroWhatsapp('11999998888'), '5511999998888')
})

test('normalizarNumeroWhatsapp com 10 digitos recebe prefixo 55', () => {
  assert.equal(normalizarNumeroWhatsapp('1133334444'), '551133334444')
})

test('normalizarNumeroWhatsapp com 12-13 digitos que ja comecam com 55 nao duplica o DDI', () => {
  assert.equal(normalizarNumeroWhatsapp('5511999998888'), '5511999998888')
  assert.equal(normalizarNumeroWhatsapp('551133334444'), '551133334444')
})

test('normalizarNumeroWhatsapp devolve null para qualquer outro tamanho', () => {
  assert.equal(normalizarNumeroWhatsapp('123'), null)
  assert.equal(normalizarNumeroWhatsapp('123456789012345'), null)
  assert.equal(normalizarNumeroWhatsapp(''), null)
})

test('montarMensagemSorteio devolve o texto exato de D-05 com o cupom em 5 digitos', () => {
  const texto = montarMensagemSorteio('42')
  const esperado = [
    '🎉 *Sorteio Dia das Crianças – Bom Custo Papelaria!*',
    '',
    'Seu cupom nº 00042 foi cadastrado com sucesso! 🎈',
    '',
    'Para concorrer, não esqueça das regras:',
    '✅ Compras no Débito, Crédito, Dinheiro ou Pix',
    '✅ Preencha o cupom Físico e Digital',
    '✅ Curta a publicação',
    '✅ Siga nossa página',
    '',
    '📲 Siga a gente no Instagram: https://www.instagram.com/bomcustopapelaria/',
    '',
    'Boa sorte! 🍀',
  ].join('\n')
  assert.equal(texto, esperado)
})

test('montarMensagemSorteio e idempotente no padding', () => {
  assert.equal(montarMensagemSorteio('42'), montarMensagemSorteio('00042'))
})

test('lerConfigWhatsapp devolve null quando falta qualquer uma das 3 variaveis', () => {
  assert.equal(lerConfigWhatsapp({}), null)
  assert.equal(lerConfigWhatsapp({ PROMO_WHATSAPP_HOST: 'https://x' }), null)
})

test('lerConfigWhatsapp devolve host sem barra final e timeout default de 5000', () => {
  const config = lerConfigWhatsapp({ ...ENV_COMPLETA, PROMO_WHATSAPP_HOST: 'https://evolution.exemplo.com/' })
  assert.equal(config.host, 'https://evolution.exemplo.com')
  assert.equal(config.timeoutMs, 5000)
})

test('o enviador faz exatamente um POST com o caminho de sendText, header apikey e corpo number/text', async () => {
  let chamadas = 0
  let urlCapturada
  let optsCapturadas
  const fetchImpl = async (url, opts) => {
    chamadas += 1
    urlCapturada = url
    optsCapturadas = opts
    return { status: 201, json: async () => ({}) }
  }

  const enviar = criarEnviadorWhatsapp({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })
  await enviar({ telefone: '11999998888', cupom: '42' })

  assert.equal(chamadas, 1)
  assert.equal(urlCapturada, 'https://evolution.exemplo.com/message/sendText/bomcusto')
  assert.equal(optsCapturadas.method, 'POST')
  assert.equal(optsCapturadas.headers.apikey, 'apikey-teste')
  const corpo = JSON.parse(optsCapturadas.body)
  assert.deepEqual(Object.keys(corpo).sort(), ['number', 'text'])
  assert.equal(corpo.number, '5511999998888')
})

test('resposta 201 devolve enviado true', async () => {
  const fetchImpl = async () => ({ status: 201, json: async () => ({}) })
  const enviar = criarEnviadorWhatsapp({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })
  const resultado = await enviar({ telefone: '11999998888', cupom: '42' })
  assert.deepEqual(resultado, { enviado: true })
})

test('resposta 400 devolve enviado false com motivo http_400', async () => {
  const fetchImpl = async () => ({ status: 400, json: async () => ({}) })
  const enviar = criarEnviadorWhatsapp({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })
  const resultado = await enviar({ telefone: '11999998888', cupom: '42' })
  assert.deepEqual(resultado, { enviado: false, motivo: 'http_400' })
})

test('abort de timeout devolve enviado false com motivo timeout', async () => {
  const fetchImpl = async () => {
    const err = new Error('timeout')
    err.name = 'TimeoutError'
    throw err
  }
  const enviar = criarEnviadorWhatsapp({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })
  const resultado = await enviar({ telefone: '11999998888', cupom: '42' })
  assert.deepEqual(resultado, { enviado: false, motivo: 'timeout' })
})

test('erro de rede devolve enviado false com motivo falha_de_rede', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED')
  }
  const enviar = criarEnviadorWhatsapp({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })
  const resultado = await enviar({ telefone: '11999998888', cupom: '42' })
  assert.deepEqual(resultado, { enviado: false, motivo: 'falha_de_rede' })
})

test('config ausente devolve enviado false com motivo nao_configurado sem chamar fetch', async () => {
  let chamou = false
  const fetchImpl = async () => {
    chamou = true
    return { status: 201, json: async () => ({}) }
  }
  const enviar = criarEnviadorWhatsapp({ env: {}, fetchImpl, logger: loggerMudo() })
  const resultado = await enviar({ telefone: '11999998888', cupom: '42' })
  assert.equal(chamou, false)
  assert.deepEqual(resultado, { enviado: false, motivo: 'nao_configurado' })
})

test('o enviador nunca lanca, mesmo com fetchImpl que rejeita ou corpo nao-JSON', async () => {
  const fetchImplRejeita = async () => {
    throw new Error('boom')
  }
  const enviarComRejeicao = criarEnviadorWhatsapp({ env: ENV_COMPLETA, fetchImpl: fetchImplRejeita, logger: loggerMudo() })
  await assert.doesNotReject(enviarComRejeicao({ telefone: '11999998888', cupom: '42' }))

  const fetchImplCorpoRuim = async () => ({
    status: 201,
    json: async () => {
      throw new Error('corpo nao-JSON')
    },
  })
  const enviarComCorpoRuim = criarEnviadorWhatsapp({ env: ENV_COMPLETA, fetchImpl: fetchImplCorpoRuim, logger: loggerMudo() })
  const resultado = await enviarComCorpoRuim({ telefone: '11999998888', cupom: '42' })
  assert.equal(resultado.enviado, true)
})
