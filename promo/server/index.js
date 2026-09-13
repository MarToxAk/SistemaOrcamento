// Servidor minimo do microsite de sorteio — zero dependencias de runtime.
// node:http + node:sqlite + node:fs. Sem Express, sem path traversal por
// construcao (mapa de estaticos montado no boot, apenas rotas exatas).

import { createServer as createHttpServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, extname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, timingSafeEqual } from 'node:crypto'
import { validarCadastro } from './validate.js'
import { montarCsv } from './csv.js'
import { criarVerificadorCupomFiscal } from './athos.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')

const MAX_BODY_BYTES = 4096
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_MAP_CAP = 5000

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

function contentTypeFor(filepath) {
  const ext = extname(filepath).toLowerCase()
  return CONTENT_TYPES[ext] || 'application/octet-stream'
}

function buildStaticMap(distDir) {
  const map = new Map()
  if (!existsSync(distDir)) {
    console.warn(`aviso: ${distDir} nao existe — servindo apenas a API (rode "npm run build")`)
    return map
  }

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else {
        const rel = relative(distDir, fullPath).split('\\').join('/')
        map.set(`/${rel}`, fullPath)
      }
    }
  }

  walk(distDir)

  const indexPath = join(distDir, 'index.html')
  if (existsSync(indexPath)) {
    map.set('/', indexPath)
  }

  return map
}

function ensureSchema(db) {
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS cadastro (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cupom TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      nfce TEXT,
      ip TEXT,
      criado_em TEXT NOT NULL
    )
  `)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let received = 0
    const chunks = []
    let aborted = false

    req.on('data', (chunk) => {
      if (aborted) return
      received += chunk.length
      if (received > MAX_BODY_BYTES) {
        aborted = true
        reject({ status: 413, error: 'corpo_muito_grande' })
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (aborted) return
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject({ status: 400, error: 'json_invalido' })
      }
    })

    req.on('error', () => {
      if (!aborted) reject({ status: 400, error: 'erro_de_leitura' })
    })
  })
}

function isUniqueViolation(err) {
  const msg = String(err?.message || '')
  return err?.errcode === 2067 || /UNIQUE constraint failed/i.test(msg)
}

function resolveOrigin(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for']
    if (forwarded) {
      const first = String(forwarded).split(',')[0].trim()
      if (first) return first
    }
  }
  return req.socket.remoteAddress || 'desconhecido'
}

function createRateLimiter({ windowMs, max, mapCap }) {
  const hits = new Map()

  return function checkLimit(origin) {
    const now = Date.now()
    const entry = hits.get(origin)

    if (!entry || now - entry.windowStart >= windowMs) {
      // Poda entradas expiradas antes de inserir uma nova, para o Map nao
      // crescer sem teto (ele mesmo seria um vetor de exaustao de memoria).
      if (hits.size >= mapCap) {
        for (const [key, value] of hits) {
          if (now - value.windowStart >= windowMs) {
            hits.delete(key)
          }
        }
      }
      hits.set(origin, { count: 1, windowStart: now })
      return true
    }

    if (entry.count >= max) {
      return false
    }

    entry.count += 1
    return true
  }
}

function tokenConfere(recebido, esperado) {
  const digestRecebido = createHash('sha256').update(String(recebido)).digest()
  const digestEsperado = createHash('sha256').update(String(esperado)).digest()
  return timingSafeEqual(digestRecebido, digestEsperado)
}

export function createServer({ dbPath, verificarCupomFiscal, enviarWhatsapp } = {}) {
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  // enviarWhatsapp fica reservado para a integracao de WhatsApp (Task 3
  // do plano 260913-ivr) — aceito aqui e ainda ignorado nesta task.
  void enviarWhatsapp

  const verificarCupom = verificarCupomFiscal || criarVerificadorCupomFiscal()

  const db = new DatabaseSync(dbPath)
  ensureSchema(db)

  const staticMap = buildStaticMap(DIST_DIR)
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true'
  const checkRateLimit = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    mapCap: RATE_LIMIT_MAP_CAP,
  })

  const insertStmt = db.prepare(
    'INSERT INTO cadastro (cupom, nome, telefone, nfce, ip, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const findByCupomStmt = db.prepare('SELECT 1 FROM cadastro WHERE cupom = ?')
  const selectAllStmt = db.prepare(
    'SELECT cupom, nome, telefone, nfce, criado_em FROM cadastro ORDER BY id ASC'
  )

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (url.pathname === '/api/cadastro') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'metodo_nao_permitido' }))
        return
      }

      const origem = resolveOrigin(req, trustProxy)
      if (!checkRateLimit(origem)) {
        res.writeHead(429, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'muitas_tentativas' }))
        return
      }

      let body
      try {
        body = await readBody(req)
      } catch (err) {
        const status = err?.status || 400
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err?.error || 'erro_desconhecido' }))
        return
      }

      const validacao = validarCadastro(body)
      if (!validacao.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'dados_invalidos', campo: validacao.campo }))
        return
      }

      const { cupom, nome, telefone, nfce } = validacao.valor

      const jaExiste = findByCupomStmt.get(cupom)
      if (jaExiste) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'cupom_ja_cadastrado' }))
        return
      }

      // Validacao do cupom fiscal (COO) contra o Athos, antes de qualquer
      // insert. Nesta task so o ramo feliz esta implementado; os ramos de
      // bloqueio (422 invalido, 503 indisponivel) sao a Task 2 do plano.
      const resultadoAthos = await verificarCupom({ coo: nfce })
      if (resultadoAthos.status !== 'valido') {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'validacao_indisponivel' }))
        return
      }

      const ip = req.socket.remoteAddress || ''
      const criadoEm = new Date().toISOString()

      try {
        insertStmt.run(cupom, nome, telefone, nfce, ip, criadoEm)
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, cupom }))
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'cupom_ja_cadastrado' }))
          return
        }
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'erro_ao_gravar' }))
      }
      return
    }

    if (url.pathname === '/api/cadastros.csv') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'metodo_nao_permitido' }))
        return
      }

      const tokenConfigurado = process.env.PROMO_ADMIN_TOKEN
      if (!tokenConfigurado) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'exportacao_indisponivel' }))
        return
      }

      const tokenRecebido = req.headers['x-admin-token'] || url.searchParams.get('token') || ''
      if (!tokenRecebido || !tokenConfere(tokenRecebido, tokenConfigurado)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'nao_autorizado' }))
        return
      }

      const linhas = selectAllStmt.all()
      const csv = montarCsv(linhas)
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cadastros.csv"',
      })
      res.end(csv)
      return
    }

    // Estaticos: apenas rotas exatas presentes no mapa montado no boot.
    if (req.method === 'GET' || req.method === 'HEAD') {
      const filepath = staticMap.get(url.pathname)
      if (filepath) {
        const content = readFileSync(filepath)
        res.writeHead(200, { 'Content-Type': contentTypeFor(filepath) })
        res.end(req.method === 'HEAD' ? undefined : content)
        return
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'nao_encontrado' }))
  })

  server.db = db
  return server
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT) || 3100
  const PROMO_DB_PATH = process.env.PROMO_DB_PATH || './data/promo.db'

  const server = createServer({ dbPath: PROMO_DB_PATH })
  server.listen(PORT, () => {
    console.log(`promo-sorteio ouvindo na porta ${PORT} (banco: ${PROMO_DB_PATH})`)
  })
}
