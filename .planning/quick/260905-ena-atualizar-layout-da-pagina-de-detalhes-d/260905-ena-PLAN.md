---
phase: quick-260905-ena
plan: 01
type: execute
wave: 1
depends_on: []
subsystem: frontend
tags: [nextjs, react, plainadmin, contas-a-receber, cliente-detalhe, refactor-visual]
files_modified:
  - apps/frontend/src/app/contas-receber/admin-shell.tsx
  - apps/frontend/src/app/contas-receber/page.tsx
  - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
autonomous: false
requirements: [QT-ENA-01, QT-ENA-02, QT-ENA-03]

estimate:
  tokens: 96000
  raw_tokens: 64000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Abrir /contas-receber/{id} mostra a mesma sidebar fixa de 250px e a mesma topbar sticky de /contas-receber, com o item 'Contas a Receber' marcado como ativo"
    - "Todo o conteudo pre-existente da pagina de detalhe continua visivel e funcional: dados cadastrais, titulos em aberto (com grupos de boleto), cards de resumo, contas pagas, itens mais comprados (toggle valor/quantidade), gasto por mes, NFS-e emitidas e notas fiscais Athos"
    - "Selecionar titulos ainda revela a barra de acoes e os botoes Gerar Boleto / Anexar NFS-e ainda abrem seus modais por cima da sidebar"
    - "A pagina /contas-receber (lista) continua renderizando exatamente como antes da mudanca — nenhuma regressao visual causada pela extracao do CSS"
  artifacts:
    - "apps/frontend/src/app/contas-receber/admin-shell.tsx — passa a ser a fonte unica das classes pa-* compartilhadas"
    - "apps/frontend/src/app/contas-receber/[idcliente]/page.tsx — conteudo envolvido por <AdminShell> e reestilizado com pa-card / pa-table / pa-stat"
  key_links:
    - "O bloco <style> de AdminShell e a UNICA definicao das classes pa-* consumidas pelas duas paginas — se as regras nao forem movidas integralmente, a lista perde o estilo silenciosamente"
    - "Os modais ficam FORA de <AdminShell> e dependem de z-index 1050 (backdrop) > 1040 (sidebar) para aparecerem por cima do menu"
    - "A barra de acoes sticky precisa ficar DENTRO de <AdminShell> para respeitar o offset de 250px da sidebar"
---

<objective>
Portar a pagina de detalhe do cliente (`/contas-receber/[idcliente]`) para o mesmo layout PlainAdmin ja usado na pagina principal `/contas-receber`: mesma casca `AdminShell` (sidebar + topbar) e as mesmas classes `pa-*` de card, tabela e tipografia.

Purpose: o usuario pediu paridade visual explicita ("atualiza o layout para novo para fica tudo igual quem nem a pagina principal contas-receber"). Hoje a pagina de detalhe e a unica sobrevivente do estilo Bootstrap antigo (`container` + `orcamento-header`), o que quebra a continuidade ao navegar de "Ver Detalhe" na lista.

Output: as duas paginas de contas a receber compartilhando uma unica casca administrativa e um unico conjunto de estilos, sem nenhuma mudanca de dado, de fetch ou de regra de negocio.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Fonte de verdade visual (ja migrada, ler antes de editar o detalhe):
@apps/frontend/src/app/contas-receber/page.tsx
@apps/frontend/src/app/contas-receber/admin-shell.tsx

Alvo da migracao:
@apps/frontend/src/app/contas-receber/[idcliente]/page.tsx

Contexto do conteudo recem-adicionado que NAO pode se perder:
@.planning/quick/260905-dzi-atualizar-p-gina-de-detalhes-do-cliente-/260905-dzi-SUMMARY.md
</context>

<investigation_findings>
Levantamento feito no codigo vivo antes de escrever este plano (nao presumir, ja esta confirmado):

