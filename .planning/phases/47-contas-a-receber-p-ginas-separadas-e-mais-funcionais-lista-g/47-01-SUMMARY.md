---
phase: 47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g
plan: 01
subsystem: cobranca / notas fiscais (backend NestJS + proxies Next)
tags: [nfse, nfe, xml, zip, cobranca, proxy-next]
status: complete
requires: []
provides:
  - "GET /api/cobranca/nfse/:id/xml (XML salvo da NFS-e, 404 'XML indisponível ...')"
  - "POST /api/cobranca/notas/zip (ZIP com PDF + XML e LEIA-ME.txt, máximo 50 notas)"
  - "criarZipStore / crc32 (ZIP STORE sem dependência npm)"
  - "Proxies Next /api/cobranca/nfse/[id]/xml e /api/cobranca/notas/zip com requireAdminSession"
affects: [47-04, 47-06]
tech-stack:
  added: []
  patterns:
    - "Controller novo em arquivo separado para não tocar cobranca.controller.ts (D-03)"
    - "ZIP escrito à mão com Buffer (STORE, nomes UTF-8, CRC-32 por tabela)"
key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca-notas.service.ts
    - apps/backend/src/modules/cobranca/cobranca-notas.controller.ts
    - apps/backend/src/modules/cobranca/zip-store.util.ts
    - apps/backend/src/modules/cobranca/dto/baixar-notas-zip.dto.ts
    - apps/backend/src/modules/cobranca/cobranca-notas.service.test.ts
    - apps/backend/src/modules/cobranca/zip-store.util.test.ts
    - apps/backend/src/modules/cobranca/cobranca-notas.zip.test.ts
    - "apps/frontend/src/app/api/cobranca/nfse/[id]/xml/route.ts"
    - apps/frontend/src/app/api/cobranca/notas/zip/route.ts
  modified:
    - apps/backend/src/modules/cobranca/cobranca.module.ts
decisions:
  - "ZIP no método STORE (sem compressão): PDF/XML pequenos, e evita dependência npm nova."
  - "Nome-base único por nota (NFSe-239, NFSe-239-2) compartilhado entre PDF e XML."
  - "Cache por boleto no ZIP: várias NF-e do mesmo boleto consultam o Athos uma vez."
metrics:
  duration: "~35 min"
  completed: 2026-11-13
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: 8cba258b8140ae3d29708949b8cc6412316d7093
plan_head_after: e023fea6e21aaec256081ae5e6d1e9ece1ffa21e
---

# Fase 47 Plano 01: XML da NFS-e e ZIP em lote PDF + XML

Rota nova do XML salvo da NFS-e (xmlNacional, depois linkNfse, senão 404 "XML indisponível") e download em lote em ZIP com PDF + XML por nota e LEIA-ME.txt das pendências, ambos com proxy Next protegido por sessão de admin, sem dependência npm nova e sem alterar nenhuma regra de boleto, baixa ou aviso.

## Tarefas executadas

| Tarefa | Nome | Commit | Arquivos principais |
|--------|------|--------|---------------------|
| 1 (tracer) | XML da NFS-e de ponta a ponta (proxy -> controller -> serviço) | `c0cfe29` | cobranca-notas.service.ts, cobranca-notas.controller.ts, cobranca.module.ts, proxy `nfse/[id]/xml` |
| 2 | zip-store.util (ZIP STORE, UTF-8, CRC-32) | `4aeecf7` | zip-store.util.ts e teste |
| 3 | ZIP em lote POST notas/zip + DTO + proxy | `e023fea` | gerarZipNotas, DTO, proxy `notas/zip`, cobranca-notas.zip.test.ts |

## Evidência de TDD (RED antes de GREEN)

- Tarefa 1: ao rodar `cobranca-notas.service.test.ts` antes da implementação, a suíte falhou com `TS2307: Cannot find module './cobranca-notas.controller'` e `'./cobranca-notas.service'` (módulos inexistentes). Depois da implementação: 12 testes verdes.
- Tarefa 2: RED com `TS2307: Cannot find module './zip-store.util'`; GREEN com 7 testes (U3 e U5 executaram com `python3` 3.12.3, nenhum `skip`).
- Tarefa 3: RED com `TS2307: Cannot find module './dto/baixar-notas-zip.dto'` e `TS2339: Property 'gerarZipNotas' does not exist`; GREEN com 14 testes.

## Resultados de verificação (contagens reais)

| Comando | Resultado |
|---------|-----------|
| `npm --prefix apps/backend run test -- cobranca-notas.service` | 1 suíte, 12 testes verdes |
| `npm --prefix apps/backend run test -- zip-store` | 1 suíte, 7 testes verdes (U3 executado, não skipped) |
| `npm --prefix apps/backend run test -- cobranca-notas` | 2 suítes, 26 testes verdes |
| `npm --prefix apps/backend run test -- cobranca` (regressão D-03) | 19 suítes, 258 testes verdes (baseline medido no HEAD antes das mudanças: 16 suítes, 225 testes) |
| `npm --prefix apps/backend run test -- --no-coverage` (backend inteiro) | 69 suítes passaram, 2 skipped (pré-existentes); 986 testes passaram, 28 skipped; 0 falhas |
| `npx tsc --noEmit -p apps/backend/tsconfig.json` | exit 0 |
| `npx tsc --noEmit -p apps/frontend/tsconfig.json` | exit 0 |

