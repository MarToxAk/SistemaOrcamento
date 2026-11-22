---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
reviewed: 2026-11-22T17:30:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - apps/backend/src/modules/pesquisa/pesquisa-regras.ts
  - apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa-render-paridade.test.ts
  - apps/backend/src/modules/pesquisa/pesquisa.service.test.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
  necessity: 0
status: issues_found
---

# Fase 52 (plano 52-13): Relatório de revisão incremental (gap CR-01)

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Revisão incremental de `git diff f94e1c3..HEAD`. O fix de produção é uma única mudança em `renderizarTexto` (`pesquisa-regras.ts:50-57`): a chave capturada pelo regex `/gi` agora é normalizada com `toLowerCase()` antes do `hasOwnProperty`/leitura. As suítes de `src/modules/pesquisa` passam (13 suítes, 324 testes).

**O fix fecha o CR-01.** Verifiquei os três pontos de uso de `renderizarTexto` em `pesquisa.service.ts` (fechamento linha 250, pós-resposta linha 624, convite linha 727). Todos montam mapas só com chaves minúsculas (`link`, `codigo`, `link_google`, ...), então `{LINK}`, `{CODIGO}` e `{LINK_GOOGLE}` passam a resolver o valor real. Sobre os casos de borda pedidos:

- **Caixa mista** (`{Link_Google}`): o regex usa `/i` e a chave é normalizada, então resolve.
- **Repetidos**: o `replace` global trata cada ocorrência de forma independente. O teste `{LINK} {Link} {link}` cobre isso.
- **Desconhecidos** (`{xyz}`): continuam virando `""` em produção, como antes.
- **Validação**: `validarTextoMensagem` já comparava em minúsculas (`baixo.includes(...)`, `.toLowerCase()` na chave). O gap era só o render, então não há regressão nem mudança nela.
- **Prévia do frontend**: `renderizarPrevia` já normalizava a caixa. Produção e prévia agora concordam para chaves presentes no mapa.

Resta uma divergência prévia x produção que o teste de paridade não detecta (WR-01), mais pontos menores de qualidade de teste.

## Warnings

### WR-01: Prévia do admin mostra {codigo} e {link_google} preenchidos no fechamento, mas produção envia vazio

**File:** `apps/frontend/src/app/configuracoes/pesquisa/config-form.tsx:103-112,724` (contra `apps/backend/src/modules/pesquisa/pesquisa.service.ts:250-262`)
**Issue:** A prévia de `textoFechamento` usa `EXEMPLOS`, que tem `codigo: "BOX-7K3Q9M"` e `link_google: "https://g.page/exemplo"`. Em produção, `prepararFechamento` envia `codigo: ""` e `link_google: ""` (linhas 259-260). `validarTextoMensagem("fechamento", ...)` aceita `{codigo}`/`{CODIGO}` nesse tipo (só `posResposta` e `convite` têm restrições específicas). Um admin que escrever `{CODIGO}` no texto de fechamento vê um código fictício na prévia, enquanto o cliente recebe a mensagem com o espaço em branco. Esse é o mesmo tipo de falha de paridade que o plano 52-13 quer eliminar.

O teste `pesquisa-render-paridade.test.ts` (`mapaFechamento`, linhas 25-34) usa o mapa real de produção (`codigo: ""`) nos dois lados. Por isso nunca exercita `EXEMPLOS` e não pega a divergência. Ela é anterior ao 52-13, mas o plano declara paridade prévia x produção como objetivo.

**Fix:** Duas opções.
1. Rejeitar `{codigo}` e `{link_google}` em `fechamento` e `semRecompensa` na validação, como já é feito para `{link}` em `posResposta`.
2. Fazer a prévia do fechamento usar um mapa que zere `codigo` e `link_google`:
```ts
renderizarPrevia(atual.textoFechamento, { ...EXEMPLOS, codigo: "", link_google: "" })
```

## Info

### IN-01: Mapas de produção copiados à mão no teste de paridade

**File:** `apps/backend/src/modules/pesquisa/pesquisa-render-paridade.test.ts:25-34,52-55`
**Issue:** `mapaFechamento` e `mapaConvite` são cópias manuais dos objetos em `pesquisa.service.ts` (fechamento e `enviarConviteGoogle`). Só `mapaPosResposta` usa a função real, `montarVariaveisMensagem`. Se alguém acrescentar ou renomear uma chave no serviço, o teste continua verde com o mapa antigo. A paridade fica protegida só contra o regex, não contra o conjunto de chaves.
**Fix:** Extrair os dois mapas para helpers exportados (como `montarVariaveisMensagem`) e usá-los no serviço e no teste. Alternativa: manter só os testes de serviço (T52-13a/c/d), que já validam o envio real de ponta a ponta.

### IN-02: Asserção de paridade em T52-13c e T52-13d é circular, e há ID duplicado "T52-13e"

**File:** `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts:545-558,573-577`; `pesquisa-render-paridade.test.ts:61,81`
**Issue:**
- Comparar `renderizarTexto("... {CODIGO} ...")` com `renderizarTexto("... {codigo} ...")` usa a mesma função nos dois lados. Só protege se o valor do mapa for não vazio, o que é o caso. O teste de serviço antes dele (`toContain(codigo)` e `not.toMatch(/[{}]/)`) é o que prova o fix de verdade. O bloco extra é redundante.
- O ID `T52-13e` aparece em dois testes (o `describe.each` e o teste dos "três placeholders"), o que atrapalha a rastreabilidade para o plano.
**Fix:** Remover as asserções circulares ou compará-las contra um valor literal esperado. Renomear um dos testes (por exemplo `T52-13e2`).

### IN-03: Acoplamento do teste do backend ao caminho do frontend via `require` calculado

**File:** `apps/backend/src/modules/pesquisa/pesquisa-render-paridade.test.ts:15-22`
**Issue:** O teste carrega `../../../../frontend/src/lib/pesquisa-admin` por `require` com caminho relativo. A justificativa (TS6059 e frontend sem runner) está documentada e funciona hoje, com a suíte passando. É frágil se o frontend ganhar imports com alias (`@/...`) ou deixar de ser transformável pelo ts-jest, e o tipo `RenderizarPrevia` é redeclarado à mão, sem checagem contra o export real. O regex também está triplicado (`renderizarTexto` inline, `REGEX_PLACEHOLDER` na mesma linha 351 e o do frontend). Esse é o motivo pelo qual a paridade só é garantida por este teste.
**Fix:** Aceitável por ora. A longo prazo, mover `renderizarTexto` e `REGEX_PLACEHOLDER` para `@bomcusto/shared` e consumir nos dois lados, o que elimina a necessidade do teste de paridade. Em `renderizarTexto`, reutilizar a constante `REGEX_PLACEHOLDER` em vez do literal inline.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
