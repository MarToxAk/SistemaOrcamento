// Funcoes puras de montagem do CSV de exportacao do sorteio.

const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r'])

export function escaparCelula(valor) {
  let texto = valor == null ? '' : String(valor)

  if (texto.length > 0 && FORMULA_TRIGGER_CHARS.has(texto[0])) {
    texto = `'${texto}`
  }

  const precisaAspas = /[",\n\r]/.test(texto)
  if (precisaAspas) {
    texto = `"${texto.replace(/"/g, '""')}"`
  }

  return texto
}

export function montarCsv(linhas) {
  const BOM = '﻿'
  const cabecalho = 'cupom,nome,telefone,nfce,criado_em'
  const corpo = linhas.map((linha) =>
    [
      escaparCelula(linha.cupom),
      escaparCelula(linha.nome),
      escaparCelula(linha.telefone),
      escaparCelula(linha.nfce),
      escaparCelula(linha.criado_em),
    ].join(',')
  )

  return BOM + [cabecalho, ...corpo].join('\r\n') + (corpo.length > 0 ? '\r\n' : '\n')
}