1. **O CSS `pa-*` NAO e compartilhado.** `admin-shell.tsx` define apenas as variaveis `:root --pa-*` e as regras de casca (`.pa-shell`, `.pa-sidebar`, `.pa-topbar`, `.pa-content`, `.pa-nav*`, `.pa-brand*`, `.pa-hamburger`, `.pa-backdrop`). Todas as regras de **componente** (`.pa-card*`, `.pa-table`, `.pa-pill*`, `.pa-stat*`, `.pa-aging*`, `.pa-vencer*`, `.pa-link-btn`, `.pa-id-badge`, `.pa-icon-btn`, `.pa-icon-muted`, `.pa-empty*`, `.pa-seg*`, `.pa-progress*`, `.pa-th-sort`, `.pa-td-cliente`, `.pa-row-critico`, `.bg-orange`, `.bg-danger-soft`) vivem no `<style>` inline de `contas-receber/page.tsx` (linhas ~597-778). Envolver o detalhe em `<AdminShell>` sozinho daria sidebar/topbar mas deixaria os cards e tabelas sem estilo. Por isso a Task 1 move esse CSS para `admin-shell.tsx`.
2. **A migracao do CSS e segura para a lista:** todo consumidor de `pa-*` em `page.tsx` esta dentro de `<AdminShell>` — inclusive `<ClienteAutocomplete>`, que e passado via prop `actions` e renderiza em `.pa-topbar-actions` dentro do shell.
3. **Falta uma variante:** so existem `.pa-pill-success`, `.pa-pill-warning` e `.pa-pill-secondary`. A pagina de detalhe precisa de vermelho (cliente com `bloqueaprazo === "S"`, boleto vencido) — `.pa-pill-danger` precisa ser criada.
4. **Estrutura atual do detalhe** (`[idcliente]/page.tsx`, 2544 linhas): tres wrappers `container` irmaos — `container my-4` (linha ~850, header `orcamento-header` + secao principal com Dados Cadastrais / Titulos em Aberto / cards de resumo / Contas Pagas / Itens Mais Comprados / Gasto por Mes), `container mt-3` (linha ~1376, NFS-e Emitidas) e `container mt-2 mb-3` (linha ~1482, Notas Fiscais Athos). Depois vem a barra de acoes sticky (~1598), tres modais (~1642-2431) e um `<style>` proprio dos modais (~2432-2541).
5. **`useEmpresa` fica orfao:** `EMPRESA_NOME` / `EMPRESA_LOGO_URL` sao usados exclusivamente no header que sera removido (linhas 854-860). `AdminShell` ja chama `useEmpresa` internamente para a marca da sidebar, entao o import (linha 6) e a desestruturacao (linha 138) precisam sair, senao viram variaveis nao usadas.
6. **Modais nao precisam mudar:** `.boleto-modal-backdrop` e `position: fixed; z-index: 1050`, acima da sidebar (1040). Ficam fora do `<AdminShell>` e continuam corretos.
7. **Autocomplete de cliente na topbar NAO se aplica aqui:** `<ClienteAutocomplete>` consome uma lista de clientes ja carregada; a pagina de detalhe busca apenas um cliente. Inclui-la exigiria um fetch novo — isso seria mudanca de logica, fora do escopo de re-skin. Decisao registrada, nao e lacuna.
8. **Referencia visual e a pagina irma, nao a skill.** A skill `bom-custo-design` descreve o tema "Painel" (acento teal `#0e6d73`, Layout v2). A implementacao viva de PlainAdmin (`--pa-accent: #3d42df`) foi estabelecida na quick task 260905-cyr e e o que o usuario pediu para replicar ("igual a pagina principal"). Seguir a pagina irma; nao reintroduzir o teal.
9. **Sem instalacao de pacotes:** nenhuma dependencia npm/pip/cargo e adicionada, portanto o gate de legitimidade de pacotes nao se aplica a este plano.
</investigation_findings>

<tasks>

<task type="tracer" tdd="false">
  <name>Task 1: Casca unica — extrair CSS pa-* compartilhado e envolver o detalhe em AdminShell</name>
  <files>apps/frontend/src/app/contas-receber/admin-shell.tsx, apps/frontend/src/app/contas-receber/page.tsx, apps/frontend/src/app/contas-receber/[idcliente]/page.tsx</files>
  <read_first>
    - `apps/frontend/src/app/contas-receber/admin-shell.tsx` inteiro (261 linhas) — a assinatura de `AdminShellProps` (`activeHref`, `title`, `subtitle`, `actions`, `children`) e o bloco `<style>` que recebera as regras novas.
    - `apps/frontend/src/app/contas-receber/page.tsx` linhas 590-781 — o bloco `<style>` a ser movido, na integra.
    - `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` linhas 1-10 e 130-145 (imports e topo do componente), 826-880 (abertura do return e header antigo), 1368-1380, 1475-1490 e 1592-1600 (as tres fronteiras de wrapper e o inicio da barra sticky).
  </read_first>
  <action>
