---
phase: 260804-g0t
plan: 01
subsystem: nfse-integracoes
tags: [nfse, viacep, fallback, codigomunicipio, iibrasil]
dependency-graph:
  requires: []
  provides:
    - "viacep.util.ts: consultarIbgePorCep (cliente HTTP puro, nunca lanca, timeout 5s)"
    - "nfse.service.ts: enviarRpsComFallbackMunicipio (ponto unico de retry para GerarNfse)"
  affects:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts (emitir, emitirParaContaReceber)
tech-stack:
  added: []
  patterns:
    - "Fallback de dado nao confiavel via API publica (ViaCEP) acionado apenas por codigo de erro especifico da prefeitura"
    - "Ponto unico de envio SOAP com retry encapsulado — elimina duplicacao entre dois fluxos de emissao"
key-files:
  created:
    - apps/backend/src/modules/integrations/nfse/viacep.util.ts
    - apps/backend/src/modules/integrations/nfse/nfse.municipio-fallback.test.ts
  modified:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - memory/nfse-iibrasil-integracao.md
decisions:
  - "Fallback restrito a codigos E288/E58 (ou mensagem casando /municipio/i + /tomador/i) — nao dispara para nenhum outro erro da prefeitura"
  - "Apenas UMA re-tentativa, reutilizando o mesmo numero de RPS — RPS rejeitado nao e consumido pela prefeitura"
  - "Falha do ViaCEP, CEP invalido, IBGE ja identico ao cadastrado, ou 2a tentativa tambem falha -> propaga o erro ORIGINAL da 1a tentativa (D-04)"
  - "Divergencia de UF entre ViaCEP e Athos e apenas logada (warn) — a UF enviada nunca e alterada (fora de escopo D-05)"
metrics:
  duration: "~35min"
  completed: 2026-08-04
actuals:
  tokens: 7915
  tasks: 3
  commits: 3
status: complete
---

# Quick Task 260804-g0t: Corrigir emissao de NFS-e travada por CodigoMunicipio incorreto Summary

Fallback automatico via ViaCEP para o `CodigoMunicipio` do tomador na emissao de NFS-e: quando a prefeitura de Ilhabela rejeita com E288/E58, o backend consulta o ViaCEP pelo CEP do tomador e re-tenta uma unica vez com o codigo IBGE corrigido, sem exigir correcao manual de cadastro no Athos.

## O que foi feito

**Task 1 — Fallback ViaCEP end-to-end no fluxo de contas a receber** (commit `3d2f42f`)
- Criado `apps/backend/src/modules/integrations/nfse/viacep.util.ts`: `consultarIbgePorCep(cep, timeoutMs=5000)` — funcao pura sem DI, nunca lanca exceção. Retorna `null` para CEP com menos/mais de 8 digitos (sem chamada de rede), erro de transporte/timeout, resposta `{erro:true}`, ou `ibge` ausente/fora do padrao de 7 digitos.
- `nfse.service.ts`: tipo `RpsXmlInput` extraido para nivel de modulo (era object literal inline em `buildRpsXml`); `parseCodigosErro()` novo (extrai `<Codigo>` de dentro de `<MensagemRetorno>`, com fallback para matchAll global se o wrapper nao existir); `deveTentarFallbackMunicipio()` novo (codigos E288/E58 OU mensagem casando `/municí?pio/i` + `/tomador/i`); `enviarRpsComFallbackMunicipio()` novo — ponto unico de envio com a logica completa de tentativa 1 -> deteccao de erro de municipio -> consulta ViaCEP -> guardas (CEP invalido, ViaCEP indisponivel, IBGE ja identico) -> tentativa 2 -> fallback para o erro original em qualquer falha da 2a tentativa.
- `emitirParaContaReceber()` ligado ao novo metodo unico, substituindo o `enviarSoap` inline.
- 9 testes novos em `nfse.municipio-fallback.test.ts`: 5 casos de `consultarIbgePorCep`, 3 de `deveTentarFallbackMunicipio`, 1 ponta-a-ponta (E58 -> retry com IBGE corrigido, mesmo numero de RPS, `<TomadorServico>` correto na 2a chamada).

**Task 2 — Mesmo fallback no fluxo de emissao por orcamento (`emitir`)** (commit `518ef6d`)
- `emitir()` ligado ao mesmo `enviarRpsComFallbackMunicipio()`, eliminando a segunda copia do bloco `computeIntegridade`/`enviarSoap`/`parseErros`/`parseNumeroNfse` que existia inline.
- `grep -c 'enviarRpsComFallbackMunicipio'` no arquivo = 3 (1 definicao + 2 chamadas) — ambos os fluxos agora passam pelo ponto unico de retry.
- 2 testes novos: E288 na 1a resposta aciona retry com IBGE do ViaCEP e `quote.update` recebe o `nfseNumero` da 2a resposta; caminho feliz (municipio correto) confirma `enviarSoap` 1x e `axios.get` nunca chamado.

