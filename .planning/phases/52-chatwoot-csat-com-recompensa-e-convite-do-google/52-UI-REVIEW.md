# Phase 52 — UI Review

**Audited:** 2026-11-22
**Baseline:** `52-UI-SPEC.md` (aprovado em 2026-11-22, revisão 1)
**Screenshots:** não capturados — `localhost:3000` responde mas serve o **Chatwoot** (título `Chatwoot`); `localhost:3001` é o frontend, porém com build anterior à fase 52 (`/cupons`, `/configuracoes/pesquisa` e `/pesquisa/abc` retornam 404). Playwright falhou nas 3 capturas (0/3). Auditoria feita por análise de código.
**Interaction captures:** off (`workflow.ui_interaction_capture` = false)

> Portão de `.gitignore` executado antes das capturas: `.planning/ui-reviews/.gitignore` criado com `*.png`, `*.webp`, `*.jpg`, `*.jpeg`, `*.gif`, `*.bmp`, `*.tiff` e `interaction/`.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Copy da página pública e do resgate bate quase literalmente com o contrato; achados pontuais: erro técnico "Falha ao conectar no backend." e textos da revogação fora do copywriting contract |
| 2. Visuals | 3/4 | Foco e estrutura corretos; nota média não usa o Display 2rem/600 do contrato e os títulos de card têm dois tratamentos (span herdado vs Bootstrap `h6`) |
| 3. Color | 2/4 | Novas telas admin usam `#6b7a90` (4,36:1) em rótulos pequenos e `#e5484d` (3,91:1) em texto de erro — ambos proibidos pelo contrato |
| 4. Typography | 2/4 | Componentes admin novos usam 0,76/0,78/0,82/0,85 rem e peso 700; o contrato admite só 0,8/1/1,25/2 rem e 400/600 |
| 5. Spacing | 2/4 | Admin novo usa muitos valores rem arbitrários (.85rem/.7rem/.9rem/.35rem…) fora da escala de múltiplos de 4; página pública está aderente |
| 6. Experience Design | 3/4 | Cobertura forte de loading/erro/vazio/sucesso, duplo envio, beforeunload e recarga não otimista; falha no alvo de toque de 40px do "Copiar código" e no foco da confirmação de revogação |

**Overall: 15/24**

---

## Top 3 Priority Fixes

1. **Contraste insuficiente em rótulos e erros das telas novas** — `resultados-panel.tsx` usa `.pa-stat-label`/`.pa-card-header-count` (`#6b7a90`, 4,36:1 — o UI-SPEC diz explicitamente "Não usar nas telas novas") e `config-form.tsx` usa `#e5484d` (3,91:1) como cor de texto de erro. Impacto: rótulos e mensagens de validação ficam abaixo de 4,5:1, prejudicando leitura e acessibilidade. Correção: sobrescrever para `#5b6778` (rótulos secundários) e `#b02a37` (texto de erro) nas classes novas; reservar `#e5484d` para ícone/borda.
2. **Escala tipográfica e de espaçamento divergente no admin** — `config-form.tsx`, `resultados-panel.tsx` e `cupons-manager.tsx` introduzem 0,76/0,78/0,82/0,85 rem e `font-weight: 700`, além de paddings/gaps em `.85rem`, `.7rem`, `.9rem`, `.35rem`. Impacto: quebra a coerência visual entre as 3 superfícies da fase. Correção: normalizar para 0,8/1/1,25/2 rem e 400/600, e para múltiplos de 4px (ou reutilizar as exceções `pa-*` documentadas). Definir a nota média do painel em Display 2rem/600 (hoje `pa-stat-value` = 1,3rem/700).
3. **Alvos de toque e foco em ações irreversíveis** — o botão "Copiar código" tem `height: 40px` (`pesquisa-cliente.tsx:382`), abaixo do mínimo de 44px; a confirmação de "Revogar pesquisa" (`resultados-panel.tsx:553`) não move o foco para o painel (o botão anterior é substituído por um span e o foco cai no `body`). Impacto: erro de toque no celular e perda de contexto para teclado/leitor de tela. Correção: `min-height: 44px` (ideal 48px) no botão de copiar; `ref` + `tabIndex={-1}` + `focus()` no painel de confirmação (como já feito em `cupons-manager.tsx:240-242`).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Aderente ao contrato:**
- Página pública: "Enviar avaliação" (`pesquisa-cliente.tsx:578`), "Nota selecionada: {n} de 5 ({rótulo})." (`:515`), erro sem nota (`:27`), estados "Sua avaliação já foi registrada", "Esta pesquisa não está mais disponível", "Não foi possível carregar a pesquisa"/"Tentar novamente" (`:670-709`), bloco Google com "(abre em nova aba)" (`:663`).
- Cupons: "Buscar cupom", "Buscando cupom...", "Informe o valor da compra.", "Compra mínima de … não atingida…", confirmação e sucesso com instrução de lançar no Athos/PDV (`cupons-manager.tsx:84-85, 414-423, 286, 525-530, 560-592, 309-311`).
- Configuração: "Salvar alterações", "Descartar alterações", "Alterações não salvas.", "Confira os campos destacados.", "Configurações salvas." (`config-form.tsx:745-752`, `:385`).
- Empty states exatos: "Nenhuma resposta ainda" / "Nenhum cupom ainda" (`resultados-panel.tsx:479-482`, `cupons-manager.tsx:650-651`).

