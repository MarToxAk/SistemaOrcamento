---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
reviewed: 2026-11-22T16:35:00Z
depth: standard
files_reviewed: 53
files_reviewed_list:
  - apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.test.ts
  - apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts
  - apps/backend/src/modules/integrations/chatwoot/chatwoot-csat.service.test.ts
  - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.test.ts
  - apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts
  - apps/backend/src/modules/integrations/chatwoot/chatwoot-fechamento-agendado.test.ts
  - apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts
  - apps/backend/src/modules/pesquisa/dto/atualizar-pesquisa-config.dto.ts
  - apps/backend/src/modules/pesquisa/dto/listar-cupons.query.dto.ts
  - apps/backend/src/modules/pesquisa/dto/resgatar-cupom.dto.ts
  - apps/backend/src/modules/pesquisa/pesquisa-admin.controller.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-admin.controller.ts
  - apps/backend/src/modules/pesquisa/pesquisa-config.service.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-config.service.ts
  - apps/backend/src/modules/pesquisa/pesquisa-cupom.service.ts
  - apps/backend/src/modules/pesquisa/pesquisa-cupom.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-efeitos.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-efeitos.ts
  - apps/backend/src/modules/pesquisa/pesquisa-jobs.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-regras.ts
  - apps/backend/src/modules/pesquisa/pesquisa-resultados.service.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-resultados.service.ts
  - apps/backend/src/modules/pesquisa/pesquisa-retencao.job.ts
  - apps/backend/src/modules/pesquisa/pesquisa-retry.job.ts
  - apps/backend/src/modules/pesquisa/pesquisa-revogacao.service.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-revogacao.service.ts
  - apps/backend/src/modules/pesquisa/pesquisa-trava.ts
  - apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.ts
  - apps/backend/src/modules/pesquisa/pesquisa-webhook.ts
  - apps/backend/src/modules/pesquisa/pesquisa.module.ts
  - apps/backend/src/modules/pesquisa/pesquisa.service.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa.service.ts
  - apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts
  - apps/frontend/src/app/api/admin/pesquisa-config/route.ts
  - "apps/frontend/src/app/api/admin/pesquisa-cupons/[codigo]/resgate/route.ts"
  - "apps/frontend/src/app/api/admin/pesquisa-cupons/[codigo]/route.ts"
  - apps/frontend/src/app/api/admin/pesquisa-cupons/route.ts
  - apps/frontend/src/app/api/admin/pesquisa-resultados/route.ts
  - "apps/frontend/src/app/api/admin/pesquisa-revogar/[id]/route.ts"
  - apps/frontend/src/app/configuracoes/pesquisa/config-form.tsx
  - apps/frontend/src/app/configuracoes/pesquisa/page.tsx
  - apps/frontend/src/app/configuracoes/pesquisa/resultados-panel.tsx
  - apps/frontend/src/app/contas-receber/_shared/recursos-bootstrap.tsx
  - apps/frontend/src/app/contas-receber/admin-shell.tsx
  - apps/frontend/src/app/cupons/cupons-manager.tsx
  - apps/frontend/src/app/cupons/page.tsx
  - apps/frontend/src/lib/pesquisa-admin.ts
  - deploy/docker-compose.box.vps.yml
  - deploy/docker-compose.vps.yml
  - deploy/stack.env.example
findings:
  critical: 1
  warning: 9
  info: 8
  total: 18
  necessity: 1
status: issues_found
---

# Phase 52: Code Review Report

**Reviewed:** 2026-11-22T16:35:00Z
**Depth:** standard
**Files Reviewed:** 53
**Status:** issues_found

## Summary

Revisão adversarial do módulo de pesquisa de satisfação (CSAT) com recompensa e convite do Google, incluindo os arquivos novos de `pesquisa/`, as mudanças no `chatwoot/` (gancho de fechamento, etiquetas de pesquisa, métodos de CSAT/inbox/mensagens), os proxies e telas admin do frontend e os arquivos de deploy.

Validações executadas: as 16 suítes dos arquivos em escopo passam (441 testes) e `tsc --noEmit` passa no backend e no frontend. Isso **não** elimina os achados abaixo: os testes atuais não cobrem placeholders em caixa alta, taxa de resposta entre meses, parsing de "1.000" em campos monetários, concorrência na primeira leitura da config, nem a re-tentativa de `MENSAGEM_OK`.

