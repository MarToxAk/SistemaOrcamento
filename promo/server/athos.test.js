import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarVerificadorCupomFiscal, lerConfigAthos } from './athos.js'

const ENV_COMPLETA = {
  PROMO_ATHOS_BASE_URL: 'http://host.docker.internal:4001/api',
  PROMO_ATHOS_API_TOKEN: 'token-athos-teste',
  PROMO_BACKEND_INTERNAL_API_KEY: 'chave-interna-teste',
}

function loggerMudo() {
  return { warn: () => {} }
}

test('lerConfigAthos devolve null quando falta qualquer uma das 3 variaveis', () => {
  assert.equal(lerConfigAthos({}), null)
  assert.equal(lerConfigAthos({ PROMO_ATHOS_BASE_URL: 'http://x' }), null)
  assert.equal(
    lerConfigAthos({ PROMO_ATHOS_BASE_URL: 'http://x', PROMO_ATHOS_API_TOKEN: 't' }),
    null,
  )
})

test('lerConfigAthos devolve config com timeout default de 5000', () => {
  const config = lerConfigAthos(ENV_COMPLETA)
  assert.equal(config.baseUrl, ENV_COMPLETA.PROMO_ATHOS_BASE_URL)
  assert.equal(config.apiToken, ENV_COMPLETA.PROMO_ATHOS_API_TOKEN)
  assert.equal(config.internalKey, ENV_COMPLETA.PROMO_BACKEND_INTERNAL_API_KEY)
  assert.equal(config.timeoutMs, 5000)
})

test('criarVerificadorCupomFiscal com as 3 envs ausentes devolve indisponivel/nao_configurado sem chamar fetch', async () => {
  let chamou = false
  const fetchImpl = async () => {
    chamou = true
    return { ok: true, status: 200, json: async () => ({}) }
  }
  const verificar = criarVerificadorCupomFiscal({ env: {}, fetchImpl, logger: loggerMudo() })
  const resultado = await verificar({ coo: '12345' })

  assert.equal(chamou, false)
  assert.deepEqual(resultado, { status: 'indisponivel', motivo: 'nao_configurado' })
})

test('o verificador chama exatamente um GET com os headers de auth e a query do coo', async () => {
  let chamadas = 0
  let urlCapturada
  let optsCapturadas
  const fetchImpl = async (url, opts) => {
    chamadas += 1
    urlCapturada = url
    optsCapturadas = opts
    return { ok: true, status: 200, json: async () => ({ valido: true, valor: 80 }) }
  }

  const verificar = criarVerificadorCupomFiscal({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })
  await verificar({ coo: '12345' })

  assert.equal(chamadas, 1)
  assert.equal(optsCapturadas.method, 'GET')
  assert.equal(optsCapturadas.headers['x-api-token'], 'token-athos-teste')
  assert.equal(optsCapturadas.headers['x-internal-api-key'], 'chave-interna-teste')
  assert.match(urlCapturada, /\/athos\/venda\/verificar-cupom\?coo=12345$/)
})

test('resposta 200 com valido true devolve status valido e o valor', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ valido: true, valor: 80 }) })
  const verificar = criarVerificadorCupomFiscal({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })

  const resultado = await verificar({ coo: '12345' })

  assert.deepEqual(resultado, { status: 'valido', valor: 80 })
})

test('resposta 200 com valido false devolve invalido', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ valido: false, valor: null }) })
  const verificar = criarVerificadorCupomFiscal({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })

  const resultado = await verificar({ coo: '99999' })

  assert.deepEqual(resultado, { status: 'invalido' })
})

test('resposta 400 devolve invalido (o backend rejeitou o formato do coo)', async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({}) })
  const verificar = criarVerificadorCupomFiscal({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })

  const resultado = await verificar({ coo: 'abc' })

  assert.deepEqual(resultado, { status: 'invalido' })
})

test('fetch que rejeita (falha de rede) vira indisponivel', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED')
  }
  const verificar = criarVerificadorCupomFiscal({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })

  const resultado = await verificar({ coo: '12345' })

  assert.equal(resultado.status, 'indisponivel')
  assert.equal(resultado.motivo, 'falha_de_rede')
})

test('outro status HTTP (500) vira indisponivel com motivo http_<status>', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) })
  const verificar = criarVerificadorCupomFiscal({ env: ENV_COMPLETA, fetchImpl, logger: loggerMudo() })

  const resultado = await verificar({ coo: '12345' })

  assert.deepEqual(resultado, { status: 'indisponivel', motivo: 'http_500' })
})