**Achados (WARNING):**
- `config-form.tsx:387`: catch de rede exibe **"Falha ao conectar no backend."** — texto técnico, não a copy declarada para erro de salvar ("Não foi possível salvar. Confira os campos destacados e tente de novo.").
- `resultados-panel.tsx:548-580`: a ação destrutiva "Revogar pesquisa" / "Revogar esta pesquisa? … Confirmar revogação" **não existe no Copywriting Contract** da seção 3 (Resultados). Vem da decisão de revogação do `52-CONTEXT.md` e é válida, mas o contrato visual não a prevê; a copy nova deveria ser incorporada ao UI-SPEC.
- `config-form.tsx:726`: "Exemplo com valores fictícios; nada é enviado ao servidor." é texto extra não declarado (aceitável, porém fora do contrato).

### Pillar 2: Visuals (3/4)

**Achados (WARNING):**
- **Nota média não usa Display.** O contrato atribui Display (2rem, peso 600) a "código do cupom, nota média no painel". Em `resultados-panel.tsx:319` a nota usa `pa-stat-value`, que em `admin-shell.tsx:478` é **1,3rem / peso 700**. O cartão de maior destaque do painel sai menor e mais pesado que o contrato.
- **Títulos de card com dois tratamentos.** Configuração e Resultados usam `<div className="pa-card-header"><span>` (`config-form.tsx:454-456`, `resultados-panel.tsx:399-401`), que herda 1rem/400 de `body` (`admin-shell.tsx:334-340` não define tamanho); Cupons usa `<h2 className="h6 m-0">` (`cupons-manager.tsx:388, 435, 603`), 1rem/500 do Bootstrap. Nenhum dos dois usa o Heading 1,25rem/600 do contrato — a hierarquia entre seções fica fraca e inconsistente.
- Coluna "Ações"/"Revogar pesquisa" adicionada ao painel (`resultados-panel.tsx:470-495`) sem previsão no UI-SPEC (seção 3 lista Data · Nota · Variante · Comentário · Cupom).
- Positivos: foco claro na página pública (controle de nota) e no cartão do cupom; ícones só com `aria-label` (copiar, `pesquisa-cliente.tsx:641-649`); variação de tamanho/peso para hierarquia no formulário público.

### Pillar 3: Color (2/4)