Pontos fortes confirmados: verificação HMAC sobre o corpo bruto com janela de timestamp e comparação em tempo constante; rotas admin com `AdminAuthGuard` e proxies que injetam as chaves só no servidor; rate limit próprio com IP encaminhado só confiável sob chave interna válida; token de 192 bits e código de cupom com `crypto`; locks advisory para resgate, retenção e re-tentativa; `updateMany` condicional garantindo uso único; mascaramento de telefone, anonimização e ausência de token/conversationId nas respostas. Também li o controller público e a página pública (fora da lista de escopo) para validar a cadeia de auth/rate-limit; não encontrei falha crítica ali.

A principal preocupação é o CR-01: um texto salvo com placeholder em caixa alta passa na validação e aparece correto na prévia, mas em produção é renderizado vazio — a mensagem de fechamento pode sair sem o link da pesquisa e a mensagem de cupom sem o código.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: Placeholders em caixa alta passam na validação/prévia mas são renderizados vazios no envio

**Severity:** BLOCKER
**File:** `apps/backend/src/modules/pesquisa/pesquisa-regras.ts:46-50`
**Related:** `apps/backend/src/modules/pesquisa/pesquisa-regras.ts:352-357`, `apps/frontend/src/lib/pesquisa-admin.ts:106-112`
**Issue:** `renderizarTexto` procura a variável com a chave na **caixa original**: `Object.prototype.hasOwnProperty.call(variaveis, chave)`. Já `validarTextoMensagem` compara a chave em minúsculas (`casamento[1].toLowerCase()`) e a prévia do admin (`renderizarPrevia`) também busca em minúsculas. Resultado: `{LINK}`, `{Link}`, `{CODIGO}` etc. são aceitos pela validação e renderizam corretamente na prévia, mas no envio real viram string vazia. Conseguinte: `textoFechamento`/`textoSemRecompensa` sem `{link}` (mensagem sem link da pesquisa), `textoPosResposta` sem `{codigo}` (cliente não vê o cupom) e `textoConviteGoogle` sem `{link_google}`. A prévia esconde o erro do admin.
**Repro:** salvar `textoFechamento = "Responda: {LINK}"`. `renderizarTexto("Responda: {LINK}", { link: "https://..." })` devolve `"Responda: "`.
**Fix:**
```ts
export function renderizarTexto(modelo: string, variaveis: Record<string, string>): string {
  return modelo.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (_trecho, chave: string) => {
    const k = chave.toLowerCase();
    return Object.prototype.hasOwnProperty.call(variaveis, k) ? variaveis[k] : "";
  });
}
```
Alternativa: rejeitar placeholders fora de minúsculas em `validarTextoMensagem`. Adicionar teste de regressão provando que prévia e render de produção coincidem para `{LINK}`.

### Warnings

#### WR-01: `MENSAGEM_OK` fica fora da re-tentativa do CSAT nativo e deixa o branch de `reconciliarCsatNativo` morto

**Severity:** WARNING
**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts:1037-1042` (e `:1056`)
**Issue:** `csatPendente` só considera `AGUARDANDO_MENSAGEM`, `MENSAGEM_FALHA` e `RESPOSTA_FALHA`. Porém `reconciliarCsatNativo` tem um branch explícito para `MENSAGEM_OK` (`:1056`), que nunca é alcançado porque nenhuma linha `MENSAGEM_OK` entra na re-tentativa. Cenários em que o estado fica `MENSAGEM_OK` sem a nota ter chegado ao Chatwoot: falha de gravação de `RESPOSTA_FALHA` após um PUT que falhou, falha de `gravarCsat("OK")`, ou resposta do cliente na janela entre o envio da mensagem e o término de `aoFechamentoEnviado`. Nesses casos a nota nunca é enviada ao CSAT nativo (a nota local e o painel não são afetados).
**Fix:** incluir `MENSAGEM_OK` em `csatPendente` (respeitando o limite de 14 dias) ou remover o branch morto, se a intenção for não reenviar. Teste: pesquisa respondida com `chatwootCsat = "MENSAGEM_OK"` e PUT falhando deve virar candidata.

#### WR-02: Contagem do CSAT nativo ignora estados que ainda podem criar `input_csat` (risco de segunda `input_csat`)

**Severity:** WARNING
**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts:88` e `:308-312`
**Issue:** `ESTADOS_COM_INPUT_CSAT` exclui `AGUARDANDO_MENSAGEM` e `MENSAGEM_FALHA`, mas ambos ainda podem gerar `input_csat` na re-tentativa (`reconciliarCsatNativo`). Cenário alcançável: pesquisa anterior respondida com `MENSAGEM_FALHA`; antes de a re-tentativa rodar, uma nova conversa é fechada e cria nova pesquisa com `AGUARDANDO_MENSAGEM`; as duas acabam criando `input_csat` na mesma conversa. O PUT público do Chatwoot grava na **primeira** `input_csat`, então a nota da pesquisa nova pode ser aplicada no lugar errado (viola D-28).
**Fix:** contar qualquer pesquisa da conversa que possa possuir/gerar `input_csat` (tudo exceto `NAO_APLICAVEL`) ou consultar as mensagens da conversa com `incluirInternas: true` antes de criar; no mínimo incluir `AGUARDANDO_MENSAGEM`/`MENSAGEM_FALHA` na contagem.

