---
phase: "52"
slug: "chatwoot-csat-com-recompensa-e-convite-do-google"
status: draft
shadcn_initialized: false
preset: none
created: "2026-11-22"
---

# Phase 52 — UI Design Contract

> Contrato visual e de interação das 4 superfícies da fase 52: pesquisa pública (`/pesquisa/[token]`), aba
> "Pesquisa e recompensa" em `/configuracoes`, painel de resultados (mesma aba) e tela "Cupons" para o balcão.
> Gerado por gsd-ui-researcher. Copy em português do Brasil; identificadores técnicos em inglês.

**Fontes aplicadas:** `52-CONTEXT.md` (decisões travadas), `memory/project_fase52_csat_recompensa.md`,
skill `bom-custo-design` (SKILL.md, README.md, colors_and_type.css), skill `ui-ux-pro-max` (SKILL.md,
regras de pro-rules e busca `--domain ux`), e o código atual: `apps/frontend/src/app/layout.tsx`,
`contas-receber/admin-shell.tsx`, `configuracoes/cobranca/page.tsx`, `app/globals.css`,
`components/password-gate.tsx`, `lib/empresa-config.ts`, `lib/empresa.tsx`,
`orcamento/[id]/approve/page.tsx` (precedente público, não copiado — ver UI-D02).

---

## Orientação das skills e conflitos resolvidos

| Fonte | Orientação aplicada | Onde |
|-------|---------------------|------|
| bom-custo-design (README, Content fundamentals) | Português direto e transacional; ações em Title Case ("Enviar Avaliação"); moeda `pt-BR` BRL; telefone normalizado `(12) 99648-4918`; sem emoji (usar `bi-*`) | Copywriting, Typography, Ícones |
| bom-custo-design (Iconography) | Bootstrap Icons 1.11.1 via CDN; nunca SVG inventado. Os nomes novos foram conferidos no CSS do 1.11.1 | Seções 1 e 2 |
| bom-custo-design (Placement rules) | Logo sempre em tile branco com raio pequeno e padding; primária com no mínimo 64 px | Página pública, cabeçalho |
| bom-custo-design (colors_and_type.css) | `--accent #0d6efd` é a cor padrão de `EMPRESA_COR_PRIMARIA`; `--success #1a7f37` (5,08:1) usado no texto das pílulas; `--radius-md 8px` e `--radius-lg 10px` | Color, Spacing |
| bom-custo-design (SKILL.md "Painel") | **Conflito, não aplicado no admin.** Ver UI-D01 | Design System |
| ui-ux-pro-max (Forms & Feedback) | Loading, depois sucesso ou erro, em todo envio; label visível em todo campo (placeholder nunca é label); erro perto do campo | Interação, Copy |
| ui-ux-pro-max (pro-rules, prioridade 2) | Alvo de toque mínimo 44×44 px; espaçamento de 8 px entre alvos | Public page |
| ui-ux-pro-max (Accessibility, prioridade 1) | Contraste mínimo 4,5:1 para texto; botão de ícone sempre com `aria-label`; foco visível | Color, Acessibilidade |
| ui-ux-pro-max (Mobile Keyboards, Viewport, 100vh) | `inputmode="decimal"` em valores; viewport padrão do Next.js sem bloquear zoom; `min-height` com `dvh` e não `100vh` | Responsivo |
| ui-ux-pro-max (Table Handling) | Tabelas largas com scroll horizontal, não quebram o layout | Resultados, Cupons |
| ui-ux-pro-max (Compact Control Semantics) | Controles de escolha como botão ou radio nativo com estado selecionado exposto (`checked` / `aria-pressed`), nunca `div` clicável | Nota, segmented |
| ui-ux-pro-max (Accessible Authentication) | Permitir colar e gerenciador de senha no PasswordGate | Cupons |

A busca `--domain ux` com a consulta "coupon voucher code redeem" devolveu um resultado não relacionado
(code splitting). Ele foi descartado e nenhuma regra de cupom foi tirada dele. As regras de cupom vêm
deste contrato e do código existente.

### Conflitos resolvidos (registrados em Decisões, seção final)

- **Tema:** o SKILL.md descreve o tema "Painel" (Mulish, teal `#0e6d73`). O admin real já usa `AdminShell` com
  classes `pa-*` (indigo `#3d42df`), e todas as áreas admin seguem esse padrão. Resolvido em UI-D01.
- **Página de aprovação existente** (`orcamento/[id]/approve`): hardcoda o gradiente pastel, o fundo creme e o botão
  sage `#7dc8aa`, que dá 2,04:1 com texto branco. Não serve de modelo para a página pública. Resolvido em UI-D02.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (sem shadcn; `apps/frontend/package.json` não tem biblioteca de componentes) |
