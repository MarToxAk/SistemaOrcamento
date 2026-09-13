#!/usr/bin/env node
// Extrai as 9 imagens PNG embutidas em base64 do objeto IMG em src/App.jsx
// para arquivos reais em public/img/, e reescreve o objeto IMG para apontar
// para esses caminhos. Idempotente: se os valores ja forem caminhos, sai 0
// sem fazer nada. Nunca imprime o conteudo base64 em stdout.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_JSX = join(__dirname, '..', 'src', 'App.jsx')
const IMG_DIR = join(__dirname, '..', 'public', 'img')

const KEYS = [
  'BG',
  'LOGO',
  'SUN',
  'CLOUD1',
  'CLOUD2',
  'PINWHEEL',
  'BOAT',
  'RAINBOW',
  'BIKE',
]

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function fail(msg) {
  console.error(`ERRO: ${msg}`)
  process.exit(1)
}

function main() {
  const source = readFileSync(APP_JSX, 'utf8')

  // Localiza o objeto IMG = { ... };
  const imgStart = source.indexOf('const IMG = {')
  if (imgStart === -1) {
    fail('objeto IMG nao encontrado em src/App.jsx')
  }
  const imgBraceStart = source.indexOf('{', imgStart)
  const imgEnd = source.indexOf('\n};', imgBraceStart)
  if (imgEnd === -1) {
    fail('fim do objeto IMG nao encontrado em src/App.jsx')
  }
  const imgBlock = source.slice(imgBraceStart, imgEnd + 3) // inclui "};"

  // Idempotencia: se nenhuma chave contem "data:image", ja foi extraido.
  if (!imgBlock.includes('data:image')) {
    console.log('extract-images: nenhum data URI encontrado — ja extraido (idempotente).')
    process.exit(0)
  }

  if (!existsSync(IMG_DIR)) {
    mkdirSync(IMG_DIR, { recursive: true })
  }

  const missing = []
  let newImgBlock = imgBlock

  for (const key of KEYS) {
    const keyRegex = new RegExp(`${key}:\\s*"(data:image\\/[a-zA-Z]+;base64,[^"]+)"`)
    const match = imgBlock.match(keyRegex)
    if (!match) {
      missing.push(key)
      continue
    }
    const dataUri = match[1]
    const base64 = dataUri.slice(dataUri.indexOf('base64,') + 'base64,'.length)
    const buffer = Buffer.from(base64, 'base64')

    if (buffer.length < 1024) {
      fail(`imagem ${key} tem menos de 1 KB apos decodificar (${buffer.length} bytes)`)
    }
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
      fail(`imagem ${key} nao tem assinatura PNG valida nos primeiros 8 bytes`)
    }

    const filename = `${key.toLowerCase()}.png`
    const filepath = join(IMG_DIR, filename)
    writeFileSync(filepath, buffer)

    const replacement = `${key}: "/img/${filename}"`
    newImgBlock = newImgBlock.replace(`${key}: "${dataUri}"`, replacement)
  }

  if (missing.length > 0) {
    fail(`chaves ausentes ou sem data URI valido no objeto IMG: ${missing.join(', ')}`)
  }

  const newSource = source.slice(0, imgBraceStart) + newImgBlock + source.slice(imgEnd + 3)
  writeFileSync(APP_JSX, newSource, 'utf8')

  console.log(`extract-images: ${KEYS.length} imagens extraidas para public/img/ e IMG reescrito.`)
}

main()
