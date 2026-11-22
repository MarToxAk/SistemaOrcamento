---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
fixed_at: 2026-11-22T17:55:00Z
review_path: /root/SistemaOrcamento/.planning/phases/52-chatwoot-csat-com-recompensa-e-convite-do-google/52-REVIEW.md
iteration: 1
findings_in_scope: 18
fixed: 17
skipped: 1
status: partial
---

# Phase 52: Code Review Fix Report

**Fixed at:** 2026-11-22T17:55:00Z
**Source review:** /root/SistemaOrcamento/.planning/phases/52-chatwoot-csat-com-recompensa-e-convite-do-google/52-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 18 (CR-01, WR-01..WR-09 e IN-01..IN-08; escopo `all`, incluindo o achado de necessidade WR-09)
- Fixed: 17
- Skipped: 1 (WR-07, requer decisao de produto e/ou mudanca de schema)
- Corrigidos nesta execucao: 16 findings via commits `ae68420`..`da712b2` e IN-07 em `6186bd4`
- CR-01 ja havia sido corrigido pelo plano 52-13 (`07348e2`) e foi reverificado no codigo atual
- Inclui tambem dois achados da revisao incremental do gap (`bf9e4f0`, `30a6ba2`; ver `52-REVIEW-gap13.md`), fora dos 18 originais

**Verificacao desta execucao:** executada em uma worktree isolada (`workflow.use_worktrees: true`), branch `gsd-reviewfix/52-581736`, a partir de `30a6ba2`. Como a worktree nao tem `node_modules`, as ferramentas rodaram a partir de `/root/SistemaOrcamento/node_modules` e o Node resolveu as dependencias subindo ate o `node_modules` do checkout principal — portanto um run feito a partir da worktree, nao reproduzivel depois que ela e removida. Resultados:
- `jest src/modules/pesquisa src/modules/integrations/chatwoot --no-coverage`: 19 suites, 490 testes, todos passando (inclui o teste novo de IN-07).
- `tsc --noEmit -p apps/backend/tsconfig.json`: limpo.
- `tsc --noEmit -p apps/frontend/tsconfig.json`: limpo.
Nenhum banco real foi tocado; os testes usam mocks. Nenhuma migracao aplicada.

**Observacao sobre a arvore principal:** o checkout principal ja tinha, antes desta execucao, alteracoes nao commitadas em `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts` e `pesquisa-render-paridade.test.ts` (trabalho parcial de G13-IN-02, da revisao incremental `52-REVIEW-gap13.md`). Elas nao fazem parte da `52-REVIEW.md` e foram preservadas, nao commitadas nem descartadas.

## Fixed Issues

### CR-01: Placeholders em caixa alta passam na validacao/previa mas sao renderizados vazios no envio

**Status:** ja corrigido antes desta revisao (sem novo commit)
**Files modified:** nenhum nesta execucao
**Commit:** `07348e2` (plano 52-13, `feat(52-13): normalize placeholder key in renderizarTexto`)
**Applied fix / verificacao:** confirmado no codigo atual — `renderizarTexto` (`pesquisa-regras.ts`) normaliza a chave com `toLowerCase()` antes do `hasOwnProperty`; `validarTextoMensagem` e `renderizarPrevia` ja comparavam em minusculas. Os testes de regressao de 52-13 estao presentes e passam.

### WR-01: `MENSAGEM_OK` fora da re-tentativa do CSAT nativo

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts`, `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts`
**Commit:** `ae68420`
**Applied fix:** `csatPendente` inclui `MENSAGEM_OK` (respeitando o limite de 14 dias), tornando alcancavel o branch de `reconciliarCsatNativo` que repete o PUT; teste de regressao presente.
**Status:** fixed: requires human verification (logica de estado/re-tentativa)

### WR-02: Contagem do CSAT nativo ignora estados que ainda podem criar `input_csat`

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts`, `apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts`
**Commit:** `83d80e6`
**Applied fix:** `ESTADOS_COM_INPUT_CSAT` passou a incluir `AGUARDANDO_MENSAGEM` e `MENSAGEM_FALHA` (so `NAO_APLICAVEL` fica de fora), evitando segunda `input_csat` na mesma conversa.
**Status:** fixed: requires human verification (logica de estado)

### WR-03: Taxa de resposta pode ultrapassar 100%

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-resultados.service.ts`, `apps/backend/src/modules/pesquisa/pesquisa-resultados.service.test.ts`
**Commit:** `928e529`
**Applied fix:** numerador e denominador usam a mesma coorte ("enviada E respondida no periodo"), com teste de virada de mes. `totalRespostas`, nota media e distribuicao seguem ancorados em `respondidaEm`.
**Status:** fixed: requires human verification (muda a semantica do indicador)

### WR-04: `lerNumero` converte "1.000" em 1

**Files modified:** `apps/frontend/src/lib/pesquisa-admin.ts`
**Commit:** `b0405aa`
**Applied fix:** ponto seguido de exatamente 3 digitos (sem virgula) e lido como separador de milhar ("1.000" = 1000); "1.000,50" = 1000,5. Decimais com ponto continuam validos. Verificado por script ad hoc (o frontend nao tem runner de testes).
**Status:** fixed: requires human verification

### WR-05: `PesquisaConfigService.obter()` faz `findUnique` + `create` nao atomico

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-config.service.ts`, `apps/backend/src/modules/pesquisa/pesquisa-config.service.test.ts`
**Commit:** `e3a97e5`
**Applied fix:** `criarPadrao()` captura `P2002` e rele a linha criada pelo vencedor; outros erros propagam. Teste de corrida com `Promise.all`.
**Status:** fixed

