import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarCadastro } from './validate.js'
import { escaparCelula, montarCsv } from './csv.js'

const BASE = { cupom: '1234', nome: 'Fulano de Tal', telefone: '(11) 99999-9999', nfce: '123' }

test('validarCadastro aceita um cadastro valido', () => {
  const r = validarCadastro(BASE)
  assert.equal(r.ok, true)
  assert.equal(r.valor.cupom, '1234')
  assert.equal(r.valor.telefone, '11999999999')
})

test('validarCadastro rejeita cupom fora de ^\\d{1,10}$', () => {
  const r = validarCadastro({ ...BASE, cupom: 'abc' })
  assert.equal(r.ok, false)
  assert.equal(r.campo, 'cupom')
})

test('validarCadastro rejeita cupom numericamente zero', () => {
  const r1 = validarCadastro({ ...BASE, cupom: '0' })
  assert.equal(r1.ok, false)
  assert.equal(r1.campo, 'cupom')

  const r2 = validarCadastro({ ...BASE, cupom: '0000' })
  assert.equal(r2.ok, false)
  assert.equal(r2.campo, 'cupom')
})

test('validarCadastro rejeita cupom com mais de 10 digitos', () => {
  const r = validarCadastro({ ...BASE, cupom: '12345678901' })
  assert.equal(r.ok, false)
  assert.equal(r.campo, 'cupom')
})

test('validarCadastro rejeita nome com menos de 2 caracteres', () => {
  const r = validarCadastro({ ...BASE, nome: 'A' })
  assert.equal(r.ok, false)
  assert.equal(r.campo, 'nome')
})

test('validarCadastro rejeita nome com mais de 80 caracteres', () => {
  const r = validarCadastro({ ...BASE, nome: 'A'.repeat(81) })
  assert.equal(r.ok, false)
  assert.equal(r.campo, 'nome')
})

test('validarCadastro rejeita telefone que nao reduz a 10 ou 11 digitos', () => {
  const r1 = validarCadastro({ ...BASE, telefone: '123' })
  assert.equal(r1.ok, false)
  assert.equal(r1.campo, 'telefone')

  const r2 = validarCadastro({ ...BASE, telefone: '119999999999999' })
  assert.equal(r2.ok, false)
  assert.equal(r2.campo, 'telefone')
})

test('validarCadastro aceita telefone com 10 digitos (fixo)', () => {
  const r = validarCadastro({ ...BASE, telefone: '1133334444' })
  assert.equal(r.ok, true)
  assert.equal(r.valor.telefone, '1133334444')
})

test('validarCadastro rejeita nfce acima de 44 caracteres', () => {
  const r = validarCadastro({ ...BASE, nfce: '1'.repeat(45) })
  assert.equal(r.ok, false)
  assert.equal(r.campo, 'nfce')
})

test('validarCadastro rejeita nfce com caractere fora de digito/espaco/hifen', () => {
  const r = validarCadastro({ ...BASE, nfce: 'ABC-123' })
  assert.equal(r.ok, false)
  assert.equal(r.campo, 'nfce')
})

test('validarCadastro aceita nfce ausente (opcional)', () => {
  const r = validarCadastro({ ...BASE, nfce: undefined })
  assert.equal(r.ok, true)
  assert.equal(r.valor.nfce, null)
})

test('escaparCelula prefixa apostrofo quando a celula comeca com sinal de igual', () => {
  assert.equal(escaparCelula('=SOMA(A1:A2)'), "'=SOMA(A1:A2)")
})

test('escaparCelula prefixa apostrofo para +, -, @, tab e CR', () => {
  assert.equal(escaparCelula('+1'), "'+1")
  assert.equal(escaparCelula('-1'), "'-1")
  assert.equal(escaparCelula('@cmd'), "'@cmd")
})

test('escaparCelula aplica aspas RFC4180 quando ha virgula ou aspas', () => {
  assert.equal(escaparCelula('Fulano, Ciclano'), '"Fulano, Ciclano"')
  assert.equal(escaparCelula('Nome "Apelido"'), '"Nome ""Apelido"""')
})

test('montarCsv gera cabecalho e BOM UTF-8', () => {
  const csv = montarCsv([])
  assert.ok(csv.startsWith('﻿'))
  assert.ok(csv.includes('cupom,nome,telefone,nfce,criado_em'))
})

test('montarCsv escapa celula perigosa e com virgula/aspas dentro das linhas', () => {
  const csv = montarCsv([
    { cupom: '1', nome: '=1+1', telefone: '11999999999', nfce: 'a,"b"', criado_em: '2026-09-13T00:00:00.000Z' },
  ])
  assert.ok(csv.includes("'=1+1"))
  assert.ok(csv.includes('"a,""b"""'))
})