| Preset | not applicable |
| Component library | Bootstrap 5.3.2 (CSS e JS via CDN, carregado por `RecursosBootstrap` nas telas admin; a página pública NÃO carrega Bootstrap, ver UI-D02) + `AdminShell` / classes `pa-*` do próprio projeto |
| Icon library | Bootstrap Icons 1.11.1 (CDN, `bootstrap-icons.css`). Os nomes novos (`emoji-*`, `star*`, `ticket-perforated`, `copy`, `shop`, `box-arrow-up-right`, `whatsapp`, `google`) foram conferidos no CSS 1.11.1 |
| Font | Stack de sistema: `--font-ui` de `colors_and_type.css` (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`). Sem webfont. Mulish do tema Painel NÃO é carregado. |

**Não há inventário de componentes**, porque o projeto não tem pacote de design system. A seção "Reuso de padrões
existentes" lista o que deve ser reaproveitado.

---

## Reuso de padrões existentes

Estes itens já existem no código. Reaproveitar, não recriar. Caminhos são relativos a `apps/frontend/src/`.

| Padrão | Arquivo | Uso nesta fase |
|--------|---------|----------------|
| `AdminShell` (sidebar, topbar, `pa-content`) | `app/contas-receber/admin-shell.tsx` | Todas as telas admin novas. Adicionar 2 itens em `PA_NAV_ITEMS` (ver Navegação) |
| `PasswordGate` (title, description) | `components/password-gate.tsx` | Aba de configuração (igual a `configuracoes/cobranca`) e tela Cupons. Mesmo cookie `orcamento_admin_session` |
| Classes `pa-card`, `pa-card-header`, `pa-card-body`, `pa-card-body-scroll` | `admin-shell.tsx` (bloco `<style>`) | Cards de seção |
| `pa-table`, `pa-th-sort`, `pa-td-cliente`, `pa-row-critico` | idem | Tabelas de respostas e cupons |
| `pa-pill`, `pa-pill-success`, `pa-pill-warning`, `pa-pill-secondary`, `pa-pill-danger` | idem | Situação de cupom e de resposta (ver Color, pílula de sucesso) |
| `pa-stat-grid`, `pa-stat`, `pa-stat-icon`, `pa-stat-value`, `pa-stat-value-*` | idem | Cartões do painel de resultados |
| `pa-seg`, `pa-seg-btn`, `pa-seg-btn-active` | idem | Abas "Configuração / Resultados" e filtro de situação |
| `pa-progress`, `pa-progress-bar-*` | idem | Gasto real vs teto mensal |
| `pa-actionbar`, `pa-btn-accent` | idem | Barra de salvar da configuração |
| `pa-empty`, `pa-empty-erro` | idem | Estados vazio e de erro |
| `pa-link-btn` | idem | Link "Ver relatório no Chatwoot" |
| Campos Bootstrap `form-control`, `form-label`, `form-switch`, `invalid-feedback`, `is-invalid` | `configuracoes/cobranca/page.tsx` | Campos da configuração (mesmo padrão do cobranca) |
| `lerNumero` (vírgula ou ponto decimal) e `formatarDataHora` (`America/Sao_Paulo`) | `configuracoes/cobranca/page.tsx` | Parsing e formatação de valores e datas |
| `MSG_SESSAO` ("Sessão expirada. Recarregue a página e digite a senha.") | idem | Erro 401 em todas as telas admin |
| Ref de envio único (`emEnvio`) | idem | Bloquear duplo envio |
| `useEmpresa()` / `getEmpresaConfig()` (`EMPRESA_NOME`, `EMPRESA_LOGO_URL`, `EMPRESA_COR_PRIMARIA`, `EMPRESA_WHATSAPP`) | `lib/empresa.tsx`, `lib/empresa-config.ts` | White-label da página pública e links de WhatsApp |
| Proxy `/api/admin/*` com `adminBackendFetch` | `lib/admin-backend-client.ts` | Todas as chamadas admin novas (segredo fica no servidor) |

---

## Spacing Scale

Valores declarados (todos múltiplos de 4 px):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Espaço entre ícone e texto em botões e pílulas |
| sm | 8px | Espaço entre alvos de toque (opções de nota), entre pílulas |
| md | 16px | Padding interno de card no celular, espaço entre campos |
| lg | 24px | Padding de card no desktop, espaço entre seções da página pública |
| xl | 32px | Espaço entre blocos principais (cupom e Google) |
| 2xl | 48px | Altura mínima de botão primário da página pública (48 px) |
| 3xl | 64px | Tile do logo da página pública (mínimo de 64 px para a marca primária) |

Exceções:

- 12px (múltiplo de 4) é permitido para padding interno de chip e para o botão compacto de copiar código.
- Os paddings `pa-*` existentes (ex.: `0.9rem`, `1.1rem`, `0.65rem`) são herdados do AdminShell e não são alterados nesta fase.
- Alvos de toque na página pública: 56×56 px nas opções de nota, 48 px de altura em botões e campos.

---

## Typography

Quatro tamanhos e dois pesos para o conteúdo novo. Pesos: 400 e 600.

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Caption | 0.8rem (12,8px) | 400 | 1.4 | Ajuda de campo, contador de caracteres, rótulos de nota, rodapé de LGPD e opt-out |
| Body | 1rem (16px) | 400 | 1.5 | Texto da página pública, campos de formulário (16px evita zoom automático no iOS), descrição de cards |
| Label / Heading | 1.25rem (20px) em títulos, 1rem com peso 600 em rótulos | 600 | 1.2 | Títulos de card, títulos da página pública, rótulos visíveis dos campos |
| Display | 2rem (32px) mobile 1.75rem | 600 | 1.1 | Código do cupom, nota média no painel |

Exceções herdadas (não são novos tamanhos ou pesos):

- `pa-*` existentes usam 0.72 a 0.9rem em rótulos, cabeçalhos e tabelas, e 1.05rem e 1.3rem em título e valores de
  stat. O peso 700 aparece no título da topbar e nos valores de stat. Não alterar.
- O `body` global de `globals.css` usa a fonte "Trebuchet MS". As telas admin herdam essa fonte porque `pa-*` não define
  `font-family`. Não alterar nesta fase.
- Números monetários e códigos usam `font-variant-numeric: tabular-nums`, e o código do cupom usa a fonte monoespaçada
  `--font-mono`.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | Admin `#f4f6fa` (`--pa-bg`) no fundo de página. Público `#ffffff` | Fundo de página |
| Secondary (30%) | Admin `#ffffff` em cards, `#1b2431` na sidebar. Público `#f4f6fa` no cupom e na faixa do Google | Cards, sidebar, blocos de apoio |
| Accent (10%) | Admin `#3d42df` (`--pa-accent`). Público `var(--cor-primaria)` (padrão `#0d6efd`) | Ver lista abaixo |
| Destructive | Texto de erro `#b02a37` (6,49:1). Ícone e borda de erro `#e5484d`. Não há ação destrutiva nesta fase | Somente erro e estado de falha |

**Accent reservado para (lista exaustiva):**

1. Botão primário de cada tela: "Enviar avaliação", "Salvar alterações", "Buscar cupom", "Confirmar uso".
2. Estado selecionado da nota (estrela ou carinha escolhida) e da aba ativa no `pa-seg`.
3. Borda esquerda do cartão do cupom na página pública.
4. Botão "Avaliar no Google" (versão de contorno, com texto na cor de accent).
5. Foco de teclado (`:focus-visible`, outline de 3 px com offset de 2 px).
6. Item ativo da navegação (já existente no AdminShell).
7. Links externos ("Ver relatório no Chatwoot").

Accent NÃO é usado em: títulos, valores de desconto, barras de progresso, pílulas de status e fundos.

**Contraste verificado** (razão WCAG 2.x calculada sobre os hex listados):

| Par | Razão | Resultado |
|-----|-------|-----------|
| `#6b7a90` sobre `#ffffff` (muted atual de `pa-stat-label` e `pa-topbar-subtitle`) | 4,36:1 | Falha para texto pequeno. Não usar nas telas novas |
| `#5b6778` sobre `#ffffff` (muted novo) | 5,74:1 | Passa. Usar para texto secundário |
| `#1eb564` sobre `#ffffff` (`pa-pill-success` atual) | 2,67:1 | Falha. Não usar em texto novo |
| `#1a7f37` sobre `#ffffff` (`--success`) | 5,08:1 | Passa. Texto da pílula de sucesso nas telas novas |
| `#e5484d` sobre `#ffffff` | 3,91:1 | Só para ícone e borda (exige 3:1) |
| `#c92a2a` sobre `#ffffff` | 5,46:1 | Alternativa para texto de erro admin (preferir `#b02a37` na página pública) |
| `#b02a37` sobre `#ffffff` | 6,49:1 | Texto de erro (ambas as superfícies) |
| `#3d42df` sobre `#ffffff` | 6,90:1 | Accent admin, com texto branco no botão |
| `#0d6efd` (padrão `EMPRESA_COR_PRIMARIA`) com texto branco | 4,50:1 | Passa, no limite |
| `#7dc8aa` com texto branco (botão da página de aprovação) | 2,04:1 | Falha. Não reutilizar |
| `#8a94a3` sobre `#ffffff` (borda de campo na página pública) | 3,07:1 | Passa para limite de componente de interface (3:1) |
| `#ced4da` (borda padrão do Bootstrap nos campos admin) | ~1,5:1 | Herdado. Anotado como pendência de acessibilidade, não alterado nesta fase |

Regras de uso: pílula de sucesso com texto `#1a7f37` sobre o fundo `rgba(30,181,100,0.14)` (que já existe no
`pa-pill-success`). A classe nova `pesquisa-pill-ok` usa `#1a7f37` como texto. A `pa-pill-success` atual fica como está,
com correção em tarefa separada.

Barra de progresso de teto: `pa-progress-bar-success` até 69%, `pa-progress-bar-warning` de 70% a 99%,
`pa-progress-bar-danger` a partir de 100%. O texto ao lado (valor e situação) carrega a informação, não só a cor.

**Checagem de cor primária da empresa:** `EMPRESA_COR_PRIMARIA` precisa passar 4,5:1 com texto branco. O padrão
`#0d6efd` passa (4,50:1). Cores customizadas são verificadas na implantação de cada empresa (ver UI Considerations).

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (pública) | Enviar avaliação |
| Primary CTA (configuração) | Salvar alterações |
| Primary CTA (cupons) | Buscar cupom (busca) e Marcar cupom como usado (resgate, com confirmação) |
| Empty state heading (resultados) | Nenhuma resposta ainda |
| Empty state body (resultados) | As respostas aparecem aqui depois que os clientes avaliarem o atendimento. |
| Empty state heading (cupons) | Nenhum cupom ainda |
| Empty state body (cupons) | Os cupons aparecem aqui depois que um cliente responder a pesquisa. |
| Error state (pública, envio) | Não foi possível enviar sua avaliação. Verifique sua conexão e tente de novo. Sua resposta foi mantida. |
| Error state (configuração, salvar) | Não foi possível salvar. Confira os campos destacados e tente de novo. |
| Error state (cupons, resgate) | Não foi possível registrar o uso. Não lance o desconto no Athos ou no PDV antes de confirmar que o cupom foi marcado como usado. |
| Destructive confirmation | Confirmar uso do cupom {código}: esta ação não pode ser desfeita. Lance o desconto de R$ {valor} no Athos ou no PDV antes de confirmar. |

### Página pública (`/pesquisa/[token]`)

| Elemento | Copy |
|----------|------|
| Título padrão (editável) | Como foi seu atendimento? |
| Subtítulo padrão (editável) | Leva menos de 1 minuto. Sua opinião ajuda a melhorar o atendimento. |
| Rótulo do grupo de nota (visível) | Qual nota você dá para o atendimento? |
| Ajuda do grupo | Toque em uma opção de 1 a 5. |
| Rótulos de nota (ambas as variantes) | 1 Muito ruim · 2 Ruim · 3 Regular · 4 Bom · 5 Excelente |
| Confirmação de seleção (aria-live) | Nota selecionada: {n} de 5 ({rótulo}). |
| Rótulo do comentário | Quer contar mais? (opcional) |
| Ajuda do comentário | Máximo de 500 caracteres. Contador: {n}/500 |
| Erro sem nota | Escolha uma nota de 1 a 5 antes de enviar. |
| Enviando | Enviando... |
| Erro de rede | (ver Error state acima) |
| Erro 5xx | Não foi possível registrar sua avaliação agora. Tente de novo em instantes. |
| Obrigado com cupom (título) | Obrigado pela sua avaliação! |
| Cupom (título do cartão) | Seu cupom |
| Cupom (linha 1) | {percentual} de desconto, até {teto} |
| Cupom (linha 2) | Compra mínima de {compra_minima} |
| Cupom (linha 3) | Válido até {dd/mm/aaaa} |
| Cupom (linha 4) | Uso único. Apresente o código no balcão ao fazer seu pedido. |
| Copiar | Copiar código |
| Copiado | Código copiado. |
| Obrigado sem recompensa | Obrigado por responder. Sua opinião é muito importante para nós. (texto editável) |
| Já respondida (título) | Sua avaliação já foi registrada |
| Já respondida (corpo) | Obrigado por responder. Se o cupom não chegou pelo WhatsApp, fale com a gente pelo WhatsApp. |
| Inválida, expirada ou desativada (título) | Esta pesquisa não está mais disponível |
| Inválida, expirada ou desativada (corpo) | O link expirou ou já não é válido. Se quiser falar com a gente, use o WhatsApp da loja. |
| Erro ao carregar (título) | Não foi possível carregar a pesquisa |
| Erro ao carregar (corpo) | Tente de novo em instantes. |
| Erro ao carregar (botão) | Tentar novamente |
| Bloco Google (título) | Quer compartilhar sua experiência? |
| Bloco Google (corpo) | Sua avaliação no Google ajuda outros clientes a nos conhecerem. |
| Bloco Google (nota legal, visível) | Deixar uma avaliação no Google é opcional e não altera seu cupom. |
| Botão Google | Avaliar no Google (abre em nova aba) |
| Opt-out (rodapé) | Não quer receber mais pesquisas? Responda SAIR no WhatsApp. |
| LGPD (rodapé) | Usamos sua resposta só para melhorar o atendimento. Guardamos por até 12 meses. (texto a validar pelo responsável) |

Cabeçalho da página pública: logo (`EMPRESA_LOGO_URL`) em tile branco de 64 px. Sem logo, ícone `bi-shop` no mesmo
tile. Nome: `EMPRESA_NOME`. Nenhum texto de marca fixo no código.

### Configuração (`/configuracoes/pesquisa`)

| Elemento | Copy |
|----------|------|
| Título da topbar | Pesquisa e recompensa |
| Subtítulo da topbar | Pesquisa de satisfação no fechamento e cupom de desconto |
| Abas | Configuração · Resultados |
| Interruptor | Pesquisa e recompensa ativas |
| Ajuda do interruptor (desligado) | Desligado: o fechamento não envia o link da pesquisa e nenhum cupom é emitido. |
| Ajuda do interruptor (ligado) | Vale para os próximos fechamentos. |
| Campo desconto | Desconto (%) — ajuda: Padrão sugerido nesta empresa: {padrão}%. |
| Campo teto | Teto de desconto por cupom (R$) — ajuda: Desconto máximo em reais por cupom. |
| Campo compra mínima | Compra mínima (R$) — ajuda: Compra mínima para usar o cupom. |
| Campo validade do cupom | Validade do cupom (dias) — ajuda: Contada a partir da emissão. |
| Campo validade do link | Validade do link da pesquisa (dias) — ajuda: Máximo de 14 dias. Limite do Chatwoot para aceitar a resposta. |
| Campo intervalo | Intervalo entre cupons do mesmo cliente (dias) — ajuda: Um cupom por telefone a cada {n} dias. |
| Campo teto mensal | Teto mensal de desconto (R$) — ajuda: Quando o desconto usado no mês chega a este valor, novos cupons deixam de ser emitidos. |
| Ajuda calculada do teto | Com estes valores, o teto por cupom é atingido a partir de R$ {teto ÷ desconto} de compra. |
| Campo prefixo | Prefixo do código — ajuda: Ex.: BOX ou BC. Seguido de 6 caracteres. |
| Campo link Google | Link de avaliação no Google — ajuda: Deixe vazio para não enviar o convite. |
| Aviso link vazio | Sem link do Google: o convite não será enviado nem exibido. |
| Campo variante | Variante visual — opções: Estrelas · Carinhas · Alternar (teste A/B) |
| Ajuda da variante | No teste A/B, cada pesquisa recebe uma variante ao acaso, 50% para cada. |
| Seção mensagens | Mensagens |
| Prévia | Prévia da mensagem (exemplo com valores de exemplo) |
| Salvo | Configurações salvas. |
| Não salvo | Alterações não salvas. |
| Botão descartar | Descartar alterações |
| Campos de mensagem: ajuda | Use {placeholders}. Disponíveis: {link}, {percentual}, {teto}, {compra_minima}, {validade}, {codigo}, {link_google}, {nome_empresa} |

Validações de mensagem (mensagem em português, no campo):

- "Inclua {link} para o cliente encontrar a pesquisa." (bloco do fechamento e bloco sem recompensa, obrigatório)
- "Não inclua link aqui. O convite do Google tem mensagem própria." (pós-resposta)
- "Inclua {codigo} para o cliente ver o cupom." (pós-resposta, quando a recompensa estiver ligada)
- "Campo {x} não existe. Use: {lista}." (placeholder desconhecido)
- "Remova emoji. Mensagens usam só texto." (qualquer caractere emoji)
- "Máximo de 600 caracteres." (qualquer texto de mensagem)

Validações de campo (pt-BR, reaproveitando o padrão de `lerNumero`):

- "Informe um número." (vazio ou texto)
- "Não pode ser negativo." (desconto, teto, compra mínima, teto mensal)
- "Máximo de 50%." (desconto), "Mínimo de 1%." (desconto)
- "Máximo de 14 dias." (validade do link), "Mínimo de 1 dia." (validade do cupom e do link)
- "Máximo de 180 dias." (validade do cupom)
- "Informe um link que comece com https://." (link do Google, quando preenchido)

### Painel de resultados (aba "Resultados")

| Elemento | Copy |
|----------|------|
| Período | Período: Mês atual · Últimos 30 dias · Todo o período |
| Cartão nota média | Nota média — "{média} de 5" — "{n} respostas" (singular: "1 resposta") |
| Cartão taxa de resposta | Taxa de resposta — "{x}%" — "{respondidas} de {enviadas} pesquisas enviadas" |
| Cartão cupons | Cupons emitidos — "{emitidos}" — "{usados} usados · {vencidos} vencidos" |
| Cartão gasto | Gasto real no mês — "R$ {gasto}" — "de R$ {teto} de teto" |
| Teto atingido | Teto atingido. Novos cupons estão suspensos até o mês seguinte. |
| Comparativo A/B (título) | Estrelas e carinhas |
| Amostra pequena | Amostra pequena: menos de 30 respostas por variante. Não compare as variantes ainda. |
| Distribuição (título) | Notas recebidas |
| Últimas respostas (título) | Últimas respostas |
| Comentário vazio | Sem comentário |
| Ver tudo | Ver tudo |
| Relatório | Ver relatório no Chatwoot (abre em nova aba) |
| Carregando | Carregando resultados... |
| Erro | Não foi possível carregar os resultados. |
| Erro (botão) | Tentar novamente |

### Cupons (`/cupons`)

| Elemento | Copy |
|----------|------|
| Título da topbar | Cupons |
| Subtítulo da topbar | Confira e dê baixa nos cupons de desconto no balcão |
| Campo de busca | Código do cupom (placeholder: Ex.: BOX-7K3Q9M, somente como exemplo) |
| Ajuda da busca | Digite ou cole o código completo. |
| Não encontrado | Cupom não encontrado. Confira se digitou o código completo. |
| Situação: disponível | Disponível |
| Situação: já usado | Já usado — "Usado em {dd/mm/aaaa, hh:mm}, desconto de R$ {valor}." |
| Situação: vencido | Vencido — "Venceu em {dd/mm/aaaa}. Não pode ser usado." |
| Situação: suspenso (teto) | Suspenso — "Teto mensal atingido. Pode ser usado a partir de {01/mm/aaaa}." |
| Situação: cancelado | Cancelado — "Este cupom foi cancelado e não pode ser usado." |
| Campos do cupom | Desconto · Teto · Compra mínima · Válido até · Cliente · Emitido em · Nota da pesquisa |
| Cliente mascarado | (dd) *****-1234 (apenas os 4 últimos dígitos) |
| Campo valor da compra | Valor da compra (R$) |
| Ajuda do valor | Valor antes do desconto. |
| Valor inválido | Informe o valor da compra. |
| Abaixo do mínimo | Compra mínima de R$ {minimo} não atingida. Este cupom não pode ser usado nesta compra. |
| Resumo | Subtotal R$ {x} · Desconto R$ {y} · Total com desconto R$ {z} |
| Teto aplicado | Limitado ao teto de R$ {teto}. |
| Arredondamento | Desconto arredondado para baixo, no centavo. |
| Confirmação (título) | Confirmar uso do cupom {código}? |
| Confirmação (botão) | Confirmar uso |
| Voltar | Voltar |
| Sucesso | Cupom marcado como usado. Lance o desconto de R$ {valor} no Athos ou no PDV. |
| Já usado (409) | Este cupom já foi usado. Atualize a busca. |
| Suspenso ao resgatar | Teto mensal atingido. Este cupom só pode ser usado a partir de {01/mm/aaaa}. |
| Filtros de situação | Todos · Disponíveis · Usados · Vencidos · Cancelados |
| Lista: colunas | Código · Emitido em · Cliente · Desconto · Validade · Situação · Usado em |
| Lista: sem situação | Nenhum cupom com esta situação. |
| Carregar mais | Carregar mais |
| Ver detalhes | Ver detalhes |
| Carregando | Buscando cupom... |
| Erro da lista | Não foi possível carregar os cupons. |
| Erro (botão) | Tentar novamente |

Plural: "1 cupom" e "2 cupons", "1 resposta" e "2 respostas". Valores com `pt-BR` BRL (`toLocaleString`),
percentuais sem casa decimal quando inteiros.

---

## Superfícies e estados

### 1. Pesquisa pública — `/pesquisa/[token]`

**Arquitetura da página:** rota Next.js com proxy server-side ao backend (`backendFetch`), no padrão de
`/cobranca/confirmar/[token]`. O estado inicial (pesquisa válida, respondida ou inválida) é resolvido no servidor. O
cliente recebe a página já renderizada e só o formulário é Client Component.

**Layout (mobile-first, 360 px de largura mínima):**

1. Cabeçalho: tile branco de 64 px com logo (ou `bi-shop`), `EMPRESA_NOME` ao lado em Label/Heading.
2. Card principal, fundo `#ffffff`, borda 1px `#e6e9f0`, raio 12px. Padding 16px no celular e 24px no desktop. Largura máxima 480 px, centralizado.
3. Título e subtítulo (padrão editável).
4. Grupo de nota (`<fieldset>` com `<legend>` visível). Cinco opções em grade `repeat(5, minmax(0, 1fr))`, com gap de 8px. Cada opção tem área de toque de 56×56 px. Rótulo de texto (Caption) embaixo de cada opção, com quebra de linha permitida.
5. Confirmação de seleção (aria-live, polite).
6. Comentário: label visível, textarea de 4 linhas, contador `{n}/500`.
7. Botão "Enviar avaliação", largura total, altura 48px, raio 8px.
8. Rodapé (Caption): LGPD e opt-out.

**Variantes A/B da nota (mesma estrutura, só o ícone muda):**

- Estrelas: `bi-star` (vazia) e `bi-star-fill` (preenchida até a nota escolhida). A seleção pinta as estrelas
  até a nota com a cor de accent.
- Carinhas: `bi-emoji-angry` (1), `bi-emoji-frown` (2), `bi-emoji-neutral` (3), `bi-emoji-smile` (4),
  `bi-emoji-laughing` (5). Em repouso ficam em `#5b6778`. Selecionada, fica na cor de accent.
- Ambas: os rótulos de texto ficam visíveis (ver Copy). O ícone sozinho não transmite a nota. Cada opção é um
  `<input type="radio">` nativo, visualmente oculto, com `<label>` ligado. Assim o teclado (setas) funciona sem código extra.
- Acessibilidade de cada opção: nome acessível "{n} de 5: {rótulo}" no próprio `<label>`. Os ícones têm `aria-hidden="true"`.

**Variante sorteada por pesquisa:** A variante é definida quando a pesquisa é criada (50/50 no modo Alternar) e
gravada na pesquisa. Recarregar a página mostra a mesma variante.

**Estados da página pública (um por vez, no mesmo lugar do card):**

| Estado | Aparência | Ações |
|--------|-----------|-------|
| Válida (formulário) | Card com título, nota, comentário e botão | Enviar avaliação |
| Enviando | Formulário desabilitado. Botão com spinner-border pequeno e texto "Enviando..." (mesma largura). `aria-busy="true"` no formulário | Nenhuma (bloqueado) |
| Erro de envio | Formulário preservado (nota e comentário). Alerta `role="alert"` acima do botão | Enviar avaliação de novo |
| Obrigado com cupom | Título, cartão do cupom (borda esquerda accent, fundo `#f4f6fa`), botão Copiar código, separador, bloco Google | Copiar código, Avaliar no Google |
| Obrigado sem recompensa | Título e texto de agradecimento (editável). Sem cartão de cupom. Bloco Google igual | Avaliar no Google |
| Já respondida | Título "Sua avaliação já foi registrada". NÃO mostra o código (ver UI-D06). Bloco Google | Avaliar no Google |
| Inválida, expirada ou desativada | Título e corpo genéricos (mesmo texto para os três casos). Botão WhatsApp se `EMPRESA_WHATSAPP` estiver definido | WhatsApp (se configurado) |
| Erro ao carregar | Título, corpo e botão "Tentar novamente" (recarrega a página) | Tentar novamente |

**Regras da tela de agradecimento:**

- Foco vai para o título "Obrigado..." depois do envio (`tabIndex={-1}`). Assim o leitor de tela anuncia o resultado.
- O cartão do cupom: código em Display (2rem, 600, monoespaçado), `overflow-wrap: anywhere`, cabe em 320 px.
  Botão "Copiar código" com `aria-label="Copiar código {código}"`. Depois de copiar, aparece "Código copiado." por 2s, em aria-live.
- O bloco do Google aparece para todos, em todos os estados de resposta. Ele é uma seção separada, com fundo `#f4f6fa`,
  sem nenhum texto que ligue a avaliação ao cupom. A frase "não altera seu cupom" é obrigatória.
- Botão Google: contorno de 2px em `var(--cor-primaria)`, texto na mesma cor, `target="_blank"` e `rel="noopener noreferrer"`.
  O botão só aparece quando o link do Google está configurado.
- Se o link do Google estiver vazio, o bloco inteiro some (sem título órfão).

**Estilos da página pública:**

- Classes com prefixo `pesquisa-` (ex.: `pesquisa-card`, `pesquisa-opcao`). O `globals.css` define classes genéricas
  (`.btn`, `.btn-primary` em terracota, `.card`, `.label`, `.value`, `.grid`, `.hero`, `.shell`) que colidiriam com
  nomes curtos. Também pinta o `body` com gradiente creme. Por isso o wrapper da página tem `background: #ffffff`,
  `min-height: 100dvh` (com fallback `100vh`).
- CSS da página é local (no próprio componente), sem Bootstrap CSS. Carrega só `bootstrap-icons.css` (um arquivo, CDN, 1.11.1).

### 2. Configuração — `/configuracoes/pesquisa` (aba "Configuração")

**Estrutura:** `AdminShell` com `activeHref="/configuracoes/pesquisa"`, dentro de `PasswordGate` (igual a
`configuracoes/cobranca`). Abas no topo do conteúdo: `pa-seg` com "Configuração" e "Resultados", estado em `?aba=`.

**Blocos (cards `pa-card`, empilhados, largura máxima 720px):**

1. **Situação:** interruptor "Pesquisa e recompensa ativas" (Bootstrap `form-switch`) e a ajuda que muda com o estado.
2. **Recompensa:** desconto (%), teto por cupom (R$), compra mínima (R$), validade do cupom (dias), intervalo entre cupons (dias), teto mensal (R$), prefixo do código. Ajuda calculada: "Com estes valores, o teto por cupom é atingido a partir de R$ X de compra." (Ex.: Box 10% e teto R$2 chegam ao teto em R$20; Bom Custo 10% e teto R$5 chegam em R$50.)
3. **Link e variante:** validade do link (dias, máximo 14), link do Google, variante visual (`pa-seg`: Estrelas · Carinhas · Alternar).
4. **Mensagens:** cinco textareas, uma por texto: bloco do fechamento, bloco sem recompensa, mensagem pós-resposta (WhatsApp com cupom, sem link), convite do Google (WhatsApp, com um link), textos da página (título, subtítulo, agradecimento sem recompensa, bloco Google). Ajuda de placeholders abaixo de cada campo, contador de caracteres à direita.
5. **Prévia:** renderiza o bloco do fechamento com valores de exemplo (ex.: "10%", "R$ 2,00", "22/12/2026", link de exemplo). Atualiza ao digitar, sem chamar o servidor. O servidor valida na hora de salvar.

**Valores padrão por empresa (preenchidos no primeiro acesso, editáveis):**

| Empresa | Desconto | Teto | Compra mínima | Teto mensal | Origem |
|---------|----------|------|---------------|-------------|--------|
| Box | 10% | R$ 2,00 | R$ 6,00 | R$ 300,00 | Env por instância ou primeiro acesso (planner escolhe) |
| Bom Custo | 10% | R$ 5,00 | R$ 30,00 | R$ 300,00 | idem |

Os demais padrões (validade do cupom 30 dias, validade do link 7 dias, intervalo 90 dias, prefixo) valem para as duas.

**Barra de salvar (`pa-actionbar`, sticky no rodapé):** "Salvar alterações" (accent) e "Descartar alterações"
(botão secundário), e à esquerda "Alterações não salvas." quando há diferença. Todas as mudanças, inclusive o
interruptor, só valem depois de salvar. Motivo: evitar que uma tecla acidental ligue o fechamento com recompensa.

**Saída com alterações pendentes:** `beforeunload` pede confirmação do navegador. (O `configuracoes/cobranca` atual
não faz isso; esta fase cria o padrão.)

**Bloqueio de salvar:** o botão "Salvar alterações" fica desabilitado enquanto houver erro de campo, e a barra mostra
"Confira os campos destacados." (a razão de estar desabilitado fica visível, não silenciosa).

### 3. Resultados — `/configuracoes/pesquisa?aba=resultados`

**Filtro de período:** `pa-seg` ou select no topo, valor na URL (`?periodo=mes|30d|tudo`). Padrão: mês atual
(fuso `America/Sao_Paulo`). O gasto sempre é do mês atual, independente do filtro.

**Estrutura (de cima para baixo):**

1. `pa-stat-grid` com 4 cartões: nota média, taxa de resposta, cupons emitidos, gasto real no mês (com barra de teto).
2. Linha de 2 colunas (≥992px; empilha abaixo disso): **Estrelas e carinhas** (tabela: variante, respostas, nota média,
   taxa de resposta) e **Notas recebidas** (cinco barras horizontais, cada uma com rótulo "1 Muito ruim" até "5 Excelente",
   contagem e percentual; a barra não é a única informação).
3. **Últimas respostas** (`pa-card`, largura total, 20 respostas): colunas Data · Nota (ícone + número "4/5") · Variante ·
   Comentário (2 linhas, "Ver tudo" para expandir) · Cupom (pílula). Largura abaixo de 992px: scroll horizontal dentro de
   `pa-card-body-scroll`.

**Regras do painel:**

- Taxa de resposta = respondidas ÷ pesquisas com mensagem enviada com sucesso no período. Mostrar sempre "n de N"
  junto da porcentagem, para não parecer maior que é.
- Comparativo A/B: se alguma variante tiver menos de 30 respostas, mostrar a mensagem "Amostra pequena" e não destacar vencedor.
- Pílulas da coluna Cupom: Emitido → `pa-pill-warning`; Usado → `pesquisa-pill-ok`; Vencido e Sem cupom (teto ou
  intervalo) → `pa-pill-secondary`; Cancelado → `pa-pill-danger`.
- Nomes de cliente aparecem só como telefone mascarado `(dd) *****-1234`. Nome do Chatwoot não é exibido nesta tela.
- Link "Ver relatório no Chatwoot" aparece só se houver URL configurada (a origem do link fica para o plano).

### 4. Cupons — `/cupons`

**Estrutura:** `AdminShell` com `activeHref="/cupons"`, dentro de `PasswordGate` (ver UI-D12). Três blocos:

1. **Buscar cupom** (card): campo de código (`autoCapitalize="characters"`, `autoComplete="off"`, `spellCheck={false}`), botão "Buscar cupom". Enter envia. Colar é permitido. O código é normalizado (trim e maiúsculas) antes da requisição.
2. **Detalhe do cupom** (card, aparece após a busca): título com o código (monoespaçado), pílula de situação, lista de campos (desconto, teto, compra mínima, validade, cliente mascarado, emitido em, nota da pesquisa), e o formulário de resgate **somente quando a situação for "Disponível"**.
3. **Cupons recentes** (card, largura total): filtro de situação (`pa-seg`, valor em `?status=`), tabela com 50 linhas por página e botão "Carregar mais". Cada linha tem "Ver detalhes" (botão real, não só clique na linha).

**Fluxo de resgate (cupom disponível):**

1. Campo "Valor da compra (R$)", `inputMode="decimal"`, rótulo visível, ajuda "Valor antes do desconto."
2. Resumo ao vivo (sem botão de calcular): subtotal, desconto, total com desconto. Desconto = `min(valor × desconto%, teto)`, arredondado para baixo no centavo (UI-D10). Se o teto limitar, aparece "Limitado ao teto de R$ X."
3. Se o valor for menor que a compra mínima, aparece o erro "Compra mínima de R$ X não atingida..." e o botão fica desabilitado. O erro é visível, não silencioso.
4. Botão "Marcar cupom como usado" habilitado só com valor válido. Ao clicar, abre o painel de confirmação inline (não um modal de tela cheia), com título, corpo com o valor do desconto e dois botões ("Confirmar uso", "Voltar").
5. Ao confirmar: chamada ao backend, depois recarrega o cupom do servidor (não atualiza otimisticamente). Mostra alerta de sucesso com o valor a lançar no Athos ou no PDV.
6. Erros: 409 ("Este cupom já foi usado. Atualize a busca."), 422 (compra mínima), suspenso (teto mensal), rede ou 5xx (mensagem de erro com a instrução de não lançar o desconto antes de confirmar).

**Situações (derivadas no cliente a partir dos campos da API):**

| Situação | Condição | Pílula | Resgate |
|----------|----------|--------|---------|
| Disponível | `EMITIDO`, válido, dentro do teto mensal | `pesquisa-pill-ok` (fundo do `pa-pill-success`, texto `#1a7f37`) | Sim |
| Vencido | `EMITIDO` e `validade` passada | `pa-pill-warning` | Não |
| Suspenso | `EMITIDO`, válido, mas teto mensal atingido | `pa-pill-warning` | Não, até o dia 1 do mês seguinte |
| Já usado | `USADO` | `pa-pill-secondary` | Não |
| Cancelado | `CANCELADO` | `pa-pill-danger` | Não |
| Expirado no banco | `EXPIRADO` | `pa-pill-secondary` | Não |

A situação "Suspenso" não está no enum de status do contexto. Ela é derivada (UI-D09). Ver pendências.

---

## Navegação e rotas

Alterações em `PA_NAV_ITEMS` (`contas-receber/admin-shell.tsx`):

| Item | Href | Ícone | Posição |
|------|------|-------|---------|
| Cupons | `/cupons` | `ticket-perforated` | Novo item de nível 1, entre "Produção" e "Configurações" |
| Pesquisa e recompensa | `/configuracoes/pesquisa` | `star-half` | Novo filho de "Configurações", depois de "Juros e multa" |

Ordem final dos filhos de Configurações: Templates de PDF · Juros e multa · Pesquisa e recompensa.

Rotas novas:

- `apps/frontend/src/app/pesquisa/[token]/` (pública, sem AdminShell e sem PasswordGate).
- `apps/frontend/src/app/configuracoes/pesquisa/` (PasswordGate + AdminShell; `?aba=`).
- `apps/frontend/src/app/cupons/` (PasswordGate + AdminShell; `?status=`).

Estados de navegação: `navItemAtivo` já cobre `/cupons`, e o filho de Configurações fica ativo por `aria-current="page"`.

---

## Interação e feedback

| Contrato | Regra |
|----------|-------|
| Envio único | Toda ação de escrita usa ref de envio (`emEnvio`). Botão desabilitado durante o envio, com texto "Enviando..." ou "Salvando..." |
| Loading | Texto com spinner-border de 1rem. Região com `aria-busy="true"`. Sem spinner de tela cheia |
| Sucesso | Alerta `role="status"` (ou aria-live) com a copy de sucesso. Na página pública, o estado troca para agradecimento |
| Erro | Alerta `role="alert"` perto da ação. Preserva o que o usuário digitou |
| Foco após erro | Campo com erro recebe foco na primeira falha de validação |
| Foco após sucesso | Título do novo estado recebe foco (página pública) |
| Seleção de nota | Radio nativo. Setas trocam a seleção. O texto de confirmação atualiza em aria-live |
| Copiar código | `navigator.clipboard.writeText`; se falhar, seleciona o texto e mostra "Selecione e copie o código." |
| Link externo | Abre em nova aba com "(abre em nova aba)" no texto acessível |
| Filtros na URL | `?aba=`, `?periodo=`, `?status=`. Recarregar mantém o filtro. "Todos" e "Mês atual" são o padrão e não entram na URL |
| Configuração | Só salva com o botão. Descartar volta ao último valor salvo do servidor |
| Resgate | Dois passos (preencher e confirmar). Após confirmar, recarrega do servidor |
| Pesquisa desativada | A página pública mostra o estado genérico de "não está mais disponível", sem revelar que a pesquisa existe |

**Movimento:** só a transição de 0,2s do interruptor e da seleção de nota. Com `prefers-reduced-motion: reduce`, zero transição.

---

## Responsivo e mobile

| Superfície | Largura mínima | Comportamento |
|------------|----------------|---------------|
| Pública | 320px | Sem scroll horizontal. Com padding de 16px, sobram 288px de conteúdo. As 5 opções de 56px com gap de 8px pedem 312px, então abaixo de 360px de viewport as opções ficam em 48×48px com gap de 4px (5×48 + 4×4 = 256px). Rótulos podem quebrar em 2 linhas |
| Pública | ≥480px | Card centralizado, 480 px de largura máxima |
| Admin | <992px | Sidebar some e abre pelo hamburger (já existente). `pa-stat-grid` vai para 2 colunas; `pa-aging-grid` é herdado |
| Admin tabelas | <992px | Scroll horizontal dentro de `pa-card-body-scroll` (não quebra o layout). Coluna de código e de cliente fixas à esquerda (`position: sticky`) |
| Cupons no celular | <768px | Mesma tabela com scroll. Não há layout de cards nesta fase |

Viewport: o Next.js já inclui `width=device-width, initial-scale=1` por padrão. Não bloquear zoom. Altura mínima com
`min-height: 100dvh` (fallback `100vh`), não `height: 100vh`.

---

## Acessibilidade

| Área | Requisito |
|------|-----------|
| Rótulos | Todo campo tem `<label>` visível. Placeholder nunca é o único rótulo. Ajuda ligada com `aria-describedby` |
| Erros de campo | `aria-invalid="true"` no campo e `aria-describedby` apontando para a mensagem |
| Grupo de nota | `<fieldset>` com `<legend>` visível. Opções são radio nativo com label de texto |
| Ícones | Decorativos com `aria-hidden="true"`. Botões só com ícone (copiar, fechar, hamburger) com `aria-label` |
| Cor | Nunca a única informação. Pílulas têm texto, barras têm número, nota tem rótulo |
| Contraste | Ver tabela em Color. Texto ≥4,5:1, componente de interface ≥3:1 |
| Foco | `:focus-visible` com outline de 3px. Nunca `outline: none` sem substituto |
| Alvos de toque | Mínimo 44×44 px. Opções de nota 56×56 px (48×48 px abaixo de 360px de viewport). Botões 48 px de altura na página pública |
| Idioma | `lang="pt-BR"` (já no `layout.tsx`) |
| Regiões de status | Confirmação de nota (polite), erros de envio (`role="alert"`), sucesso (`role="status"`), loading com `aria-busy` |
| Tabelas | Com `<caption>` visível ou `aria-label`. Cabeçalhos com `<th scope="col">` |
| Movimento | `prefers-reduced-motion` respeitado |
| Pendência herdada | Bordas de campo do Bootstrap (~1,5:1) nas telas admin. Herdado, anotado, não alterado nesta fase |

---

## UI Considerations

Applicable state considerations resolved: 21 covered, 3 backstop, 2 unresolved

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Formulário da pesquisa (nota não escolhida) | ✅ covered | Botão continua ativo. Ao enviar sem nota, erro "Escolha uma nota de 1 a 5 antes de enviar." com foco no grupo |
| loading | Página pública (carregamento inicial) | ✅ covered | Página renderizada no servidor. Sem spinner de página. Se houver etapa cliente, texto "Carregando..." sem salto de layout |
| loading | Botão Enviar avaliação | ✅ covered | "Enviando..." com spinner, formulário `aria-busy`, ref `emEnvio` contra duplo envio |
| error | Envio da pesquisa (rede ou 5xx) | ✅ covered | Mensagens da seção Copywriting. Nota e comentário preservados. Botão Enviar avaliação de novo |
| error | Pesquisa inválida, expirada ou desativada | ✅ covered | Mesmo texto genérico para os três casos. Não revela existência do token |
| partial | Formulário com comentário vazio | ✅ covered | Comentário opcional. Envio só com nota. Sem erro para campo vazio opcional |
| long-text | Comentário do cliente (máximo 500) | ✅ covered | Textarea com contador e quebra normal. Limite no cliente e no servidor |
| overflow | Código do cupom na página de agradecimento | ✅ covered | Fonte monoespaçada, `overflow-wrap: anywhere`, cabe em 320 px |
| long-text | Textos configuráveis da página (máximo 600) | ✅ covered | Quebra normal no cartão. Validação de tamanho no admin antes de salvar |
| empty | Configuração no primeiro acesso | ✅ covered | Campos vêm preenchidos com o padrão da empresa (Box e Bom Custo). Nenhum campo fica vazio por padrão |
| partial | Configuração com campo inválido | ✅ covered | Salvar bloqueado enquanto houver erro. Mensagem por campo. "Confira os campos destacados." na barra |
| error | Carregamento de configuração e de resultados | ✅ covered | Erro com "Tentar novamente". Sessão expirada usa MSG_SESSAO existente |
| empty | Resultados sem respostas no período | ✅ covered | "Nenhuma resposta ainda" com texto de próximo passo. Taxa mostra "0 de 0" como "Sem envios no período" |
| zero-one-many | Contagens (respostas e cupons) | ✅ covered | "1 resposta" e "2 respostas", "1 cupom" e "2 cupons" |
| overflow | Últimas respostas com comentário longo | ✅ covered | Comentário truncado em 2 linhas com "Ver tudo". Tabela com scroll abaixo de 992px |
| populated | Tabela de cupons recentes | ✅ covered | Código, cliente mascarado, desconto, validade, situação e uso. 50 por página |
| empty | Cupons vazios e filtro sem resultado | ✅ covered | "Nenhum cupom ainda" e "Nenhum cupom com esta situação." |
| loading | Busca de cupom e lista | ✅ covered | Botão com spinner, lista com `aria-busy`. Sem spinner de tela cheia |
| error | Falha no resgate | ✅ covered | Mensagem com instrução de não lançar o desconto antes de confirmar. Recarrega o cupom do servidor |
| partial | Cupom sem data de uso | ✅ covered | "Usado em" mostra "—" quando vazio |
| overflow | Rótulo "Pesquisa e recompensa" na sidebar | ✅ covered | 21 caracteres cabem na sidebar de 250px no nível de subitem |
| zero-one-many | Gasto vs teto (R$ 0, abaixo do teto, teto exato e acima) | 🧪 backstop | Verificação visual com 0, R$ 299,99, R$ 300,00 e R$ 412,00: barra limitada a 100%, texto "Teto atingido" |
| long-text | Comentário de 500 caracteres em 320 px | 🧪 backstop | Verificação visual com fixture em 320px, sem scroll horizontal da página |
| overflow | Lista de cupons com muitos registros | 🧪 backstop | Paginação de 50 com "Carregar mais". Teste de integração da paginação |
| long-text | Cor primária da empresa com contraste baixo | ⚠ unresolved | Padrão `#0d6efd` passa (4,50:1). Cores customizadas precisam de checagem na implantação. Planner trata como premissa |
| empty | Situação "Suspenso" é derivada, não persistida | ⚠ unresolved | Premissa: a tela calcula a partir do gasto do mês e da validade. Planner confirma se a API já devolve o campo |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | nenhum (projeto sem shadcn) | não aplicável |
| third-party | nenhum bloco declarado | não aplicável |
| CDN (já em uso) | Bootstrap 5.3.2 (CSS e JS), Bootstrap Icons 1.11.1 (CSS) | versões fixas no URL. A página pública carrega só o CSS do Bootstrap Icons |

Nenhum bloco de terceiros entra nesta fase. A etapa de vetting de registry não se aplica.

---

## Decisões de design

Cada decisão tem motivo e custo de reversão. Confirmar as marcadas como "confirmar" na seção de pendências.

| ID | Decisão | Motivo | Reversibilidade |
|----|---------|--------|-----------------|
| UI-D01 | Admin segue `AdminShell` atual (`pa-*`, indigo `#3d42df`). O tema Painel (Mulish, teal) do SKILL.md não é aplicado | Todas as áreas admin já usam `pa-*` (fonte única desde a tarefa 260905-ena). Teal criaria duas identidades no mesmo menu. Brand pigments e tom pt-BR do skill continuam valendo | Barata (CSS). Confirmar |
| UI-D02 | Página pública não usa Bootstrap CSS, gradiente pastel, creme nem sage fixos. Cores vêm de `--cor-primaria`, classes com prefixo `pesquisa-`, sem webfont | White-label por `EMPRESA_*`. Evita colisão com `globals.css` (`.btn-primary` terracota, `.card`, `body` creme). Página mais leve para o WhatsApp in-app | Barata |
| UI-D03 | Variante A/B sorteada 50/50 ao criar a pesquisa e gravada. Não re-sorteia ao recarregar | Comparação justa entre variantes. Mesmo cliente vê sempre a mesma opção | Custosa (muda dado gravado). Só pelo backend |
| UI-D04 | Nota com radio nativo e rótulo de texto nas duas variantes | Teclado e leitor de tela sem código extra. Ícone sozinho não transmite a nota | Barata |
| UI-D05 | Nota obrigatória, comentário opcional (máximo 500). Erro de nota foca o grupo | Contrato do CONTEXT. Erro perto do campo (ui-ux-pro-max Forms) | Barata |
| UI-D06 | Página "Já respondida" NÃO exibe o código do cupom de novo | O link pode ser repassado. O código já vai no WhatsApp e aparece uma vez na tela de agradecimento. Confirmar: se preferir reexibir, muda só esse estado | Barata |
| UI-D07 | "Sem recompensa" cobre teto mensal e intervalo de 90 dias com o mesmo texto | O cliente não precisa saber a regra interna. Não promete cupom | Barata |
| UI-D08 | Dois WhatsApp separados: cupom (sem link) e convite Google (um link). Bloco do fechamento tem só o link da pesquisa. Opt-out sem link | Um link por mensagem (risco de banimento). Convite Google independente do cupom | Barata. Confirmar |
| UI-D09 | "Suspenso" é estado derivado na tela Cupons, não status novo no banco. Resgate liberado no dia 1 do mês seguinte | O enum do contexto não tem o estado. Evita migração só para isso. Confirmar | Barata |
| UI-D10 | Desconto arredondado para baixo, no centavo. Nunca passa do teto nem do valor da compra | Não dar desconto a mais por arredondamento. Confirmar | Barata |
| UI-D11 | Resgate em dois passos com confirmação. Após confirmar, recarrega do servidor. Não há desfazer nesta fase | Ação irreversível com efeito de caixa. Lembrete de lançar no Athos/PDV dentro da confirmação | Custosa se virar fluxo de desfazer |
| UI-D12 | Tela Cupons protegida por `PasswordGate` (mesmo cookie de sessão admin) | Balcão é área interna. Mesmo mecanismo das outras telas admin. Confirmar | Barata |
| UI-D13 | Comparação entre variantes só com 30 ou mais respostas por variante | Evitar decisão com amostra pequena. Valor proposto. Confirmar | Barata |
| UI-D14 | Validade do link limitada a 14 dias | Limite do Chatwoot para aceitar a resposta ao `input_csat` (fonte: CONTEXT) | Limite fixo |
| UI-D15 | Limites propostos: desconto 1 a 50%; validade do cupom 1 a 180 dias; intervalo 0 a 365 dias; teto mensal maior ou igual a zero | Valores razoáveis. Não estão no CONTEXT. Confirmar | Barata |
| UI-D16 | Aba "Configuração" salva tudo de uma vez, incluindo o interruptor | Evita ligar o fechamento com recompensa por tecla acidental | Barata |
| UI-D17 | Pílulas novas usam `#1a7f37` como texto. A `pa-pill-success` atual (2,67:1) fica para correção separada | Não alterar telas existentes nesta fase. Anotado | Barata |

---

## Pendências para confirmação

Estas perguntas vão ao usuário em texto numerado, pelo orquestrador (sem AskUserQuestion):

1. **Tema do admin (UI-D01):** manter o `AdminShell` atual (indigo, recomendado) ou aplicar o tema Painel teal do SKILL.md?
2. **Já respondida (UI-D06):** não reexibir o código (recomendado) ou reexibir?
3. **WhatsApp (UI-D08):** dois envios separados, cupom sem link e convite Google com link (recomendado), ou uma mensagem só?
4. **Suspenso (UI-D09):** cupom com teto mensal atingido fica suspenso até o dia 1 do mês seguinte (recomendado) ou é cancelado?
5. **Arredondamento (UI-D10):** para baixo no centavo (recomendado) ou arredondamento comercial?
6. **Senha na tela Cupons (UI-D12):** exigir a mesma senha das outras áreas admin (recomendado) ou aberta?
7. **Limites propostos (UI-D15):** aceitar 1 a 50% de desconto, 1 a 180 dias de validade e 30 respostas para comparar variantes (UI-D13)?
8. **Padrões por empresa:** Box 10% / R$2 / R$6 e Bom Custo 10% / R$5 / R$30, vindos de env por instância ou preenchidos no primeiro acesso (planner escolhe, mas o valor precisa estar confirmado)?

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS
- [ ] Dimension 7 Inventory Provenance: PASS (não se aplica: `Tool: none`, sem seção de inventário)

**Approval:** pending
