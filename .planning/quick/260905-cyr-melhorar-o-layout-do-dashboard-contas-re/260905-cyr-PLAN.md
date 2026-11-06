---
phase: quick-260905-cyr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/frontend/src/app/contas-receber/admin-shell.tsx
  - apps/frontend/src/app/contas-receber/cliente-autocomplete.tsx
  - apps/frontend/src/app/contas-receber/page.tsx
autonomous: true
requirements: [QT-CYR-01, QT-CYR-02, QT-CYR-03, QT-CYR-04]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Abrir /contas-receber (apos a senha) mostra um layout de painel administrativo: sidebar escura fixa a esquerda com navegacao e topbar com titulo + controles, no lugar do header em gradiente pastel (D-01, D-03)."
    - "A sidebar e alimentada por um array de itens de navegacao — adicionar uma nova secao no futuro e acrescentar um objeto ao array, sem tocar no JSX da sidebar (D-01)."
    - "Digitar no campo de busca abre um dropdown com os clientes correspondentes (nome ou id) enquanto se digita, navegavel por setas do teclado, Enter e Escape (D-02)."
    - "Escolher um cliente no dropdown abre /contas-receber/{idcliente}; continuar digitando sem escolher segue filtrando a lista da pagina, como hoje (D-02)."
    - "Todos os paineis construidos na Fase 41 continuam presentes e com os mesmos dados: boletos consolidados, 4 KPIs fiscais, 4 faixas de aging, 3 faixas a vencer, lista de clientes ordenavel e destaque visual para atraso acima de 90 dias (QT-CYR-04)."
    - "As tres chaves de ordenacao (nome, valor em aberto, valor vencido) e as duas direcoes continuam alcancaveis pelo operador (QT-CYR-04)."
    - "A pagina continua protegida pelo PasswordGate e continua buscando dados exatamente pelos mesmos dois endpoints de hoje (QT-CYR-04)."
    - "Nenhum arquivo fora de apps/frontend/src/app/contas-receber/ (nivel raiz) e modificado — globals.css, [idcliente]/page.tsx e todo o backend ficam intactos (D-05)."
  artifacts:
    - apps/frontend/src/app/contas-receber/admin-shell.tsx
    - apps/frontend/src/app/contas-receber/cliente-autocomplete.tsx
    - apps/frontend/src/app/contas-receber/page.tsx
  key_links:
    - "page.tsx renderiza <AdminShell> envolvendo todo o conteudo do dashboard e injeta busca + filtros + refresh no slot actions da topbar"
    - "AdminShell exporta PA_NAV_ITEMS (array de {href,label,icon}) e marca o item ativo comparando com a prop activeHref"
    - "ClienteAutocomplete recebe o array clientes ja carregado no estado de page.tsx — zero fetch novo, zero endpoint novo"
    - "fetchDashboard (GET /api/athos/contas-receber/dashboard) e fetchBoletosDashboard (GET /api/cobranca/boleto/dashboard) permanecem byte-a-byte na mesma logica"
    - "Tokens .pa-* e o CSS do chrome vivem no bloco <style> de admin-shell.tsx; helpers .pa-* de conteudo vivem no bloco <style> de page.tsx — globals.css nao e tocado"
---

<objective>
Reconstruir visualmente o dashboard `/contas-receber` como um painel administrativo no estilo do template PlainAdmin (Bootstrap admin): sidebar lateral fixa e extensivel, topbar, paleta escura/neutra propria com um unico accent, cards densos e busca de cliente com autocomplete.

Purpose: a pagina hoje e uma sequencia de cards sob um header em gradiente pastel — funciona, mas nao se le como um painel de analise. O operador precisa varrer valores e achar um cliente rapido. Esta tarefa muda a casca visual e a busca, sem mexer em uma linha de logica de dados.

Output: `admin-shell.tsx` (casca reutilizavel), `cliente-autocomplete.tsx` (typeahead) e um `page.tsx` reestilizado, com toda a funcionalidade da Fase 41 preservada.

