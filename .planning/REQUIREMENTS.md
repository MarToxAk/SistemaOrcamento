# Requirements - Sistema de Orcamento BomCusto

Milestone: v1.7 — Correcoes NFS-e: Tomador e Numeracao RPS
Date: 2026-05-04

---

## v1.7 Requirements

### Numeracao RPS

- [x] **RPS-01**: Ao emitir NFS-e, o numero RPS usado e `proximoRps` retornado por `getInfoNfse()` -- a API iiBrasil retorna ProximoRPS ja como o proximo numero a emitir (sem incremento). Ex: ProximoRPS=8 -> envia RPS 8.
- [x] **RPS-02**: O comportamento de fallback (internalNumber) e mantido sem regressao quando a API Auxiliar esta indisponivel

### Dados do Tomador

- [x] **TOM-01**: Quando o orcamento esta associado ao Athos (`externalQuoteId` preenchido), `buscarTomador()` retorna nome, CPF/CNPJ e endereco do cliente corretos
- [x] **TOM-02**: Se a busca no Athos falhar, os logs registram o motivo com nivel WARNING suficiente para diagnostico (identifierColumn, idcliente retornado, erro da query)
- [x] **TOM-03**: Se `idcliente` retornado pelo Athos for zero ou falsy, a busca de cliente por ID nao e silenciada — registrar aviso explicito e tentar fallback por nome da tabela orcamento

### Regressao

- [x] **REG-01**: Emissao de NFS-e sem associacao ao Athos continua funcionando normalmente (tomador nulo permitido, nota emitida sem tomador)
- [x] **REG-02**: Emissao com desconto continua funcionando (NFSC-01..05 nao regridem)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Alterar schema do banco para armazenar idcliente Athos na quote | Escopo v1.7 e correetivo; alteracao de schema e backlog |
| Validacao obrigatoria de CPF/CNPJ do tomador | iiBrasil aceita emissao sem tomador identificado |
| UI de preenchimento manual do tomador | Escopo futuro; tomador automatico via Athos e suficiente |

---

## Traceability

| REQ-ID | Phase | Status  |
|--------|-------|---------|
| RPS-01 | 18    | pending |
| RPS-02 | 18    | pending |
| TOM-01 | 18    | pending |
| TOM-02 | 18    | pending |
| TOM-03 | 18    | pending |
| REG-01 | 18    | pending |
| REG-02 | 18    | pending |

---
*Requirements defined: 2026-05-04*
*Last updated: 2026-05-04*