Esta e a fatia ponta-a-ponta: depois dela a pagina de detalhe ja abre dentro da casca administrativa e ja tem todas as classes `pa-*` disponiveis, mesmo que o conteudo interno ainda esteja com o visual antigo.

Passo 1 — mover o CSS de componente para a casca. Recorte todo o conteudo do template literal do `<style>` de `contas-receber/page.tsx` (o bloco que comeca com a regra `.pa-card` e termina na media query de 992px) e cole-o ao final do template literal do `<style>` que ja existe em `admin-shell.tsx`, imediatamente apos a media query de 992px que ja esta la. As duas media queries podem coexistir como blocos separados — nao tente fundi-las. Copie verbatim: qualquer regra esquecida quebra a lista silenciosamente. Em seguida remova por completo o elemento `<style>` de `page.tsx`, deixando o restante do arquivo intocado (o `return` da lista passa a fechar logo apos `</AdminShell>`).

Passo 2 — completar a paleta de pills. Ainda em `admin-shell.tsx`, junto das outras variantes de pill, acrescente uma variante vermelha `pa-pill-danger` usando `rgba(229, 72, 77, 0.14)` como fundo e `var(--pa-danger)` como cor do texto, seguindo exatamente a forma das variantes ja existentes.

Passo 3 — envolver a pagina de detalhe. Em `[idcliente]/page.tsx`, dentro do `return`, mantenha os quatro elementos `Script`/`link` de Bootstrap como estao e substitua os tres wrappers `container` irmaos por um unico `<AdminShell>`:
  - `activeHref` recebe a rota da lista, para que o item de navegacao correspondente fique destacado;
  - `title` recebe o texto que hoje esta no `h3` do cabecalho antigo;
  - `subtitle` recebe o nome do cliente quando `dadosCliente` ja carregou, com fallback para uma etiqueta contendo o `idcliente` da rota;
  - `actions` recebe o link de volta para a lista, agora com a classe `pa-link-btn` no lugar das classes de botao Bootstrap, preservando o icone e o texto atuais.
Os filhos do `<AdminShell>` passam a ser, nesta ordem: o bloco de dados cadastrais, o bloco de titulos em aberto, os cards de resumo do historico, contas pagas, itens mais comprados, gasto por mes, a secao recolhivel de NFS-e emitidas, a secao recolhivel de notas fiscais Athos e, por ultimo, a barra de acoes sticky. Remova o wrapper de cabecalho antigo com a logo e o wrapper `orcamento-section` — a casca ja fornece superficie e espacamento. Remova tambem os dois `<hr />` que separavam as secoes recolhiveis. <!-- planner-discipline-allow: orcamento-header --> <!-- planner-discipline-allow: container my-4 -->

Passo 4 — os tres modais e o `<style>` dos modais permanecem exatamente onde estao, como irmaos do `<AdminShell>` dentro do fragmento externo. Nao os mova para dentro da casca.

Passo 5 — limpar o hook orfao. Como a marca agora e renderizada pela sidebar, remova do topo do arquivo a desestruturacao das constantes de empresa e o import do hook correspondente vindo de `@/lib/empresa`. <!-- planner-discipline-allow: useEmpresa -->