## Mapa de decisoes (CONTEXT.md -> IDs citados neste plano)

| ID | Decisao travada (secao do CONTEXT.md) |
|----|----------------------------------------|
| D-01 | **Estrutura de navegacao** — sidebar lateral fixa estilo admin, pensada como navegacao extensivel (array de itens), nao componente hardcoded de item unico |
| D-02 | **Busca de cliente** — trocar o campo simples por autocomplete/dropdown de resultados enquanto digita |
| D-03 | **Estilo visual / paleta** — copiar cores e componentes do PlainAdmin nesta pagina, em vez dos tokens do skill `bom-custo-design`; ilha visual, so aqui |
| D-04 | **Estilo visual / paleta** — nao clonar o template 1:1; inferir a estrutura (sidebar + topbar + cards + tabelas densas, paleta escura/neutra) e nao travar esperando o CSS-fonte |
| D-05 | **Escopo** — somente `/contas-receber`; `[idcliente]/page.tsx` e o resto do app ficam como estao |

## Discricao exercida (registrada aqui, conforme "Claude's Discretion" do CONTEXT.md)

1. **Arquivos:** a sidebar vira componente co-locado `admin-shell.tsx` (nao inline, nao em `src/components/`), seguindo o precedente ja existente de `app/configuracoes/templates/templates-manager.tsx` — componente irmao de um `page.tsx` dentro da propria rota. Fica reutilizavel para futuras secoes deste painel sem virar componente global.
2. **Busca:** client-side sobre o array `clientes` ja carregado. O endpoint de dashboard usa `LIMIT 100` (decisao de 2026-05-21 no STATE.md) — 100 registros em memoria nao justificam endpoint novo.
3. **Fonte:** stack sans-serif do sistema (sem webfont novo). D-03 fala em cores e componentes; carregar um Google Font adicionaria dependencia de rede a uma pagina interna sem ganho proporcional.

## Paleta PlainAdmin-like (fechada — o executor nao escolhe cor fora desta tabela)

Nao ha acesso ao CSS-fonte do template (D-04). Esta e a paleta prescrita, no espirito "admin template Bootstrap": sidebar escura, fundo neutro dessaturado, um accent indigo.

| Token | Valor | Uso |
|-------|-------|-----|
| `--pa-sidebar-bg` | `#1b2431` | Fundo da sidebar |
| `--pa-sidebar-bg-hover` | `#26313f` | Hover/estado ativo do item de menu |
| `--pa-sidebar-text` | `#a9b4c4` | Texto do item de menu |
| `--pa-sidebar-text-active` | `#ffffff` | Item ativo |
| `--pa-accent` | `#3d42df` | Acao primaria, item ativo (barra lateral 3px), links de navegacao, foco |
| `--pa-accent-soft` | `#eceefe` | Fundo dos tiles de icone dos KPIs |
| `--pa-bg` | `#f4f6fa` | Fundo da pagina (`body`) |
| `--pa-surface` | `#ffffff` | Cards, topbar, tabelas |
| `--pa-border` | `#e6e9f0` | Bordas de card, linhas de tabela, divisorias |
| `--pa-text` | `#1f2a37` | Texto principal |
| `--pa-text-muted` | `#6b7a90` | Labels, legendas |
| `--pa-success` | `#1eb564` | Em dia / boleto pago / NFS-e OK |
| `--pa-warning` | `#f7a600` | 1-30 dias / boleto pendente / NFS-e parcial |
| `--pa-orange` | `#fd7e14` | 31-60 dias |
| `--pa-danger-soft` | `#ff6b6b` | 61-90 dias |
| `--pa-danger` | `#e5484d` | 90+ dias, inadimplencia, erros |

