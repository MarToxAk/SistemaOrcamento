import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from './index.js'

function startServer(dbPath, deps = {}) {
  return new Promise((resolve) => {
    const server = createServer({ dbPath, ...deps })
    server.listen(0, () => resolve(server))
  })
}

function baseUrl(server) {
  const { port } = server.address()
  return `http://127.0.0.1:${port}`
}

// Stub padrao: aprova qualquer cupom fiscal, para os testes que nao existem
// para exercer a integracao Athos continuarem exercendo exatamente o que
// exerciam antes dela existir.
function verificadorAprovaTudo() {
  return async () => ({ status: 'valido', valor: 999 })
}

async function withServer(fn, deps = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'promo-test-'))
  const dbPath = join(dir, 'promo.db')
  const server = await startServer(dbPath, {
    verificarCupomFiscal: verificadorAprovaTudo(),
    ...deps,
  })
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
    const server1 = await startServer(dbPath, { verificarCupomFiscal: verificadorAprovaTudo() })
    await fetch(`${baseUrl(server1)}/api/cadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cupom: '5678', nome: 'Ciclana', telefone: '11988887777', nfce: '999' }),
    })
    server1.db.close()
    server1.close()

    const server2 = await startServer(dbPath, { verificarCupomFiscal: verificadorAprovaTudo() })
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

const VALIDO = { cupom: '1001', nome: 'Fulano de Tal', telefone: '11999999999', nfce: '123' }

async function postCadastro(server, overrides) {
  return fetch(`${baseUrl(server)}/api/cadastro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...VALIDO, ...overrides }),
  })
}

test('POST /api/cadastro com cupom invalido responde 400 com campo cupom', async () => {
  await withServer(async (server) => {
    const resposta = await postCadastro(server, { cupom: '0000' })
    assert.equal(resposta.status, 400)
    const json = await resposta.json()
    assert.equal(json.campo, 'cupom')
  })
})

test('POST /api/cadastro com nome invalido responde 400 com campo nome', async () => {
  await withServer(async (server) => {
    const resposta = await postCadastro(server, { nome: 'A' })
    assert.equal(resposta.status, 400)
    const json = await resposta.json()
    assert.equal(json.campo, 'nome')
  })
})

test('POST /api/cadastro com telefone invalido responde 400 com campo telefone', async () => {
  await withServer(async (server) => {
    const resposta = await postCadastro(server, { telefone: '123' })
    assert.equal(resposta.status, 400)
    const json = await resposta.json()
    assert.equal(json.campo, 'telefone')
  })
})

test('POST /api/cadastro com nfce invalido responde 400 com campo nfce', async () => {
  await withServer(async (server) => {
    const resposta = await postCadastro(server, { nfce: 'ABC-XYZ' })
    assert.equal(resposta.status, 400)
    const json = await resposta.json()
    assert.equal(json.campo, 'nfce')
  })
})

test('segundo POST com o mesmo cupom responde 409 e o banco segue com 1 linha', async () => {
  await withServer(async (server, dbPath) => {
    const r1 = await postCadastro(server, { cupom: '2002' })
    assert.equal(r1.status, 201)

    const r2 = await postCadastro(server, { cupom: '2002', nome: 'Outro Nome' })
    assert.equal(r2.status, 409)
    const json2 = await r2.json()
    assert.equal(json2.error, 'cupom_ja_cadastrado')

    server.db.close()
    const check = new DatabaseSync(dbPath)
    const rows = check.prepare('SELECT cupom FROM cadastro WHERE cupom = ?').all('2002')
    check.close()
    assert.equal(rows.length, 1)
    server.db = new DatabaseSync(dbPath)
  })
})

test('acima de 10 POSTs da mesma origem em 10 minutos responde 429', async () => {
  await withServer(async (server) => {
    for (let i = 0; i < 10; i += 1) {
      const resposta = await postCadastro(server, { cupom: String(3000 + i) })
      assert.equal(resposta.status, 201, `POST ${i + 1} deveria ser 201`)
    }
    const decimoPrimeiro = await postCadastro(server, { cupom: '3010' })
    assert.equal(decimoPrimeiro.status, 429)
    const json = await decimoPrimeiro.json()
    assert.equal(json.error, 'muitas_tentativas')
  })
})

test('GET /api/cadastros.csv sem PROMO_ADMIN_TOKEN no servidor responde 503', async () => {
  await withServer(async (server) => {
    delete process.env.PROMO_ADMIN_TOKEN
    const resposta = await fetch(`${baseUrl(server)}/api/cadastros.csv`)
    assert.equal(resposta.status, 503)
  })
})

