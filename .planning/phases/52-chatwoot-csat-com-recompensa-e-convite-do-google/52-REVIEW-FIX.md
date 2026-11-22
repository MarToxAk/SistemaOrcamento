---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
fixed_at: 2026-11-22T17:30:00Z
review_path: /root/SistemaOrcamento/.planning/phases/52-chatwoot-csat-com-recompensa-e-convite-do-google/52-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 8
skipped: 1
status: partial
---

# Phase 52: Code Review Fix Report

**Fixed at:** 2026-11-22T17:30:00Z
**Source review:** /root/SistemaOrcamento/.planning/phases/52-chatwoot-csat-com-recompensa-e-convite-do-google/52-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (CR-01 e WR-01..WR-08; WR-09 e achado de necessidade e fica fora do escopo `critical_warning`)
- Fixed: 8 (CR-01 ja corrigido antes pelo plano 52-13, sem commit novo; WR-01..WR-06 e WR-08 corrigidos)
- Skipped: 1 (WR-07, requer decisao de produto/schema)
- Out of scope, nao aplicado: WR-09 (necessidade)

Commits novos desta execucao: WR-01, WR-02, WR-03, WR-04, WR-05, WR-06, WR-08 (7 commits).

**Verificacao:** executada na working tree principal (sem worktree, conforme instrucao do chamador), em `/root/SistemaOrcamento`, branch `feat/fase-52-chatwoot-csat`. Apos cada fix: `npx jest src/modules/pesquisa src/modules/integrations/chatwoot` (19 suites, 484 testes ao final, todos passando) e `npx tsc --noEmit -p apps/backend/tsconfig.json` (limpo). Para WR-04 (frontend) rodou-se tambem `npx tsc --noEmit` em `apps/frontend` (limpo) e um script ad hoc cobrindo os casos de `lerNumero` (o frontend nao tem runner de testes). Nenhum banco real foi tocado; testes usam mocks. Nenhuma migracao aplicada.

## Fixed Issues

### CR-01: Placeholders em caixa alta passam na validacao/previa mas sao renderizados vazios no envio

**Status:** ja corrigido (sem novo commit)
**Files modified:** nenhum nesta execucao
**Commit:** 07348e2 (plano 52-13, `feat(52-13): normalize placeholder key in renderizarTexto`)
**Verificacao:** `renderizarTexto` em `apps/backend/src/modules/pesquisa/pesquisa-regras.ts` ja normaliza a chave para minusculas (`chave.toLowerCase()`) antes do `hasOwnProperty`, identico ao fix sugerido. Nada refeito.

### WR-01: `MENSAGEM_OK` fora da re-tentativa do CSAT nativo

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts`, `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts`
**Commit:** ae68420
**Applied fix:** `csatPendente` passa a incluir `MENSAGEM_OK` (mantendo o limite de 14 dias por `enviadaEm`), tornando alcancavel o branch de `reconciliarCsatNativo` que repete o PUT. Teste novo: pesquisa respondida com `chatwootCsat = "MENSAGEM_OK"` vira candidata e termina em `OK`. O fixture de um teste existente ("ENVIANDO com reserva de 14 minutos nao e tocado") passou a declarar `chatwootCsat: "OK"`, pois o default `MENSAGEM_OK` agora a tornaria candidata por outro canal.
**Status:** fixed: requires human verification (logica de estado/re-tentativa)

### WR-02: Contagem do CSAT nativo ignora estados que ainda podem criar `input_csat`

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts`, `apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts`
**Commit:** 83d80e6
**Applied fix:** `ESTADOS_COM_INPUT_CSAT` agora inclui `AGUARDANDO_MENSAGEM` e `MENSAGEM_FALHA` (apenas `NAO_APLICAVEL` fica de fora), de modo que uma nova pesquisa na mesma conversa nasce `NAO_APLICAVEL` enquanto a anterior ainda pode criar a `input_csat` na re-tentativa. Teste T5b cobre os dois estados (confirmado que falha sem o fix).
**Status:** fixed: requires human verification (logica de estado)