Geometria: sidebar `250px` fixa; topbar `60px` sticky; raio de card `10px`; sombra de card `0 1px 3px rgba(16,24,40,.06)`; abaixo de `992px` a sidebar sai de tela (`transform: translateX(-100%)`) e volta com um botao hamburguer na topbar.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260905-cyr-melhorar-o-layout-do-dashboard-contas-re/260905-cyr-CONTEXT.md
@apps/frontend/src/app/contas-receber/page.tsx
@apps/frontend/src/components/password-gate.tsx
@apps/frontend/src/lib/empresa.tsx
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Casca de painel administrativo (sidebar fixa + topbar) envolvendo o dashboard atual sem alterar nada do conteudo</name>
  <files>apps/frontend/src/app/contas-receber/admin-shell.tsx, apps/frontend/src/app/contas-receber/page.tsx</files>
  <read_first>apps/frontend/src/app/contas-receber/page.tsx (linhas 232-350 — estrutura de PasswordGate, ContasReceberDashboard, header e bloco style), apps/frontend/src/lib/empresa.tsx (hook useEmpresa e nomes exportados)</read_first>
  <action>
Criar `apps/frontend/src/app/contas-receber/admin-shell.tsx` como client component (`"use client"`), exportando:

1. `export interface PaNavItem { href: string; label: string; icon: string; }` — `icon` e o nome da classe Bootstrap Icons sem o prefixo `bi bi-`.
2. `export const PA_NAV_ITEMS: PaNavItem[]` — navegacao extensivel exigida por D-01. Itens iniciais, todos apontando para rotas que ja existem no app: `{ href: "/contas-receber", label: "Contas a Receber", icon: "cash-coin" }`, `{ href: "/orcamento", label: "Orcamentos", icon: "file-earmark-text" }`, `{ href: "/status", label: "Producao", icon: "kanban" }`, `{ href: "/configuracoes/templates", label: "Configuracoes", icon: "gear" }`. A sidebar renderiza esse array com `.map()` — nao pode haver item de menu escrito a mao no JSX.
3. `export default function AdminShell({ activeHref, title, subtitle, actions, children })` — `activeHref: string`, `title: string`, `subtitle?: string`, `actions?: React.ReactNode`, `children: React.ReactNode`.

Estrutura renderizada:
- `<div className="pa-shell">` contendo `<aside className="pa-sidebar">` e `<div className="pa-main">`.
- Sidebar: area de marca no topo com o logo e o nome da empresa vindos de `useEmpresa()` (`EMPRESA_LOGO_URL`, `EMPRESA_NOME`) — o white-label da Fase 36 nao pode se perder; abaixo, um rotulo de secao discreto e a lista `PA_NAV_ITEMS` como `<a>` com icone + label. O item cujo `href` e igual a `activeHref` recebe a classe de estado ativo (`aria-current="page"`, fundo `--pa-sidebar-bg-hover`, texto branco e uma barra de 3px em `--pa-accent` na borda esquerda).
- `.pa-main`: `<header className="pa-topbar">` sticky com o botao hamburguer (visivel so abaixo de 992px, alterna estado `sidebarAberta` via `useState`), o `title` como titulo da pagina e o `subtitle` como legenda muted, e a direita `{actions}`. Abaixo da topbar, `<main className="pa-content">{children}</main>`.
- Quando `sidebarAberta` e verdadeiro abaixo de 992px, renderizar um backdrop clicavel que fecha a sidebar.

CSS: um unico bloco `<style>{...}</style>` dentro de `admin-shell.tsx` declarando os tokens `--pa-*` em `:root` exatamente com os valores da tabela do objetivo, mais `body { background: var(--pa-bg); color: var(--pa-text); font-size: 1rem; }` e todas as regras `.pa-shell`, `.pa-sidebar`, `.pa-brand`, `.pa-nav`, `.pa-nav-item`, `.pa-main`, `.pa-topbar`, `.pa-content`, `.pa-backdrop`. Toda classe nova criada por esta tarefa usa o prefixo `pa-`. `apps/frontend/src/app/globals.css` nao pode ser aberto para escrita (D-05: ilha visual — o resto do app nao muda).