Nao altere nenhum `useState`, `useEffect`, funcao de fetch, handler ou string de copy nesta task. O conteudo interno de cada secao continua com as classes Bootstrap antigas — a Task 2 e a Task 3 cuidam disso.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p apps/frontend/tsconfig.json</automated>
    <automated>npm --prefix apps/frontend run build</automated>
    <automated>grep -q "pa-card" apps/frontend/src/app/contas-receber/admin-shell.tsx &amp;&amp; grep -q "pa-table" apps/frontend/src/app/contas-receber/admin-shell.tsx &amp;&amp; grep -q "pa-stat-icon" apps/frontend/src/app/contas-receber/admin-shell.tsx &amp;&amp; grep -q "pa-pill-danger" apps/frontend/src/app/contas-receber/admin-shell.tsx</automated>
    <automated>for s in pa-card pa-card-header pa-card-body pa-card-body-scroll pa-card-body-flush pa-icon-btn pa-icon-muted pa-empty pa-empty-erro pa-id-badge pa-table pa-td-cliente pa-th-sort pa-pill pa-pill-success pa-pill-warning pa-pill-secondary pa-row-critico pa-link-btn pa-seg pa-seg-btn pa-seg-btn-active pa-stat pa-stat-icon pa-stat-body pa-stat-label pa-stat-value pa-stat-value-accent pa-stat-value-danger pa-stat-value-success pa-stat-value-text pa-aging-grid pa-aging-card pa-vencer-grid pa-vencer-card pa-progress pa-progress-bar pa-progress-bar-success pa-progress-bar-warning pa-progress-bar-danger bg-orange bg-danger-soft; do grep -q "$s" apps/frontend/src/app/contas-receber/admin-shell.tsx || { echo "REGRA CSS PERDIDA NA MUDANCA: $s"; exit 1; }; done; echo "CSS OK"</automated>
    <automated>test 0 -eq $(grep -vE "^\s*(//|\{/\*|/\*|\*)" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx' | grep -c "orcamento-header")</automated>
    <automated>test 0 -eq $(grep -vE "^\s*(//|\{/\*|/\*|\*)" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx' | grep -c "useEmpresa")</automated>
    <automated>grep -q "AdminShell" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx'</automated>
    <automated>grep -q "boleto-modal-backdrop" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx'</automated>
  </verify>
  <done>
`admin-shell.tsx` contem todas as 42 regras `pa-*` listadas acima mais a variante vermelha nova; `contas-receber/page.tsx` nao tem mais bloco `<style>` proprio; a pagina de detalhe renderiza dentro de `<AdminShell>` com sidebar, topbar, titulo, subtitulo com o nome do cliente e link de volta; os tres modais seguem fora da casca; build e checagem de tipos limpos.
  </done>
  <reversibility rating="reversible">Mudanca puramente visual em tres arquivos versionados — `git revert` do commit restaura o estado anterior sem efeito colateral em dados.</reversibility>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin do bloco principal — dados cadastrais, titulos, resumo e historico</name>
  <files>apps/frontend/src/app/contas-receber/[idcliente]/page.tsx</files>
  <read_first>
    - `apps/frontend/src/app/contas-receber/page.tsx` linhas 135-232 (o painel de boletos: exemplo canonico de `pa-card` + `pa-card-header` + `pa-card-body` + `pa-table`) e linhas 394-436 (exemplo canonico de `pa-stat-grid` / `pa-stat` / `pa-stat-icon` / `pa-stat-label` / `pa-stat-value`).
    - `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`, o trecho que vai do bloco de dados cadastrais ate o fim do bloco de gasto por mes (aproximadamente linhas 876-1372 no arquivo original, deslocadas pela Task 1).
  </read_first>
  <action>
Reestilizar o conteudo do primeiro bloco, sem tocar em dado, fetch ou handler.

Cabecalhos de secao: cada titulo de secao (`Dados Cadastrais`, `Titulos em Aberto`, `Contas Pagas`, `Itens Mais Comprados`, `Gasto por Mes`) deixa de ser um heading Bootstrap solto e passa a ser o cabecalho de um cartao — use o par `pa-card` + `pa-card-header` como no painel de boletos da lista, mantendo o texto e o icone Bootstrap Icons atuais de cada secao, e coloque o conteudo em `pa-card-body`.

Dados cadastrais: o cartao interno vira um `pa-card` com `pa-card-body`. Mantenha a grade de duas colunas e os quatro pares rotulo/valor (nome, telefone, e-mail, limite de credito). A etiqueta vermelha que aparece quando o cliente esta com prazo bloqueado passa a usar a variante vermelha de pill criada na Task 1.

Cards de resumo do historico: os tres cartoes (`Total Ja Pago`, `Mes de Maior Gasto`, `Item de Maior Gasto`) trocam a grade de colunas Bootstrap por `pa-stat-grid`, e cada um vira `pa-card pa-stat` com `pa-stat-icon`, `pa-stat-body`, `pa-stat-label` e `pa-stat-value`. Escolha um icone Bootstrap Icons coerente para cada um (por exemplo cofre/moeda, calendario e etiqueta de item). Use a variante verde do valor para o total ja pago e a variante de acento para os outros dois. `pa-stat-grid` e definido com quatro colunas — envolva os tres cartoes em um elemento com `gridTemplateColumns` de tres colunas via `style` inline, ou adicione ao lado da declaracao existente uma classe modificadora de tres colunas no CSS da casca; qualquer das duas e aceitavel, escolha uma e seja consistente.

Tabelas: as tabelas de titulos livres, contas pagas, itens mais comprados e gasto por mes trocam as classes de tabela Bootstrap pela classe densa `pa-table`, e o wrapper de rolagem Bootstrap sai. O cabecalho claro Bootstrap tambem sai — `pa-table` ja estiliza `thead th`. Preserve integralmente todas as colunas, todos os `map`, todos os `key`, todos os formatadores de moeda e data e todo o texto de cabecalho. Nas celulas de valor monetario mantenha o negrito e o nao-quebra-linha equivalentes ao que a lista faz.

Grupos de boleto: o cartao de cada grupo (hoje uma borda arredondada com cabecalho e sub-tabela) vira um `pa-card` com `pa-card-header` no cabecalho do grupo e `pa-card-body` sem padding para a sub-tabela, que tambem passa a usar `pa-table`. As etiquetas de status do boleto (pago / cancelado / pendente) passam a usar as variantes de pill: verde para pago, cinza para cancelado, amarela para pendente.

Botoes de alternancia de `Itens Mais Comprados` (as duas opcoes de ordenacao): trocam os botoes Bootstrap pelo grupo segmentado `pa-seg` com `pa-seg-btn`, marcando o ativo com `pa-seg-btn-active` — mesmo padrao do filtro de status da lista.

Estados vazios e de erro: os avisos informativos Bootstrap dessas secoes passam a usar `pa-empty`, e os avisos de erro `pa-empty pa-empty-erro`. Preserve palavra por palavra o texto de cada mensagem existente.

Checkboxes de selecao de titulo, `selectedIds`, `totalSelecionado`, `boletoGrupos` e qualquer handler continuam exatamente como estao — apenas as classes de apresentacao mudam. <!-- planner-discipline-allow: table table-sm table-hover table-bordered -->
  </action>
  <verify>
    <automated>npx tsc --noEmit -p apps/frontend/tsconfig.json</automated>
    <automated>npm --prefix apps/frontend run build</automated>
    <automated>for s in dadosCliente boletoGrupos selectedIds totalSelecionado selecionadosSemNf historico totalPago titulosPagos mesMaiorGasto itensPorValor itensPorQuantidade formatMesAno formatBRL formatDate StatusEmailBadge badgeClassName bloqueaprazo limitecredito telefone_completo emailcliente nome_cliente; do grep -q "$s" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx' || { echo "SIMBOLO DE DADO PERDIDO: $s"; exit 1; }; done; echo "SIMBOLOS OK"</automated>
    <automated>for s in "Dados Cadastrais" "Títulos em Aberto" "Contas Pagas" "Itens Mais Comprados" "Gasto por Mês" "Total Já Pago" "Mês de Maior Gasto" "Item de Maior Gasto" "Nenhum título encontrado para este cliente." "Nenhuma conta paga encontrada para este cliente."; do grep -q "$s" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx' || { echo "COPY PERDIDA: $s"; exit 1; }; done; echo "COPY OK"</automated>
    <automated>test 0 -eq $(grep -vE "^\s*(//|\{/\*|/\*|\*)" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx' | sed -n '1,/Modal boleto/p' | grep -c "table table-sm table-hover table-bordered")</automated>
    <automated>test 3 -le $(grep -c "pa-stat" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx')</automated>
    <automated>git -C . diff --name-only HEAD -- apps/backend apps/frontend/src/app/globals.css | wc -l | grep -qx "0"</automated>
  </verify>
  <done>Dados cadastrais, titulos em aberto (incluindo grupos de boleto), os tres cards de resumo, contas pagas, itens mais comprados e gasto por mes renderizam com `pa-card` / `pa-table` / `pa-stat` / `pa-seg` / `pa-pill`; todos os simbolos de dados e todas as strings de copy verificadas acima continuam presentes; nenhum arquivo de backend ou o CSS global foi tocado.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Re-skin das secoes fiscais + barra de acoes, e conferencia visual</name>
  <files>apps/frontend/src/app/contas-receber/[idcliente]/page.tsx</files>
  <read_first>
    - `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`, os trechos das duas secoes recolhiveis (NFS-e emitidas e notas fiscais Athos) e da barra de acoes sticky, ja deslocados pelas tasks anteriores.
  </read_first>
  <action>
Parte automatica, antes do checkpoint:

Secoes recolhiveis: `NFS-e Emitidas` e `Notas Fiscais Athos` viram cada uma um `pa-card`. O botao que expande/recolhe vira o proprio `pa-card-header`, mantendo o texto atual e o indicador de aberto/fechado; substitua os triangulos de texto por icones de chevron dos Bootstrap Icons (para baixo quando aberto, para a direita quando fechado). O conteudo expandido vai para `pa-card-body`. Preserve os `ref` de rolagem, os observadores de interseccao e os estados de aberto/fechado exatamente como estao — eles controlam carregamento sob demanda.

Tabelas dessas duas secoes e a tabela de resultado da busca por numero de nota passam a usar `pa-table`, sem wrapper de rolagem Bootstrap e sem cabecalho claro Bootstrap. As etiquetas de tipo de nota produzidas pelo helper de classe de badge passam a usar variantes de pill em vez de classes de fundo Bootstrap. Preserve o campo de busca por numero, o botao de busca e todo o comportamento de tecla Enter.

Barra de acoes sticky: troque o objeto de estilo inline por classes, usando `var(--pa-surface)` como fundo e `var(--pa-border)` na borda superior, mantendo `position: sticky` no rodape e um `z-index` abaixo de 1040 para nao competir com a sidebar. Os dois botoes de acao passam a ter o visual de acento da casca; mantenha o texto, os icones, a condicao de desabilitado e o aviso vermelho de titulos sem nota fiscal palavra por palavra.

Os tres modais e o `<style>` deles continuam intocados.

Depois disso, pare para a conferencia humana descrita abaixo.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p apps/frontend/tsconfig.json</automated>
    <automated>npm --prefix apps/frontend run build</automated>
    <automated>for s in nfseEmitidas nfseAberta nfatAberta buscaNumeroNf buscarNotaPorNumero abreBoletoModal abreNfseModal boletoModalState nfseModalState emailModalState nfseRef nfatRef; do grep -q "$s" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx' || { echo "SIMBOLO PERDIDO: $s"; exit 1; }; done; echo "SIMBOLOS OK"</automated>
    <automated>for s in "NFS-e Emitidas" "Notas Fiscais Athos" "Gerar Boleto" "Anexar NFS-e" "Nenhuma NFS-e emitida para este cliente" "Buscar por número da nota"; do grep -q "$s" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx' || { echo "COPY PERDIDA: $s"; exit 1; }; done; echo "COPY OK"</automated>
    <automated>test 0 -eq $(grep -vE "^\s*(//|\{/\*|/\*|\*)" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx' | grep -c "table table-sm table-hover table-bordered")</automated>
    <automated>grep -q "boleto-modal-backdrop" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx' &amp;&amp; grep -q "1050" 'apps/frontend/src/app/contas-receber/[idcliente]/page.tsx'</automated>
    <human-check>
Suba o frontend (`npm --prefix apps/frontend run dev`), com Tailscale ativo para alcancar o Athos, e abra `http://localhost:3000/contas-receber`. Depois clique em "Ver Detalhe" de um cliente com movimento (por exemplo `/contas-receber/2829`) e confirme:

1. A sidebar escura de 250px e a topbar branca sao identicas as da pagina anterior, sem "salto" visual na navegacao, e o item "Contas a Receber" aparece destacado na sidebar.
2. O titulo da topbar mostra o detalhe do cliente e o subtitulo mostra o nome do cliente carregado.
3. Todas as secoes aparecem e continuam com os mesmos numeros de antes: dados cadastrais, titulos em aberto (com os grupos de boleto), os tres cards de resumo, contas pagas, itens mais comprados (alterne as duas ordenacoes) e gasto por mes.
4. As duas secoes fiscais abrem e fecham ao clicar e carregam suas tabelas.
5. Marque um titulo: a barra de acoes aparece no rodape, alinhada a direita da sidebar (nao por baixo dela). Abra "Gerar Boleto" e "Anexar NFS-e" e confirme que os modais cobrem a sidebar. Feche sem confirmar.
6. Reduza a janela para menos de 992px: a sidebar recolhe e o botao de menu aparece, igual a pagina da lista.
7. Volte para `/contas-receber` e confirme que a lista nao regrediu — cards de KPI, faixas de inadimplencia, tabela de clientes, painel de boletos e o autocomplete da topbar continuam estilizados.

Responda "ok" para concluir, ou descreva o que ficou diferente.
    </human-check>
  </verify>
  <done>As duas secoes fiscais e a barra de acoes usam o visual da casca; todos os simbolos e textos verificados continuam presentes; nenhuma tabela Bootstrap antiga sobrou fora dos modais; e o operador confirmou os sete pontos da conferencia visual.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador -> proxy Next (`/api/athos/contas-receber/...`) | Rotas de proxy ja existentes; este plano nao cria, remove nem altera nenhuma delas |
| navegador -> pagina `/contas-receber/[idcliente]` | Pagina alcancavel por quem chega ao app; condicao pre-existente, nao alterada aqui |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ENA-01 | Information Disclosure | `[idcliente]/page.tsx` sem gate de senha (o gate cobre so a lista) | medium | accept | Lacuna pre-existente ja registrada como T-DZI-02 no plano anterior; fecha-la e mudanca de comportamento, nao de layout. Este plano nao amplia a superficie: nenhum endpoint novo, nenhum dado novo, nenhuma rota nova |
| T-ENA-02 | Tampering | dependencias de terceiros | low | accept | Nenhum pacote npm/pip/cargo e instalado por este plano — o gate de legitimidade de pacotes nao se aplica |
| T-ENA-03 | Denial of Service | regressao visual silenciosa em `/contas-receber` ao mover o CSS | medium | mitigate | Loop de verificacao na Task 1 confere as 42 regras `pa-*` uma a uma em `admin-shell.tsx` e falha nomeando a regra ausente; o passo 7 da conferencia humana revalida a lista no navegador |
</threat_model>

<verification>
1. `npx tsc --noEmit -p apps/frontend/tsconfig.json` — sem erro (comando ja usado com sucesso neste mesmo arquivo na quick task 260905-dzi).
2. `npm --prefix apps/frontend run build` — limpo (comando ja usado com sucesso na quick task irma 260905-cyr, a migracao PlainAdmin da lista).
3. Loop de preservacao de regras CSS (Task 1): 0 regras `pa-*` perdidas na mudanca de arquivo.
4. Loops de preservacao de simbolos de dados e de copy (Tasks 2 e 3): 0 faltando.
5. Gate de escopo: `apps/backend` e `apps/frontend/src/app/globals.css` sem alteracao.
6. Conferencia humana nos sete pontos da Task 3.
</verification>

<success_criteria>
- `/contas-receber/[idcliente]` e `/contas-receber` compartilham a mesma sidebar, a mesma topbar e o mesmo conjunto de classes `pa-*`, servidos de um unico arquivo.
- Nenhuma secao, coluna, metrica, mensagem ou acao da pagina de detalhe foi perdida — incluindo tudo o que a quick task 260905-dzi acrescentou.
- Nenhuma mudanca de fetch, de estado, de regra de negocio ou de backend.
- Build e checagem de tipos do frontend limpos.
</success_criteria>

<output>
Criar `.planning/quick/260905-ena-atualizar-layout-da-pagina-de-detalhes-d/260905-ena-SUMMARY.md` ao concluir.
</output>
