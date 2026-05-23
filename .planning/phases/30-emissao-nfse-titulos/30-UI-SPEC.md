---
phase: 30
slug: emissao-nfse-titulos
status: draft
shadcn_initialized: false
preset: none
created: 2026-05-23
---

# Phase 30 — UI Design Contract
# Emissão de NFS-e a partir de Títulos

> Contrato visual e de interação para o modal de emissão de NFS-e acionado pela página
> `/contas-receber/[idcliente]`. Gerado por gsd-ui-researcher.
> Modelo: modal boleto da Phase 29 (29-UI-SPEC.md) — replicar estrutura com variações de NFS-e.

---

## Design System

| Property | Value | Source |
|----------|-------|--------|
| Tool | none — Bootstrap 5.3 puro | page.tsx detectado (linhas 264–278) |
| Preset | não aplicável | sem components.json |
| Component library | Bootstrap 5.3.2 via CDN jsdelivr | page.tsx linha 273 |
| Icon library | Bootstrap Icons 1.11.1 via CDN jsdelivr | page.tsx linha 269 |
| Font | Inter → Segoe UI → system-ui (sem webfont carregado) | colors_and_type.css --font-ui |
| Design tokens | .claude/skills/bom-custo-design/colors_and_type.css | SKILL.md |

shadcn **não aplicável**: stack é Next.js App Router com Bootstrap 5.3, não Radix/Tailwind.
Nenhuma inicialização de shadcn necessária ou recomendada para esta fase.

---

## Spacing Scale

Idêntico ao Phase 29 — alinhado com Bootstrap spacing + tokens do design system (rem a 16px base):

| Token | Valor | Equivalente Bootstrap | Uso no modal NFS-e |
|-------|-------|-----------------------|--------------------|
| xs | 4px | `gap-1` | Ícone ↔ texto inline, badge ↔ número NFS-e |
| sm | 8px | `gap-2`, `p-2` | Gap entre botões do footer, espaço entre badges |
| md | 16px | `p-3`, `gap-3` | Padding padrão do corpo do modal |
| lg | 24px | `p-4` | Padding do cabeçalho e rodapé do modal |
| xl | 32px | `mb-4`, `mt-4` | Separação entre blocos internos do modal |
| 2xl | 48px | — | Não usado no modal |
| 3xl | 64px | — | Não usado no modal |

Exceções:
- Barra de ações sticky: `padding: 12px 16px` — mantém padrão já implementado em page.tsx linha 536
- Botão trigger "Emitir NFS-e" na barra de ações: sem exceção de tamanho (padrão `btn`)

---

## Typography

Escala do `colors_and_type.css` mapeada para tamanhos Bootstrap equivalentes.
Pesos ativos: **400 (--fw-regular)** e **600 (--fw-semibold)** — máximo 2 pesos.
`--fw-bold` (700) **não declarado nesta fase** — não usar `.fw-bold` ou `font-weight: 700` no modal.

| Papel | CSS var | Aprox. px | Weight | Line Height | Uso no modal NFS-e |
|-------|---------|-----------|--------|-------------|---------------------|
| Body | --fs-base (1.05rem) | ~17px | 400 (--fw-regular) | 1.5 (--lh-normal) | Texto descritivo, rótulos de campo, observações |
| Label/Small | --fs-sm (0.95rem) | ~15px | 400 (--fw-regular) | 1.5 | Valores secundários, lista de títulos no resumo, hints |
| Heading | --fs-lg (1.35rem) | ~22px | 600 (--fw-semibold) | 1.3 (--lh-snug) | Título do modal "Emitir NFS-e" |
| Display/Valor | --fs-xl (1.7rem) | ~27px | 600 (--fw-semibold) | 1.15 (--lh-tight) | Valor total da NFS-e em destaque no bloco de resumo |

Regras adicionais:
- Número da NFS-e no estado de sucesso: `--fs-lg`, `--fw-semibold`, cor `--success`
- Número do RPS no estado de sucesso: `--fs-sm`, `--fw-regular`, cor `--ink-soft`
- Classes Bootstrap equivalentes: `.fw-semibold`, `.small`, `.fs-5`, `.text-muted`
- Valores monetários: sempre `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`