Em `page.tsx`: importar `AdminShell` e envolver o conteudo do dashboard. As tags `<Script>` e `<link>` do Bootstrap/Bootstrap Icons continuam onde estao, antes da casca. O bloco `<div className="container my-4">` e o header em gradiente pastel (o `<div>` com as classes de cabecalho do orcamento, linhas 313-386) saem, e seus controles — busca, ordenacao, botoes de status e refresh — passam a ser entregues via prop `actions` do AdminShell, com `title="Contas a Receber"`, `subtitle="Monitoramento de inadimplencia"` e `activeHref="/contas-receber"`. O logo/nome da empresa deixa de ser renderizado no header e passa a aparecer na marca da sidebar.

Nesta tarefa NAO reestilizar os paineis internos: `BoletosConsolidadosPanel`, os cards de KPI, aging, a vencer e o grid de clientes ficam exatamente como estao (Task 2 cuida deles). O objetivo aqui e provar a casca ponta a ponta com dados reais ja fluindo.

Preservar sem alteracao: o wrapper `PasswordGate` como raiz do componente exportado, `fetchDashboard`, `fetchBoletosDashboard`, todos os `useState`, as interfaces `DashboardSummary`/`BoletoDashboardItem`/`ClienteDevedor` e as funcoes utilitarias de formatacao e badge.
  </action>
  <verify>
    <automated>npm --prefix apps/frontend run build</automated>
    <automated>grep -q "PA_NAV_ITEMS" apps/frontend/src/app/contas-receber/admin-shell.tsx &amp;&amp; grep -q "pa-sidebar" apps/frontend/src/app/contas-receber/admin-shell.tsx &amp;&amp; grep -q "AdminShell" apps/frontend/src/app/contas-receber/page.tsx &amp;&amp; grep -q "PA_NAV_ITEMS.map" apps/frontend/src/app/contas-receber/admin-shell.tsx</automated>
    <automated>for t in PasswordGate fetchDashboard /api/cobranca/boleto/dashboard /api/athos/contas-receber/dashboard total_a_receber taxa_inadimplencia d90_mais a_vencer nfseStatus limitecredito titulos_pendentes maior_atraso_dias; do grep -q -- "$t" apps/frontend/src/app/contas-receber/page.tsx || echo "FALTANDO $t"; done</automated>
  </verify>
  <done>`npm --prefix apps/frontend run build` termina limpo; a sidebar renderiza a partir de `PA_NAV_ITEMS.map`; `page.tsx` renderiza o dashboard dentro de `<AdminShell>`; o loop de preservacao imprime saida vazia (nenhum "FALTANDO").</done>
</task>

<task type="auto">
  <name>Task 2: Reestilizar os paineis do dashboard na linguagem visual PlainAdmin, preservando cada dado da Fase 41</name>
  <files>apps/frontend/src/app/contas-receber/page.tsx</files>
  <read_first>apps/frontend/src/app/contas-receber/page.tsx (linhas 57-230 — utilitarios de badge e BoletosConsolidadosPanel; linhas 400-650 — cards de resumo, aging, a vencer, grid de clientes e bloco style)</read_first>
  <reversibility rating="reversible">Restyle de uma unica pagina, isolado por prefixo de classe e revertivel por `git revert` do commit — a divergencia deliberada do skill de marca (D-03) nao cria acoplamento novo.</reversibility>
  <action>
Reescrever a apresentacao (nao a logica) dos blocos internos usando os tokens `--pa-*` definidos na Task 1. Cada secao abaixo mantem exatamente os mesmos campos de dados que renderiza hoje.

**KPIs fiscais (4 cards).** Padrao PlainAdmin de stat card: tile quadrado de ~44px com fundo `--pa-accent-soft`, raio 10px e o icone Bootstrap ja usado hoje (`cash-stack`, `exclamation-triangle-fill`, `graph-up-arrow`, `percent`) a esquerda; a direita o label pequeno em `--pa-text-muted` e o valor grande em 700. Os quatro valores continuam sendo `summary.total_a_receber`, `summary.total_atrasado`, `summary.total_recebido_mes` e `formatPercent(summary.taxa_inadimplencia)`, e a legenda de `summary.total_clientes_devedores` continua sob a taxa. Cor do numero: "Total a Receber" em `--pa-accent`, "Inadimplencia Ativa" em `--pa-danger`, "Recebido no Mes" em `--pa-success`, taxa em `--pa-text`.

