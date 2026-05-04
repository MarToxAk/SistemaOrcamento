# PLAN.md — Phase 15: Corrigir encoding NFS-e e proxy API

**Milestone:** v1.5
**Phase:** 15
**Status:** Planned
**Requirements:** NFSFIX-01, NFSFIX-02

## Objetivo
Corrigir os dois defeitos técnicos que impedem a emissão correta da NFS-e antes de mexer na UI de desconto:
- Mojibake nas descrições de serviço do backend
- Proxy Next.js que descarta o body do POST para emissão

## Hipótese local
O problema de encoding está isolado à constante SERVICOS em nfse.service.ts, e o problema de perda de dados está isolado ao handler POST de route.ts. Corrigindo esses dois pontos, o backend volta a expor descrições corretas e passa a receber os campos de desconto enviados pelo frontend.

## Plano de execução

### Task 15.1 — Corrigir strings corrompidas no backend
**Arquivo:** apps/backend/src/modules/integrations/nfse/nfse.service.ts

Passos:
1. Corrigir os quatro valores de descricao na constante SERVICOS.
2. Corrigir também o comentário acima da constante, que está com mojibake.
3. Preservar comportamento e chaves existentes.

Validação:
- Buscar por sequências corrompidas como Ã, §Ã, Ã£ no arquivo.
- Rodar checagem de TypeScript ou lint do backend se houver comando barato disponível.

### Task 15.2 — Repassar body do POST no proxy Next.js
**Arquivo:** apps/frontend/src/app/api/quotes/[id]/nfse/route.ts

Passos:
1. Ler o body bruto da request no handler POST.
2. Repassar esse body ao backendFetch.
3. Enviar Content-Type application/json quando houver body.
4. Manter tratamento de erro e resposta atual.

Validação:
- Revisar o diff do arquivo.
- Rodar checagem de TypeScript do frontend ou lint do arquivo se houver comando barato disponível.

## Critérios de pronto
- Não há mais strings com mojibake nas descrições de SERVICOS.
- O proxy POST repassa body para o backend.
- Pelo menos uma validação executável foi rodada após a edição.

## Fora de escopo
- UI do modal de desconto.
- Regras de cálculo de desconto no backend.
- Mudanças de schema ou banco.
