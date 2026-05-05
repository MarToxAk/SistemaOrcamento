# 19-CONTEXT - API de busca de cliente Athos

Phase: 19
Milestone: v1.8
Status: planning
Created: 2026-05-04

---

## Objetivo

Implementar uma API interna para busca de clientes no Athos, com filtros por nome, CPF/CNPJ e idcliente, para suportar a selecao de tomador no fluxo de emissao de NFS-e.

A fase foca apenas no backend de busca e normalizacao dos dados do cliente. A selecao na UI e envio no fluxo de emissao ficam para a fase 21.

---

## Escopo

### In Scope
- Novo metodo no AthosService para pesquisar clientes com paginacao
- Join read-only entre cliente, cliente_fisico e cliente_juridico para consolidar nome e documento
- Inclusao de endereco resumido via cliente_endereco (quando houver)
- Novo endpoint interno no AthosController para expor a busca
- Validacoes de query (limites, filtros minimos, normalizacao de entrada)
- Testes de unidade para cenarios essenciais de busca

### Out of Scope
- Alteracoes na UI de emissao NFS-e
- Mudancas no metodo emitir() da NFS-e para consumir clienteAthosId
- Escrita/sincronizacao no banco Athos
- Busca fuzzy com ranking por relevancia

---

## Estado Atual

### AthosService
- Ja possui conexao read-only com Pool e limite de conexoes
- Ja possui metodo buscarClientePorId(clienteId)
- Nao possui metodo de busca textual/listagem de clientes

### AthosController
- Ja possui endpoint GET /athos/contas-pagar com protecao por token opcional ATHOS_API_TOKEN
- Nao possui endpoint para busca de clientes

### NfseService
- Atualmente resolve tomador usando lookup por orcamento e buscarClientePorId
- Ainda nao recebe clienteAthosId explicito no payload de emissao

---

## Base de Dados Athos (fornecida)

Tabelas-alvo para esta fase:
- cliente
- cliente_fisico
- cliente_juridico
- cliente_endereco

Campos principais esperados para busca:
- cliente.idcliente
- cliente_fisico.nome, cliente_fisico.cpf
- cliente_juridico.nomefantasia, cliente_juridico.razaosocial, cliente_juridico.cnpj
- cliente_endereco.logradouro, numero, bairro, cep, codigocidade, uf

---

## Decisoes de Design

| ID | Decisao | Razao |
|----|---------|-------|
| D-01 | Busca read-only direta no Athos | Evita drift de cadastro e mantem fonte oficial |
| D-02 | Endpoint interno protegido por mecanismo existente | Reaproveita seguranca atual sem novo acoplamento |
| D-03 | Limite maximo de pagina para consulta | Evita consultas pesadas na base Athos |
| D-04 | Normalizar saida em formato unico PF/PJ | Simplifica consumo nas fases 20 e 21 |
| D-05 | Priorizar filtros exatos de documento e idcliente quando presentes | Melhora performance e previsibilidade |

---

## Contrato de Saida (proposto)

```json
{
  "total": 2,
  "page": 1,
  "take": 20,
  "items": [
    {
      "idcliente": 123,
      "tipoPessoa": "fisico",
      "nome": "Joao da Silva",
      "documento": "12345678901",
      "endereco": {
        "logradouro": "Rua X",
        "numero": "10",
        "bairro": "Centro",
        "cep": "11630000",
        "codigoMunicipio": "3520400",
        "uf": "SP"
      }
    }
  ]
}
```

---

## Referencia de Requisitos

| Requisito | Descricao |
|-----------|-----------|
| ATHCL-01 | Buscar clientes Athos por nome/documento/idcliente |
| ATHCL-02 | Normalizar tipo de pessoa e documento |
| ATHCL-03 | Paginacao e validacao para evitar varredura excessiva |