**Aging (4 faixas).** Manter os quatro cards `1-30`, `31-60`, `61-90` e `Mais de 90 dias` com seus quatro valores. Trocar as badges Bootstrap por uma barra de acento de 4px na borda esquerda do card, na cor da faixa: `--pa-warning`, `--pa-orange`, `--pa-danger-soft`, `--pa-danger`. Um card com valor zero continua renderizando `R$ 0,00` — nunca some.

**A vencer (3 faixas).** Manter os tres cards de 7/15/30 dias, seus valores e a legenda "Acumulado a partir de hoje", em versao mais compacta e com o icone de calendario em `--pa-text-muted`.

**Boletos a Receber.** Converter as linhas flex atuais numa tabela densa (`<table>` com `<thead>` fixo) de colunas: Cliente (badge `#id` + nome com truncamento e `title`), Valor, Vencimento (data + o sufixo de `getVencimentoSuffix`), Status, NFS-e, Acao ("Ver Cliente"). Manter o cabecalho do card com a contagem `({boletos.length})` e o botao de refresh, o `max-height: 320px` com rolagem interna, e os tres estados (carregando com spinner, erro com a copy "Erro ao carregar boletos consolidados." e retry proprio, vazio com "Nenhum boleto pendente" + o texto complementar). As funcoes `getStatusBoletoBadgeClass` e `getNfseBadge` continuam decidindo status e rotulo — trocar apenas as classes de cor por pills `.pa-pill.pa-pill-{success|warning|secondary}`, preservando o `title` do badge de NFS-e.

**Lista de clientes.** Converter o grid de cards numa tabela densa, que e o formato que o CONTEXT pede para "analisar" (D-04): colunas Cliente (`#idcliente` + nome), Total devido, Atrasado, Titulos, Limite de credito (valor + a barra de progresso existente, com a mesma regra de 80%/50% mapeada para `--pa-danger`/`--pa-warning`/`--pa-success`), Atraso (pill de `getBadgeClass`/`getBadgeLabel`) e Acao ("Ver Detalhe" para `/contas-receber/{idcliente}`). Nenhum desses campos pode desaparecer. Linhas de clientes com `maior_atraso_dias` acima de 90 mantem o destaque critico: borda esquerda de 4px em `--pa-danger` e fundo levemente avermelhado na linha.

**Ordenacao (D-01 da Fase 41 — capacidade preservada).** Os cabecalhos de Cliente, Total devido e Atrasado viram botoes de ordenacao que escrevem em `sortBy`/`sortDir`: clicar num cabecalho inativo o torna a chave ativa; clicar no ativo inverte a direcao. O cabecalho ativo mostra `bi-sort-down`/`bi-sort-up`. As tres chaves (`nome`, `total_devido`, `total_atrasado`) e as duas direcoes continuam alcancaveis. Substituir a constante `SORT_OPTIONS` por uma constante de definicao de colunas usada para renderizar esses cabecalhos — nao deixar simbolo orfao no arquivo (o build falha no lint).

**Filtros de status e refresh.** `STATUS_OPTIONS` e o comportamento de refetch por status continuam identicos; apenas o visual dos botoes vira um grupo segmentado no slot `actions` da topbar, com o ativo em `--pa-accent`.

**Bloco style de page.tsx.** Ele passa a conter somente helpers de conteudo com prefixo `pa-` (`.pa-card`, `.pa-stat`, `.pa-table`, `.pa-pill`, `.pa-row-critico`, `.pa-aging-*`), todos lendo os tokens declarados em `admin-shell.tsx`. Regras de `body` e do chrome nao se repetem aqui. As regras antigas de gradiente, fundo bege e logo do header saem junto com o markup que as usava.