test('GET /api/cadastros.csv sem token responde 401 quando o servidor tem token configurado', async () => {
  await withServer(async (server) => {
    process.env.PROMO_ADMIN_TOKEN = 'segredo-de-teste'
    try {
      const resposta = await fetch(`${baseUrl(server)}/api/cadastros.csv`)
      assert.equal(resposta.status, 401)
    } finally {
      delete process.env.PROMO_ADMIN_TOKEN
    }
  })
})

test('POST /api/cadastro com verificador stub que aprova responde 201 e grava exatamente 1 linha', async () => {
  await withServer(async (server, dbPath) => {
    const resposta = await postCadastro(server, { cupom: '5005', nfce: '4242' })
    assert.equal(resposta.status, 201)
    const json = await resposta.json()
    assert.equal(json.ok, true)

    server.db.close()
    const check = new DatabaseSync(dbPath)
    const rows = check.prepare('SELECT cupom, nfce FROM cadastro WHERE cupom = ?').all('5005')
    check.close()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].nfce, '4242')
    server.db = new DatabaseSync(dbPath)
  })
})

test('o verificador de cupom fiscal recebe o COO digitado no campo nfce', async () => {
  const chamadasComCoo = []
  const verificarCupomFiscal = async ({ coo }) => {
    chamadasComCoo.push(coo)
    return { status: 'valido', valor: 100 }
  }

  await withServer(
    async (server) => {
      const resposta = await postCadastro(server, { cupom: '6006', nfce: '424242' })
      assert.equal(resposta.status, 201)
    },
    { verificarCupomFiscal },
  )

  assert.deepEqual(chamadasComCoo, ['424242'])
})

function contarLinhas(dbPath) {
  const check = new DatabaseSync(dbPath)
  const total = check.prepare('SELECT COUNT(*) as total FROM cadastro').get().total
  check.close()
  return total
}

test('POST /api/cadastro com verificador que devolve invalido responde 422 e nao grava', async () => {
  const verificarCupomFiscal = async () => ({ status: 'invalido' })

  await withServer(
    async (server, dbPath) => {
      const resposta = await postCadastro(server, { cupom: '7007' })
      assert.equal(resposta.status, 422)
      const json = await resposta.json()
      assert.equal(json.ok, false)
      assert.equal(json.error, 'cupom_fiscal_invalido')

      server.db.close()
      assert.equal(contarLinhas(dbPath), 0)
      server.db = new DatabaseSync(dbPath)
    },
    { verificarCupomFiscal },
  )
})

test('POST /api/cadastro com verificador que devolve indisponivel responde 503 e nao grava', async () => {
  const verificarCupomFiscal = async () => ({ status: 'indisponivel', motivo: 'timeout' })

  await withServer(
    async (server, dbPath) => {
      const resposta = await postCadastro(server, { cupom: '7008' })
      assert.equal(resposta.status, 503)
      const json = await resposta.json()
      assert.equal(json.ok, false)
      assert.equal(json.error, 'validacao_indisponivel')

      server.db.close()
      assert.equal(contarLinhas(dbPath), 0)
      server.db = new DatabaseSync(dbPath)
    },
    { verificarCupomFiscal },
  )
})

test('POST /api/cadastro num servidor sem nenhuma env de validacao configurada responde 503 e nao grava', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'promo-test-'))
  const dbPath = join(dir, 'promo.db')
  const originais = {
    PROMO_ATHOS_BASE_URL: process.env.PROMO_ATHOS_BASE_URL,
    PROMO_ATHOS_API_TOKEN: process.env.PROMO_ATHOS_API_TOKEN,
    PROMO_BACKEND_INTERNAL_API_KEY: process.env.PROMO_BACKEND_INTERNAL_API_KEY,
  }
  delete process.env.PROMO_ATHOS_BASE_URL
  delete process.env.PROMO_ATHOS_API_TOKEN
  delete process.env.PROMO_BACKEND_INTERNAL_API_KEY

  try {
    // Sem injetar verificarCupomFiscal: usa o default criarVerificadorCupomFiscal(),
    // que le process.env sem as 3 variaveis.
    const server = await startServer(dbPath)
    try {
      const resposta = await postCadastro(server, { cupom: '7009' })
      assert.equal(resposta.status, 503)
      const json = await resposta.json()
      assert.equal(json.error, 'validacao_indisponivel')

      server.db.close()
      assert.equal(contarLinhas(dbPath), 0)
    } finally {
      server.close()
    }
  } finally {
    for (const [chave, valor] of Object.entries(originais)) {
      if (valor === undefined) delete process.env[chave]
      else process.env[chave] = valor
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('POST /api/cadastro sem nfce responde 400 com campo nfce e nao chega a chamar o verificador', async () => {
  let chamou = false
  const verificarCupomFiscal = async () => {
    chamou = true
    return { status: 'valido' }
  }

  await withServer(
    async (server) => {
      const resposta = await postCadastro(server, { nfce: undefined })
      assert.equal(resposta.status, 400)
      const json = await resposta.json()
      assert.equal(json.campo, 'nfce')
      assert.equal(chamou, false)
    },
    { verificarCupomFiscal },
  )
})

test('POST /api/cadastro aceito chama o enviador de WhatsApp uma vez com o telefone e o cupom, respondendo 201 com whatsapp.enviado true', async () => {
  const chamadas = []
  const enviarWhatsapp = async ({ telefone, cupom }) => {
    chamadas.push({ telefone, cupom })
    return { enviado: true }
  }

  await withServer(
    async (server) => {
      const resposta = await postCadastro(server, { cupom: '8001', telefone: '11999997777' })
      assert.equal(resposta.status, 201)
      const json = await resposta.json()
      assert.deepEqual(json.whatsapp, { enviado: true })
    },
    { enviarWhatsapp },
  )

  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0].telefone, '11999997777')
  assert.equal(chamadas[0].cupom, '8001')
})

