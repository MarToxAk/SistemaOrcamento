---
phase: 47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g
plan: 03
subsystem: backend/cobranca + frontend/api-proxy
tags: [nestjs, athos, efi, somente-leitura, notas-fiscais, boletos]
requires: [47-01]
provides:
  - "GET /api/cobranca/notas (NFS-e + NF-e dos boletos, filtros de cliente e periodo)"
  - "AthosService.buscarNfeResumoPorTitulos (SELECT somente leitura, sem XML)"
  - "GET /api/cobranca/boleto/:id/detalhe (linha digitavel e PIX da EFI + titulos, cache de 60 s)"
  - "extrairDadosPagamentoEfi e chavesBoletoEfi (parse defensivo da EFI)"
  - "proxies Next /api/cobranca/notas e /api/cobranca/boleto/[id]/detalhe"
affects: [47-05, 47-06]
tech-stack:
  added: []
  patterns: ["leitura defensiva com aviso em vez de 500", "cache em memoria por processo com TTL", "meia-noite de Sao Paulo = T03:00:00Z"]
key-files:
  created:
    - apps/backend/src/modules/cobranca/dto/listar-notas.query.dto.ts
    - apps/backend/src/modules/cobranca/cobranca-efi-detalhe.util.ts
    - apps/backend/src/modules/cobranca/cobranca-notas.lista.test.ts
    - apps/backend/src/modules/cobranca/cobranca.service.boleto-detalhe.test.ts
    - apps/backend/src/modules/integrations/athos/athos.service.nfe-resumo.test.ts
    - apps/frontend/src/app/api/cobranca/notas/route.ts
    - "apps/frontend/src/app/api/cobranca/boleto/[id]/detalhe/route.ts"
  modified:
    - apps/backend/src/modules/cobranca/cobranca-notas.service.ts
    - apps/backend/src/modules/cobranca/cobranca-notas.controller.ts
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - apps/backend/src/modules/integrations/athos/athos.service.ts
decisions:
  - "O SELECT do Athos usa nota.totalvalornota (a coluna nota.valornota NAO existe) e to_char(dataemissao) para a data; descoberto na validacao no clone."
  - "O cache de 60 s guarda so linha digitavel e PIX (nao o DetalheBoleto inteiro): status e titulos vem sempre do banco."
  - "Falha de qualquer parte das NF-e (Athos ou banco de boletos) vira avisoNfe; as NFS-e continuam na resposta."
metrics:
  tasks: 3
  files: 12
  duration: "aprox. 40 min"
status: complete
commits: 3
plan_head_before: 319834d3dde84de15d50a453c1878ccf7459f222
plan_head_after: 647912a2a8b341c7e26880bdf02e591ff24cfaab
actuals:
  tokens: 15500
  tasks: 3
  commits: 3
---

# Fase 47 Plano 03: Leituras de notas e detalhe do boleto Summary

Tres leituras somente leitura para as telas: lista geral de NFS-e e NF-e dos boletos com a situacao do XML, consulta de resumo das NF-e no Athos (validada no clone, compativel com PostgreSQL 9.0.5) e detalhe do boleto com linha digitavel e PIX lidos na EFI, com cache de 60 s.

## O que foi feito

**Tarefa 1 (tracer), commit 68b107c.** `CobrancaNotasService.listarNotas`: ate 500 NFS-e (`take: 501` para detectar `truncado`), mais recentes primeiro, `select` sem `xmlNacional`; a situacao do XML (`salvo`/`link`/`indisponivel`) vem de uma segunda consulta so por ids com `select: { id: true }`. Filtros `idclienteAthos`, `de` e `ate` (AAAA-MM-DD convertido para meia-noite de Sao Paulo, `lt` no dia seguinte a `ate`; data inexistente como 2026-13-45 vira 400). `ListarNotasQueryDto` valida a query com as opcoes do `main.ts` (parametro desconhecido da 400). Handler `listar` em `GET cobranca/notas` e proxy Next com `requireAdminSession`, lista branca de parametros e 502 em falha de rede.

**Tarefa 2, commit 48a3b87.** `AthosService.buscarNfeResumoPorTitulos` (apos `buscarNotasFiscaisXmlPorTitulos`): ids saneados para inteiros positivos sem repeticao, `ANY($1)` parametrizado, mesmos filtros do download (XML e chave de acesso presentes, nao cancelada) e sem `n.xml` no SELECT; em erro lanca `ServiceUnavailableException`. `listarNotas` agora busca os boletos nao cancelados, agrupa por boleto e numero da nota, aplica o periodo sobre a data de emissao (nulas saem quando ha filtro), ordena por data desc (nulas no fim) e faz UMA unica consulta de nomes para NFS-e e boletos. Athos fora do ar: `nfe: []` e `avisoNfe` "Não foi possível consultar as NF-e no Athos agora.".

**Tarefa 3, commit 647912a.** `buscarDetalheBoleto` (logo depois de `verificarPagamentoBoleto`, que nao foi tocado: o diff do `cobranca.service.ts` so tem linhas adicionadas): 404 se nao existe; sem `txidEfi` -> `sem_charge`; com `txidEfi`, authorize + `GET /v1/charge/<id>` (timeout 15 s) e parse pelo util; sem linha digitavel -> aviso proprio e log so com os nomes das chaves de `banking_billet`; qualquer erro (inclusive variavel de ambiente ausente) -> `falha` com aviso, 200. Nenhum `update`, nenhuma chamada de baixa. Rota `GET boleto/:id/detalhe` (sem `AdminAuthGuard` e sem `@Public`, igual a `baixa-athos`) e proxy Next com `requireAdminSession` e `id` validado por `^\d+$`.

## Validacao do SELECT no clone athos-teste (READ ONLY)