Nao alterar: `fetchDashboard`, `fetchBoletosDashboard`, `useEffect`, as interfaces TypeScript, `formatBRL`, `formatPercent`, `getBadgeClass`, `getBadgeLabel`, `getStatusBoletoBadgeClass`, `getVencimentoSuffix`, `getNfseBadge`, a logica de `clientesFiltrados`/`clientesOrdenados` e o wrapper `PasswordGate`. Nenhum endpoint novo, nenhuma dependencia npm nova.
  </action>
  <verify>
    <automated>npm --prefix apps/frontend run build</automated>
    <automated>for t in PasswordGate fetchDashboard /api/cobranca/boleto/dashboard /api/athos/contas-receber/dashboard total_a_receber total_atrasado total_recebido_mes taxa_inadimplencia total_clientes_devedores d1_30 d31_60 d61_90 d90_mais a_vencer nfseStatus getNfseBadge getStatusBoletoBadgeClass getVencimentoSuffix getBadgeClass getBadgeLabel limitecredito titulos_pendentes maior_atraso_dias STATUS_OPTIONS clientesOrdenados; do grep -q -- "$t" apps/frontend/src/app/contas-receber/page.tsx || echo "FALTANDO $t"; done</automated>
    <automated>for t in "Nenhum boleto pendente" "Erro ao carregar boletos consolidados." "Nenhum cliente com contas em aberto." "Ver Cliente" "Ver Detalhe" "Acumulado a partir de hoje"; do grep -q -- "$t" apps/frontend/src/app/contas-receber/page.tsx || echo "COPY FALTANDO $t"; done</automated>
    <automated>test "$(git diff --name-only HEAD -- apps/frontend/src/app/globals.css 'apps/frontend/src/app/contas-receber/[idcliente]' apps/backend | wc -l)" = "0" &amp;&amp; echo ESCOPO_OK</automated>
  </verify>
  <done>Build limpo; os dois loops de preservacao imprimem saida vazia; o check de escopo imprime `ESCOPO_OK`; a pagina renderiza KPIs, aging, a vencer, tabela de boletos e tabela de clientes na paleta `--pa-*`, com destaque de borda para atraso acima de 90 dias e cabecalhos de coluna ordenaveis nas tres chaves.</done>
</task>

<task type="auto">
  <name>Task 3: Busca de cliente com autocomplete (dropdown enquanto digita) na topbar</name>
  <files>apps/frontend/src/app/contas-receber/cliente-autocomplete.tsx, apps/frontend/src/app/contas-receber/page.tsx</files>
  <read_first>apps/frontend/src/app/contas-receber/page.tsx (estado `busca` e a derivacao de `clientesFiltrados`, e o slot `actions` montado na Task 1)</read_first>
  <behavior>
    - Digitar "mar" com clientes carregados: o dropdown abre listando ate 8 clientes cujo nome contem "mar", ignorando acentos e caixa.
    - Digitar "42": o dropdown lista clientes cujo `idcliente` comeca com 42, alem dos nomes que contenham "42".
    - Campo vazio ou so espacos: dropdown fechado, lista da pagina sem filtro.
    - Seta para baixo/cima percorre as sugestoes; Enter na sugestao destacada navega para `/contas-receber/{idcliente}`; Escape fecha o dropdown sem limpar o texto.
    - Clique fora do componente fecha o dropdown.
    - Busca sem nenhum resultado: dropdown aberto com uma linha "Nenhum cliente encontrado".
    - Texto digitado sem selecionar sugestao continua filtrando a lista da pagina, exatamente como hoje.
  </behavior>
  <action>
Criar `apps/frontend/src/app/contas-receber/cliente-autocomplete.tsx` como client component com props `{ clientes, valor, onValorChange, onSelecionar }`, onde `clientes` e o array ja carregado em `page.tsx` (D-02, discricao 2 do objetivo: filtro client-side, sem endpoint novo) e `onSelecionar(idcliente: number)` e disparado ao escolher uma sugestao.

