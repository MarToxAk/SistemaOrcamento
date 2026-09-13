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

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')

const MAX_BODY_BYTES = 4096

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

export function createServer({ dbPath }) {
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  const db = new DatabaseSync(dbPath)
  ensureSchema(db)

  const staticMap = buildStaticMap(DIST_DIR)

  const insertStmt = db.prepare(
    'INSERT INTO cadastro (cupom, nome, telefone, nfce, ip, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
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

      let body
      try {
        body = await readBody(req)
      } catch (err) {
        const status = err?.status || 400
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err?.error || 'erro_desconhecido' }))
        return
      }

      const cupom = String(body.cupom ?? '').trim()
      const nome = String(body.nome ?? '').trim()
      const telefone = String(body.telefone ?? '').trim()
      const nfce = body.nfce != null ? String(body.nfce).trim() : null

      if (!cupom || !nome || !telefone) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'dados_invalidos' }))
        return
      }

      const ip = req.socket.remoteAddress || ''
      const criadoEm = new Date().toISOString()

      try {
        insertStmt.run(cupom, nome, telefone, nfce, ip, criadoEm)
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, cupom }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'erro_ao_gravar' }))
      }
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
