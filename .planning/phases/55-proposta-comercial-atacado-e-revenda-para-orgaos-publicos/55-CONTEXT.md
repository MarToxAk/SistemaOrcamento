# Phase 55: Proposta comercial atacado e revenda para orgaos publicos - Context

**Gathered:** 2026-11-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Modulo novo, separado do fluxo de orcamento da grafica, para montar propostas comerciais de atacado/revenda aceitas por orgaos publicos:
buscar produtos do cadastro do Athos, ajustar nome/descricao curta e preco **somente na proposta**, associar um cliente do Athos,
ver custo para comparacao durante a montagem, gerar um PDF institucional serio (sistema de templates) e lancar a proposta como
**orcamento no Athos**. Nao inclui lancamento no caixa, venda, cobranca nem cadastro de cliente/produto no Athos.

</domain>

<decisions>
## Implementation Decisions

### Preco e produtos (decididos antes da discussao, 2026-11-27)
- **D-01:** Preco base de cada item = `precovendaproduto(idproduto)` do Athos (mesmo da busca da Fase 44). Promocao so vale quando valida — a propria funcao ja confere `promocaostatus` e o periodo `iniciopromocao..terminopromocao`; fora disso usa o preco de `precousado`. Sem colunas separadas de atacado/revenda.
- **D-02:** Ajuste de preco por % (+ ou -) ou valor digitado. Ajuste por % arredonda **sempre para cima** no centavo (ceil por item, no valor unitario).
  - **D-02a (esclarecimento, 2026-11-27):** "valor digitado" = o **novo preco unitario final** do item (substitui o preco base), nao um acrescimo em R$. Corresponde ao pedido original do usuario ("alterar preco digitando"); confirmado como leitura padrao e a ser conferido pelo usuario no checkpoint de homologacao.
- **D-03:** Ajuste de preco **NAO e desconto**. O preco ajustado vira o valor unitario do item: no PDF aparece so o valor final (sem "de/por", sem coluna de desconto) e no Athos vai `valoritem` = preco ajustado, `valordesconto = 0`, `orcamentoDesconto = 0`, `orcamentovalorfinalitem` = quantidade x preco, cabecalho com `desconto`/`descontoRS` = 0. E o mesmo comportamento do Balcao (captura 2 em referencia/athos-orcamento.md). **Nao** usar a regra D-04 da Fase 44 (`athos-orcamento-calc.util.ts`: preco abaixo do cadastro vira desconto implicito) — precisa de um modo/opcao proprio. — **Reversibility:** costly — orcamentos ja gravados no Athos ficariam com formato diferente.
- **D-04:** Nome e descricao curta editaveis so na proposta. O Athos recebe o produto original (`idproduto`); o PDF mostra o nome alterado **+ codigo do produto** (idproduto). Nunca alterar o cadastro do Athos.
- **D-05:** Todo item precisa existir no Athos (sem item avulso). Produto que falta e cadastrado pela tela de produto existente.

### Ciclo da proposta
- **D-06:** Status: rascunho, enviada (lancada no Athos + PDF oficial gerado), fechada (cliente aceitou), cancelada. Marcar fechada/cancelada e manual.
- **D-07:** **Gerar o PDF oficial = lancar no Athos** (opcao A escolhida pelo usuario). Orcamento no Athos nao e venda, entao lancar cedo e aceitavel. O numero da proposta no PDF e o `idorcamento` do Athos. Botao com confirmacao ("Gerar proposta e lancar no Athos"). — **Reversibility:** one-way — cria registro no Athos de producao (sem cancelamento capturado).
- **D-08:** Depois de lancada no Athos a proposta **nao pode ser editada**; so **duplicar** (gera novo rascunho com os mesmos itens, nomes e precos ajustados).
- **D-09:** A proposta guarda snapshot dos precos/nomes/custos do momento da montagem; mudancas posteriores no Athos nao alteram propostas existentes. Ao duplicar, manter os valores da proposta original (nao repuxar do Athos).
- **D-10:** Cancelar a proposta e so local (cancelamento de orcamento no Athos nao foi capturado).

### Tela de montagem
- **D-11:** Ajuste de preco e por item. Existe tambem uma acao "aplicar % em todos os itens" que aplica a mesma % a cada item (arredondando cada um para cima, conforme D-02).
- **D-12:** Na montagem, cada item mostra o **custo unitario** para comparacao (calculado como o Balcao: `valorcustocaixa/quantidadecaixa` + impostos/ipi/frete/outroimposto — ver referencia/athos-orcamento.md, passo 2) e a margem resultante. Custo e margem **nunca** aparecem no PDF.
- **D-13:** Preco abaixo do custo: linha destacada em vermelho com aviso; nao bloqueia (decisao do Claude, nao vetada).