Definir uma interface local minima para o item da sugestao com os campos que o dropdown mostra — `idcliente`, `nome_cliente`, `total_devido`, `maior_atraso_dias` — para o componente nao depender da interface completa `ClienteDevedor`.

Normalizacao para casar sem acento: `s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()`. Um cliente entra na lista se o nome normalizado contem o termo normalizado ou se `String(idcliente)` comeca com o termo. Cortar em 8 sugestoes.

Cada sugestao mostra: badge `#idcliente`, nome truncado com `title`, o valor de `total_devido` formatado em BRL alinhado a direita e uma pill de atraso quando `maior_atraso_dias` for maior que zero. Formatar o valor dentro do proprio componente com `toLocaleString("pt-BR", { style: "currency", currency: "BRL" })` — nao exportar utilitario de `page.tsx`.

Teclado e estado: `useState` para `aberto` e `indiceDestacado`; `ArrowDown`/`ArrowUp` movem e dao wrap no indice; `Enter` seleciona o destacado; `Escape` fecha; `useRef` no container mais um listener de `mousedown` em `document` (registrado e removido num `useEffect`) fecha ao clicar fora.

Acessibilidade: o `<input>` recebe `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"` e `aria-controls` apontando para o id da lista; a lista recebe `role="listbox"`; cada sugestao recebe `role="option"` com `aria-selected`; o input recebe `aria-activedescendant` com o id da opcao destacada.

Visual: herda os tokens `--pa-*`; painel do dropdown em `--pa-surface`, borda `--pa-border`, raio 10px, sombra, `position: absolute` ancorado ao input com `z-index` acima da topbar sticky; item destacado com fundo `--pa-accent-soft`. O input mantem o icone `bi bi-search` a esquerda e o placeholder "Buscar cliente por nome ou ID...".

Em `page.tsx`: substituir o `input-group` de busca do slot `actions` por `<ClienteAutocomplete clientes={clientes} valor={busca} onValorChange={setBusca} onSelecionar={(id) => { window.location.href = `/contas-receber/${Number(id)}`; }} />`. Montar o href sempre com `Number(id)` — nunca interpolar string livre da API na URL (T-CYR-03). O estado `busca` e a derivacao `clientesFiltrados` de `page.tsx` continuam intocados, entao digitar sem selecionar mantem o filtro da lista funcionando como hoje.
  </action>
  <verify>
    <automated>npm --prefix apps/frontend run build</automated>
    <automated>for t in 'role="combobox"' 'role="listbox"' 'role="option"' "aria-activedescendant" "ArrowDown" "Escape" "mousedown" "Nenhum cliente encontrado"; do grep -q -- "$t" apps/frontend/src/app/contas-receber/cliente-autocomplete.tsx || echo "FALTANDO $t"; done</automated>
    <automated>grep -q "ClienteAutocomplete" apps/frontend/src/app/contas-receber/page.tsx &amp;&amp; grep -q "clientesFiltrados" apps/frontend/src/app/contas-receber/page.tsx &amp;&amp; grep -q "Number(id)" apps/frontend/src/app/contas-receber/page.tsx</automated>
    <human-check>Rodar `npm --prefix apps/frontend run dev`, abrir http://localhost:3000/contas-receber, destravar o PasswordGate e confirmar: (1) sidebar escura fixa a esquerda com os 4 itens e "Contas a Receber" marcado como ativo; (2) digitar parte do nome de um cliente abre o dropdown, setas navegam, Enter abre a pagina de detalhe daquele cliente; (3) boletos consolidados, os 4 KPIs, as 4 faixas de aging, as 3 faixas a vencer e a tabela de clientes aparecem com os mesmos numeros de antes; (4) clicar nos cabecalhos Cliente / Total devido / Atrasado reordena nos dois sentidos; (5) estreitar a janela abaixo de 992px esconde a sidebar e o hamburguer a traz de volta.</human-check>
  </verify>
  <done>Build limpo; os greps de acessibilidade, teclado e fecha-ao-clicar-fora passam sem saida; `page.tsx` usa `ClienteAutocomplete`, mantem `clientesFiltrados` e monta a URL de detalhe com `Number(id)`; a verificacao humana confirma os cinco pontos.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| PasswordGate -> conteudo do dashboard | A pagina inteira e financeira e so pode renderizar apos o gate de senha |