### WR-03: Taxa de resposta pode ultrapassar 100%

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-resultados.service.ts`, `apps/backend/src/modules/pesquisa/pesquisa-resultados.service.test.ts`
**Commit:** 928e529
**Applied fix:** o numerador da taxa (geral e por variante) passa a ser a coorte "enviada E respondida no periodo" (`respondidasDasEnviadas`), com o mesmo conjunto do denominador. `totalRespostas`, nota media e distribuicao continuam ancorados em `respondidaEm`. Teste de virada de mes: 5 respostas de envios do mes anterior + 1 envio no mes atual nao respondido resulta em `{ respondidas: 0, enviadas: 1, percentual: 0 }` e `totalRespostas = 5`. A tela ja exibe "X de Y pesquisas enviadas", coerente com a coorte.
**Status:** fixed: requires human verification (muda a semantica do indicador; o campo `taxaResposta.respondidas` agora pode ser menor que `totalRespostas`)

### WR-04: `lerNumero` converte "1.000" em 1

**Files modified:** `apps/frontend/src/lib/pesquisa-admin.ts`
**Commit:** b0405aa
**Applied fix:** sem virgula, ponto seguido de exatamente 3 digitos (grupos de milhar, sem zero a esquerda) e lido como milhar ("1.000" = 1000); com virgula, pontos de milhar sao removidos so se estiverem no formato valido ("1.000,50" = 1000,5; "1,000.50" = NaN). Decimais com ponto continuam ("1.5", "0.125", ".5"). Verificado com script ad hoc (frontend sem runner de testes, entao nao ha teste automatizado novo).
**Status:** fixed: requires human verification

### WR-05: `obter()` com `findUnique` + `create` nao atomico

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-config.service.ts`, `apps/backend/src/modules/pesquisa/pesquisa-config.service.test.ts`
**Commit:** e3a97e5
**Applied fix:** novo `criarPadrao()` captura `P2002` no `create` e relê a linha criada pelo vencedor; outros erros continuam propagando. Testes: corrida simulada com `Promise.all` e erro nao-P2002 propagado.
**Status:** fixed

### WR-06: Limites de dinheiro nao respeitam `Decimal(12,2)`

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-regras.ts`, `apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts`, `apps/backend/src/modules/pesquisa/dto/atualizar-pesquisa-config.dto.ts`
**Commit:** 1524210
**Applied fix:** nova constante `VALOR_MAXIMO_DINHEIRO = 9_999_999_999.99`; `validarConfig` limita `tetoDesconto`, `compraMinima` e `tetoMensal` a ela com mensagem por campo ("Maximo de R$ 9.999.999.999,99."), e o DTO ganhou `@Max`. Teste cobre o valor exato do limite (valido) e valores acima (erro por campo).
**Status:** fixed

### WR-08: `sendOutgoingMessage` sem timeout

**Files modified:** `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts`, `apps/backend/src/modules/integrations/chatwoot/chatwoot-csat.service.test.ts`
**Commit:** 91994ba
**Applied fix:** `axios.post` agora usa `{ headers: { api_access_token: token }, timeout: 10000 }`, igual aos demais metodos. Teste novo valida payload, header e timeout.
**Status:** fixed

## Skipped Issues

### WR-07: Promessa de recompensa no fechamento pode divergir do cupom emitido

**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts:250-264` e `:519-530`
**Reason:** skipped - requer decisao de produto e, em uma das opcoes, mudanca de schema/migracao. Nada foi alterado.
**Original issue:** o texto com recompensa e escolhido no fechamento (`avaliarRecompensa`), mas na resposta `emitirCupom` recalcula a elegibilidade com a config vigente. Se o teto mensal for atingido ou a config mudar durante os ate 14 dias de validade do link, o cliente e prometido "ganhe 10%" e recebe nenhum cupom ou um cupom com valores diferentes.
**Opcoes para decidir:**
1. Snapshot da promessa: gravar na pesquisa (nova coluna, ex.: `recompensaPrometida`/valores) a elegibilidade e os parametros no fechamento e honrar isso na emissao (ainda sujeito ao teto mensal, ou reservando verba). Exige migracao Prisma.
2. Mensagem mais conservadora: textos de fechamento que nao prometem valor/percentual especifico, ou usar `textoSemRecompensa` quando a garantia nao puder ser honrada. Sem schema, mas muda o apelo da mensagem.
3. Aceitar e documentar: manter o comportamento atual (o cupom segue a config vigente na resposta) e comunicar a regra ao operador na tela de configuracao; em caso de teto esgotado, a pagina de obrigado ja cai em "sem recompensa".

### WR-09: Guarda de estado impossivel em `reenviarPendentes` (necessidade)

**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts:970`
**Reason:** skipped - achado com `**Category:** necessity` (remover codigo, nao corrigir defeito). O escopo `critical_warning` exclui achados de necessidade mesmo com prefixo WR; remover codigo e decisao do humano (#4100). Nenhuma edicao aplicada. Pode ser tratado com `fix_scope: all`.
**Original issue:** a guarda `if (pesquisa.conversationId === null || !pesquisa.telefone) continue;` protege um estado que a janela de re-tentativa (3 dias) e o piso de anonimizacao (>= 30 dias) tornam impossivel para as linhas selecionadas.

---

_Fixed: 2026-11-22T17:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