### Cliente e lancamento no Athos
- **D-14:** O cliente da proposta e um cliente do Athos (busca existente `GET /athos/clientes` por nome/documento/id). O `idcliente` vai junto no orcamento lancado (a escrita da Fase 44 ja valida `idcliente`).
- **D-15:** Orgao sem cadastro no Athos: **obriga cadastrar no Athos antes** de gerar/lancar (opcao B). Rascunho pode existir sem cliente; gerar exige cliente.
- **D-16:** Dados de orgao publico extras, todos opcionais, guardados na proposta: numero do processo/pregao/dispensa, setor/responsavel no orgao, e-mail/telefone de contato. CNPJ, razao social e endereco vem do cadastro do Athos (podem ser sobrescritos na proposta para o PDF).

### Conteudo do PDF
- **D-17:** Numero da proposta = `idorcamento` do Athos (D-07).
- **D-18:** Dados bancarios: **Santander** (Ag <AGENCIA> / Cc <CONTA>, Bom Custo Papelaria & Grafica Rapida Ltda, CNPJ 62.391.927/0001-57). Guardar em configuracao, nao hardcoded no template.
- **D-19:** Assinante escolhido na hora de gerar (nome + cargo/CPF opcional); lista de assinantes salvos para reuso fica a criterio do Claude.
- **D-20:** Validade padrao **1 dia**; prazo de entrega padrao **15 dias**. Ambos vem preenchidos e sao editaveis por proposta.
- **D-21:** Campo de observacao livre na proposta, impresso no PDF.
- **D-22:** PDF com perfil institucional/serio (nao o visual colorido da grafica), via sistema de templates (`pdf-templates`), com linha propria de templates de proposta separada dos templates de orcamento da grafica. Colunas: codigo, descricao (alterada), unidade, quantidade, valor unitario, total. Sem coluna de **marca do produto** (`produto_marca`), sem valor por extenso e sem declaracoes (nao pedidos). "Marca" aqui e a marca do PRODUTO, nao a identidade da empresa: o cabecalho institucional pode ter o logo da Bom Custo (via `EMPRESA_LOGO_URL`, opcional) junto com razao social e CNPJ.

### Decisoes pos-pesquisa (2026-11-27, respostas do usuario as open questions do 55-RESEARCH.md)
- **D-23:** Preco-base com mais de 2 casas (ex: 3,456): arredondar **para cima no centavo** tambem quando nao ha ajuste. Toda conta de preco em centavos/milesimos com BigInt (nunca Math.ceil em float).
- **D-24:** Custo unitario: tratar `imposto`/`ipi`/`frete`/`outroimposto` NULL como 0 (COALESCE por termo), em vez de zerar o custo como a formula atual da Fase 44.
- **D-25:** PDF usa a **razao social** do cliente (`razaosocial`, mesmo com `nomefantasia` preenchida); campos de endereco ausentes aparecem como "nao informado" (nunca os fallbacks inventados `Centro`/`S/N`/`SP`).
- **D-26:** Produto que nao existe e cadastrado no **Athos desktop** (nao ha tela de cadastro de produto no frontend; nada a construir para isso).
- **D-27:** Margem exibida na montagem = margem liquida igual ao Athos: `(preco - custo) / preco` (mesmo conceito de `margemliquidavenda1`).
- **D-28:** Orcamento lancado por engano fica aberto no Athos e e cancelado pelo Balcao; no sistema so cancelamento local + duplicar (aceito pelo usuario).
- **D-29:** Forma de pagamento do orcamento lancado = a mesma configurada para a Fase 44 (`ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO`).
- **D-30 (Claude):** Kill-switch proprio para a escrita de propostas no Athos (ex: `PROPOSTA_ESCRITA_ATIVA`, desligado por padrao), separado de `ATHOS_ORCAMENTO_ESCRITA`. Templates de proposta ficam na tabela `PdfTemplate` com coluna de familia e ativacao escopada por familia; seed grava `isActive` so no create. Gravacao no Athos via funcao/metodo novos (`calcularLinhasProposta` / `criarOrcamentoProposta`), sem alterar `criarOrcamento` da Fase 44.
- **Debito registrado (fora do escopo):** `SQL_LER_PRODUTOS` da Fase 44 zera custo quando imposto e NULL — corrigir em fase propria.

