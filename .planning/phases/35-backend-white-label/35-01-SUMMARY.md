---
phase: 35-backend-white-label
plan: "01"
subsystem: nfse
tags: [white-label, nfse, config, tdd]
status: complete

dependency_graph:
  requires: []
  provides:
    - CODIGO_MUNICIPIO lido de EMPRESA_MUNICIPIO_IBGE via ConfigService
  affects:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts

tech_stack:
  added: []
  patterns:
    - getter computado delegando ao ConfigService (padrão WSDL_URL/ENDPOINT/AUX_URL)

key_files:
  modified:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.test.ts

decisions:
  - "D-11: CODIGO_MUNICIPIO vira getter computado lendo EMPRESA_MUNICIPIO_IBGE com fallback 3520400"
  - "D-12: DEFAULT_ENDPOINT e DEFAULT_AUX_URL mantidos inalterados — URLs especificos de Ilhabela ja sobrescritos por NFSE_SOAP_URL/NFSE_AUX_URL"

metrics:
  duration: "~8min"
  completed: "2026-06-19"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 2
  commits: 2
---

# Phase 35 Plan 01: NFSE-01 CODIGO_MUNICIPIO getter Summary

Getter computado `private get CODIGO_MUNICIPIO()` lendo `EMPRESA_MUNICIPIO_IBGE` via ConfigService com fallback "3520400" para deploy Ilhabela.

## Objective

Substituir `private readonly CODIGO_MUNICIPIO = "3520400"` em `NfseService` por getter computado que lê `EMPRESA_MUNICIPIO_IBGE` via `ConfigService`, mantendo "3520400" apenas como fallback. Base do white-label fiscal para NFS-e em outros municípios.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED | Testes failing para getter CODIGO_MUNICIPIO | 61542df | nfse.service.test.ts |
| GREEN | Implementação do getter computado | 69f3d3b | nfse.service.ts |

## Implementation Details

### Mudança cirúrgica (1 linha)

**Antes** (`nfse.service.ts` linha 60):
```typescript
private readonly CODIGO_MUNICIPIO  = "3520400";
```

**Depois:**
```typescript
private get CODIGO_MUNICIPIO() { return this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400"; }
```

O padrão é idêntico aos getters existentes `WSDL_URL`, `ENDPOINT`, `AUX_URL` nas linhas 66-68. `this.config` (ConfigService) já estava injetado no construtor — zero rewiring de módulo.

### Call sites

Todos os consumidores de `CODIGO_MUNICIPIO` (linhas 226, 970, 1022, 1092) usam `this.CODIGO_MUNICIPIO` — sintaxe idêntica para propriedade e getter em TypeScript. Nenhum call-site foi alterado.

### D-12: DEFAULT_ENDPOINT e DEFAULT_AUX_URL inalterados

As constantes das linhas 63-64 contêm "3520400" nos seus valores mas são URLs de endpoint específicas da prefeitura de Ilhabela (`ilhabela2.iibr.com.br`). Não foram parametrizadas conforme decisão D-12: o mecanismo correto para outros municípios é `NFSE_SOAP_URL`/`NFSE_AUX_URL` (já documentados no `.env.example`).

### Testes TDD

3 novos testes no describe "NfseService - getter CODIGO_MUNICIPIO (NFSE-01)":

1. **getter retorna EMPRESA_MUNICIPIO_IBGE quando definida** — acessa getter privado via cast `(service as any).CODIGO_MUNICIPIO` e verifica retorno "3550308"
2. **getter retorna fallback 3520400 quando EMPRESA_MUNICIPIO_IBGE ausente** — verifica fallback sem env var
3. **XML do servico usa env var via regex** — verifica o elemento `<CodigoMunicipio>` dentro do bloco `<Servico>` (não do tomador) via regex que distingue os dois contextos no XML

Total: 10 testes passando (7 pré-existentes + 3 novos).

## Acceptance Criteria Verification

- [x] `nfse.service.ts` contém `private get CODIGO_MUNICIPIO`
- [x] `nfse.service.ts` contém `config.get<string>("EMPRESA_MUNICIPIO_IBGE")`
- [x] `nfse.service.ts` NÃO contém mais `private readonly CODIGO_MUNICIPIO`
- [x] `nfse.service.ts` ainda contém `DEFAULT_ENDPOINT` e `DEFAULT_AUX_URL` inalterados (D-12)
- [x] `nfse.service.test.ts` contém o token `EMPRESA_MUNICIPIO_IBGE`
- [x] `npm --workspace @bomcusto/backend test -- --testPathPatterns=nfse.service` sai com código 0

## Deviations from Plan

**Ajuste de estratégia de teste (Rule 1 — correção de testes ineficazes):**

Os primeiros 2 testes escritos no RED verificavam `xmlSent.toContain("<CodigoMunicipio>3550308</CodigoMunicipio>")` mas passavam falsamente porque o XML do tomador (CLIENTE_PJ com `codigoMunicipio: "3550308"`) continha essa tag mesmo sem a implementação. Os testes foram reescritos para:
- Verificação direta do getter via `(service as any).CODIGO_MUNICIPIO` (testes 1 e 2)
- Verificação via regex que isola o `<CodigoMunicipio>` do bloco `<Servico>` (teste 3)

Essa mudança garantiu que o RED falhou corretamente (2 falhas esperadas antes da implementação).

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superfície nova — EMPRESA_MUNICIPIO_IBGE é lida de env var controlada pelo operador do servidor, conforme threat model T-35-01 (accept).

## TDD Gate Compliance

- [x] RED commit: `test(35-01): add failing tests for CODIGO_MUNICIPIO getter (NFSE-01)` (61542df)
- [x] GREEN commit: `feat(35-01): convert CODIGO_MUNICIPIO to computed getter reading EMPRESA_MUNICIPIO_IBGE` (69f3d3b)
- [ ] REFACTOR: não necessário — código já limpo e consistente com padrão existente

## Self-Check: PASSED

- [x] `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — modificado e verificado
- [x] `apps/backend/src/modules/integrations/nfse/nfse.service.test.ts` — modificado e verificado
- [x] Commits 61542df e 69f3d3b existem em git log
- [x] 10 testes passando