Critérios de aceite por grep/git:
- `nfse/:id/xml` no controller: 1; `notas/zip` no controller: 1.
- `CobrancaNotasController` no módulo: 2 (import + controllers).
- `XML indisponível` no serviço: 4; `LIMITE_NOTAS_ZIP` no serviço: 3.
- `requireAdminSession` nos proxies: 2 (xml) e 2 (zip).
- `0xEDB88320` em zip-store.util.ts: 1; imports de archiver/jszip/adm-zip/yazl/fflate: 0.
- `git diff --quiet 003ba3b` em `apps/backend/package.json`: exit 0 (nenhuma dependência nova).
- `git diff --quiet 003ba3b` em `cobranca.service.ts`, `cobranca.controller.ts` e `email-envio.service.ts`: exit 0 (D-03, intocados).

O gate do tracer (verificação apenas automatizada, `HUMAN_VERIFY_MODE` padrão, modo não automático) foi satisfeito: os testes e os dois tsc passaram ponta a ponta antes de expandir para as tarefas 2 e 3.

## Decisões de implementação

- `baixarNfseXml` segue a ordem do D-11: `xmlNacional` (bytes UTF-8 do cache), depois `linkNfse` (somente `http:`/`https:`, `timeout` 15 s, `maxContentLength` 5 MB), senão 404. BOM e espaços iniciais são ignorados só para inspecionar o começo; os bytes entregues são os originais. PDF no link (iiBrasil), HTML ou conteúdo que não começa por `<` viram 404 "XML indisponível". 404/410 do link viram 404; qualquer outro erro vira 502 com `logger.warn` sem conteúdo nem URL.
- `sanearNomeArquivo` mantém `[A-Za-z0-9_-]`; é reaproveitada no ZIP.
- ZIP: entradas processadas uma por vez; duplicatas de ids e de NF-e contam uma vez; limite 50 conferido no DTO, no serviço e no proxy; nome do arquivo é `NFSe-<n>.zip`/`NF-e-<n>.zip` para nota única e `notas-fiscais-<hojeSaoPaulo()>.zip` para várias.
- Proxy do ZIP descarta chaves desconhecidas e valida `nfseIds` (inteiros positivos) e `nfe` (`cobrancaBoletoId` inteiro, `numero` só dígitos até 15) antes de chamar o backend.

## Desvios do plano

Nenhum desvio de regra (Rules 1 a 4). Pequenos acréscimos dentro do escopo das tarefas, todos com teste:
- Caso extra X4b (HTML em minúsculas e texto que não começa por `<`), U7 (nome com mais de 255 bytes), Z9b (duplicatas contam uma vez) além dos casos listados no plano.
- O leitor Python do U3/U5 roda com `python3 -I`, conforme a orientação de segurança do ambiente.
- Nota de ambiente: o worktree não tinha `node_modules`; foram criados symlinks para os `node_modules` do repositório principal (raiz, `apps/backend`, `apps/frontend`). Eles aparecem como não rastreados e NÃO foram commitados (o `.gitignore` usa `node_modules/`, que não casa com symlink).
- Nota de processo: os arquivos de PLAN/CONTEXT da fase 47 não estão versionados no worktree (existem só no repositório principal); este SUMMARY foi criado no diretório da fase dentro do worktree.

## Known Stubs

Nenhum stub (sem valores vazios hardcoded, TODO ou placeholders nos arquivos criados).

## Threat Flags

Nenhuma superfície nova além da já coberta pelo threat_model do plano (T-47-01 a T-47-05 mitigadas: `requireAdminSession` nos dois proxies, guard global e teste C2 de que nada é `@Public`; só http/https, timeout e 5 MB no link; nomes saneados e entradas validadas no ZIP; limite 50 e processamento sequencial; XML nunca gerado, PDF/HTML no link vira 404).

## Pendências para verificação final (fora do escopo deste plano)

- Teste manual com NFS-e real (com `xmlNacional`, com link de XML e iiBrasil só com PDF) e uma NF-e do Athos para ver o ZIP aberto em um leitor real; os testes automatizados usam colaboradores falsos e o `zipfile` do Python como leitor independente.
- As telas dos planos 47-04 e 47-06 devem espelhar `LIMITE_NOTAS_ZIP = 50` e tratar a mensagem que começa por "XML indisponível".

## Self-Check: PASSED

- Arquivos criados presentes: cobranca-notas.service.ts, cobranca-notas.controller.ts, zip-store.util.ts, baixar-notas-zip.dto.ts, três suítes de teste, dois proxies Next: todos FOUND.
- Commits `c0cfe29`, `4aeecf7`, `e023fea` presentes no histórico do worktree.