### Claude's Discretion
- Layout e navegacao das telas (menu "Propostas", lista com filtro por status, tela de montagem).
- Modelo de dados local (tabelas novas para proposta/itens/config) e se reaproveita `Customer`.
- Destaque visual de preco abaixo do custo (D-13) e calculo da margem exibida.
- Lista de assinantes salvos (D-19).
- Preview do PDF no rascunho, desde que nao seja confundido com o oficial (ex: marca d'agua "PREVIA", sem numero).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SQL do Athos (capturas Frida/pktmon fornecidas pelo usuario)
- `.planning/phases/55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos/referencia/athos-orcamento.md` — insert de `orcamento`/`orcamento_item`/`orcamento_Forma_Pagamento`, preco alterado sem desconto (captura 2), calculo do custo unitario, lacunas (validade/obs/cliente nao capturados)
- `.planning/phases/55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos/referencia/athos-cadastro-produto.md` — campos de preco (`valorvenda1..6`, `precousado`, promocao), custo e margem

### Codigo existente a reaproveitar
- `apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts` — escrita de orcamento no Athos (Fase 44): transacao, idempotencia, validacao de `idcliente`, busca de produtos
- `apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.ts` — calculo em centavos/milesimos; regra D-04 (desconto implicito) que esta fase NAO deve aplicar
- `apps/backend/src/modules/integrations/athos/athos-orcamento-idempotencia.service.ts` — evitar lancamento duplicado
- `apps/backend/src/modules/pdf-templates/` — galeria/presets/ativacao de templates Handlebars
- `apps/backend/src/modules/quotes/quotes-pdf.template.ts` e `quotes-pdf-storage.service.ts` — geracao/armazenamento de PDF com Puppeteer
- `memory/athos_postgres_9_0_5.md` — Athos e PG 9.0.5 de producao; testes de escrita so no clone `athos-teste`

### Validacoes ja feitas (2026-11-27)
- Teste no clone `athos-teste` com ROLLBACK: orcamento do produto 60 a 2,90 (cadastro 3,30) x2, desconto 0 — aceito. `orcamento` tem rules DO ALSO (`atualizardatahorainsert/update`): nao usar INSERT dentro de CTE.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GET /athos/orcamentos/produtos` (`AthosOrcamentoService.buscarProdutos`): busca por descricao/referencia/codigo de barras/id com preco, estoque, unidade, `permiteFracionar` — falta devolver custo unitario para D-12.
- `POST /athos/orcamentos` (Fase 44): cria orcamento no Athos com itens e `idcliente`; precisa de modo "preco informado e o valor do item" (sem D-04) e de devolver o `idorcamento` para o PDF.
- `GET /athos/clientes`: busca cliente por nome/documento/id.
- `pdf-templates` (presets `colorful`/`minimal`/`classic`, enum `PdfTemplateKind`): base para templates de proposta.

### Established Patterns
- Athos: SQL direto via `pg`, valores em centavos/`bigint`, uma transacao, testes de escrita no clone `athos-teste`, flag de escrita desligavel.
- Backend NestJS por modulo + Prisma (migrations aditivas, provadas em Postgres descartavel); frontend Next.js 14 app router com proxy em `app/api`.

### Integration Points
- Novo modulo backend de propostas (Prisma) + uso do AthosOrcamentoService para lancar.
- Nova area no frontend (lista + montagem) e no menu; templates de proposta na tela `configuracoes/templates` ou equivalente.

</code_context>

<specifics>
## Specific Ideas

- "Perfil mais serio" no PDF, aceito por orgaos publicos — nao o visual atual da grafica.
- O fechamento deve sair "como se fosse o valor original sem desconto" (D-03).
- Custo visivel "na hora de comecar a montar o orcamento" para comparacao (D-12).

</specifics>

<deferred>
## Deferred Ideas

- Cadastro de cliente no Athos pelo sistema online (hoje: cadastrar no Athos desktop antes de lancar) — o usuario mencionou que pode fazer "a area de clientes" se precisar; fase propria.
- Gravar validade/observacao/prazo no orcamento do Athos (`validadeOrcamento`, `obs`, `dataentrega`) — campos nao capturados; precisam de nova captura antes. Nesta fase ficam so na proposta/PDF.
- Cancelar o orcamento no proprio Athos.
- Envio da proposta por e-mail/WhatsApp.

</deferred>

---

*Phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos*
*Context gathered: 2026-11-27*
