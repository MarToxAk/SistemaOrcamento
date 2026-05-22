---
phase: 29
slug: boleto-consolidado-efi
status: draft
shadcn_initialized: false
preset: none
created: 2026-05-22
---

# Phase 29 — UI Design Contract
# Boleto Consolidado via EFI Bank

> Contrato visual e de interação para o modal de geração de boleto.
> Gerado por gsd-ui-researcher. Verificado por gsd-ui-checker.

---

## Design System

| Property | Value | Source |
|----------|-------|--------|
| Tool | none — Bootstrap 5.3 puro | page.tsx detectado |
| Preset | não aplicável | sem components.json |
| Component library | Bootstrap 5.3.2 via CDN | page.tsx linha 119 |
| Icon library | Bootstrap Icons 1.11.1 via CDN | page.tsx linha 116 |
| Font | Inter → Segoe UI → system-ui (sem webfont carregado) | colors_and_type.css --font-ui |
| Design tokens | .claude/skills/bom-custo-design/colors_and_type.css | SKILL.md |

shadcn **não aplicável**: stack é Next.js App Router com Bootstrap 5.3, não Radix/Tailwind.
Nenhuma inicialização de shadcn necessária.

---

## Spacing Scale

Alinhado com Bootstrap spacing + escala do design system (rem → px a 16px base):

| Token | Valor | Equivalente Bootstrap | Uso no modal |
|-------|-------|-----------------------|--------------|
| xs | 4px | `gap-1` | Ícone ↔ texto inline |
| sm | 8px | `gap-2`, `p-2` | Espaçamento entre badges, botões pequenos |
| md | 16px | `p-3`, `gap-3` | Padding padrão do corpo do modal |
| lg | 24px | `p-4` | Padding do cabeçalho e rodapé do modal |
| xl | 32px | `mb-4`, `mt-4` | Separação entre blocos internos do modal |
| 2xl | 48px | — | Não usado no modal |
| 3xl | 64px | — | Não usado no modal |

Exceções:
- Barra de ações sticky: padding `12px 16px` (mantém padrão já implementado na página — fonte: page.tsx linha 289)
- Botão copiar linha digitável: largura mínima 44px para touch target (acessibilidade)

---

## Typography

Usa a escala do `colors_and_type.css` mapeada para tamanhos Bootstrap equivalentes.

| Papel | Tamanho CSS var | Tamanho aprox. | Weight | Line Height | Uso no modal |
|-------|----------------|----------------|--------|-------------|--------------|
| Body | --fs-base (1.05rem) | ~17px | 400 (--fw-regular) | 1.5 (--lh-normal) | Texto descritivo, rótulos de campo |
| Label/Small | --fs-sm (0.95rem) | ~15px | 400 (--fw-regular) | 1.5 | Valores secundários, hints de campo |
| Heading | --fs-lg (1.35rem) | ~22px | 600 (--fw-semibold) | 1.3 (--lh-snug) | Título do modal "Gerar Boleto" |
| Display/Valor | --fs-xl (1.7rem) | ~27px | 700 (--fw-bold) | 1.15 (--lh-tight) | Valor total do boleto em destaque |

Regras de aplicação:
- Linha digitável: `font-family: var(--font-mono)`, --fs-sm, weight 400 — permite leitura e cópia fácil
- Vencimento e valor: sempre formatados via `toLocaleString('pt-BR', ...)` e `toLocaleDateString('pt-BR')`
- Classes Bootstrap equivalentes: `.fw-semibold`, `.fw-bold`, `.small`, `.fs-5`

---

## Color

| Papel | Valor hex | Var CSS | Uso no modal |
|-------|-----------|---------|--------------|
| Dominant (60%) | `#ffffff` | --surface | Fundo do card do modal |
| Secondary (30%) | `#f9f7ed` | --bg | Backdrop por trás do overlay, cabeçalho do modal |
| Accent (10%) | `#0d6efd` | --accent | Botão "Confirmar Geração", links de ação |
| Destrutivo | `#ee3537` | --danger | Alert de datas diferentes, estado de erro da API |
| Sucesso | `#1a7f37` | --success | Estado de sucesso pós-geração |
| Aviso (warning) | `#fd7e14` | --accent-warm | Botão "Gerar Boleto" na barra de ações (Bootstrap `btn-warning` — já implementado) |

Accent reservado para: botão primário "Confirmar Geração", botão "Abrir Boleto" no estado de sucesso.

