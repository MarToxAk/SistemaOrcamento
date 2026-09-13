#!/usr/bin/env node
// Verificador de gates do microsite de sorteio.
// Uso: node scripts/check.mjs <tracer|hardening|integracao|deploy>
// Existe como script em vez de one-liners de shell porque as asercoes
// precisam procurar literais com barras, aspas e dois-pontos dentro de
// arquivos, o que nao sobrevive a citacao de shell no Windows.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REPO_ROOT = join(ROOT, '..')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let failures = 0

function fail(msg) {
  console.error(`FALHA: ${msg}`)
  failures += 1
}

function ok(msg) {
  console.log(`ok: ${msg}`)
}

function readWithoutComments(filepath) {
  const raw = readFileSync(filepath, 'utf8')
  return raw
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('#')
    })
    .join('\n')
}

function checkTracer() {
  const imgDir = join(ROOT, 'public', 'img')
  if (!existsSync(imgDir)) {
    fail('promo/public/img nao existe')
  } else {
    const files = readdirSync(imgDir).filter((f) => f.endsWith('.png'))
    if (files.length !== 9) {
      fail(`esperado exatamente 9 arquivos PNG em promo/public/img, encontrado ${files.length}`)
    } else {
      ok('9 arquivos PNG encontrados em promo/public/img')
    }
    for (const f of files) {
      const fullPath = join(imgDir, f)
      const buf = readFileSync(fullPath)
      if (buf.length < 1024) {
        fail(`${f} tem menos de 1 KB`)
      }
      if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
        fail(`${f} nao tem assinatura PNG valida nos primeiros 8 bytes`)
      }
    }
  }

  const appJsxPath = join(ROOT, 'src', 'App.jsx')
  const appJsx = readWithoutComments(appJsxPath)

  if (appJsx.includes('data:image/png;base64,')) {
    fail('promo/src/App.jsx ainda contem data URI de PNG embutido')
  } else {
    ok('nenhum data URI de PNG restante em promo/src/App.jsx')
  }

  const storageLiterais = ['window.storage', 'storage.set(', 'storage.get(']
  for (const literal of storageLiterais) {
    if (appJsx.includes(literal)) {
      fail(`promo/src/App.jsx ainda contem o literal do helper de storage do sandbox: ${literal}`)
    }
  }
  ok('nenhum literal do helper de storage do sandbox restante em promo/src/App.jsx')

  if (!appJsx.includes('/api/cadastro')) {
    fail('promo/src/App.jsx nao contem chamada para /api/cadastro')
  } else {
    ok('promo/src/App.jsx contem fetch para /api/cadastro')
  }
}