---

## Color

| Papel | Valor hex | Var CSS | Uso no modal NFS-e |
|-------|-----------|---------|---------------------|
| Dominant (60%) | `#ffffff` | --surface | Fundo do card do modal |
| Secondary (30%) | `#f9f7ed` | --bg | Backdrop por trás do overlay, cabeçalho do modal (fundo do `.nfse-modal-header`) |
| Accent (10%) | `#0d6efd` | --accent | Botão "Confirmar Emissão" no estado de confirmação |
| Destrutivo | `#ee3537` | --danger | Estado de erro da API; aviso de duplicidade de NFS-e (alert-danger) |
| Sucesso | `#1a7f37` | --success | Estado de sucesso pós-emissão (ícone, heading, número da NFS-e) |
| Aviso (warning) | `#fd7e14` | --accent-warm | Alert de produto físico (alert-warning); botão trigger "Emitir NFS-e" na barra de ações usa `btn-primary` (não warning — ver nota abaixo) |
| Info | `#0d6efd` bg `#f0f4ff` | --info-bg | Campos readonly pré-preenchidos (badge "Preenchido automaticamente") |

**Nota — botão trigger:** O botão "Emitir NFS-e" na barra de ações usa `btn btn-primary` (azul `--accent`),
diferenciando-se visualmente do "Gerar Boleto" (`btn btn-warning`). Isso mantém o padrão já implementado
em page.tsx linha 560.

Accent (`#0d6efd`) reservado para:
- Botão "Confirmar Emissão" no estado de confirmação (único CTA primário do modal)
- Botão trigger "Emitir NFS-e" na barra de ações sticky

Overlay do modal: `rgba(0, 0, 0, 0.55)` — idêntico ao `.boleto-modal-backdrop`.