Executada com `BEGIN READ ONLY` (e `transaction_read_only = on` confirmado) em `127.0.0.1:5440`, db `athos` (PostgreSQL 14.24, clone). O Athos de producao NAO foi acessado. O SQL foi extraido do proprio `athos.service.ts`, nao copiado a mao.

- Ids de `contareceber` usados: 20 (os mais recentes ligados a NF-e com XML, chave e nao canceladas).
- Resultado: **20 linhas**, sem erro.
- Colunas devolvidas: `idcontareceber, numero, dataemissao, valornota`.
- Tipos: `idcontareceber` numero, `numero` string, `dataemissao` string AAAA-MM-DD (via `to_char`), `valornota` string numerica (convertida por `Number`).
- Id inexistente (`-1`): 0 linhas, sem erro.
- Achado importante: **`nota.valornota` nao existe**; o valor da nota esta em `nota.totalvalornota` (a `dataemissao` e do tipo `date`). A primeira versao do SQL (copiada do plano e de `buscarNotasFiscaisCliente`) falhou com `column n.valornota does not exist`; corrigida para `n.totalvalornota AS valornota` e `to_char(n.dataemissao, 'YYYY-MM-DD') AS dataemissao`. Compatibilidade com 9.0.5: so `SELECT DISTINCT`, `JOIN`, `ANY($1)`, `COALESCE` e `to_char`, todos existentes bem antes da 9.0. Nenhuma funcao de PG 10+ (`pg_sequence_last_value`: 0 ocorrencias).

## Verificacao (resultados reais)

- `cobranca-notas.lista`: 21 testes passando (L1..L9 + variantes, C3 e validacao do pipe).
- `athos.service.nfe-resumo`: 5 testes passando (A1..A4 + A4b).
- `cobranca.service.boleto-detalhe`: 19 testes passando (E1..E5, S1..S7 com variantes incluindo o cache de 60 s com fake timers, C4).
- Regressao `-- cobranca`: **21 suites, 298 testes**, todos passando.
- Suite completa do backend: **72 suites passando (2 puladas), 1031 testes passando (28 pulados), 0 falhas**.
- `integrations/athos`: verde (27 suites passando no run combinado, 1 pulada, 10 testes pulados).
- `npx tsc --noEmit` backend e frontend: exit 0.
- Gates: `LIMITE_LISTA_NFSE` presente; `requireAdminSession` nos dois proxies; `boleto/:id/detalhe` no controller = 1; `buscarNfeResumoPorTitulos` presente no `athos.service.ts` e no `cobranca-notas.service.ts`; `pg_sequence_last_value` = 0.
- Nenhum teste fala com EFI, Athos ou banco reais (axios, pg e Prisma mockados).

## Desvios do plano

1. **[Rule 1 - Bug] Coluna inexistente no SELECT novo.** O plano mandava reproduzir o mapeamento de `buscarNotasFiscaisCliente` com `n.valornota`; a validacao no clone mostrou que a coluna e `n.totalvalornota`. Corrigido e coberto no teste A1 (`n.totalvalornota AS valornota`). Commit 48a3b87.
2. **[Rule 2 - Robustez] Data via `to_char`.** `dataemissao` e `date`; o driver `pg` o converte em `Date` local e `toISOString().slice(0,10)` poderia deslocar o dia conforme o fuso do servidor. O SQL devolve texto AAAA-MM-DD (o mapeador ainda aceita `Date`). Commit 48a3b87.
3. **Cache do item 5b guarda so os dados da EFI**, nao o `DetalheBoleto` inteiro como o plano descrevia (`Map<number, {expira; valor: DetalheBoleto}>`): assim `status` e `titulos` nunca ficam defasados por ate 60 s (ex.: boleto que acabou de ser pago). Chave inclui o `txidEfi`, e entradas vencidas sao podadas a cada escrita. S7 e as variantes cobrem: 1 chamada em 2 leituras, nova consulta apos 60 s, `falha`/`sem_charge`/sem linha nao cacheados.
4. **Falha do banco de boletos tambem vira `avisoNfe`** (todo o bloco de NF-e esta num try/catch), alem da falha do Athos; as NFS-e sempre voltam.
5. **Testes do detalhe instanciam `new CobrancaService(...)`** em vez de `Object.create`, para o inicializador do cache rodar.

## Problemas conhecidos e itens adiados

- **Bug pre-existente (fora do escopo, nao corrigido; ver `deferred-items.md`):** `AthosService.buscarNotasFiscaisCliente` usa `n.valornota`, que nao existe; na consulta real ela falha e o `catch` devolve `[]`. Verificado no clone. A rota/aba que depende dela nunca lista NF-e. Corrigir e trocar por `n.totalvalornota` (decisao do usuario, pois altera comportamento fora do D-03).
- **Premissa nao verificada:** o caminho `payment.banking_billet.barcode` / `pix.qrcode` na resposta da EFI continua sendo suposicao da documentacao (D-13). Verificacao humana pos-fase: abrir o detalhe de um boleto real e conferir a linha digitavel com o PDF; se vier nula com `consultaEfi: "ok"`, as chaves registradas no log mostram o caminho real.
- O cache de 60 s e por processo (cada instancia do backend tem o seu).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum alem do registrado no `<threat_model>` do plano (T-47-09 a T-47-14 mitigados: proxies com `requireAdminSession`, logs sem linha digitavel/PIX, rota sem escrita, SELECT parametrizado, timeout de 15 s, DTO com `forbidNonWhitelisted`).

## Self-Check: PASSED

- Arquivos criados e modificados presentes (12 arquivos do `git diff --name-only`).
- Commits 68b107c, 48a3b87 e 647912a presentes no historico da branch.