| API interna (`/api/athos/...`, `/api/cobranca/...`) -> browser | Nomes de cliente e ids vindos do Athos chegam ao React e sao usados em texto e em URLs |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-CYR-01 | Elevation of Privilege | `ContasReceberPage` / `PasswordGate` | high | mitigate | O `PasswordGate` continua sendo a raiz do componente exportado; o `AdminShell` so e instanciado dentro do conteudo ja liberado. Gate coberto pelo grep de preservacao nas Tasks 1 e 2. |
| T-CYR-02 | Tampering | href de navegacao do dropdown | medium | mitigate | URL do detalhe montada como `/contas-receber/${Number(id)}` — valor da API coagido a numero antes de entrar na URL; verificado por grep na Task 3. |
| T-CYR-03 | Information Disclosure | Busca client-side sobre `clientes` | low | accept | O filtro roda sobre dados que ja estavam carregados no browser da sessao autenticada; nenhuma requisicao nova e nenhum campo adicional e exposto. |
| T-CYR-04 | Information Disclosure | Itens da sidebar | low | accept | Os quatro destinos sao rotas internas ja existentes do app; a sidebar nao exibe dado financeiro, apenas rotulos de navegacao. |
| T-CYR-05 | Spoofing | Nome de cliente renderizado em card/tabela/dropdown | low | accept | Renderizado como texto JSX (React escapa por padrao); nenhum `dangerouslySetInnerHTML` e introduzido nesta tarefa. |

**Package Legitimacy Gate:** nao aplicavel — zero instalacoes de npm/pip/cargo nesta tarefa. Bootstrap 5.3.2 e Bootstrap Icons 1.11.1 continuam vindo do mesmo CDN ja referenciado no arquivo.
</threat_model>

<verification>
1. `npm --prefix apps/frontend run build` limpo apos cada task (type-check + lint do Next.js).
2. Loops de preservacao (Tasks 1 e 2) sem nenhuma linha "FALTANDO" / "COPY FALTANDO" — provam que os dados, utilitarios e copy da Fase 41 sobreviveram ao restyle.
3. Check de escopo imprime `ESCOPO_OK` — `globals.css`, `[idcliente]/page.tsx` e `apps/backend` sem diff (D-05).
4. Greps de estrutura confirmam sidebar orientada a array (`PA_NAV_ITEMS.map`) e autocomplete acessivel (`role="combobox"`, `aria-activedescendant`, teclado, fecha-ao-clicar-fora).
5. Verificacao humana da Task 3 cobre os cinco comportamentos visiveis que grep nao alcanca.
</verification>

<success_criteria>
- `/contas-receber` abre como painel administrativo: sidebar escura fixa de 250px, topbar sticky com titulo e controles, fundo neutro `#f4f6fa` (D-01, D-03, D-04).
- Adicionar uma secao futura ao painel e acrescentar um objeto a `PA_NAV_ITEMS` (D-01).
- A busca virou autocomplete com dropdown enquanto digita, com teclado e navegacao para o detalhe do cliente (D-02).
- Nenhum dado, badge, estado de erro/vazio ou copy dos paineis da Fase 41 foi perdido; as tres chaves de ordenacao e as duas direcoes continuam disponiveis (QT-CYR-04).
- O restyle e uma ilha: nenhum arquivo fora de `apps/frontend/src/app/contas-receber/` (nivel raiz) foi modificado; `globals.css`, `[idcliente]/page.tsx` e o backend intactos (D-05).
- Zero endpoints novos, zero dependencias npm novas.
</success_criteria>

<output>
Criar `.planning/quick/260905-cyr-melhorar-o-layout-do-dashboard-contas-re/260905-cyr-SUMMARY.md` ao concluir.
</output>
