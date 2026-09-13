import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from './index.js'

function startServer(dbPath) {
  return new Promise((resolve) => {
    const server = createServer({ dbPath })
    server.listen(0, () => resolve(server))
  })
}

function baseUrl(server) {
  const { port } = server.address()
  return `http://127.0.0.1:${port}`
}

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'promo-test-'))
  const dbPath = join(dir, 'promo.db')
  const server = await startServer(dbPath)
  try {
    await fn(server, dbPath)
  } finally {
    server.db.close()
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

test('POST /api/cadastro com dados validos responde 201 e grava exatamente 1 linha', async () => {
  await withServer(async (server, dbPath) => {
    const resposta = await fetch(`${baseUrl(server)}/api/cadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cupom: '1234', nome: 'Fulano de Tal', telefone: '11999999999', nfce: '123' }),
    })
    assert.equal(resposta.status, 201)
    const json = await resposta.json()
    assert.equal(json.ok, true)
    assert.equal(json.cupom, '1234')

    server.db.close()
    const check = new DatabaseSync(dbPath)
    const rows = check.prepare('SELECT cupom, nome, telefone FROM cadastro').all()
    check.close()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cupom, '1234')
    assert.equal(rows[0].nome, 'Fulano de Tal')
    assert.equal(rows[0].telefone, '11999999999')
    // Reabrir para o teardown fechar sem erro
    server.db = new DatabaseSync(dbPath)
  })
})

test('GET / responde 200 com HTML referenciando o bundle do Vite', async () => {
  await withServer(async (server) => {
    const resposta = await fetch(`${baseUrl(server)}/`)
    assert.equal(resposta.status, 200)
    const html = await resposta.text()
    assert.match(html, /<script[^>]+type="module"/)
  })
})

test('GET /caminho-inexistente responde 404', async () => {
  await withServer(async (server) => {
    const resposta = await fetch(`${baseUrl(server)}/caminho-inexistente`)
    assert.equal(resposta.status, 404)
  })
})

test('reabrir o mesmo arquivo de banco nao duplica schema nem dados', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'promo-test-'))
  const dbPath = join(dir, 'promo.db')
  try {
    const server1 = await startServer(dbPath)
    await fetch(`${baseUrl(server1)}/api/cadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cupom: '5678', nome: 'Ciclana', telefone: '11988887777' }),
    })
    server1.db.close()
    server1.close()

    const server2 = await startServer(dbPath)
    const rows = server2.db.prepare('SELECT cupom FROM cadastro').all()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cupom, '5678')
    server2.db.close()
    server2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('POST /api/cadastro com metodo errado em /api/cadastro responde 405', async () => {
  await withServer(async (server) => {
    const resposta = await fetch(`${baseUrl(server)}/api/cadastro`, { method: 'GET' })
    assert.equal(resposta.status, 405)
  })
})