Mapeamento Bootstrap → token:
- `btn-warning` = `--accent-warm` (#fd7e14) — botão trigger "Gerar Boleto" (já na barra de ações)
- `btn-primary` = `--accent` (#0d6efd) — confirmação dentro do modal
- `btn-success` = `--success` (#1a7f37) — botão "Abrir Boleto" no estado de sucesso
- `alert-danger` = `--danger-bg` (#ffefef) com texto `--danger` — alerta de datas divergentes

Overlay do modal: `rgba(0, 0, 0, 0.55)` — mantém padrão do `.pdf-modal-backdrop` da página de orçamento.

---

## Estrutura de Estados do Modal

O modal passa por 4 estados sequenciais. Cada estado tem renderização exclusiva dentro do mesmo overlay.

### Estado 1 — Validação / Confirmação (estado inicial)

Ativado por: clique em "Gerar Boleto" na barra de ações (≥1 título selecionado).

**Elementos obrigatórios:**

| Elemento | Especificação |
|----------|---------------|
| Título do modal | `<h5>` — "Gerar Boleto" com ícone `bi-receipt` à esquerda |
| Subtítulo | `<small>` com texto dinâmico: "{N} título(s) selecionado(s)" |
| Bloco de resumo | Card `border-0 shadow-sm` com: Valor Total (destaque --fs-xl bold), lista dos títulos selecionados (numerotitulo + valor, font-size .small) |
| Campo de vencimento | `<input type="date">` com label "Data de Vencimento do Boleto" |
| Alert datas divergentes | `alert alert-danger` (visível somente quando títulos têm datavencimento diferentes): "Os títulos selecionados possuem datas de vencimento diferentes. Informe a data de vencimento manualmente." |
| Pré-preenchimento | Se datas iguais → campo de data pré-preenchido e readonly (exibe data + badge "Preenchido automaticamente" `bg-info text-dark`) |
| Data no passado | Validação inline abaixo do campo: `<div class="invalid-feedback">` — "A data de vencimento não pode ser no passado." |
| Botão cancelar | `btn btn-outline-secondary` — "Cancelar" — fecha o modal sem chamada à API |
| Botão confirmar | `btn btn-primary` — "Confirmar Geração" com ícone `bi-check-lg` — desabilitado se campo de data vazio ou data no passado |

**Comportamento do campo de data:**
- Datas iguais nos títulos selecionados → `value` pré-preenchido, `readOnly={true}`, badge "Preenchido automaticamente" visível
- Datas diferentes → campo vazio, `readOnly={false}`, alert danger visível acima do campo
- Valor `min` do campo: data de hoje (ISO YYYY-MM-DD) — impede datas no passado via HTML5

### Estado 2 — Loading (chamada à API em andamento)

Ativado por: clique em "Confirmar Geração".

| Elemento | Especificação |
|----------|---------------|
| Spinner | `<div class="spinner-border text-primary">` centralizado — tamanho padrão (não `spinner-border-sm`) |
| Texto | `<p class="mt-3 text-muted">` — "Gerando boleto junto à EFI Bank…" |
| Botões | Ocultos durante o loading (não apenas desabilitados) |
| Backdrop | Não clicável durante loading (prevenir fechamento acidental) |

### Estado 3 — Sucesso

Ativado por: resposta 2xx da API com payload `{ linkBoleto, barcodeLinhaDigitavel, valor, expireAt }`.

| Elemento | Especificação |
|----------|---------------|
| Ícone de sucesso | `bi-check-circle-fill` tamanho `fs-1` (2rem), cor `--success` (#1a7f37), centralizado |
| Heading | `<h5 class="fw-semibold text-success">` — "Boleto Gerado com Sucesso" |
| Bloco de dados | Card `border-0 bg-light` com: Valor (`formatBRL(valor)` — --fs-xl bold), Vencimento (`formatDate(expireAt)`) |
| Linha digitável | Label "Linha Digitável", input `type="text"` readonly com `font-family: var(--font-mono)` e `font-size: var(--fs-sm)`, largura 100% |
| Botão copiar | `btn btn-outline-secondary btn-sm` com ícone `bi-clipboard` ao lado do campo — texto "Copiar" → muda para "Copiado!" por 2s após click (via estado React) |
| Botão abrir boleto | `btn btn-success` — "Abrir Boleto" com ícone `bi-box-arrow-up-right` — `target="_blank" rel="noopener noreferrer"` abrindo `linkBoleto` |
| Botão fechar | `btn btn-outline-secondary` — "Fechar" — fecha o modal |

**Feedback de cópia:** Ao clicar em "Copiar", executar `navigator.clipboard.writeText(barcodeLinhaDigitavel)`. Texto do botão muda para "Copiado! ✔" por 2000ms, depois volta a "Copiar". Nenhum toast adicional necessário.

### Estado 4 — Erro

Ativado por: resposta não-2xx da API ou exceção de rede.

| Elemento | Especificação |
|----------|---------------|
| Alert | `alert alert-danger d-flex gap-2` com ícone `bi-exclamation-triangle-fill` |
| Mensagem principal | Texto da resposta API se disponível, senão: "Não foi possível gerar o boleto. Verifique a conexão e tente novamente." |
| Detalhe técnico | `<small class="text-muted d-block mt-1">` — exibe `error.message` ou status HTTP para facilitar diagnóstico pelo operador |
| Botão tentar novamente | `btn btn-warning` — "Tentar Novamente" — retorna para Estado 1 com os mesmos dados |
| Botão fechar | `btn btn-outline-secondary` — "Cancelar" — fecha o modal |

---

## Estrutura DOM do Modal

```
div.boleto-modal-backdrop (position: fixed, inset: 0, z-index: 1050, backdrop rgba(0,0,0,0.55))
  div.boleto-modal-card (bg: #fff, border-radius: 10px, shadow-lg, max-width: 520px, width: calc(100% - 2rem))
    div.boleto-modal-header (flex, space-between, border-bottom: 1px solid #ececec, padding: 16px 24px)
      h5.boleto-modal-title
      button.btn-close (fecha modal — somente em estados 1, 3, 4)
    div.boleto-modal-body (padding: 24px)
      [conteúdo do estado ativo]
    div.boleto-modal-footer (flex, gap-2, justify-content: flex-end, padding: 16px 24px, border-top: 1px solid #ececec)
      [botões do estado ativo]
```

Notas de implementação:
- Modal implementado via estado React (`useState<'idle'|'confirm'|'loading'|'success'|'error'>`) — sem Bootstrap Modal JS
- Padrão estabelecido no projeto: `.pdf-modal-backdrop` em `/orcamento/[id]/page.tsx` (linhas 1062-1101)
- Fechar modal: somente ESC key + botão explícito (não fechar ao clicar no backdrop durante `loading`)
- `max-width: 520px` — menor que o PDF modal (1200px), adequado para formulário de confirmação

---

## Copywriting Contract

| Elemento | Texto |
|----------|-------|
| Título do modal (trigger aberto) | "Gerar Boleto" |
| Subtítulo dinâmico | "{N} título(s) selecionado(s) — {formatBRL(total)}" |
| Label campo data | "Data de Vencimento do Boleto" |
| Hint campo data (datas iguais) | "Preenchida automaticamente com a data dos títulos." |
| Alert datas divergentes | "Os títulos selecionados possuem datas de vencimento diferentes. Informe a data de vencimento manualmente." |
| Erro data no passado | "A data de vencimento não pode ser no passado." |
| Botão cancelar (estado 1) | "Cancelar" |
| Botão confirmar (estado 1) | "Confirmar Geração" |
| Loading text | "Gerando boleto junto à EFI Bank…" |
| Heading sucesso | "Boleto Gerado com Sucesso" |
| Label linha digitável | "Linha Digitável" |
| Botão copiar (estado neutro) | "Copiar" (ícone bi-clipboard) |
| Botão copiar (pós-cópia, 2s) | "Copiado! ✔" |
| Botão abrir boleto | "Abrir Boleto" (ícone bi-box-arrow-up-right) |
| Botão fechar (estado sucesso) | "Fechar" |
| Erro genérico API | "Não foi possível gerar o boleto. Verifique a conexão e tente novamente." |
| Erro data passada (API 400) | "A data de vencimento informada já passou. Informe uma data futura." |
| Botão tentar novamente (erro) | "Tentar Novamente" |
| Botão cancelar (erro) | "Cancelar" |
| Barra de ações — contador | "{N} título(s) selecionado(s) — {formatBRL(total)}" |
| Barra de ações — botão trigger | "Gerar Boleto" (ícone bi-receipt) |

Nenhuma ação destrutiva nesta fase. O botão "Cancelar" não destrói dados — apenas fecha o modal. Nenhuma confirmação adicional necessária para cancelar.

---

## Interações e Acessibilidade

| Interação | Especificação |
|-----------|---------------|
| Fechar com ESC | `useEffect` com `keydown` listener — fecha modal nos estados 1, 3, 4 (não no estado 2/loading) |
| Focus trap | Ao abrir o modal, `focus()` no primeiro elemento interativo (campo de data ou botão "Abrir Boleto") |
| aria-modal | `role="dialog" aria-modal="true"` no `.boleto-modal-card` |
| aria-label modal | `aria-label="Gerar Boleto Bancário"` |
| aria-live sucesso | `<div role="status" aria-live="polite">` envolvendo o estado de sucesso |
| aria-live erro | `<div role="alert" aria-live="assertive">` envolvendo o estado de erro |
| Spinner acessível | `<span class="visually-hidden">Gerando boleto...</span>` dentro do spinner |
| Touch target copiar | `min-width: 44px; min-height: 44px` no botão copiar |
| Estado indeterminado | Checkbox "Selecionar todos" já usa `ref.current.indeterminate` — manter comportamento |

---

## Tokens de Animação

| Transição | Valor | Uso |
|-----------|-------|-----|
| Entrada do modal | `opacity 0→1 em 150ms ease-out` + `translateY(8px→0)` | Backdrop + card aparecem juntos |
| Troca de estado interno | Sem animação — troca imediata (simplicidade) | Loading, sucesso, erro |
| Feedback de cópia | Estado React com `setTimeout(2000)` — sem CSS transition | Texto "Copiado! ✔" |

---

## Componentes Bootstrap Usados

| Componente | Classe Bootstrap | Estado |
|------------|-----------------|--------|
| Modal overlay | Custom (`.boleto-modal-backdrop`) | Novo — padrão do projeto |
| Alert | `.alert.alert-danger`, `.alert.alert-info` | Existente no projeto |
| Spinner | `.spinner-border.text-primary` | Existente no projeto |
| Badge | `.badge.bg-info.text-dark`, `.badge.bg-danger` | Existente na página |
| Botões | `.btn.btn-primary`, `.btn.btn-success`, `.btn.btn-warning`, `.btn.btn-outline-secondary` | Existente |
| Input | `.form-control` | Existente |
| Form label | `.form-label.fw-semibold` | Existente |
| Invalid feedback | `.invalid-feedback` (com `.is-invalid` no input) | Existente |
| Card | `.card.border-0.shadow-sm` | Existente na página |
| Close button | `.btn-close` | Bootstrap nativo |

Nenhum componente de terceiros. Registry safety gate: não aplicável.

---

## Estilos Inline do Modal

Adicionar ao bloco `<style>` existente na página (mantém padrão do projeto):

```css
.boleto-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
  padding: 1rem;
  animation: fadeIn 150ms ease-out;
}
.boleto-modal-card {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 18px 30px rgba(12, 27, 42, 0.15);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  animation: slideUp 150ms ease-out;
}
.boleto-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #ececec;
  background: #f8fafb;
  border-radius: 10px 10px 0 0;
  flex-shrink: 0;
}
.boleto-modal-body {
  padding: 24px;
  flex: 1;
}
.boleto-modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid #ececec;
  flex-shrink: 0;
}
.boleto-linha-digitavel {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.85rem;
  background: #f5f5f5;
  border: 1px solid #ececec;
  border-radius: 6px;
  padding: 8px 12px;
  word-break: break-all;
}
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes slideUp { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
```

---

## Registry Safety

| Registry | Blocos Usados | Safety Gate |
|----------|---------------|-------------|
| shadcn official | nenhum — não aplicável | não aplicável |
| Bootstrap 5.3.2 CDN | CSS + JS bundle | CDN oficial jsdelivr — já em uso no projeto |
| Bootstrap Icons 1.11.1 CDN | Font CSS | CDN oficial jsdelivr — já em uso no projeto |

Nenhum registry de terceiros declarado. Registry safety gate não executado (não necessário).

---

## Decisões Pré-Populadas por Fonte

| Decisão | Fonte | Valor Adotado |
|---------|-------|---------------|
| Framework de UI | page.tsx detectado | Bootstrap 5.3.2 + Bootstrap Icons 1.11.1 |
| Padrão de modal | orcamento/[id]/page.tsx (pdf-modal-backdrop) | Custom React state overlay, sem Bootstrap Modal JS |
| Paleta de cores | colors_and_type.css | Tokens --surface, --danger, --success, --accent |
| Tipografia | colors_and_type.css | --font-ui, --fs-sm/base/lg/xl, --fw-regular/semibold/bold |
| Escala de espaçamento | colors_and_type.css + Bootstrap | --space-4 (16px), --space-6 (24px) como base |
| Botão trigger "Gerar Boleto" | page.tsx linha 297 | `btn btn-warning` com `bi-receipt` — não alterar |
| Validação de datas | CONTEXT.md D-06 | Datas iguais → pré-preencher readonly; diferentes → campo vazio + alert danger |
| Campos de resposta | CONTEXT.md D-13 | linkBoleto + barcodeLinhaDigitavel + valor + expireAt |
| Ação do link | CONTEXT.md D-20 | target="_blank" — abre em nova aba |
| Idioma | MEMORY.md + design system | Português brasileiro, Title Case em ações |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