**Achados (WARNING/BLOCKER de acessibilidade):**
- `resultados-panel.tsx:318, 335, 352, 370` usam `.pa-stat-label`, definido em `admin-shell.tsx:477` como `var(--pa-text-muted)` = **`#6b7a90`** (`admin-shell.tsx:141`). O UI-SPEC é explícito: `#6b7a90` sobre branco = **4,36:1**, "Falha para texto pequeno. Não usar nas telas novas". Os rótulos têm 0,82rem.
- `admin-shell.tsx:341` `.pa-card-header-count` também usa `--pa-text-muted` (`#6b7a90`) e é renderizado em `resultados-panel.tsx:472` ("Últimas respostas (n)").
- `config-form.tsx:437, 439`: `.pesquisa-erro` e `.pesquisa-contador-excedido` usam **`#e5484d`** como cor de **texto** (3,91:1). O contrato reserva `#e5484d` a ícone/borda e exige `#b02a37` (6,49:1) para texto de erro.
- **Cor não declarada:** `#1f2a37` aparece em `config-form.tsx:440, 443` e em `resultados-panel.tsx:241, 246`; o contrato usa `#1b2431` para texto. Dois quase-pretos convivem na mesma tela.
- Pontos corretos: distribuição 60/30/10 respeitada (fundo `#f4f6fa`/`#ffffff`, blocos de apoio, accent só em CTA/seleção/borda do cupom/foco); pílulas `pesquisa-pill-ok/danger/neutral` com os hex exatos (`resultados-panel.tsx:220-222`, `cupons-manager.tsx:352-354`); barras de progresso e distribuição sem accent (`#5b6778` sobre `#eef1f6`), como o contrato pede; accent não é usado em títulos nem valores.
- Dependência verificada: o fallback de contraste da cor da empresa é calculado no backend (`pesquisa.service.ts:452`, `pesquisa-regras.ts:286`), então a página pública recebe `corPrimaria` já ajustada.

### Pillar 4: Typography (2/4)

O contrato declara **quatro tamanhos (0,8 / 1 / 1,25 / 2 rem) e dois pesos (400 / 600)** para conteúdo novo.

**Achados (WARNING):**
- `config-form.tsx:436-439`: `.82rem` (ajuda), `.85rem` (erro), `.78rem` (contador) — três tamanhos não declarados.
- `resultados-panel.tsx:216-232`: `.82rem`, `.8rem`, `.78rem`, `.85rem` distribuídos em nota/secundário/gasto/distribuição; além de `style={{ fontSize: ".85rem" }}` inline em `:355`.
- `cupons-manager.tsx:360-382`: `.76rem` (dt), `.8rem`, `.85rem`.
- `cupons-manager.tsx:375`: `.cupons-confirmacao-titulo { font-weight: 700 }` — terceiro peso, não permitido para conteúdo novo.
- Positivo: a **página pública adere** ao contrato — 0,8rem (ajuda/rodapé), 1rem (corpo/rótulos), 1,25rem (título), 2rem (código do cupom); o `1.5rem` em `pesquisa-cliente.tsx:258` é tamanho de ícone, não de texto; `tabular-nums`/monoespaçado respeitados no código do cupom. As exceções `pa-*` herdadas (0.72-0.9rem, 700 nos stats) são permitidas, mas as classes **novas** acima não são herdadas.

### Pillar 5: Spacing (2/4)

**Achados (WARNING):**
- Escala do contrato: múltiplos de 4px, exceções só 12px (chip/botão copiar) e paddings `pa-*` herdados. O admin novo define valores próprios fora da escala:
  - `config-form.tsx:440-447`: `.85rem 1rem` (prévia), `.4rem .6rem` (aviso), `.5rem .9rem` / `.5rem .9rem` (botões), `gap: .75rem`.
  - `resultados-panel.tsx:223, 229, 241, 243-248`: `.5rem .7rem`, `.75rem .9rem`, `.35rem .8rem`, `.4rem .9rem`, `gap: .55rem`, `.6rem`, `grid-template-columns: 7.5rem`.
  - `cupons-manager.tsx:359-373`: `gap: .75rem 1.25rem`, `.65rem .85rem`, `.85rem 1rem`, `.3rem .6rem`, `.35rem .8rem`.
- Página pública: o núcleo está aderente (padding 16/24px, gap 8px, opções 56×56, botão 48px, tile 64px), mas há desvios pontuais: `pesquisa-cliente.tsx:200` tile com `padding: 6px` e `:291` textarea com `padding: 8px 10px` (10px não é múltiplo de 4), além de `margin-bottom: 20px` no cabeçalho (`:190`).
- Layout macro correto: largura máxima 720px na configuração (`config-form.tsx:433`), 480px na pública (`pesquisa-cliente.tsx:210`), empilhamento em <992px no painel (`resultados-panel.tsx:218`), scroll horizontal nas tabelas (`pa-card-body-scroll` + `pesquisa-tabela-scroll`).

### Pillar 6: Experience Design (3/4)