#### WR-03: Taxa de resposta pode ultrapassar 100% (numerador e denominador com âncoras de data diferentes)

**Severity:** WARNING
**File:** `apps/backend/src/modules/pesquisa/pesquisa-resultados.service.ts:119-124`, `:140-142`, `:182-186`
**Issue:** `respondidas` filtra por `respondidaEm` dentro do período; `enviadas` filtra por `enviadaEm` dentro do período. Uma pesquisa enviada no fim do mês anterior e respondida neste mês entra no numerador sem entrar no denominador — a taxa pode passar de 100% (ex.: 5 respostas de envios do mês passado e 1 envio no mês atual dão 500%). O painel exibe o percentual sem cap, ao contrário de `gastoMes.percentual`, que é limitado a 100.
**Fix:** usar o mesmo conjunto (ex.: contar como respondida apenas se `enviadaEm` também caiu no período) ou limitar a 100% e rotular a semântica. Teste de virada de mês.

#### WR-04: `lerNumero` converte "1.000" em 1 — erro silencioso em campos monetários

**Severity:** WARNING
**File:** `apps/frontend/src/lib/pesquisa-admin.ts:11-15`
**Usos:** `apps/frontend/src/app/configuracoes/pesquisa/config-form.tsx:81-87`, `apps/frontend/src/app/cupons/cupons-manager.tsx:269-272`
**Issue:** `lerNumero("1.000")` devolve `1` (o regex aceita um ponto e `Number("1.000") === 1`). Em "Teto de desconto por cupom", "Teto mensal", "Compra mínima" e no "Valor da compra" do resgate, um operador digitando o separador de milhar brasileiro (`1.000` = R$ 1.000) salva/resgata R$ 1,00 sem aviso. "1.000,00" vira erro, mas "1.000" não.
**Fix:** tratar ponto como milhar quando seguido de exatamente 3 dígitos e sem vírgula, ou remover separadores de milhar antes de converter; adicionar teste com "1.000".

#### WR-05: `PesquisaConfigService.obter()` faz `findUnique` + `create` não atômico (P2002 no primeiro acesso concorrente)

**Severity:** WARNING
**File:** `apps/backend/src/modules/pesquisa/pesquisa-config.service.ts:53-59`
**Issue:** `obter()` faz `findUnique` e, se nulo, `create({ where: { id: "default" } })` sem `upsert` nem catch de `P2002`. No primeiro acesso concorrente (job de re-tentativa + fechamento/página pública logo após o deploy), um `create` vence e o outro lança `P2002`. Em `classificar`/`obterPublica` isso não é tratado → 500 na rota pública; em `prepararFechamento` a pesquisa é silenciosamente pulada.
**Fix:** usar `prisma.pesquisaConfig.upsert` ou capturar `P2002` e reler. Teste concorrente (duas chamadas simultâneas).

#### WR-06: Limites de dinheiro na config não respeitam o `Decimal(12,2)` do banco (500 em vez de 400)