test('POST /api/cadastro aceito com enviador que falha responde 201 com whatsapp.enviado false e a linha permanece gravada', async () => {
  const enviarWhatsapp = async () => ({ enviado: false, motivo: 'http_500' })

  await withServer(
    async (server, dbPath) => {
      const resposta = await postCadastro(server, { cupom: '8002' })
      assert.equal(resposta.status, 201)
      const json = await resposta.json()
      assert.equal(json.whatsapp.enviado, false)

      server.db.close()
      assert.equal(contarLinhas(dbPath), 1)
      server.db = new DatabaseSync(dbPath)
    },
    { enviarWhatsapp },
  )
})

test('POST /api/cadastro aceito com enviador que lanca responde 201 e a linha permanece gravada (1 linha)', async () => {
  const enviarWhatsapp = async () => {
    throw new Error('falha inesperada no enviador')
  }

  await withServer(
    async (server, dbPath) => {
      const resposta = await postCadastro(server, { cupom: '8003' })
      assert.equal(resposta.status, 201)
      const json = await resposta.json()
      assert.equal(json.whatsapp.enviado, false)

      server.db.close()
      assert.equal(contarLinhas(dbPath), 1)
      server.db = new DatabaseSync(dbPath)
    },
    { enviarWhatsapp },
  )
})

test('cadastro bloqueado (422, 503, 409, 400) nao chama o enviador de WhatsApp', async () => {
  let chamou = false
  const enviarWhatsapp = async () => {
    chamou = true
    return { enviado: true }
  }

  await withServer(
    async (server) => {
      // 422 — verificador invalido
      const r422 = await postCadastro(server, { cupom: '8100' })
      assert.equal(r422.status, 422)
      assert.equal(chamou, false)
    },
    { enviarWhatsapp, verificarCupomFiscal: async () => ({ status: 'invalido' }) },
  )
  assert.equal(chamou, false)

  await withServer(
    async (server) => {
      const r503 = await postCadastro(server, { cupom: '8101' })
      assert.equal(r503.status, 503)
    },
    { enviarWhatsapp, verificarCupomFiscal: async () => ({ status: 'indisponivel' }) },
  )
  assert.equal(chamou, false)

  await withServer(
    async (server) => {
      const primeiro = await postCadastro(server, { cupom: '8102' })
      assert.equal(primeiro.status, 201)
      chamou = false // reseta: o primeiro cadastro (aceito) chama o enviador; so o segundo (409) importa aqui
      const segundo = await postCadastro(server, { cupom: '8102', nome: 'Outro Nome' })
      assert.equal(segundo.status, 409)
      assert.equal(chamou, false)
    },
    { enviarWhatsapp },
  )

  await withServer(
    async (server) => {
      const r400 = await postCadastro(server, { nfce: undefined })
      assert.equal(r400.status, 400)
      assert.equal(chamou, false)
    },
    { enviarWhatsapp },
  )
})

test('GET /api/cadastros.csv com token correto responde 200 text/csv com cabecalho e linhas', async () => {
  await withServer(async (server) => {
    process.env.PROMO_ADMIN_TOKEN = 'segredo-de-teste'
    try {
      await postCadastro(server, { cupom: '4004', nome: '=PERIGO(1)' })
      const resposta = await fetch(`${baseUrl(server)}/api/cadastros.csv?token=segredo-de-teste`)
      assert.equal(resposta.status, 200)
      assert.match(resposta.headers.get('content-type') || '', /text\/csv/)
      const csv = await resposta.text()
      assert.ok(csv.includes('cupom,nome,telefone,nfce,criado_em'))
      assert.ok(csv.includes("'=PERIGO(1)"))
    } finally {
      delete process.env.PROMO_ADMIN_TOKEN
    }
  })
})
