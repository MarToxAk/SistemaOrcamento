// Adaptador do microsite de sorteio para o endpoint de verificacao de cupom
// fiscal (COO) do backend NestJS. Zero dependencia — fetch nativo do Node 24.
// A funcao nunca lanca: quem chama precisa de uma resposta em qualquer
// cenario (sucesso, cupom invalido ou indisponibilidade).

const CAMINHO_VERIFICAR_CUPOM = '/athos/venda/verificar-cupom'

export function lerConfigAthos(env = process.env) {
  const baseUrl = env.PROMO_ATHOS_BASE_URL
  const apiToken = env.PROMO_ATHOS_API_TOKEN
  const internalKey = env.PROMO_BACKEND_INTERNAL_API_KEY

  if (!baseUrl || !apiToken || !internalKey) {
    return null
  }

  const timeoutMs = Number(env.PROMO_ATHOS_TIMEOUT_MS) || 5000

  return { baseUrl, apiToken, internalKey, timeoutMs }
}

export function criarVerificadorCupomFiscal({ env, fetchImpl, logger } = {}) {
  const configEnv = env || process.env
  const doFetch = fetchImpl || fetch
  const log = logger || console

  return async function verificarCupomFiscal({ coo }) {
    const config = lerConfigAthos(configEnv)
    if (!config) {
      return { status: 'indisponivel', motivo: 'nao_configurado' }
    }

    const baseSemBarra = config.baseUrl.replace(/\/+$/, '')
    const url = `${baseSemBarra}${CAMINHO_VERIFICAR_CUPOM}?coo=${encodeURIComponent(coo)}`

    let resposta
    try {
      resposta = await doFetch(url, {
        method: 'GET',
        headers: {
          'x-api-token': config.apiToken,
          'x-internal-api-key': config.internalKey,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(config.timeoutMs),
      })
    } catch (err) {
      const motivo = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'falha_de_rede'
      log.warn?.(`verificarCupomFiscal: ${motivo}`)
      return { status: 'indisponivel', motivo }
    }

    if (resposta.status === 400) {
      return { status: 'invalido' }
    }

    if (!resposta.ok) {
      log.warn?.(`verificarCupomFiscal: http_${resposta.status}`)
      return { status: 'indisponivel', motivo: `http_${resposta.status}` }
    }

    let corpo
    try {
      corpo = await resposta.json()
    } catch {
      log.warn?.('verificarCupomFiscal: corpo_invalido')
      return { status: 'indisponivel', motivo: 'corpo_invalido' }
    }

    if (corpo?.valido === true) {
      return { status: 'valido', valor: corpo.valor }
    }

    return { status: 'invalido' }
  }
}