**Severity:** WARNING
**File:** `apps/backend/src/modules/pesquisa/pesquisa-regras.ts:422-424`; `apps/backend/src/modules/pesquisa/dto/atualizar-pesquisa-config.dto.ts:15-34`
**Issue:** `tetoDesconto`, `compraMinima` e `tetoMensal` aceitam até `Number.MAX_SAFE_INTEGER` (~9e15), mas as colunas são `Decimal(12,2)` (máximo ~9.999.999.999,99). Um valor acima disso passa por DTO + `validarConfig` e falha no Prisma por overflow, retornando 500 no `PUT /pesquisa/admin/config` em vez de um 400 por campo.
**Fix:** limitar os três campos a `9_999_999_999.99` (ou a um teto de negócio menor) em `validarConfig` e adicionar `@Max` no DTO; teste com valor extremo.

#### WR-07: Promessa de recompensa no fechamento pode divergir do cupom efetivamente emitido

**Severity:** WARNING
**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts:250-264` (texto escolhido) vs `:519-530` (elegibilidade recalculada)
**Issue:** no fechamento, o texto com recompensa é escolhido por `avaliarRecompensa` (teto mensal e intervalo). Na resposta, `emitirCupom` refaz a checagem com a config vigente. Se o teto mensal for atingido ou a config mudar (percentual/teto/compra mínima) entre o fechamento e a resposta — o link vale até 14 dias — o cliente é prometido "ganhe 10%" mas recebe nenhum cupom ou um cupom com valores diferentes da mensagem.
**Fix:** persistir o snapshot/elegibilidade da promessa na criação da pesquisa e honrá-lo na emissão (dentro do teto), ou usar `textoSemRecompensa` sempre que a garantia não puder ser honrada; documentar a regra.

#### WR-08: `sendOutgoingMessage` sem timeout — reserva `ENVIANDO` pode gerar mensagem duplicada na re-tentativa

**Severity:** WARNING
**File:** `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts:60-79` (axios.post em `:71`)
**Issue:** `sendOutgoingMessage` não define `timeout`, ao contrário dos demais métodos novos (todos com 10000 ms). Um request pendurado mantém a reserva em `ENVIANDO`; após 15 min a re-tentativa considera a reserva velha, confere no Chatwoot via `listMessagesAfter` e, se a mensagem ainda não aparecer, reenvia — podendo duplicar cupom/convite quando a requisição original concluir depois.
**Fix:** adicionar `{ headers: { api_access_token: token }, timeout: 10000 }` ao `axios.post`, como nos outros métodos, limitando a janela de incerteza.

#### WR-09: Impossible-state guard — checagem de pesquisa anonimizada em `reenviarPendentes`

**Severity:** WARNING
**Category:** necessity
**Subtype:** Impossible-state guard
**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts:970`
**Issue:** a guarda `if (pesquisa.conversationId === null || !pesquisa.telefone) continue;` protege um estado que não pode ocorrer para as linhas selecionadas. A consulta só pega `respondidaEm` entre 3 dias atrás e 5 min atrás (`:956-963`, `IDADE_MAXIMA_REENVIO_MS`). A anonimização que zera `conversationId`/`telefone` exige `criadaEm < agora - meses` com `meses >= 1` (`anonimizarAntigos`, `:1133-1135`; `PESQUISA_RETENCAO_MESES` também exige inteiro >= 1). Como `expiraEm = criadaEm + validadeLinkDias` (máx. 14 dias, `pesquisa-regras.ts:426`) e a resposta só é aceita antes de `expiraEm`, uma linha respondida há no máximo 3 dias foi criada há no máximo 17 dias — nunca anonimizada (>= 30 dias). Além disso, `telefone` é sempre preenchido na criação (`prepararFechamento`, `:239`), nunca nulo.
**Fix:** remover a guarda (ou documentá-la como invariante), já que a janela de re-tentativa e o piso de anonimização já garantem o estado; manter/ajustar o teste `"reenvio: anonimizada nao entra"` para refletir a impossibilidade (ou removê-lo se ele só existe para o guarda).

### Info

#### IN-01: Branch `P2002` por `pesquisaId` devolve cupom sem checar status (inconsistente com o caminho `existente`)

**Severity:** INFO
**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts:572-575`
**Issue:** no caminho normal, `existente` só é devolvido se `status === "EMITIDO"` (`:527-528`); no branch de `P2002` por `pesquisaId`, `this.cupomPublico(ja)` é devolvido mesmo se o cupom estiver `CANCELADO`/`EXPIRADO`/`USADO`. A branch é defensiva e difícil de alcançar (o `updateMany` de `responder` garante resposta única), mas a inconsistência é uma armadilha.
**Fix:** espelhar a checagem de status do caminho `existente` antes de devolver o cupom.

#### IN-02: `enviarPutCsat` envia `rating: 0` quando `nota` é nula

**Severity:** INFO
**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts:1101-1108`
**Issue:** `pesquisa.nota ?? 0` pode enviar `rating: 0` ao Chatwoot (fora de 1..5) se uma linha `RESPONDIDA` tiver `nota` nula por inconsistência, gerando falha e consumindo tentativas.
**Fix:** retornar `"IGNORADO"` quando `pesquisa.nota` for nula.