**Cobertura forte (evidência):**
- Página pública: `aria-busy` + spinner + "Enviando..." e ref de envio único (`pesquisa-cliente.tsx:510, 571-580, 129`); erro preserva nota/comentário com `role="alert"` (`:567-569`); foco no título após sucesso (`:91-93, 607`); `aria-live` na seleção (`:514`); radio nativo com `fieldset`/`legend` (`:518-549`); `prefers-reduced-motion` (`:426-429`).
- Configuração: loading, erro com "Tentar novamente", sucesso `role="status"`, erro `role="alert"`, bloqueio de salvar por erro visível, `beforeunload` com alterações pendentes, foco no primeiro erro (`config-form.tsx:300-308, 325-332, 394-418, 730-739`).
- Resultados: loading, erro com retry, vazio com próximo passo, `aria-busy`, recarga sempre do servidor após revogar (nunca otimista) (`resultados-panel.tsx:127-164, 288-309, 476-484, 201-205`).
- Cupons: busca com spinner, lista com `aria-busy`, vazio por filtro, confirmação inline em 2 passos, recarga do servidor após resgate, 401/404/409/422/5xx tratados (`cupons-manager.tsx:175-200, 290-337, 425-430, 481-490, 551-594`).

**Achados (WARNING):**
- `pesquisa-cliente.tsx:377-392`: botão "Copiar código" tem `height: 40px`; o UI-SPEC exige alvo mínimo de 44×44 (ideal 48px). O texto muda para "Código copiado." por 2s via `role="status"` (correto).
- `resultados-panel.tsx:553-585`: painel de confirmação de revogação sem `role`, sem `tabIndex` e sem foco; o item que o usuário acionou é trocado por "Confirmando..." (`:538`), então o foco se perde. Comparar com o padrão correto de `cupons-manager.tsx:240-242` (`confirmacaoRef` + `focus()`).
- `config-form.tsx:240-290`: carga duplicada (função `carregar` + `useEffect` com a mesma busca). Não afeta o usuário, mas é dívida de manutenção com risco de divergência de estado.
- Sem Error Boundary explícito nas superfícies novas (o contrato não exige; Next cobre o default).

---

## Notas de método

- **Registry Safety:** projeto sem shadcn (`components.json` ausente), UI-SPEC sem blocos de terceiros — auditoria de registry não aplicável. Os únicos recursos externos são CDN com SRI: `RecursosBootstrap` e a página pública carregam Bootstrap 5.3.2 e Bootstrap Icons 1.11.1 com `integrity` sha384 e `crossOrigin="anonymous"`, e o `bootstrap-icons.js` (404) foi removido (`recursos-bootstrap.tsx`, `pesquisa/[token]/page.tsx:15, 80-85`), atendendo aos requisitos 1 e 2 do contrato.
- **Privacidade:** a rota pública é `noindex`/`no-referrer` (`page.tsx:17-24`) e não usa `dangerouslySetInnerHTML` (comentário de cliente renderizado como texto).
- **Capturas:** não foi possível servir as rotas da fase. Para uma auditoria visual real, subir o frontend da fase (build com as 34 rotas citadas em `52-08-SUMMARY.md:109`) em uma porta livre e repetir `/gsd-ui-review`.

---

## Files Audited

- `apps/frontend/src/app/pesquisa/[token]/page.tsx`
- `apps/frontend/src/app/pesquisa/[token]/pesquisa-cliente.tsx`
- `apps/frontend/src/lib/pesquisa-publica.ts`
- `apps/frontend/src/app/configuracoes/pesquisa/page.tsx`
- `apps/frontend/src/app/configuracoes/pesquisa/config-form.tsx`
- `apps/frontend/src/app/configuracoes/pesquisa/resultados-panel.tsx`
- `apps/frontend/src/app/cupons/page.tsx`
- `apps/frontend/src/app/cupons/cupons-manager.tsx`
- `apps/frontend/src/lib/pesquisa-admin.ts`
- `apps/frontend/src/app/contas-receber/admin-shell.tsx` (tokens `pa-*`, `PA_NAV_ITEMS`)
- `apps/frontend/src/app/contas-receber/_shared/recursos-bootstrap.tsx`
- `apps/frontend/src/app/configuracoes/cobranca/page.tsx` (padrão herdado de card)
- `apps/frontend/src/app/globals.css` (fonte/tamanho base)
- Contratos: `52-UI-SPEC.md`, `52-CONTEXT.md`; resumos `52-02/03/08/09/10-SUMMARY.md`