### WR-06: Limites de dinheiro nao respeitam o `Decimal(12,2)` (500 em vez de 400)

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-regras.ts`, `apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts`, `apps/backend/src/modules/pesquisa/dto/atualizar-pesquisa-config.dto.ts`
**Commit:** `1524210`
**Applied fix:** constante `VALOR_MAXIMO_DINHEIRO = 9_999_999_999.99` aplicada em `validarConfig` (mensagem por campo) e `@Max` no DTO para `tetoDesconto`, `compraMinima` e `tetoMensal`.
**Status:** fixed

### WR-08: `sendOutgoingMessage` sem timeout

**Files modified:** `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts`, `apps/backend/src/modules/integrations/chatwoot/chatwoot-csat.service.test.ts`
**Commit:** `91994ba`
**Applied fix:** `axios.post` recebe `{ headers, timeout: 10000 }`, igual aos demais metodos; teste valida payload, header e timeout.
**Status:** fixed

### WR-09: Guarda de estado impossivel em `reenviarPendentes` (necessidade)

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts`
**Commit:** `43fb0df`
**Applied fix:** guarda `conversationId === null || !telefone` removida; o invariante (janela de 3 dias x piso de anonimizacao de 1 mes) ficou documentado no ponto de uso, e os envios seguem se protegendo com `IGNORADO`.
**Status:** fixed: requires human verification (remocao de codigo; achado de necessidade)

### IN-01: Branch `P2002` por `pesquisaId` devolve cupom sem checar status

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts`
**Commit:** `e646321`
**Applied fix:** o branch de `P2002` por `pesquisaId` so devolve o cupom quando `status === "EMITIDO"`, espelhando o caminho `existente`.
**Status:** fixed

### IN-02: `enviarPutCsat` envia `rating: 0` quando `nota` e nula

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts`
**Commit:** `ea7793d`
**Applied fix:** retorna `"IGNORADO"` quando `nota` e nula, e nao envia `rating` fora de 1..5.
**Status:** fixed

### IN-03: Corrida resgate x revogacao devolve 409 `JA_USADO` para cupom cancelado

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-cupom.service.ts`
**Commit:** `8a8964c`
**Applied fix:** quando o `updateMany` condicional afeta 0 linhas, a linha e relida e `status = CANCELADO` vira 422 `CANCELADO`; os demais casos seguem 409 `JA_USADO`.
**Status:** fixed

### IN-04: Constantes de etiquetas duplicadas

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-efeitos.ts`, `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts`
**Commit:** `8c75d78`
**Applied fix:** fonte unica (`ETIQUETA_AVALIOU`/`ETIQUETA_CSAT_BAIXO` exportadas por `chatwoot-etiquetas` e importadas por `pesquisa-efeitos`).
**Status:** fixed

### IN-05: Comentario livre do cliente na nota privada sem sanitizacao

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-efeitos.ts`
**Commit:** `f75456f`
**Applied fix:** `sanitizarComentarioParaNota()` neutraliza caracteres de controle e quebras de linha antes de montar a nota privada; coberto por teste.
**Status:** fixed

### IN-06: `montarConfigPadrao` aceita envs fora dos limites de `validarConfig`

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-regras.ts`
**Commit:** `085a32f`
**Applied fix:** `numeroEnv` recebe as faixas de `validarConfig` e devolve o padrao quando a env esta fora delas.
**Status:** fixed

### IN-07: `tentativasEnvio` compartilhado entre cupom e convite

**Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts`, `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts`
**Commit:** `6186bd4`
**Applied fix:** o incremento de `tentativasEnvio` distingue falhas do cupom/CSAT das do convite. Enquanto houver cupom em aberto (`PENDENTE`, `FALHA` ou `ENVIANDO`), uma falha do convite nao consome o orcamento compartilhado; assim um convite que falha sempre nao esgota o limite de 6 e nao interrompe a re-tentativa do cupom (inclusive a confirmacao de uma reserva `ENVIANDO`). O contador de `resultado.falhas` continua refletindo qualquer falha. Teste de regressao cobre os dois lados (com e sem cupom em aberto).
**Status:** fixed: requires human verification (politica do orcamento de re-tentativa)

### IN-08: Logica de carga inicial duplicada no `config-form`

**Files modified:** `apps/frontend/src/app/configuracoes/pesquisa/config-form.tsx`
**Commit:** `da712b2`
**Applied fix:** `buscarConfig()` unico, usado pelo `useEffect` e pelo botao "Tentar novamente", com divergencias eliminadas.
**Status:** fixed

## Skipped Issues

### WR-07: Promessa de recompensa no fechamento pode divergir do cupom efetivamente emitido

**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts` (texto escolhido no fechamento) e `emitirCupom` (elegibilidade recalculada na resposta)
**Reason:** skipped — a correcao exige decisao de produto e, na opcao mais fiel, mudanca de schema/migracao (snapshot da promessa na linha da pesquisa). Nada foi alterado nesta execucao. As opcoes ja registradas na iteracao anterior continuam validas:
1. Snapshot da promessa (nova coluna Prisma) e honrar a elegibilidade gravada na emissao — exige migracao.
2. Texto de fechamento sem valor/percentual especifico (ou `textoSemRecompensa` quando a garantia nao puder ser honrada) — sem schema, mas muda o apelo da mensagem.
3. Aceitar e documentar a regra atual (cupom segue a config vigente na resposta; a pagina de obrigado ja cai em "sem recompensa" quando o teto esgotou).

**Original issue:** o texto com recompensa e escolhido por `avaliarRecompensa` no fechamento, mas `emitirCupom` refaz a checagem com a config vigente. Se o teto mensal for atingido ou a config mudar durante os ate 14 dias de validade do link, o cliente e prometido "ganhe 10%" e recebe nenhum cupom ou um cupom com valores diferentes.

---

_Fixed: 2026-11-22T17:55:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