function checkHardening() {
  const indexJsPath = join(ROOT, 'server', 'index.js')
  const indexJs = readWithoutComments(indexJsPath)

  for (const status of ['409', '429', '401', '503', '422']) {
    if (!indexJs.includes(status)) {
      fail(`promo/server/index.js nao contem o status ${status}`)
    } else {
      ok(`promo/server/index.js contem o status ${status}`)
    }
  }

  for (const codigoErro of ['cupom_fiscal_invalido', 'validacao_indisponivel']) {
    if (!indexJs.includes(codigoErro)) {
      fail(`promo/server/index.js nao contem o codigo de erro ${codigoErro}`)
    } else {
      ok(`promo/server/index.js contem o codigo de erro ${codigoErro}`)
    }
  }

  if (!indexJs.includes('timingSafeEqual')) {
    fail('promo/server/index.js nao usa timingSafeEqual')
  } else {
    ok('promo/server/index.js usa timingSafeEqual')
  }

  if (!indexJs.includes('x-forwarded-for')) {
    fail('promo/server/index.js nao trata x-forwarded-for')
  } else {
    ok('promo/server/index.js trata x-forwarded-for')
  }

  const appJsxPath = join(ROOT, 'src', 'App.jsx')
  const appJsx = readWithoutComments(appJsxPath)

  if (!appJsx.includes('cupomValido')) {
    fail('promo/src/App.jsx nao contem cupomValido')
  } else {
    ok('promo/src/App.jsx contem cupomValido')
  }

  if (appJsx.includes('"0000"')) {
    fail('promo/src/App.jsx ainda usa o default de cupom zerado "0000"')
  } else {
    ok('promo/src/App.jsx nao usa mais o default de cupom zerado')
  }

  if (!appJsx.includes('422')) {
    fail('promo/src/App.jsx nao trata o status 422 (cupom fiscal invalido)')
  } else {
    ok('promo/src/App.jsx trata o status 422 (cupom fiscal invalido)')
  }

  const envExamplePath = join(ROOT, '.env.example')
  if (!existsSync(envExamplePath)) {
    fail('promo/.env.example nao existe')
  } else {
    const envExample = readFileSync(envExamplePath, 'utf8')
    if (!envExample.includes('PROMO_ADMIN_TOKEN')) {
      fail('promo/.env.example nao contem PROMO_ADMIN_TOKEN')
    } else {
      ok('promo/.env.example contem PROMO_ADMIN_TOKEN')
    }
    if (!envExample.includes('TRUST_PROXY')) {
      fail('promo/.env.example nao contem TRUST_PROXY')
    } else {
      ok('promo/.env.example contem TRUST_PROXY')
    }
  }
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const HEX_LONGO_REGEX = /[0-9a-f]{32,}/i

function checkIntegracao() {
  const athosJsPath = join(ROOT, 'server', 'athos.js')
  if (!existsSync(athosJsPath)) {
    fail('promo/server/athos.js nao existe')
  } else {
    const athosJs = readFileSync(athosJsPath, 'utf8')
    for (const nome of ['PROMO_ATHOS_BASE_URL', 'PROMO_ATHOS_API_TOKEN', 'PROMO_BACKEND_INTERNAL_API_KEY']) {
      if (!athosJs.includes(nome)) fail(`promo/server/athos.js nao referencia ${nome}`)
      else ok(`promo/server/athos.js referencia ${nome}`)
    }
  }

  const whatsappJsPath = join(ROOT, 'server', 'whatsapp.js')
  if (!existsSync(whatsappJsPath)) {
    fail('promo/server/whatsapp.js nao existe')
  } else {
    const whatsappJs = readFileSync(whatsappJsPath, 'utf8')
    for (const nome of ['PROMO_WHATSAPP_HOST', 'PROMO_WHATSAPP_INSTANCE', 'PROMO_WHATSAPP_API_KEY']) {
      if (!whatsappJs.includes(nome)) fail(`promo/server/whatsapp.js nao referencia ${nome}`)
      else ok(`promo/server/whatsapp.js referencia ${nome}`)
    }
  }

  const envExamplePath = join(ROOT, '.env.example')
  if (!existsSync(envExamplePath)) {
    fail('promo/.env.example nao existe')
  } else {
    const envExample = readFileSync(envExamplePath, 'utf8')
    const variaveisNovas = [
      'PROMO_ATHOS_BASE_URL',
      'PROMO_ATHOS_API_TOKEN',
      'PROMO_BACKEND_INTERNAL_API_KEY',
      'PROMO_ATHOS_TIMEOUT_MS',
      'PROMO_WHATSAPP_HOST',
      'PROMO_WHATSAPP_INSTANCE',
      'PROMO_WHATSAPP_API_KEY',
    ]
    for (const nome of variaveisNovas) {
      if (!envExample.includes(nome)) fail(`promo/.env.example nao cita ${nome}`)
      else ok(`promo/.env.example cita ${nome}`)
    }
  }

  // Gate de forma-de-segredo: le CRU (sem filtrar comentarios — segredo em
  // comentario tambem e segredo) todo arquivo de promo/server/ e falha se
  // algum casar UUID ou hexadecimal longo (32+ chars). Pega apikey da
  // instancia ou identificador do painel copiado-e-colado por engano.
  const serverDir = join(ROOT, 'server')
  const arquivosServer = readdirSync(serverDir).filter((f) => f.endsWith('.js'))
  let segredoEncontrado = false
  for (const arquivo of arquivosServer) {
    const conteudoCru = readFileSync(join(serverDir, arquivo), 'utf8')
    if (UUID_REGEX.test(conteudoCru)) {
      fail(`promo/server/${arquivo} contem um literal com formato de UUID (possivel identificador de instancia)`)
      segredoEncontrado = true
    }
    if (HEX_LONGO_REGEX.test(conteudoCru)) {
      fail(`promo/server/${arquivo} contem um literal hexadecimal de 32+ caracteres (possivel apikey/token)`)
      segredoEncontrado = true
    }
  }
  if (!segredoEncontrado) {
    ok('nenhum literal com formato de UUID ou hexadecimal longo em promo/server/*.js')
  }
}

function checkDeploy() {
  const dockerfilePath = join(ROOT, 'Dockerfile')
  if (!existsSync(dockerfilePath)) {
    fail('promo/Dockerfile nao existe')
  } else {
    const dockerfile = readWithoutComments(dockerfilePath)
    const fromCount = (dockerfile.match(/^FROM /gm) || []).length
    if (fromCount < 2) {
      fail(`promo/Dockerfile tem ${fromCount} estagio(s) FROM, esperado pelo menos 2`)
    } else {
      ok('promo/Dockerfile tem pelo menos 2 estagios FROM')
    }
    if (!dockerfile.includes('node:24-alpine')) {
      fail('promo/Dockerfile nao usa base node:24-alpine')
    } else {
      ok('promo/Dockerfile usa base node:24-alpine')
    }
    if (!dockerfile.includes('USER node')) {
      fail('promo/Dockerfile nao roda como USER node')
    } else {
      ok('promo/Dockerfile roda como USER node')
    }

    const lines = dockerfile.split('\n')
    const lastFromIdx = lines.map((l) => l.startsWith('FROM ')).lastIndexOf(true)
    const afterLastFrom = lines.slice(lastFromIdx).join('\n')
    if (afterLastFrom.includes('npm ci')) {
      fail('promo/Dockerfile roda "npm ci" no estagio runtime (depois do ultimo FROM)')
    } else {
      ok('promo/Dockerfile nao roda "npm ci" no estagio runtime')
    }
  }

  const composePath = join(REPO_ROOT, 'deploy', 'docker-compose.promo.yml')
  if (!existsSync(composePath)) {
    fail('deploy/docker-compose.promo.yml nao existe')
  } else {
    const compose = readFileSync(composePath, 'utf8')
    if (!compose.includes('promo_data')) fail('deploy/docker-compose.promo.yml nao cita promo_data')
    else ok('deploy/docker-compose.promo.yml cita promo_data')
    if (!compose.includes('127.0.0.1:3100')) fail('deploy/docker-compose.promo.yml nao faz bind em 127.0.0.1:3100')
    else ok('deploy/docker-compose.promo.yml faz bind em 127.0.0.1:3100')
    if (!compose.includes('promo.env')) fail('deploy/docker-compose.promo.yml nao referencia promo.env')
    else ok('deploy/docker-compose.promo.yml referencia promo.env')
  }

  const nginxPath = join(REPO_ROOT, 'deploy', 'nginx-promo.conf')
  if (!existsSync(nginxPath)) {
    fail('deploy/nginx-promo.conf nao existe')
  } else {
    const nginx = readFileSync(nginxPath, 'utf8')
    if (!nginx.includes('promocao.bomcustoilhabela.com.br')) fail('deploy/nginx-promo.conf nao cita o dominio')
    else ok('deploy/nginx-promo.conf cita o dominio')
    if (!nginx.includes('127.0.0.1:3100')) fail('deploy/nginx-promo.conf nao cita 127.0.0.1:3100')
    else ok('deploy/nginx-promo.conf cita 127.0.0.1:3100')
  }

  const readmePath = join(ROOT, 'README.md')
  if (!existsSync(readmePath)) {
    fail('promo/README.md nao existe')
  } else {
    const readme = readFileSync(readmePath, 'utf8')
    if (!readme.includes('?id=')) fail('promo/README.md nao cita ?id=')
    else ok('promo/README.md cita ?id=')
    if (!readme.includes('cadastros.csv')) fail('promo/README.md nao cita cadastros.csv')
    else ok('promo/README.md cita cadastros.csv')
  }

  ok('verificacao de diff dos arquivos de deploy do app de orcamento fica a cargo do comando git diff no <verify> do plano')
}

const modo = process.argv[2]

if (modo === 'tracer') {
  checkTracer()
} else if (modo === 'hardening') {
  checkHardening()
} else if (modo === 'integracao') {
  checkIntegracao()
} else if (modo === 'deploy') {
  checkDeploy()
} else {
  console.error(`Modo desconhecido: "${modo}". Use tracer, hardening, integracao ou deploy.`)
  process.exit(1)
}

if (failures > 0) {
  console.error(`\n${failures} falha(s) no modo "${modo}".`)
  process.exit(1)
}

console.log(`\ncheck.mjs: modo "${modo}" passou sem falhas.`)
