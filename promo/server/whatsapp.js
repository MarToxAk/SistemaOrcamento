// Adaptador do microsite de sorteio para o envio best-effort de mensagem de
// confirmacao via Evolution API. Zero dependencia — fetch nativo do Node 24.
// Formato confirmado contra a OpenAPI oficial (EvolutionAPI/docs-evolution,
// openapi/openapi-v2.json): POST /message/sendText/{instance}, header
// apikey, corpo { number, text }, sucesso 200/201. Esta e a UNICA peca que
// conhece o formato da Evolution API — se divergir da instancia real, a
// correcao e num unico lugar (o human-check da Task 4 confirma o formato).

const CAMINHO_SEND_TEXT = '/message/sendText'

export function normalizarNumeroWhatsapp(telefone) {
  const digitos = String(telefone ?? '').replace(/\D/g, '')

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`
  }
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    return digitos
  }
  return null
}

export function montarMensagemSorteio(cupom) {
  const cupomFormatado = String(cupom ?? '').replace(/\D/g, '').padStart(5, '0')

  return [
    '🎉 *Sorteio Dia das Crianças – Bom Custo Papelaria!*',
    '',
    `Seu cupom nº ${cupomFormatado} foi cadastrado com sucesso! 🎈`,
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
}

export function lerConfigWhatsapp(env = process.env) {
  const host = env.PROMO_WHATSAPP_HOST
  const instance = env.PROMO_WHATSAPP_INSTANCE
  const apiKey = env.PROMO_WHATSAPP_API_KEY

  if (!host || !instance || !apiKey) {
    return null
  }

  const timeoutMs = Number(env.PROMO_WHATSAPP_TIMEOUT_MS) || 5000

  return { host: host.replace(/\/+$/, ''), instance, apiKey, timeoutMs }
}

export function criarEnviadorWhatsapp({ env, fetchImpl, logger } = {}) {
  const configEnv = env || process.env
  const doFetch = fetchImpl || fetch
  const log = logger || console

  return async function enviarWhatsapp({ telefone, cupom }) {
    const config = lerConfigWhatsapp(configEnv)
    if (!config) {
      return { enviado: false, motivo: 'nao_configurado' }
    }

    const numero = normalizarNumeroWhatsapp(telefone)
    if (!numero) {
      log.warn?.('enviarWhatsapp: numero_invalido')
      return { enviado: false, motivo: 'numero_invalido' }
    }

    const url = `${config.host}${CAMINHO_SEND_TEXT}/${encodeURIComponent(config.instance)}`
    const texto = montarMensagemSorteio(cupom)

    let resposta
    try {
      resposta = await doFetch(url, {
        method: 'POST',
        headers: {
          apikey: config.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ number: numero, text: texto }),
        signal: AbortSignal.timeout(config.timeoutMs),
      })
    } catch (err) {
      const motivo = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'falha_de_rede'
      log.warn?.(`enviarWhatsapp: ${motivo}`)
      return { enviado: false, motivo }
    }

    if (resposta.status === 200 || resposta.status === 201) {
      return { enviado: true }
    }

    log.warn?.(`enviarWhatsapp: http_${resposta.status}`)
    return { enviado: false, motivo: `http_${resposta.status}` }
  }
}
