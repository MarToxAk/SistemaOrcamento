# 02-02-SUMMARY.md — Gap Closure: Endereco manual do tomador na NFS-e

## Status: COMPLETE

## Objetivo
Fechar gap do UAT da fase 2 (teste 4): permitir endereco manual do tomador quando nao houver associado no Athos e validar erro claro quando faltar endereco no fluxo manual.

## Implementacao

### Backend
Arquivo: apps/backend/src/modules/integrations/nfse/nfse.service.ts

- Expandido `EmitirNfseInput` com campos manuais de endereco do tomador:
  - `tomadorEnderecoLogradouro`
  - `tomadorEnderecoNumero`
  - `tomadorEnderecoBairro`
  - `tomadorEnderecoCep`
  - `tomadorEnderecoCodigoMunicipio`
  - `tomadorEnderecoUf`
- Adicionado parsing/sanitizacao/validacao do endereco manual:
  - exige todos os campos se qualquer campo de endereco for informado
  - valida CEP com 8 digitos
  - valida codigo do municipio IBGE com 7 digitos
  - valida UF com 2 letras
- Em `emitir()`:
  - usa endereco manual quando informado
  - faz fallback para endereco do Athos quando possivel
  - retorna 400 com mensagem clara quando documento manual e endereco ausente
- Em `consultar()`:
  - retorna `tomador.endereco`
  - retorna `tomador.temEndereco`

### Frontend
Arquivo: apps/frontend/src/app/orcamento/[id]/page.tsx

- Modal de NFS-e ganhou campos de endereco:
  - logradouro, numero, bairro, CEP, municipio (IBGE), UF
- Preenchimento automatico a partir de `GET /api/quotes/:id/nfse` (`tomador.endereco`)
- `POST /api/quotes/:id/nfse` agora envia os campos de endereco no body
- Mensagem orientativa adicionada no modal para o caso sem associado no Athos

## Verificacoes

### Automatizadas
- `npm --workspace @bomcusto/backend run build` -> OK
- `npm --workspace @bomcusto/frontend run build` -> OK
- `cd apps/frontend && npx tsc --noEmit` -> OK

### UAT
- Gap atualizado em `.planning/phases/02-confiabilidade-de-integracoes/02-UAT.md` com:
  - `fix_plan: .planning/phases/02-confiabilidade-de-integracoes/02-02-PLAN.md`
  - `fix_status: implemented-pending-uat-retest`

## Resultado
A correcao de gap foi implementada e validada por build/typecheck. Falta apenas reteste humano do cenario de emissao para trocar status do gap para resolvido.