#### IN-03: Corrida resgate × revogação devolve 409 `JA_USADO` para cupom cancelado

**Severity:** INFO
**File:** `apps/backend/src/modules/pesquisa/pesquisa-cupom.service.ts:217-227`
**Issue:** se a revogação cancelar o cupom entre a leitura e o `updateMany` condicional, a contagem é 0 e o resgate responde `409 JA_USADO`, embora o cupom tenha sido cancelado (`PesquisaRevogacaoService` não usa o lock 520001). O operador vê "já foi usado" em vez de "cancelado". O efeito financeiro é correto (não há duplo uso).
**Fix:** reler a linha e mapear `status = CANCELADO` para 422 `CANCELADO`, ou usar o mesmo advisory lock na revogação.

#### IN-04: Constantes de etiquetas duplicadas entre `pesquisa-efeitos` e `chatwoot-etiquetas`

**Severity:** INFO
**File:** `apps/backend/src/modules/pesquisa/pesquisa-efeitos.ts:13-14` e `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts:49-50`
**Issue:** `"avaliou"`/`"csat-baixo"` são definidos em dois módulos. `etiquetasDaPesquisa` e `ETIQUETAS_PESQUISA` precisam ficar em sincronia; se um mudar, a mescla deixa etiqueta obsoleta na conversa.
**Fix:** fonte única (importar de um dos módulos ou de um arquivo de constantes compartilhado).

#### IN-05: Comentário livre do cliente vai para nota privada do Chatwoot sem sanitização

**Severity:** INFO
**File:** `apps/backend/src/modules/pesquisa/pesquisa-efeitos.ts:56` (usado em `pesquisa.service.ts:1212-1221`)
**Issue:** o comentário (até 500 caracteres) é inserido verbatim na nota privada da conversa. No nosso painel ele é renderizado como texto (seguro), mas cruza para outro sistema que pode interpretar markdown/HTML. Como defesa em profundidade para uma fronteira de confiança, vale neutralizar marcação.
**Fix:** sanitizar/escapar `<`/`>` (a dependência `sanitize-html` já existe no projeto) antes de montar a nota.

#### IN-06: `montarConfigPadrao` aceita envs fora dos limites de `validarConfig`

**Severity:** INFO
**File:** `apps/backend/src/modules/pesquisa/pesquisa-regras.ts:488-515`
**Issue:** `numeroEnv` só rejeita não-finito/negativo. Um `PESQUISA_PERCENTUAL_PADRAO=0` (ou `60`) cria o singleton com percentual inválido, que passa a ser usado na emissão sem nunca ter passado por `validarConfig`. O admin depois não consegue salvar sem corrigir.
**Fix:** aplicar `validarConfig`/clamp aos padrões (ou ignorar env fora da faixa) antes do `create`.

#### IN-07: `tentativasEnvio` é compartilhado entre cupom e convite

**Severity:** INFO
**File:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts:1019-1028`
**Issue:** `tentativasEnvio` é por pesquisa e incrementado uma vez por ciclo se **qualquer** canal falhar. Um convite que falha repetidamente consome o limite de 6 e pode interromper a re-tentativa de um cupom ainda pendente.
**Fix:** contadores por canal, ou incrementar apenas para os canais que falharam e ainda importam.

#### IN-08: Lógica de carga inicial duplicada no `config-form`

**Severity:** INFO
**File:** `apps/frontend/src/app/configuracoes/pesquisa/config-form.tsx:240-290`
**Issue:** `carregar()` (:240-260) e o `useEffect` (:262-290) repetem o mesmo fetch/parse, mas com pequenas divergências (o efeito não limpa `errosServidor`). Manutenção futura pode corrigir um caminho e esquecer o outro.
**Fix:** extrair um helper único (com `AbortController`/flag) usado pelo efeito e pelo botão "Tentar novamente".

---

_Reviewed: 2026-11-22T16:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