Mapeamento Bootstrap → token:
- `btn-primary` = `--accent` (#0d6efd) — botão trigger + confirmação
- `btn-success` = `--success` (#1a7f37) — botão "Fechar" no estado de sucesso (estilo positivo)
- `alert-warning` = fundo `#fff3cd`, borda `#ffc107` — aviso de produto físico
- `alert-danger` = `--danger-bg` (#ffefef) com texto `--danger` — duplicidade + erro

---

## Estrutura de Estados do Modal

O modal NFS-e replica a estrutura 3-estados do CONTEXT.md D-14 dentro do mesmo overlay React
(`nfse-modal-backdrop` / `nfse-modal-card`), sem Bootstrap Modal JS.

### Estado 1 — Confirmação (estado inicial)

Ativado por: clique em "Emitir NFS-e" na barra de ações (≥1 título selecionado).

Ao abrir o modal, **antes de mostrar o estado confirm**, executar em paralelo:
1. Calcular `totalSelecionado` (soma dos títulos selecionados) e pré-preencher campo de valor.
2. Se `titulosSelecionados[0].idvenda` não for null: `GET /api/athos/venda/:idvenda/tipo-produto`
   para determinar `avisoFisico`. Exibir modal mesmo se a chamada falhar (aviso = false por padrão).

**Elementos obrigatórios:**

| Elemento | Especificação |
|----------|---------------|
| Título do modal | `<h5>` — "Emitir NFS-e" com ícone `bi-file-earmark-text` à esquerda |
| Subtítulo | `<small class="text-muted">` — "{N} título(s) selecionado(s)" |
| Bloco de resumo | Card `border-0 shadow-sm` com: Valor Total (--fs-xl fw-semibold), lista dos títulos (numerotitulo + valor, classe `.small`) |
| Campo de valor | `<input type="number" step="0.01" min="0.01">` com label "Valor da NFS-e (R$)"; pré-preenchido com `totalSelecionado.toFixed(2)`; editável pelo operador (NFR-02) |
| Aviso produto físico | `alert alert-warning d-flex gap-2` — visível SOMENTE quando `avisoFisico === true`; texto: "Este título contém produtos físicos que precisam de NF-e de produto. A NFS-e cobrirá apenas os itens de serviço." com ícone `bi-exclamation-triangle-fill`; NÃO bloqueia a emissão (D-03) |
| Aviso duplicidade | `alert alert-danger d-flex gap-2` — visível SOMENTE quando a API retorna 400 com mensagem de duplicidade; texto da mensagem da API (ex: "NFS-e já emitida para esta venda (Nº 1234)") |
| Campo descrição do serviço | `<textarea rows="2" class="form-control">` com label "Descrição do Serviço"; opcional — se vazio, o backend usa fallback padrão |
| Dados do tomador | Bloco somente-leitura abaixo do resumo: nome do cliente + documento (carregado via `dadosCliente.nome_cliente`); estilo `text-muted small`; label "Tomador" |
| Botão cancelar | `btn btn-outline-secondary` — "Cancelar" — fecha o modal sem chamada à API |
| Botão confirmar | `btn btn-primary` — "Confirmar Emissão" com ícone `bi-check-lg` — desabilitado se campo valor vazio, zero, ou negativo |

**Comportamento do campo de valor:**
- Pré-preenchido com `totalSelecionado.toFixed(2)` ao abrir o modal.
- `readOnly={false}` — sempre editável conforme D-15 e NFR-02.
- Validação: `parseFloat(nfseValor) > 0` — botão "Confirmar Emissão" desabilitado se false.
- Exibir `invalid-feedback` abaixo: "Informe um valor maior que zero." quando inválido.

### Estado 2 — Loading (chamada à API em andamento)

Ativado por: clique em "Confirmar Emissão".

| Elemento | Especificação |
|----------|---------------|
| Spinner | `<div class="spinner-border text-primary">` centralizado — tamanho padrão (não `spinner-border-sm`) |
| Texto | `<p class="mt-3 text-muted">` — "Emitindo NFS-e..." |
| Botões | Ocultos durante o loading (não apenas desabilitados) |
| Backdrop | Não clicável durante loading (prevenir fechamento acidental) |
| ESC key | Ignorado durante loading — ESC handler não deve fechar o modal no estado "loading" |

### Estado 3 — Sucesso

Ativado por: resposta 2xx da API com payload `{ nfseEmitidaId, numeroNfse, numeroRps, valor }`.

| Elemento | Especificação |
|----------|---------------|
| Ícone de sucesso | `bi-check-circle-fill` tamanho `fs-1` (2rem), cor `--success` (#1a7f37), centralizado |
| Heading | `<h5 class="fw-semibold text-success">` — "NFS-e Emitida com Sucesso" |
| Bloco de dados | Card `border-0 bg-light` com: Número da NFS-e (--fs-lg fw-semibold, cor text-success), Número do RPS (--fs-sm text-muted), Valor (formatBRL — --fs-xl fw-semibold) |
| Número da NFS-e | Label "Número da NFS-e" + valor em destaque com ícone `bi-hash` |
| Número do RPS | Label "RPS" + valor, fonte small text-muted |
| Botão fechar | `btn btn-success` — "Fechar" — fecha o modal; ao fechar, recarregar lista de títulos (refetch para atualizar badge NFS-e nos títulos) |

**Nota:** Não há botão de "Copiar número NFS-e" — o número é curto e legível. O operador pode selecioná-lo manualmente se necessário.

### Estado 4 — Erro

Ativado por: resposta não-2xx da API ou exceção de rede.

| Elemento | Especificação |
|----------|---------------|
| Alert | `alert alert-danger d-flex gap-2` com ícone `bi-exclamation-triangle-fill` |
| Mensagem principal | Texto da resposta API (`data.message ?? data.error`) se disponível; senão: "Não foi possível emitir a NFS-e. Verifique a conexão e tente novamente." |
| Detalhe técnico | `<small class="text-muted d-block mt-1">` — exibe status HTTP (ex: "HTTP 400") para facilitar diagnóstico |
| Botão tentar novamente | `btn btn-warning` — "Tentar Novamente" — retorna para Estado 1 com os mesmos dados (valor, descrição preservados) |
| Botão fechar | `btn btn-outline-secondary` — "Cancelar" — fecha o modal |

---

## Estrutura DOM do Modal

```
div.nfse-modal-backdrop (position: fixed, inset: 0, z-index: 1050, backdrop rgba(0,0,0,0.55))
  div.nfse-modal-card (bg: #fff, border-radius: 10px, shadow-lg, max-width: 520px, width: calc(100% - 2rem))
    div.nfse-modal-header (flex, space-between, border-bottom: 1px solid #ececec, padding: 16px 24px, bg: #f9f7ed)
      h5.nfse-modal-title (ícone + "Emitir NFS-e")
      button.btn-close (fecha modal — somente em estados 1, 3, 4)
    div.nfse-modal-body (padding: 24px)
      [conteúdo do estado ativo]
    div.nfse-modal-footer (flex, gap-2, justify-content: flex-end, padding: 16px 24px, border-top: 1px solid #ececec)
      [botões do estado ativo]
```

Notas de implementação:
- Modal implementado via estado React: `useState<"idle" | "confirm" | "loading" | "success" | "error">("idle")`
- Nomear classes CSS com prefixo `nfse-modal-*` (não reutilizar `.boleto-modal-*` — modais coexistem na mesma página)
- Fechar modal: ESC key + botão explícito; NÃO fechar ao clicar no backdrop durante `loading`
- `max-width: 520px` — idêntico ao modal boleto
- `max-height: calc(100vh - 2rem)` com `overflow-y: auto` — suporte a viewports pequenas

---

## Estados React Necessários

```typescript
// Estado do modal NFS-e — adicionar em page.tsx
const [nfseModalState, setNfseModalState] = useState<"idle" | "confirm" | "loading" | "success" | "error">("idle");
const [nfseValor, setNfseValor] = useState(""); // valor editável pelo operador (string para input)
const [nfseDescricao, setNfseDescricao] = useState(""); // descrição do serviço (opcional)
const [nfseAvisoFisico, setNfseAvisoFisico] = useState(false); // aviso produto físico
const [nfseResult, setNfseResult] = useState<{
  nfseEmitidaId: number;
  numeroNfse: string;
  numeroRps: number;
  valor: number;
} | null>(null);
const [nfseErro, setNfseErro] = useState("");
const [nfseErroDetalhe, setNfseErroDetalhe] = useState("");
```

---

## Badge de NFS-e na Tabela de Títulos

Além do modal, a coluna "NF" da tabela de títulos livres já exibe badges de NF-e e NFS-e
(implementado em page.tsx linhas 492–498). A Fase 30 não altera essa renderização — o badge
`bg-success` para NFS-e já está correto. O refetch após fechar o modal com sucesso atualizará
naturalmente os badges.

**Discretionary (Claude's Discretion):** Se um título tiver NFS-e emitida (`tipoNf === "NFS-e"`),
o badge deve exibir `NFS-e #${t.numeroNf}` — esse comportamento já está implementado em page.tsx
linha 496. Nenhuma alteração necessária na coluna NF.

---

## Copywriting Contract

| Elemento | Texto |
|----------|-------|
| Título do modal | "Emitir NFS-e" |
| Subtítulo dinâmico | "{N} título(s) selecionado(s) — {formatBRL(total)}" |
| Label campo valor | "Valor da NFS-e (R$)" |
| Hint campo valor | "Pré-preenchido com a soma dos títulos. Você pode editar antes de confirmar." |
| Erro valor inválido | "Informe um valor maior que zero." |
| Label descrição serviço | "Descrição do Serviço (opcional)" |
| Placeholder descrição | "Ex: Prestação de serviços gráficos conforme pedido(s) {numeroordem}" |
| Label tomador | "Tomador" |
| Aviso produto físico | "Este título contém produtos físicos que precisam de NF-e de produto. A NFS-e cobrirá apenas os itens de serviço." |
| Aviso duplicidade | Mensagem retornada pela API, ex: "NFS-e já emitida para esta venda (Nº 1234). Consulte o histórico." |
| Botão cancelar (estado 1) | "Cancelar" |
| Botão confirmar (estado 1) | "Confirmar Emissão" (ícone bi-check-lg) |
| Loading text | "Emitindo NFS-e..." |
| Heading sucesso | "NFS-e Emitida com Sucesso" |
| Label número NFS-e | "Número da NFS-e" |
| Label RPS | "RPS" |
| Botão fechar (estado sucesso) | "Fechar" |
| Erro genérico API | "Não foi possível emitir a NFS-e. Verifique a conexão e tente novamente." |
| Erro duplicidade (API 400) | Texto da API — formato: "NFS-e já emitida para esta venda (Nº {numero})." |
| Botão tentar novamente (erro) | "Tentar Novamente" |
| Botão cancelar (erro) | "Cancelar" |
| Barra de ações — botão trigger | "Emitir NFS-e" (ícone bi-file-earmark-text) |
| Estado vazio (sem títulos) | "Nenhum título encontrado para este cliente." — já implementado (page.tsx linha 365) |
| Erro carregamento títulos | "Erro ao carregar títulos." — já implementado (page.tsx linha 363) |

Ações destrutivas nesta fase: **nenhuma**. A emissão de NFS-e é irreversível, mas não
destrutiva de dados existentes. Cancelamento de NFS-e está fora do escopo (deferred).
O botão "Confirmar Emissão" não requer diálogo de confirmação adicional — o modal inteiro
é a etapa de confirmação.

---

## Interações e Acessibilidade

| Interação | Especificação |
|-----------|---------------|
| Fechar com ESC | `useEffect` com `keydown` listener — fecha modal nos estados 1, 3, 4; ignorado no estado 2 (loading) |
| Focus trap | Ao abrir o modal (estado confirm): `focus()` no campo de valor (primeiro campo editável) |
| aria-modal | `role="dialog" aria-modal="true"` no `.nfse-modal-card` |
| aria-label modal | `aria-label="Emitir Nota Fiscal de Serviço"` |
| aria-live sucesso | `<div role="status" aria-live="polite">` envolvendo o estado de sucesso |
| aria-live erro | `<div role="alert" aria-live="assertive">` envolvendo o estado de erro |
| Spinner acessível | `<span class="visually-hidden">Emitindo NFS-e...</span>` dentro do `.spinner-border` |
| Aviso produto físico | `role="note"` no alert-warning — informativo, não alert assertivo |
| Campo valor required | `aria-required="true"` no input de valor |
| Backdrop click | Estados 1, 3, 4: fechar ao clicar no backdrop; estado 2: ignorar click no backdrop |

---

## Tokens de Animação

Idênticos ao modal boleto (Phase 29) — reutilizar as mesmas `@keyframes`:

| Transição | Valor | Uso |
|-----------|-------|-----|
| Entrada do modal | `opacity 0→1 em 150ms ease-out` + `translateY(8px→0)` | `.nfse-modal-backdrop` + `.nfse-modal-card` aparecem juntos |
| Troca de estado interno | Sem animação — troca imediata | Loading, sucesso, erro |
| Nenhum feedback de cópia | Não aplicável | Não há botão copiar neste modal |

---

## Componentes Bootstrap Usados

| Componente | Classe Bootstrap | Estado |
|------------|-----------------|--------|
| Modal overlay | Custom (`.nfse-modal-backdrop`) | Novo — mesmo padrão de `.boleto-modal-backdrop` |
| Alert warning | `.alert.alert-warning.d-flex.gap-2` | Novo uso nesta fase (aviso produto físico) |
| Alert danger | `.alert.alert-danger.d-flex.gap-2` | Existente no projeto |
| Spinner | `.spinner-border.text-primary` | Existente no projeto |
| Badge NFS-e | `.badge.bg-success` | Existente na tabela de títulos (page.tsx l.494) |
| Botões | `.btn.btn-primary`, `.btn.btn-success`, `.btn.btn-warning`, `.btn.btn-outline-secondary` | Existente |
| Input número | `.form-control` com `type="number"` | Existente |
| Textarea | `.form-control` com `rows="2"` | Existente |
| Form label | `.form-label.fw-semibold.small` | Existente |
| Invalid feedback | `.invalid-feedback` (com `.is-invalid` no input) | Existente |
| Card | `.card.border-0.shadow-sm` / `.card.border-0.bg-light` | Existente na página |
| Close button | `.btn-close` | Bootstrap nativo |

Nenhum componente de terceiros. Registry safety gate: não aplicável.

---

## Estilos CSS do Modal

Adicionar ao bloco `<style>` existente na página (após os estilos `.boleto-modal-*`):

```css
.nfse-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1051; /* 1 acima do boleto-modal-backdrop para coexistência sem conflito */
  padding: 1rem;
  animation: fadeIn 150ms ease-out; /* reutiliza @keyframes fadeIn já declarado */
}
.nfse-modal-card {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 18px 30px rgba(12, 27, 42, 0.15);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  animation: slideUp 150ms ease-out; /* reutiliza @keyframes slideUp já declarado */
}
.nfse-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #ececec;
  background: #f9f7ed;
  border-radius: 10px 10px 0 0;
  flex-shrink: 0;
}
.nfse-modal-body {
  padding: 24px;
  flex: 1;
}
.nfse-modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid #ececec;
  flex-shrink: 0;
}
```

**Nota `z-index: 1051`:** O `boleto-modal-backdrop` usa `z-index: 1050`. Como os dois modais
nunca estarão abertos simultaneamente (a barra de ações exige seleção ativa e o operador aciona
um de cada vez), o valor `1051` é preventivo. Ambos podem usar `1050` se o executor confirmar
que não há coexistência.

---

## Registry Safety

| Registry | Blocos Usados | Safety Gate |
|----------|---------------|-------------|
| shadcn official | nenhum — não aplicável | não aplicável |
| Bootstrap 5.3.2 CDN | CSS + JS bundle | CDN oficial jsdelivr — já em uso no projeto desde Phase 28 |
| Bootstrap Icons 1.11.1 CDN | Font CSS | CDN oficial jsdelivr — já em uso no projeto |

Nenhum registry de terceiros declarado. Registry safety gate não executado (não necessário).

---

## Decisões Pré-Populadas por Fonte

| Decisão | Fonte | Valor Adotado |
|---------|-------|---------------|
| Framework de UI | page.tsx detectado | Bootstrap 5.3.2 + Bootstrap Icons 1.11.1 |
| Padrão de modal | 29-UI-SPEC.md + page.tsx (boleto-modal-*) | Custom React state overlay, sem Bootstrap Modal JS |
| Paleta de cores | colors_and_type.css | Tokens --surface, --danger, --success, --accent, --warn |
| Tipografia | colors_and_type.css | --font-ui, --fs-sm/base/lg/xl, --fw-regular/semibold (2 pesos) |
| Escala de espaçamento | 29-UI-SPEC.md + colors_and_type.css | --space-4 (16px), --space-6 (24px) como base |
| Modal 3 etapas | CONTEXT.md D-14 | confirm → loading → success (+ error como estado 4) |
| Valor pré-preenchido editável | CONTEXT.md D-15 + NFR-02 | `totalSelecionado.toFixed(2)`, `readOnly={false}` |
| Dados do tomador | CONTEXT.md D-16 | Nome via `dadosCliente.nome_cliente` já disponível na página |
| Aviso produto físico | CONTEXT.md D-02, D-03 | alert-warning, não bloqueia emissão |
| Verificação duplicidade | CONTEXT.md D-08 | alert-danger com mensagem da API, retorna ao estado 1 |
| Botão trigger | page.tsx linha 560 | `btn btn-primary` com `bi-file-earmark-text` — não alterar |
| Payload de sucesso | CONTEXT.md D-11 + RESEARCH.md Pattern 1 | `{ nfseEmitidaId, numeroNfse, numeroRps, valor }` |
| Refetch após sucesso | Claude's Discretion | Recarregar lista de títulos ao fechar modal de sucesso |
| Idioma | MEMORY.md + design system | Português brasileiro, Title Case em ações |
| Prefixo CSS | Conflito com .boleto-modal-* | Prefixo `.nfse-modal-*` para coexistência sem colisão |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