**Task 3 — Matriz de falhas e documentacao** (commit `4afc9f2`)
- 5 cenarios novos em `nfse.municipio-fallback.test.ts`: ViaCEP timeout, ViaCEP `{erro:true}`, E165 (nao aciona fallback, `axios.get` nunca chamado), IBGE do ViaCEP identico ao ja cadastrado (retry inutil evitado), E58 tambem na 2a tentativa (mensagem propagada e da PRIMEIRA tentativa). Todos usam `.rejects.toThrow(BadRequestException)` + assercao de mensagem para provar que o erro propagado e o da prefeitura, nao um erro inventado.
- `memory/nfse-iibrasil-integracao.md` atualizado: linha `E58` reescrita, linha `E288` adicionada, e nova subsecao "Fallback de CodigoMunicipio do tomador" com gatilho, fonte, limite (uma re-tentativa), comportamento em falha e o caso de referencia `idcliente=3485`.

## Resultado dos testes

```
cd apps/backend && npx jest nfse.
Test Suites: 3 passed, 3 total
Tests:       35 passed, 35 total   (11 nfse.service + 16 nfse.municipio-fallback + 8 nfse.discount)

npx tsc --noEmit -p tsconfig.json
(sem erros)

grep -v '^\s*//' nfse.service.ts | grep -c 'enviarRpsComFallbackMunicipio'
3

grep -v '^#' memory/nfse-iibrasil-integracao.md | grep -c 'E288'
1
```

`git diff 11ed94c..HEAD -- nfse.service.ts` confirma que `computeIntegridade`, `SERVICOS`, `CBS_RATE`/`IBS_RATE`/`NBS_DEFAULT`, `cancelarNfse`, `cancelarTeste`, `emitirTeste` e a resolucao de tomador (Caminhos A/B/C) NAO foram tocados — apenas os pontos de chamada de `computeIntegridade`/`enviarSoap` foram movidos para dentro do novo metodo de retry. `git status` confirma que `package.json`/`package-lock.json` nao mudaram (zero novas dependencias — reutiliza o `axios` ja presente).

## Deviations from Plan

None — plano executado exatamente como escrito nas Tasks 1-3. A unica adaptacao foi de forma de teste (nao de comportamento): nos 5 cenarios da matriz de falhas (Task 3), em vez de chamar `service.emitirParaContaReceber(...)` duas vezes por teste (uma por assercao `.rejects.toThrow`), o plano original sugeria isso mas cada chamada extra consumiria os mocks `mockResolvedValueOnce` de novo, quebrando a contagem de `enviarSoap`/`axios.get`. A implementacao guarda a Promise numa variavel e faz as duas assercoes sobre a MESMA invocacao (`const promise = service.emitirParaContaReceber(...); await expect(promise).rejects.toThrow(...)` duas vezes) — mesma cobertura, sem re-invocar o metodo.

## Pending Human Verification (Task 4 — NAO executada)

Task 4 do plano e `type="checkpoint:human-verify" gate="blocking"` e requer emissao real de NFS-e contra a prefeitura de Ilhabela em producao — nao pode ser automatizada. Instrucoes originais do plano, reproduzidas verbatim:

> Emissao real de NFS-e so pode ser validada contra a prefeitura (documento fiscal de producao) — nao ha como automatizar.
>
> 1. Subir o backend com o fix (`npm run start:dev` em `apps/backend` ou o deploy normal).
> 2. Emitir NFS-e para o cliente que estava travado: **idcliente 3485 — DP BARROS** (CEP 05516030), pelo fluxo de contas a receber.
> 3. Esperado: a NFS-e e emitida com sucesso, sem erro E288/E58 na tela.
> 4. Nos logs do backend deve aparecer a sequencia: a 1a resposta com o erro da prefeitura, a consulta ao ViaCEP e o log de correcao com `4121208 -> 3550308`, seguido do numero da NFS-e emitida.
> 5. Emitir tambem UMA NFS-e para um cliente com endereco correto (ex: um cliente de Ilhabela) e confirmar nos logs que houve **uma unica** chamada SOAP e NENHUMA chamada ao ViaCEP — o caminho feliz nao pode ter mudado.
> 6. Se aparecer no log o warn de divergencia de UF (`ViaCEP uf != uf do Athos`), reportar: significa que a UF do cadastro tambem esta errada e a segunda tentativa pode falhar mesmo com o municipio corrigido — nesse caso o codigo esta correto e a correcao e de cadastro no Athos.
>
> **Resume-signal:** Responda "aprovado" ou descreva o que aconteceu (mensagem de erro exata + trecho do log).

## Self-Check: PASSED

Arquivos criados:
- FOUND: apps/backend/src/modules/integrations/nfse/viacep.util.ts
- FOUND: apps/backend/src/modules/integrations/nfse/nfse.municipio-fallback.test.ts

Commits:
- FOUND: 3d2f42f (feat — Task 1)
- FOUND: 518ef6d (feat — Task 2)
- FOUND: 4afc9f2 (test/docs — Task 3)

35/35 testes das suites `nfse.*` verdes; `tsc --noEmit` sem erros; nenhuma alteracao em `package.json`.
