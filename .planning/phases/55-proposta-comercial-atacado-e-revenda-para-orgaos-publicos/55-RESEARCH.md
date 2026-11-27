<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Preco e produtos (decididos antes da discussao, 2026-11-27)
- **D-01:** Preco base de cada item = `precovendaproduto(idproduto)` do Athos (mesmo da busca da Fase 44). Promocao so vale quando valida — a propria funcao ja confere `promocaostatus` e o periodo `iniciopromocao..terminopromocao`; fora disso usa o preco de `precousado`. Sem colunas separadas de atacado/revenda.
- **D-02:** Ajuste de preco por % (+ ou -) ou valor digitado. Ajuste por % arredonda **sempre para cima** no centavo (ceil por item, no valor unitario).
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
- **D-22:** PDF com perfil institucional/serio (nao o visual colorido da grafica), via sistema de templates (`pdf-templates`), com linha propria de templates de proposta separada dos templates de orcamento da grafica. Colunas: codigo, descricao (alterada), unidade, quantidade, valor unitario, total. Sem marca, valor por extenso ou declaracoes (nao pedidos).

### Claude's Discretion
- Layout e navegacao das telas (menu "Propostas", lista com filtro por status, tela de montagem).
- Modelo de dados local (tabelas novas para proposta/itens/config) e se reaproveita `Customer`.
- Destaque visual de preco abaixo do custo (D-13) e calculo da margem exibida.
- Lista de assinantes salvos (D-19).
- Preview do PDF no rascunho, desde que nao seja confundido com o oficial (ex: marca d'agua "PREVIA", sem numero).

### Deferred Ideas (OUT OF SCOPE)
- Cadastro de cliente no Athos pelo sistema online (hoje: cadastrar no Athos desktop antes de lancar) — o usuario mencionou que pode fazer "a area de clientes" se precisar; fase propria.
- Gravar validade/observacao/prazo no orcamento do Athos (`validadeOrcamento`, `obs`, `dataentrega`) — campos nao capturados; precisam de nova captura antes. Nesta fase ficam so na proposta/PDF.
- Cancelar o orcamento no proprio Athos.
- Envio da proposta por e-mail/WhatsApp.

</user_constraints>

# Phase 55: Proposta comercial atacado e revenda para orgaos publicos - Research

**Researched:** 2026-11-27
**Domain:** Escrita de orcamento no ERP Athos (PostgreSQL 9.0.5 de producao), PDF institucional por template (Handlebars + Puppeteer + MinIO), modulo Prisma novo, telas Next.js
**Confidence:** MEDIUM. Codigo, schema e catalogo do clone foram lidos nesta sessao (HIGH). Regras de negocio, valores de configuracao de producao e comportamento do Balcao com dados nulos ficaram como ASSUMED ou open questions.

## Summary

A fase cabe no codigo existente, mas **nao pode reaproveitar o `criarOrcamento` da Fase 44 sem mudanca de comportamento**. O motivo central: o calculo da Fase 44 trata preco informado abaixo do cadastro como desconto implicito (`athos-orcamento-calc.util.ts:205` e `:216-217`), o que contradz D-03. A solucao recomendada e uma funcao pura nova para a proposta e um metodo novo de lancamento que reusa as constantes SQL e o esqueleto transacional, sem alterar `criarOrcamento` (os 95 testes unitarios da Fase 44 passaram nesta sessao e devem continuar passando).

Tres riscos reais aparecem na leitura do codigo e do catalogo do clone, e alteram o plano:

1. **Custo zerado com imposto NULL.** A formula de custo da Fase 44 (`athos.service`/`athos-orcamento.service.ts:194-196`) usa `COALESCE` no resultado inteiro. Se qualquer um dos termos `imposto`, `ipi`, `frete`, `outroimposto` for NULL, o custo vira 0. No clone, 91 dos 2410 produtos ativos tem `imposto` NULL. Exemplo verificado: produto 13523 (custo de caixa 15,40 / 12 unidades) sai com custo 0,000 pela formula da Fase 44 e 1,283 com COALESCE por termo.
2. **Ativar um template de proposta desativa o template de orcamento.** `PdfTemplatesService.activate` faz `updateMany({ data: { isActive: false } })` sem filtro (`pdf-templates.service.ts:113`), e o repositorio busca o ativo global sem `kind` (`pdf-templates.repository.ts:20-21`). Alem disso, o seed roda a cada boot do container e sobrescreve `isActive` dos presets (`seed-pdf-templates.ts:67-70`, `bootstrap-runtime.sh:25-27`).
3. **Cliente sem razao social separada.** `GET /athos/clientes` devolve `nome` com `nomefantasia` antes de `razaosocial` (`athos.service.ts:1369`), e o endereco usa fallbacks inventados (`Centro`, `S/N`, `SP`, `3520400`). Para um orgao publico, o PDF precisa da razao social real.

Outros pontos que mudam o desenho: o renderizador de PDF reduz o conteudo para caber em uma pagina A4 (`quotes-pdf-storage.service.ts:341-349`), o que deixa proposta longa ilegivel; o frontend roda **Next 16.2.5**, nao Next 14 como citam a memoria e o CONTEXT; os testes sao **Jest 30**, nao Vitest; e o `Customer` nao tem chave do Athos nem CNPJ, entao nao serve para o cliente da proposta.

**Primary recommendation:** modulo backend `propostas/` com (a) calculo puro em inteiros (`propostas-calc.util.ts`), (b) lancamento Athos como metodo novo `criarOrcamentoProposta` com marcador `obs` `[PROPOSTA] ref:<hash>`, (c) estado da proposta com compare-and-set antes de tocar o Athos, (d) familia de templates `PROPOSTA` com ativacao escopada e seed que nao sobrescreve `isActive` dessa familia, (e) renderizacao multipagina propria para proposta, (f) tabelas Prisma novas sem FK para o Athos, com migracao SQL manual idempotente validada em Postgres descartavel. Frontend: `app/propostas/*` com `AdminShell` (item novo em `PA_NAV_ITEMS`), `PasswordGate` e route handlers em `app/api/propostas/*` com `params: Promise<...>`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Preco base, ajuste por % (ceil), total de linha | API / Backend (funcao pura) | Browser (exibicao) | Regra monetaria precisa ser recalculada no servidor. Cliente nao envia preco final confiavel (D-02). |
| Custo unitario e margem (D-12) | API / Backend (leitura Athos read-only) | Browser (exibicao) | Custo vem do Athos; precisa ser persistido no snapshot (D-09) e nunca vai ao PDF. |
| Busca de produto com custo | API / Backend (pg, READ ONLY) | Browser (autocomplete) | Endpoint da IA (`/athos/orcamentos/produtos`) nao pode expor custo (`athos-orcamento.controller.ts:40`). |
| Busca de cliente Athos | API / Backend (pg) | Browser (`ClienteAutocomplete`) | `GET /athos/clientes` ja existe (`athos.controller.ts:141`); falta razao social. |
| Lancamento do orcamento no Athos | API / Backend (transacao pg) | Database externo (Athos PG 9.0.5) | Escrita one-way em producao; gate por env e idempotencia (D-07). |
| Estado e snapshot da proposta | Database (Prisma, banco do Sistema) | API | Snapshot imutavel depois de lancar (D-08, D-09). |
| Render do PDF oficial e de previa | API / Backend (Puppeteer) | Storage (MinIO) | Rede bloqueada no render (`shouldAllowRequest`); logo e assets inline. |
| Templates PROPOSTA (galeria/ativacao) | Database + API | Browser (`configuracoes/templates`) | Reuso de `pdf-templates`, com familia separada (D-22). |
| Telas /propostas (lista, montagem) | Browser (Next.js App Router) | Frontend server (route handlers `app/api/propostas`) | Padrao das telas de contas-receber e configuracoes. |
| Configuracao bancaria e de empresa | API / Backend (env) | Frontend (nao exibe segredos) | Precedente: v2.3 usa env em vez de tabela (STATE.md, decisao de 2026-06-17). |

## Standard Stack

### Core (todos ja instalados; nenhum pacote novo)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/common | ^11.1.19 | Modulo, controller, DTO, guards | `apps/backend/package.json` declara `"@nestjs/common": "^11.1.19"`. Padrao de todos os modulos. |
| @prisma/client / prisma | ^5.22.0 / CLI 5.22.0 | Banco do Sistema (proposta, itens) | `"@prisma/client": "^5.22.0"`; `npx prisma validate` retornou valid nesta sessao. |
| pg | ^8.20.0 (instalado 8.20.0) | Leitura e escrita no Athos (Pool, transacao) | `package.json:19` da raiz declara `"pg": "^8.20.0"`; `node_modules/pg` = 8.20.0. |
| puppeteer | ^24.40.0 | PDF oficial e previa | `"puppeteer": "^24.40.0"` em `apps/backend/package.json`. Chrome presente em `~/.cache/puppeteer/chrome`. |
| handlebars | ^4.7.9 | Template HTML do PDF | `"handlebars": "^4.7.9"`. Compilacao restrita `knownHelpersOnly` ja existente. |
| minio | ^8.0.7 | Armazenamento do PDF | `"minio": "^8.0.7"`. Usado por `QuotesPdfStorageService`. |
| class-validator / class-transformer | ^0.14.1 / ^0.5.1 | DTOs com whitelist | `ValidationPipe` global com `whitelist` + `forbidNonWhitelisted` (`create-athos-orcamento.dto.ts`, cabecalho). |
| sanitize-html | ^2.17.5 | Validacao de upload de template | `pdf-templates.service.ts` (`validateUpload`). |
| next | ^16.2.5 (instalado 16.2.5) | Telas e route handlers | `apps/frontend/package.json:12` declara `"next": "^16.2.5"`. **Nao e Next 14** (ver Pitfall 16). |
| react / react-dom | 18.3.1 | UI | `apps/frontend/package.json`. |
| jest / ts-jest | ^30.3.0 / ^29.4.9 | Testes | `apps/backend/package.json`; script `"test": "jest"`. **Nao e Vitest.** |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `athos-orcamento-calc.util.ts` (interno) | — | `paraMilli`, `paraCentavos`, `linhaCentavos`, `centavosParaTexto`, `milliParaTexto` (exportados) | Reusar a aritmetica em inteiros. Nao reescrever. |
| `athos-orcamento-idempotencia.service.ts` (interno) | — | `refDoOrcamento` (sha256 -> 12 hex) | Gerar o marcador `ref:` do `obs` para recuperacao de orfaos. |
| `QuotesPdfStorageService` (interno) | — | `renderHtml`, `renderPdfBuffer`, `renderPreviewPdf`, `objectExists`, `downloadObjectBuffer` | Reusar `renderPdfBuffer` apenas depois de adicionar variante sem `scale` (ver Architecture). |
| `PdfTemplatesService.validateUpload` | — | Validacao de upload (512 KB, padroes perigosos) | Mesmo caminho de upload para a familia PROPOSTA. |
| `ClienteAutocomplete` (`app/contas-receber/cliente-autocomplete.tsx:28`) | — | Autocomplete de cliente | Reuso possivel; hoje recebe `clientes` como prop (a pagina busca). |
| `AdminShell`, `PasswordGate` | — | Layout e gate de senha | Padrao de todas as telas administrativas. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Modo novo em `calcularOrcamento` (flag) | Funcao pura nova `calcularLinhasProposta` | Recomendado: funcao nova nao muda nenhum teste da Fase 44. Flag no calculo compartilhado aumenta o risco de regressao. |
| `Customer` (Prisma) como cliente da proposta | Snapshot do cliente Athos na propria proposta (`idclienteAthos Int`, sem FK) | `Customer` nao tem `idcliente` do Athos, CNPJ nem endereco (`schema.prisma:43-57`). |
| Familia de template como coluna nova em `PdfTemplate` | Tabela `PropostaPdfTemplate` separada | Coluna reusa galeria, upload e preview. Tabela separada isola o risco, ao custo de duplicar o codigo. Ver Open Question 6. |
| Renderizacao multipagina propria | Reusar `renderPdfBuffer` | `renderPdfBuffer` forca uma pagina (`quotes-pdf-storage.service.ts:341-349`). Nao serve para 200 itens. |

**Installation:** nenhuma. Nao ha pacote novo recomendado.

**Version verification:** versoes conferidas nos `package.json` e em `node_modules` nesta sessao (`pg` 8.20.0, `next` 16.2.5, `prisma` CLI 5.22.0). Nao foi consultado registro npm para pacotes novos, porque nenhum e proposto.

## Package Legitimacy Audit

Nenhum pacote externo novo e recomendado. O gate de legitimidade nao se aplica a esta fase. Se o planner decidir adicionar uma dependencia (por exemplo, um gerador de PDF alternativo), ela deve passar pelo gate `gsd-tools query package-legitimacy check` antes de entrar no plano.

## Architecture Patterns

### System Architecture Diagram

```
  Browser (Next 16, /propostas)
     |  fetch /api/propostas/...  (route handlers, params: Promise<...>)
     v
  Nest: propostas.controller  [@AdminOnly()]  -- PDF oficial e previa, lancar, duplicar
     |
     +-- busca produto com custo ----> AthosOrcamentoService.buscarProdutosProposta (pg, READ ONLY)
     |                                    |
     +-- busca cliente (+razao) ------> AthosService.buscarClienteParaProposta (pg, READ ONLY)
     |
     +-- rascunho / duplicar ---------> PropostasService --> Prisma (Proposta, PropostaItem)
     |
     +-- GERAR (lancar) ---------------> PropostasService
            0. capturarSnapshot do PDF (banco, empresa, fonte do template): falha aqui = RASCUNHO intacto, Athos intocado
            1. CAS no Prisma: RASCUNHO -> LANCANDO + pdfSnapshot  (se count != 1: conflito, nada e gravado)
            2. calcularLinhasProposta (funcao pura, inteiros, sem D-04)
            3. criarOrcamentoProposta: BEGIN; SET TRANSACTION READ WRITE (padrao); INSERT orcamento
               RETURNING idorcamento; INSERT itens; DELETE+INSERT pagamento; COMMIT  -> Athos (producao)
            4. Prisma: idorcamentoAthos, status ENVIADA  (se falhar: recuperar por obs LIKE '[PROPOSTA] ref:<ref>%')
            5. PropostasPdfService: HTML (familia PROPOSTA) so pelo pdfSnapshot -> Puppeteer multipagina (sem scale)
            6. MinIO prefixo "propostas/" -> Prisma: pdfObjectName
            (falha em 5-6 NAO relanca no Athos: so repete o PDF, regenerado do mesmo pdfSnapshot)
```

Os passos 3 e 5 nao podem estar na mesma transacao. O INSERT em `orcamento` dispara uma regra que atualiza `conf_inicial` (ver Pitfall 11), e o PDF nao deve segurar esse lock.

### Recommended Project Structure
```
apps/backend/src/modules/propostas/
├── propostas.module.ts            # importa AthosModule, PdfTemplatesModule (ou QuotesModule)
├── propostas.controller.ts        # @AdminOnly(); rotas estaticas antes de :id
├── propostas.service.ts           # rascunho, itens, duplicar, lancar (CAS), status
├── propostas-calc.util.ts         # PURO: ajuste % (ceil), total, custo, margem, sem I/O
├── propostas-calc.util.test.ts
├── propostas-pdf.service.ts       # payload + HTML (familia PROPOSTA) + render multipagina + MinIO
├── dto/                           # class-validator; nenhum campo de custo em DTO de saida
└── propostas.service.test.ts      # Prisma e pg mockados
apps/backend/src/modules/integrations/athos/
├── athos-orcamento.service.ts     # +criarOrcamentoProposta, +buscarProdutosProposta (metodos novos)
└── athos-orcamento.service.test.ts  # INTOCADO (regressao)
apps/backend/templates/
└── proposta-institucional.hbs     # PRESET da familia PROPOSTA (sem URL externa, sem script)
apps/frontend/src/app/propostas/
├── page.tsx                       # lista com filtro por status
├── nova/page.tsx                  # rascunho
└── [id]/page.tsx                  # montagem (custo, margem, ajuste %, gerar)
apps/frontend/src/app/api/propostas/...   # proxies (padrao app/api/athos/clientes/route.ts)
```

### Pattern 1: Lancamento como metodo novo, nao como modo do `criarOrcamento`
**What:** `criarOrcamentoProposta(input)` no `AthosOrcamentoService` (que ja tem `getPool`, `lerSomenteLeitura`, `mapearErroPg` privados) reusa `SQL_INSERIR_ORCAMENTO`, `SQL_INSERIR_ITEM`, `SQL_LIMPAR_PAGAMENTO`, `SQL_INSERIR_PAGAMENTO` (exportando-as) e a sequencia `BEGIN` / `SET LOCAL statement_timeout` / `COMMIT` / `ROLLBACK`.
**When to use:** sempre para proposta. `criarOrcamento` continua intocado.
**Diferencas obrigatorias em relacao ao `criarOrcamento`:**
- Sem `montarObsOrcamento` da IA. O `obs` vira `[PROPOSTA] ref:<12 hex>` (sem observacao de usuario; a observacao vai so para o PDF, D-21).
- Sem `calcularOrcamento` nem `ratear`. Itens com `valoritem` = preco final informado, `valordesconto` = 0, `orcamentodesconto` = 0, `orcamentovalorfinalitem` = `linhaCentavos(q, preco)`.
- Cabecalho com `descontors` = 0 e `desconto` = 0 (`SQL_INSERIR_ORCAMENTO` ja recebe esses parametros).
- `RETURNING idorcamento, senhabalcao` (ja existe). Para a data do PDF, incluir `to_char(dataorcamento,'YYYY-MM-DD')` e `to_char(hora,'HH24:MI:SS')` no mesmo `RETURNING` ou em um `SELECT` dentro da transacao (ver Pitfall 13).
- Gate de escrita proprio (ver Security e Open Question 5).

### Pattern 2: Estado com compare-and-set antes de tocar o Athos
**What:** a proposta passa de `RASCUNHO` para `LANCANDO` com um `updateMany` condicionado ao status. So o chamador que ganhou a troca chama o Athos. Depois do COMMIT, grava `idorcamentoAthos` e `ENVIADA`. Se a gravacao local falhar depois do COMMIT, o orcamento existe no Athos e a proposta fica em `LANCANDO`. A recuperacao procura `obs LIKE '[PROPOSTA] ref:<ref>%'` no Athos. Esse e o mesmo mecanismo da Fase 44 (`athos-orcamento-idempotencia.service.ts:18-20`).
**Why:** dois cliques em "Gerar" nao podem criar dois orcamentos no Athos de producao (D-07).

### Pattern 3: Familia de templates PROPOSTA com ativacao escopada
**What:** adicionar uma coluna `familia` (ex.: `ORCAMENTO` | `PROPOSTA`, default `ORCAMENTO`, backfill das linhas existentes). `activate`, `list` e `getActiveSource` filtram por familia. O seed nao sobrescreve `isActive` dos presets de `PROPOSTA`.
**Why:** D-22 exige linha propria. Sem o filtro, `activate` desativa todo o resto (ver Pitfall 5).

### Pattern 4: Renderizacao multipagina para proposta
**What:** variante de `renderPdfBuffer` sem `scale` e com cabecalho/rodape de pagina (`displayHeaderFooter`), margens reais e quebra de linha entre paginas. Manter o mesmo `shouldAllowRequest` (rede bloqueada) e o mesmo Handlebars restrito.
**Why:** `renderPdfBuffer` calcula `scale = A4_HEIGHT_PX / contentHeight` (`quotes-pdf-storage.service.ts:341-349`). Com 60 itens a escala cai para perto do minimo (0,1) e o texto fica ilegivel.

### Anti-Patterns to Avoid
- **Reusar `criarOrcamento` com `valorUnitario` abaixo do preco:** gera desconto implicito (`athos-orcamento-calc.util.ts:216-217`) e pode bloquear com `DESCONTO_ACIMA_LIMITE` pelo `permitedescontode` global (`:248`).
- **Recalcular o preco no Athos na hora de lancar:** a proposta usa o snapshot (D-09). O lancamento so valida que o produto existe e esta ativo, e que o preco base ainda e >0 quando a regra exigir.
- **Usar `Math.ceil(preco * (1 + pct/100) * 100)` em ponto flutuante:** ver Code Examples (3,50 +10% sai 3,86 em vez de 3,85).
- **Gerar o PDF dentro da transacao do Athos:** segura o lock de `conf_inicial` (Pitfall 11).
- **Enviar `nome`/`descricao` alterados ao Athos:** D-04 manda o produto original; alem disso `sanitizarTextoAthos` remove acentos (`athos-conta-receber-baixa.service.ts:166-174`).
- **Adicionar helpers Handlebars de formatacao:** `KNOWN_HELPERS` e vazio e o registro e restrito (`quotes-pdf-storage.service.ts`, comentario "NAO adicionar helpers de I/O"). Formatar valores em TypeScript antes do `template(...)`, como ja e feito.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Aritmetica de centavos e milesimos | Operacoes com `number` e `toFixed` | `paraMilli`, `paraCentavos`, `linhaCentavos`, `milliParaTexto` (exportados de `athos-orcamento-calc.util.ts`) | Ja tem recusa de mais de 3 casas, limite de linha e half-up. Testado (260 linhas de teste). |
| Escrita no Athos | Novo cliente pg ou SQL solto | `AthosOrcamentoService` (Pool, `lerSomenteLeitura`, `mapearErroPg`) | Trava de host de teste (`assertHostPermitido`), timeout e mapeamento de `42501` (GRANT ausente). |
| Idempotencia de lancamento | Flag booleana na proposta | Compare-and-set + marcador `obs` (padrao Fase 44) | Booleano sem transacao deixa a corrida aberta. |
| Armazenamento e download de PDF | Filesystem local | `QuotesPdfStorageService` (MinIO) + `downloadObjectBuffer` | Padrao existente, backup e acesso ja resolvidos. |
| Validacao de template enviado | Regex nova | `PdfTemplatesService.validateUpload` | Ja rejeita script, `on*=`, `javascript:`, `file:` e limite de 512 KB. |
| Gate de senha de tela | Login novo | `components/password-gate.tsx` (cookie `orcamento_admin_session`) | Mesma rota `/api/admin/login`, sem nova env var. |
| Autocomplete de cliente | Componente novo | `ClienteAutocomplete` (`cliente-autocomplete.tsx:28`) | Ja existe; avaliar reuso antes de criar outro. |
| Menu lateral | Layout novo | `PA_NAV_ITEMS` em `app/contas-receber/admin-shell.tsx:13` | Item "Propostas" entra aqui. |

**Key insight:** o que nao pode ser reaproveitado sem mudanca e a *regra de preco* (D-04 da Fase 44) e o *lookup de template ativo*. O resto da infraestrutura (transacao, pool, storage, gate, menu) serve como esta.

## Runtime State Inventory

Nao se aplica. A fase cria modulo novo (greenfield), sem renomear nem migrar strings existentes. A unica mudanca em estado existente e a coluna `familia` na tabela `PdfTemplate`, que e aditiva com default e backfill (ver Pattern 3 e Pitfall 5).

## Common Pitfalls

### Pitfall 1: Preco informado abaixo do cadastro vira desconto (Fase 44)
**What goes wrong:** `calcularOrcamento` grava `valoritem = max(vu, precoMilli)` (`athos-orcamento-calc.util.ts:205`) e trata a diferenca como desconto implicito (`:216-217`). Para D-03 isso esta errado: o Athos recebe `valoritem` = preco do cadastro e `valordesconto` > 0.
**Why it happens:** a regra D-04 da Fase 44 foi escrita para "preco negociado com desconto", que e outro caso.
**How to avoid:** funcao pura nova `calcularLinhasProposta(linhas)` com `valorItem = precoFinal`, `desconto = 0`, sem rateio e sem limite `permitedescontode`. Nao alterar `calcularOrcamento`.
**Warning signs:** `valordesconto` diferente de zero em orcamento de proposta no clone; `DESCONTO_ACIMA_LIMITE` ao lancar proposta com preco baixo.
**Nota de limite:** `permitedescontode` e percentual (`conf_vendas` = `100.000` no clone). Se a producao tiver um valor menor, um preco 20% abaixo do cadastro seria recusado pela Fase 44. Esse valor de producao nao foi lido (ASSUMED).

### Pitfall 2: Custo zerado quando algum imposto e NULL
**What goes wrong:** `round(COALESCE(CASE ... END, 0), 3)` (`athos-orcamento.service.ts:194-196`) transforma um custo NULL em 0. A expressao inteira vira NULL se qualquer termo do `+` for NULL.
**Evidence:** no clone, `imposto` NULL em 91 de 2410 produtos ativos; `ipi` NULL em 90; `frete` NULL em 91; `outroimposto` NULL em 91. `valorcustocaixa` NULL em 0. Produto 13523: custo de caixa 15,400, quantidade de caixa 12,000, impostos NULL. Formula da Fase 44 = 0,000. Formula corrigida = 1,283.
**How to avoid:** `COALESCE` em cada termo (ver Code Examples). A formula corrigida bate com os custos capturados do Balcao para os produtos que tinham todos os impostos preenchidos: produto 10 = 0,033 (captura 1, `referencia/athos-orcamento.md:88`) e produto 60 = 1 (captura 2, `:129` e `:151`). O produto 60 tambem teve 0,853 na captura 1 (`:89`), entao o custo muda com o cadastro e precisa ser lido na hora, como o Balcao faz (`:151`).
**Warning signs:** custo 0,000 em produto com preco > 0; margem de 100%.
**Nota:** o Balcao usa a mesma formula sem COALESCE. O comportamento dele com NULL nao foi capturado (ASSUMED). Ver Open Question 2.

### Pitfall 3: Ceil em ponto flutuante
**What goes wrong:** `Math.ceil(3.5 * 1.1 * 100) / 100` = 3,86. O correto e 3,85.
**Evidence (executado nesta sessao com node):** `3.5 +10%` bruto = `3.8500000000000005`, naive = `3.86`, exato em centavos = `3.85`. `1.1 +10%`: naive = `1.22`, exato = `1.21`.
**How to avoid:** BigInt em milesimos e centavos (ver Code Examples). D-02 pede ceil no centavo; a conta tem que ser exata.

### Pitfall 4: Preco com sub-centavo vs PDF em centavos
**What goes wrong:** `precovendaproduto` devolve `numeric(9,3)` (ver Pitfall 12 para o tipo). No clone, 303 de 2410 produtos ativos tem `valorvenda1` com mais de 2 casas. Se o PDF mostrar 2 casas e o Athos guardar 3, o total impresso nao bate com a soma do Athos.
**How to avoid:** decidir (Open Question 1) e aplicar a mesma regra no snapshot, no PDF e no Athos. Recomendacao: normalizar o preco unitario da proposta para centavos no momento do snapshot, com ceil (mesma regra de D-02), e somar a partir dai.
**Warning signs:** total do PDF diferente de `orcamento.valor` do Athos em centavos.

### Pitfall 5: Ativacao de template de proposta desativa o de orcamento
**What goes wrong:** `activate()` faz `this.prisma.pdfTemplate.updateMany({ data: { isActive: false } })` (`pdf-templates.service.ts:113`), sem filtro. `getActiveSource()` busca `findFirst({ where: { isActive: true } })` (`pdf-templates.repository.ts:20-21`), sem familia. `resolveTemplateSource` usa esse ativo global (`quotes-pdf-storage.service.ts:268`).
**How to avoid:** coluna `familia`; `activate` com `where: { familia }`; `getActiveSource(familia)`; `resolveTemplateSource` passa `ORCAMENTO` explicitamente; galeria filtra por familia. Teste: ativar um PROPOSTA nao muda o ativo de ORCAMENTO.

### Pitfall 6: Seed a cada boot sobrescreve isActive
**What goes wrong:** `bootstrap-runtime.sh:25-27` roda `seed-pdf-templates.ts` a cada start do container (o `CMD` do `Dockerfile:42` e esse script). O seed faz `upsert` com `update: { name, source, isActive: preset.isActive }` (`seed-pdf-templates.ts:67-70`). Efeitos: (a) `colorful` volta a ficar ativo em todo deploy; (b) como o seed nao desativa os outros, um template custom ativado pelo operador continua ativo ao lado do `colorful`, e `findFirst` escolhe um deles sem ordem definida; (c) presets de PROPOSTA com `isActive: false` seriam desativados a cada boot.
**How to avoid:** para a familia PROPOSTA, gravar `isActive` apenas no `create`. Para ORCAMENTO, considerar corrigir o caso (b) (fora do escopo da fase, mas precisa ser registrado). Teste: segundo seed nao altera `isActive` de PROPOSTA.
**Nota de teste:** `pdf-templates.presets.test.ts` (linha 212 em diante) replica a lista de presets dentro do teste e nao importa o script real. Ele nao pega regressao no seed de verdade.

### Pitfall 7: Proposta longa vira uma pagina ilegivel
**What goes wrong:** `renderPdfBuffer` reduz para uma pagina (`quotes-pdf-storage.service.ts:341-349`). Phase 44 aceita ate 200 itens por orcamento.
**How to avoid:** variante multipagina (Pattern 4). Teste: 60 itens geram 2 ou mais paginas com `scale` 1.

### Pitfall 8: Razao social e endereco do cliente
**What goes wrong:** (a) `buscarClientes` devolve `nome` = `nomefantasia` antes de `razaosocial` (`athos.service.ts:1369`); `buscarClientePorId` faz o mesmo (`athos.service.ts:1126`). Para um orgao publico, o nome pode nao ser a razao social. (b) Os fallbacks de endereco (`"Centro"`, `"S/N"`, `"SP"`, `"3520400"`) preenchem campos que nao existem no cadastro. Em documento de licitacao, isso vira dado inventado impresso.
**How to avoid:** adicionar `razaoSocial` como campo novo e aditivo na resposta (nao renomear `nome`, que e usado pelo NFS-e e pelo `TomadorAthosSearch`). Para o PDF, mostrar o campo real e marcar "nao informado" quando faltar, sem fallback silencioso. Endereco: o fallback atual nao deve ser reutilizado.
**Evidence da estrutura:** `cliente_juridico` tem `razaosocial`, `nomefantasia` e `cnpj` (clone). Os contatos ficam em `cliente`: `emailcliente` e `c.dddtelefoneempresa || c.telefoneempresa` (`athos.service.ts:1167-1168`, dentro de `buscarDadosClienteContasReceber`, que comeca em `:1152`). Esse metodo e a fonte para o contato da proposta, se o planner quiser prefill (D-16 deixa o contato como campo manual).

### Pitfall 9: Reusar `Customer`
**What goes wrong:** `Customer` tem `fullName`, `phone`, `email`, `source`, `chatwootContactId` (`schema.prisma:43-57`). Nao tem `idcliente` do Athos, CNPJ, razao social nem endereco.
**How to avoid:** proposta guarda `idclienteAthos Int` sem FK (padrao de `CobrancaBoleto`, `CobrancaEmailEnvio` e `CobrancaAvisoVencimento`, que usam o mesmo nome de campo) e um snapshot em JSON.

### Pitfall 10: Orfao depois do COMMIT no Athos
**What goes wrong:** o COMMIT do Athos acontece, e a gravacao local em seguida falha (queda, timeout). A proposta fica em `LANCANDO` e o operador tenta de novo, criando um segundo orcamento.
**How to avoid:** Pattern 2. O `obs` carrega `[PROPOSTA] ref:<hash>`, a retentativa primeiro consulta o Athos pelo marcador (`obs LIKE '[PROPOSTA] ref:<ref>%'`, com `ref` hexadecimal, sem caracteres do LIKE) e so relanca se nao achar. Tambem vale um botao "Recuperar lancamento" para o caso manual.

### Pitfall 11: Concorrencia com o Balcao (regra em `orcamento`)
**What goes wrong:** o Athos tem regras que disparam em todo INSERT e UPDATE de `orcamento`:
```
atualizardatahorainsert | CREATE RULE atualizardatahorainsert AS ON INSERT TO public.orcamento DO  UPDATE conf_inicial SET datahora = now();
atualizardatahoraupdate | CREATE RULE atualizardatahoraupdate AS ON UPDATE TO public.orcamento DO  UPDATE conf_inicial SET datahora = now();
```
Cada escrita em `orcamento` segura o lock da linha de `conf_inicial` ate o COMMIT. Isso serializa o Balcao e a proposta.
**How to avoid:** transacao curta (so INSERTs), sem PDF, sem MinIO e sem chamada HTTP dentro dela. Nao usar INSERT em CTE (a Fase 44 ja evita isso pelo mesmo motivo).

### Pitfall 12: Compatibilidade com PostgreSQL 9.0.5 (producao)
**What goes wrong:** o Athos de producao roda PostgreSQL 9.0.5 (`memory/athos_postgres_9_0_5.md`). Sem `FILTER`, `LATERAL`, `GROUPING SETS`, `ON CONFLICT`, `jsonb`, `pg_sequence_last_value`.
**How to avoid:** SQL novo no Athos usa `$n`, `RETURNING`, `CASE WHEN`, `COALESCE`, `to_char`. O clone (PostgreSQL 14.24, verificado) aceita mais coisa do que a producao: testar so com o subconjunto compativel.
**Tipos verificados no clone:**
- `precovendaproduto` retorna o dominio `monetario`, de base `numeric` com typmod 589831. Decodificando (589831 − 4 = 589827 = 9×65536 + 3), o tipo e `numeric(9,3)`.

### Pitfall 13: Data e hora do orcamento
**What goes wrong:** o INSERT usa `current_date` e `current_time(0)` do servidor de banco (`athos-orcamento.service.ts:202`). Se o PDF usar a data do Node, pode divergir do `dataorcamento` gravado no Athos.
**How to avoid:** ler `dataorcamento` e `hora` do Athos dentro da transacao (ou no mesmo `RETURNING`) e imprimir esses valores. A validade de 1 dia (D-20) continua so no PDF, porque `orcamento.validadeorcamento` e `DATE` e nao sera gravado (deferido).

### Pitfall 14: `descontomaximo` e o limite do Athos
**Pergunta do CONTEXT:** o `descontomaximo` do produto bloqueia preco abaixo do catalogo?
**Resposta:** no codigo atual, nao. `criarOrcamento` nao consulta `descontomaximo` (comentario em `athos-orcamento.service.ts:564`: "descontomaximo do produto NAO e consultado (D-04): so o limite global de conf_vendas vale"). O que pode bloquear e `permitedescontode` global (`athos-orcamento-calc.util.ts:248`), e so quando a regra de desconto implicito e aplicada (Pitfall 1). Com a funcao nova, nenhum limite e aplicado a precos da proposta.

### Pitfall 15: Proposta aparece como orcamento aberto no Balcao
**What goes wrong:** `buscarOrcamento` trata `statusorcamento` NULL como `aberto` (`athos-orcamento.service.ts:800`). Um orcamento de proposta fica aberto no Balcao e pode ser convertido em venda por engano. Cancelamento no Athos nao foi capturado (D-10, deferido).
**Efeitos laterais verificados:** o listener de caixa so atua quando existe `relacao_orcamento_venda` (`athos-listener.service.ts:106-116`). Depois, `persistPaymentNote` atualiza `Quote` pelo `externalQuoteId` (`:159-175`). Proposta nao tem `Quote`, entao o efeito e nulo. Nenhum fluxo le a tabela `orcamento` por status (busca em `src/`: so `athos-orcamento.service.ts` e `athos.service.ts:689`, que busca por numero).
**Recomendacao:** orientar o operador (fora do sistema) a nao converter. Registrar na UI que a proposta esta lancada e nao cancelavel pelo sistema.

### Pitfall 16: Versao do Next
**What goes wrong:** CONTEXT e memoria citam Next.js 14. O repositorio declara `"next": "^16.2.5"` (`apps/frontend/package.json:12`), e `node_modules/next` esta em 16.2.5.
**How to avoid:** usar convencoes do Next 16. Em route handlers dinamicos, `params` e Promise: `{ params }: { params: Promise<{ idcliente: string }> }` (`app/api/athos/clientes/[idcliente]/notas-fiscais/route.ts:7`).

### Pitfall 17: Bug existente de custo na Fase 44 (fora do escopo)
`SQL_LER_PRODUTOS` (`athos-orcamento.service.ts:192-197`) usa a mesma formula com COALESCE global. Orcamentos criados pela IA gravam `valorcustoitem` = 0 para os produtos com imposto NULL (Pitfall 2). Nao afeta o Balcao, mas afeta relatorios de margem. Recomendacao: registrar como item separado, nao corrigir nesta fase sem pedido, porque mexe em codigo da Fase 44.

### Pitfall 18: A "tela de produto" de D-05 nao existe no frontend
`apps/frontend/src` nao tem tela de cadastro de produto. Ha API `athos/produtos` (`athos-produto.controller.ts:30`), sem UI. D-05 diz "cadastrado pela tela de produto existente", que provavelmente e o Athos desktop (captura `referencia/athos-cadastro-produto.md`). Ver Open Question 4.

### Pitfall 19: Textos do Athos e do PDF
`sanitizarTextoAthos` (`athos-conta-receber-baixa.service.ts:166-174`) remove acentos e tudo fora de `[A-Za-z0-9 .,:/-]`. Isso e correto para o `obs` do Athos e errado para o PDF. Nao reusar essa funcao no PDF. Nome e descricao alterados (D-04) nao vao ao Athos.

## Code Examples

### Ajuste de preco com ceil exato em centavos (BigInt)
```typescript
// Preco em milesimos (3.500 -> 3500n). Percentual em milesimos de % (10% -> 10000n; -10% -> -10000n).
// Retorno: preco unitario em CENTAVOS (385n = R$ 3,85). Ceil exato, sem ponto flutuante.
export function ajustarPrecoCentavos(precoMilli: bigint, pctMilli: bigint): bigint {
  const num = precoMilli * (100_000n + pctMilli); // preco * (1 + pct/100) * 100000
  const den = 1_000_000n;                          // 100000 (pct) * 10 (milesimo -> centavo)
  return (num + den - 1n) / den;                   // ceil para num positivo
}
```
Conferido nesta sessao com a mesma conta: 3,50 +10% -> 385; 2,90 +15% -> 334; 1,10 +10% -> 121; 4,10 +20% -> 492; 7,70 +30% -> 1001.

### Custo unitario com COALESCE por termo (SQL, PG 9.0 compativel)
```sql
-- Formula do Balcao: (caixa/qtd) + (caixa/qtd) * (imp+ipi+frete+outro)/100. Equivale a (caixa/qtd) * (1 + soma/100).
-- COALESCE em cada termo: um imposto NULL nao zera o custo.
SELECT p.idproduto,
       round(COALESCE(
         CASE WHEN p.quantidadecaixa > 0
           THEN (p.valorcustocaixa / p.quantidadecaixa)
                * (1 + (COALESCE(p.imposto,0) + COALESCE(p.ipi,0) + COALESCE(p.frete,0) + COALESCE(p.outroimposto,0)) / 100)
           ELSE p.valorcustocaixa
                * (1 + (COALESCE(p.imposto,0) + COALESCE(p.ipi,0) + COALESCE(p.frete,0) + COALESCE(p.outroimposto,0)) / 100)
         END, 0), 3) AS valorcustounitario
  FROM produto p
 WHERE p.idproduto = ANY($1::int[]);
```
Resultado observado no clone (leitura): produto 10 -> 0,033; produto 60 -> 1,000; produto 13523 -> 1,283 (Fase 44 daria 0,000); produto 29690 -> 2,884 (Fase 44 daria 0,000).

### Lancamento com compare-and-set (Prisma)
```typescript
// Ganha a troca apenas uma chamada. Nenhuma chamada ao Athos antes deste passo.
const reservado = await prisma.proposta.updateMany({
  where: { id, status: "RASCUNHO" },
  data: { status: "LANCANDO", lancandoEm: new Date() },
});
if (reservado.count !== 1) throw new ConflictException("Proposta ja esta sendo lancada ou ja foi enviada.");
```

### Marcador de recuperacao (padrao Fase 44)
```typescript
// obs do orcamento no Athos: "[PROPOSTA] ref:<12 hex>". ref = sha256(idPropostaUUID).slice(0, 12).
// Hex apenas, sem % nem _, entao o LIKE e seguro sem escape.
const obs = `[PROPOSTA] ref:${ref}`;
// Recuperacao: SELECT idorcamento, senhabalcao FROM orcamento WHERE obs LIKE $1 ORDER BY idorcamento DESC LIMIT 1  -- $1 = '[PROPOSTA] ref:' || $2 || '%'
```

### Exemplo de comando de teste (Jest, padrao da Fase 44)
```bash
cd /root/SistemaOrcamento/apps/backend && npx jest --no-coverage propostas-calc
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Template de PDF com um ativo global | Ativo por familia (ORCAMENTO / PROPOSTA) | Esta fase | Necessario para D-22; ver Pitfall 5 |
| Preco informado abaixo do cadastro = desconto (Fase 44) | Preco final sem desconto (proposta) | Esta fase | Modo novo; Fase 44 intocada |
| Next 14 (memoria e CONTEXT) | Next 16.2.5 (repositorio) | Ja no repositorio | `params` e Promise; ver Pitfall 16 |
| Jest/Vitest | Jest 30 (repositorio) | — | Usar Jest |

**Deprecated/outdated:**
- Afirmacoes de "Next 14" em CONTEXT.md e na memoria do projeto: contradizem `apps/frontend/package.json:12`.

## Assumptions Log

> Afirmacoes marcadas [ASSUMED] nao foram verificadas nesta sessao. O planner e o discuss-phase devem confirmar antes de virarem decisao.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O `permitedescontode` de producao e 100% ou maior (o clone tem `100.000`) | Pitfall 1 | Com a funcao nova nao ha impacto; se a proposta reusar a Fase 44, precos 20% abaixo seriam bloqueados |
| A2 | O Balcao de producao calcula custo com NULL da mesma forma (zerando) | Pitfall 2 | Divergencia entre custo mostrado na proposta e no Balcao |
| A3 | `ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO` = 5 (PIX) em producao | Environment, Security | Se nao for PIX ativo, `FORMA_PAGAMENTO_INVALIDA` na escrita (validado so em runtime) |
| A4 | Valores de `ATHOS_ORCAMENTO_ID_FUNCIONARIO`, `_VENDEDOR`, `_TERMINAL` em producao | Standard Stack | Config invalida bloqueia o lancamento (CONFIG_INVALIDA) |
| A5 | O bucket MinIO nao e publico (download deve passar pelo backend) | Architecture | Se for publico, o `publicUrl` do PDF fica acessivel sem login |
| A6 | Tailscale/VPN para o Athos de producao disponivel nesta maquina | Environment | Sem ele, nao ha leitura real de produto/cliente nem teste contra producao (e nao deve haver teste de escrita) |
| A7 | A classificacao de cliente como orgao publico nao muda o regime de documento (NFS-e etc.) | Scope | Fora do escopo da fase; se mudar, o PDF pode exigir campos fiscais |
| A8 | `pdfObjectName` e `publicUrl` do PDF da proposta podem seguir o padrao do `QuotesPdfStorageService` com prefixo `propostas` | Architecture | Baixo; so muda o prefixo de `MINIO_PATH_PREFIX` |
| A9 | Desenho de nomes de env novas (`PROPOSTA_ESCRITA_ATIVA`, `PROPOSTA_BANCO_*`) | Architecture | Nomes sao sugestao; confirmar com o usuario |
| A10 | Nao ha outro consumidor de `GET /athos/clientes` que quebraria com campo novo | Pitfall 8 | Campo e aditivo; baixo risco |

**If this table is empty:** nao se aplica; ha 10 itens.

## Open Questions (RESOLVED)

> Todas resolvidas pelo usuario em 2026-11-27 — ver 55-CONTEXT.md D-23..D-30.

1. **Arredondamento do preco-base com sub-centavo (303 produtos no clone).** **RESOLVED: D-23.**
   - O que sabemos: `precovendaproduto` devolve 3 casas; o PDF mostra centavos (D-22); D-02 manda ceil no centavo no ajuste.
   - O que nao sabemos: se o preco sem ajuste deve ser arredondado (e para cima, como o ajuste) ou mantido com 3 casas.
   - Recomendacao: aplicar ceil no centavo ao snapshot tambem sem ajuste, de modo que PDF, snapshot e Athos somem o mesmo valor. Confirmar com o usuario, porque altera D-01 na pratica.

2. **Custo com imposto NULL: qual valor mostrar e gravar?** **RESOLVED: D-24.**
   - Recomendacao: mostrar e gravar o custo com COALESCE por termo (Pitfall 2). Confirmar se o Balcao (captura futura, com produto de imposto NULL) grava 0 ou o valor real; se gravar 0, decidir se a proposta grava o valor corrigido em `valorcustoitem` (recomendado: sim, custo e informativo).

3. **Razao social no PDF do orgao.** **RESOLVED: D-25.**
   - D-16 diz que razao social vem do cadastro do Athos. O cadastro tem `razaosocial` separado de `nomefantasia`. Confirmar que o PDF deve usar `razaosocial` mesmo quando `nomefantasia` estiver preenchida, e que endereco ausente deve aparecer como "nao informado" (sem fallback).

4. **Onde fica a "tela de produto existente" (D-05)?** **RESOLVED: D-26.**
   - Nao ha tela de produto no frontend. Ha API `athos/produtos` sem UI. Confirmar se o cadastro de produto que falta e feito no Athos desktop (`referencia/athos-cadastro-produto.md`).

5. **Kill-switch separado para propostas?** **RESOLVED: D-30.**
   - `ATHOS_ORCAMENTO_ESCRITA` liga a escrita da IA (Fase 44) e nao deve ser o unico controle de propostas. Recomendacao: env nova `PROPOSTA_ESCRITA_ATIVA` (default desligada), validada antes de qualquer conexao, no mesmo padrao de `ESCRITA_DESABILITADA` (`athos-orcamento.service.ts:431`).

6. **Familia de template: coluna ou tabela?** **RESOLVED: D-30.**
   - Recomendacao: coluna `familia` em `PdfTemplate` com backfill (reaproveita galeria, upload, preview e validacao). Alternativa: tabela separada (isola regressao, duplica codigo). Escolher antes do plano de templates.

7. **Margem exibida (D-12).** **RESOLVED: D-27.**
   - O Athos define `margemliquidavenda1 = (venda − custo) / venda` (`referencia/athos-cadastro-produto.md:46`), e a margem de markup `venda/custo − 1`. Recomendacao: exibir margem liquida, com o mesmo nome do campo do Athos, para nao confundir com markup.

8. **Proposta lancada com erro.** **RESOLVED: D-28.**
   - Sem cancelamento no Athos (D-10), a unica correcao e duplicar. Confirmar que o operador aceita um orcamento "fantasma" aberto no Balcao nesse caso (Pitfall 15).

9. **Forma de pagamento gravada (`idformapagamento`).** **RESOLVED: D-29.**
   - A escrita grava uma linha PIX (Fase 44). Confirmar o id em producao (A3).

10. **Bug de custo da Fase 44 (Pitfall 17).** **RESOLVED: D-30 (debito registrado, fora do escopo).** Corrigir em fase propria ou registrar como debito.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend, testes, Next | ✓ | v22.22.1 | — |
| Jest (apps/backend) | Testes unitarios | ✓ | 30.x (rodou 3 suites, 95 testes, 11 s) | — |
| Prisma CLI | Schema, migracao | ✓ | 5.22.0; `prisma validate` retornou valid | — |
| Docker | Clone do Athos, banco descartavel | ✓ | container `athos-teste` em `127.0.0.1:5440` (Up 2 weeks) | — |
| Athos clone (PostgreSQL 14.24) | Introspeccao e IT de escrita | ✓ | PG 14.24 (producao e 9.0.5) | Subconjunto PG 9.0 (Pitfall 12) |
| Chrome para Puppeteer | Render de PDF | ✓ | `~/.cache/puppeteer/chrome` e `chrome-headless-shell` presentes | — |
| Postgres do Sistema | Migracao e IT Prisma | ✓ (container `orcamento-postgres`, `0.0.0.0:5435->5432`) | — | Container descartavel via `scripts/validar-migration-descartavel.sh` |
| MinIO | Armazenamento de PDF | ✓ (container `minio-minio-1`) | — | — |
| Athos producao (192.168.33.198) | Leitura real e escrita | Nao sondado (intencional) | — | Nunca escrever em teste; leituras so por `usuario_leitura` se autorizado |
| Tailscale | Acesso ao Athos de producao | Nao sondado | — | Ver A6 |

**Missing dependencies with no fallback:** nenhuma para pesquisa e implementacao com clone. Teste contra producao nao deve ser feito.

**Missing dependencies with fallback:** Tailscale, se nao estiver disponivel. A validacao real de cliente e produto fica no clone.

## Validation Architecture

> `workflow.nyquist_validation` nao esta definido em `.planning/config.json`, entao a secao entra.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.x com ts-jest 29.x (`apps/backend/jest.config.js`: `rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`) |
| Config file | `apps/backend/jest.config.js` |
| Quick run command | `cd /root/SistemaOrcamento/apps/backend && npx jest --no-coverage propostas` |
| Full suite command | `npm --prefix apps/backend run test -- --no-coverage` (STATE.md registra 502/502 testes verdes em 260906-iz0) |
| Regressao Fase 44 | `npx jest --no-coverage athos-orcamento-calc athos-orcamento.service athos-orcamento-idempotencia` (95 testes verdes nesta sessao) |
| Clone IT | `ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos ATHOS_PG_USER=postgres ATHOS_PG_PASS=<clone> npm --prefix apps/backend run test -- <arquivo.clone.it> --no-coverage` (senha so por variavel de ambiente) |

### Phase Requirements → Test Map
Como a fase nao tem IDs de requisito (REQUIREMENTS.md cobre so v2.5), o mapa usa as decisoes D-xx.

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| D-02 | Ajuste % com ceil exato: 3,50 +10% = 385 centavos; negativo; sub-centavo; aplicar a todos | unit | `npx jest --no-coverage propostas-calc` | ❌ Wave 0 |
| D-03 | `calcularLinhasProposta`: valoritem = preco informado abaixo do cadastro; valordesconto = 0; cabecalho desconto = 0 | unit | `npx jest --no-coverage propostas-calc` | ❌ Wave 0 |
| D-03 | Total = soma das linhas em centavos (half-up); total do PDF = `orcamento.valor` | unit | `npx jest --no-coverage propostas-calc` | ❌ Wave 0 |
| D-03 / Fase 44 | `criarOrcamento` sem mudanca (regressao: preco abaixo vira desconto) | unit (existente) | `npx jest --no-coverage athos-orcamento.service` | ✅ |
| D-12 | Custo com imposto NULL = caixa/qtd x (1 + soma/100), nao 0 | unit (SQL mockado, padrao `pg` mockado) | `npx jest --no-coverage athos-proposta` | ❌ Wave 0 |
| D-12 | Margem liquida = (preco − custo) / preco; preco < custo marca alerta (D-13) | unit | `npx jest --no-coverage propostas-calc` | ❌ Wave 0 |
| D-07 | Duas chamadas concorrentes de "Gerar": um unico INSERT no Athos | unit (Prisma e pg mockados) | `npx jest --no-coverage propostas.service` | ❌ Wave 0 |
| D-07 | COMMIT ok + falha na gravacao local: recuperacao por `obs` sem novo INSERT | unit | `npx jest --no-coverage propostas.service` | ❌ Wave 0 |
| D-07 | Falha no PDF apos lancamento: nao relanca no Athos | unit | `npx jest --no-coverage propostas.service` | ❌ Wave 0 |
| D-12 / D-22 | HTML e PDF nao contem custo nem margem | unit (HTML) | `npx jest --no-coverage propostas-pdf` | ❌ Wave 0 |
| D-22 | Template PROPOSTA compila com `knownHelpersOnly` e sem URL externa (padrao de `pdf-templates.presets.test.ts`) | unit | `npx jest --no-coverage pdf-templates` | ✅ (estender) |
| D-22 | Render multipagina: 60 itens geram >= 2 paginas com escala 1 | integracao local (Puppeteer) | comando manual a definir no plano | ❌ Wave 0 |
| Pattern 3 | Ativar PROPOSTA nao desativa ORCAMENTO | unit (Prisma mockado) | `npx jest --no-coverage pdf-templates.service` | ❌ Wave 0 (estender) |
| Pitfall 6 | Segundo seed nao altera `isActive` de PROPOSTA | unit (seed com Prisma mockado) | `npx jest --no-coverage seed-pdf` | ❌ Wave 0 |
| D-07 / D-09 | Lancamento real no clone, ROLLBACK ao final, com itens, pagamento e `idorcamento` | IT clone | `ATHOS_IT_CLONE=1 ... npm --prefix apps/backend run test -- athos-proposta.clone --no-coverage` | ❌ Wave 0 |
| Migracao | Coluna `familia` e tabelas novas: aditiva e idempotente | script | `apps/backend/scripts/validar-migration-descartavel.sh <pasta> <tabela> <n_colunas>` | ❌ Wave 0 |
| D-14 | `razaoSocial` aditivo em `buscarClientes` nao quebra `TomadorAthosSearch` | unit (existente de NFS-e) | `npx jest --no-coverage athos.service` | ✅ (estender) |

### Sampling Rate
- **Por tarefa (commit):** `npx jest --no-coverage <padrao da tarefa>`.
- **Por onda (merge):** suite do backend inteira (`npm --prefix apps/backend run test -- --no-coverage`), com os 95 testes da Fase 44.
- **Antes de `/gsd-verify-work`:** suite verde, migracao validada no descartavel, IT do clone verde com ROLLBACK, e verificacao manual de um PDF oficial e uma previa.

### Wave 0 Gaps
- [ ] `apps/backend/src/modules/propostas/propostas-calc.util.test.ts` — D-02, D-03, D-12, D-13
- [ ] `apps/backend/src/modules/propostas/propostas.service.test.ts` — CAS, recuperacao, falha no PDF
- [ ] `apps/backend/src/modules/propostas/propostas-pdf.test.ts` — sem custo no HTML, multipagina
- [ ] `apps/backend/src/modules/integrations/athos/athos-proposta.clone.it.test.ts` — escrita no clone com ROLLBACK
- [ ] Estender `pdf-templates.service.test.ts` (escopo por familia) e `pdf-templates.presets.test.ts` (presets PROPOSTA)
- [ ] Teste do seed real (`scripts/seed-pdf-templates.ts`), que hoje o teste replica em vez de importar (`pdf-templates.presets.test.ts`, linha 212)
- [ ] Fixtures: orcamento de proposta de referencia (`__fixtures__`), no padrao de `quotes/__fixtures__/`
- [ ] Migracao: `apps/backend/prisma/migrations/<timestamp>_add_proposta_comercial/migration.sql`, com timestamp posterior a `20261125120000`

Framework install: nenhum. Jest ja roda.

## Security Domain

> `security_enforcement` nao esta definido em `.planning/config.json`, entao a secao entra.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (tela) | `PasswordGate` (`components/password-gate.tsx`) e `AdminOnly` (`security/admin.decorator.ts:10`) |
| V3 Session Management | yes (tela) | Cookie `orcamento_admin_session` existente; nao criar sessao nova |
| V4 Access Control | yes | `@AdminOnly()` em todas as rotas de `/propostas`; rotas da IA (`InternalAuthGuard`) nao expoem propostas nem custo |
| V5 Input Validation | yes | DTOs com `class-validator` (whitelist + forbidNonWhitelisted); parametros `$n` no SQL do Athos; `sanitizarTextoAthos` so para o `obs` do Athos |
| V6 Cryptography | no | Nao ha segredo novo. O `ref` do marcador e sha256 truncado, so para localizar orfao (nao e segredo) |
| V7 Error Handling | yes | `mapearErroPg` existente (nao vazar mensagem de pg); mensagens em portugues |
| V8 Data Protection | yes | Custo e margem nunca no PDF nem em resposta de endpoint da IA; PDF so por rota autenticada |
| V9 Communications | yes | Athos por conexao de rede ja existente (Tailscale); nao mudar |
| V12 Files | yes | PDF em MinIO com prefixo proprio (`propostas/`); validacao de upload de template existente (512 KB, padroes perigosos) |
| V13 API | yes | `@Throttle({ default: THROTTLE_SENSITIVE })` em "Gerar" (como `criar` em `athos-orcamento.controller.ts:59`) |
| V14 Configuration | yes | Dados bancarios e de empresa em env (D-18), nao no template; flag de escrita separada |

### Known Threat Patterns for {Node/NestJS + Athos PG + Puppeteer}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Vazamento de custo/margem no PDF ou em resposta publica | Information Disclosure | Separar DTO de saida; teste de HTML sem custo; nenhum campo de custo na rota da IA (`athos-orcamento.controller.ts:40`) |
| Preco final enviado pelo cliente sem validacao | Tampering | Servidor recalcula a partir do snapshot + percentual; valida faixa; ceil no servidor (D-02) |
| Lancamento duplicado no Athos de producao | Tampering / Repudiation | CAS no Prisma antes do Athos; marcador `obs`; recuperacao antes de relancar |
| Escrita acidental em producao durante teste | Tampering | Trava de host (`assertHostPermitido`, `HOSTS_PERMITIDOS_EM_TESTE`) e IT so no clone (`ATHOS_IT_CLONE=1`); nunca produção |
| SQL injection no Athos | Tampering | Apenas parametros `$n` (padrao existente) |
| SSRF/exfiltracao pelo Puppeteer | Information Disclosure | Manter `setRequestInterception` com `shouldAllowRequest` (somente `about:blank` e `data:`) |
| XSS via nome de cliente/produto no PDF | Tampering | Handlebars com `noEscape: false` (existente); nao usar `{{{ }}}` no template |
| Template malicioso enviado pela UI | Tampering | `validateUpload` (padroes perigosos, 512 KB) para a familia PROPOSTA |
| Abuso de render (DoS) | DoS | Throttle em "Gerar" e na previa; limite de itens (200, como Fase 44) |
| Ativacao de template errado em producao | Tampering | Escopo por familia; teste de isolamento (Pitfall 5) |

## Sources

### Primary (HIGH confidence — lido nesta sessao)
- `.planning/phases/55-.../55-CONTEXT.md` — decisoes D-01..D-22 (usado para User Constraints)
- `.planning/phases/55-.../referencia/athos-orcamento.md` — SQL capturado do Balcao (captura 1 e 2): linhas 27-35 (custo), 91-92, 127-153
- `.planning/phases/55-.../referencia/athos-cadastro-produto.md` — campos de preco, margem (linha 46), `precousado` (linha 93)
- `apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts` — linhas 192-236 (SQL), 428-431 (gate), 438 (config), 459 (READ ONLY), 564 (descontomaximo), 573 (calcularOrcamento), 612-621 (INSERT orcamento RETURNING), 720 (buscarProdutos), 800 (status)
- `apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.ts` — linhas 24-25, 28, 65-70, 94, 182-186, 205, 216-217, 248-253
- `apps/backend/src/modules/integrations/athos/athos-orcamento-idempotencia.service.ts` — linhas 18-20, 96-98, 131-154
- `apps/backend/src/modules/integrations/athos/athos-orcamento.controller.ts` — linhas 29-43 (produtos sem custo), 58-87 (criar)
- `apps/backend/src/modules/integrations/athos/dto/create-athos-orcamento.dto.ts` — descricao de `valorUnitario` e `descontoRS`
- `apps/backend/src/modules/integrations/athos/athos.controller.ts` — linha 141 (`@Get("clientes")`)
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — linhas 1126 (nome nomefantasia-first, detalhe), 1366-1369 (lista)
- `apps/backend/src/modules/integrations/athos/athos-listener.service.ts` — linhas 106-116, 159-175
- `apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts` — linhas 166-174 (`sanitizarTextoAthos`)
- `apps/backend/src/modules/pdf-templates/pdf-templates.service.ts` — linhas 106-113 (activate), 125 (list), 138 (getSource)
- `apps/backend/src/modules/pdf-templates/pdf-templates.repository.ts` — linhas 20-21
- `apps/backend/src/modules/pdf-templates/pdf-templates.presets.test.ts` — linhas 1-13, 173-236 (lista replicada)
- `apps/backend/src/modules/pdf-templates/pdf-templates.types.ts` — `PRESET_SLUGS`, `DEFAULT_ACTIVE_SLUG`
- `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` — linhas 77-78 (objectName), 265-268 (resolveTemplateSource), 341-349 (scale), 429-430 (prefixo `quotes`)
- `apps/backend/scripts/seed-pdf-templates.ts` — linhas 63-72 (upsert com `isActive` no update)
- `apps/backend/scripts/bootstrap-runtime.sh` — linhas 18-30 (seed a cada boot)
- `apps/backend/Dockerfile` — linha 42 (`CMD`)
- `apps/backend/prisma/schema.prisma` — linhas 43-57 (Customer), 395-398 (enum PdfTemplateKind: `PRESET`, `CUSTOM`), 404-415 (PdfTemplate), 471 (AthosOrcamentoIa)
- `apps/backend/prisma/migrations/20261125120000_add_nfse_liberacao/migration.sql` — padrao de migracao aditiva e idempotente
- `apps/backend/scripts/validar-migration-descartavel.sh` — cabecalho (uso e regras)
- `apps/backend/jest.config.js` e `apps/backend/package.json` — Jest, scripts, dependencias
- `apps/backend/src/modules/integrations/athos/athos-orcamento.service.test.ts` — padrao de mock de `pg` (linhas 7-13)
- `apps/frontend/package.json` — linha 12 (`"next": "^16.2.5"`)
- `apps/frontend/src/app/contas-receber/admin-shell.tsx` — linhas 13-36 (`PA_NAV_ITEMS`)
- `apps/frontend/src/app/api/athos/clientes/route.ts` — padrao de proxy
- `apps/frontend/src/app/api/athos/clientes/[idcliente]/notas-fiscais/route.ts` — linha 7 (`params: Promise<...>`)
- `apps/frontend/src/app/contas-receber/cliente-autocomplete.tsx` — linha 28 (assinatura)
- `.env.example` (somente nomes de variaveis, sem valores): `ATHOS_ORCAMENTO_ESCRITA`, `ATHOS_ORCAMENTO_ID_FUNCIONARIO`, `ATHOS_ORCAMENTO_ID_VENDEDOR`, `ATHOS_ORCAMENTO_ID_TERMINAL`, `ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO`, `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO`, `MINIO_PATH_PREFIX`
- `.claude/skills/bom-custo-design/SKILL.md` — template colorido com faixas decorativas em URL externa (nao serve ao perfil institucional de D-22)

### Clone do Athos (leitura de catalogo, `docker exec athos-teste psql -U postgres -d athos`, PG 14.24, snapshot de 2026-11-09)
- `information_schema.columns`: `orcamento_item|valoritem|numeric|16|3|YES`; `orcamento_item|orcamentodesconto|numeric|9|3|YES`; `orcamento_item|orcamentovalorfinalitem|numeric|9|3|YES`; `orcamento|validadeorcamento|date|||YES`; `orcamento|dataentrega|date|||YES`; `produto|imposto|numeric|9|3|YES`; `produto|ipi|numeric|6|2|YES`; `produto|frete|numeric|9|3|YES`; `produto|outroimposto|numeric|9|3|YES`; `produto|descontomaximo|numeric|5|2|YES`; `cliente_juridico|razaosocial|character varying|||YES`; `cliente_juridico|nomefantasia|character varying|||YES`; `cliente_juridico|cnpj|character varying|||YES`. Consulta por `inscricaoestadual` em `cliente_juridico` nao retornou linha.
- `pg_rules` de `orcamento`: `atualizardatahorainsert` e `atualizardatahoraupdate` (texto em Pitfall 11).
- `pg_type`: `monetario` typtype `d`, base `numeric`, typmod `589831`. `precovendaproduto(int)` retorna `monetario`; corpo da funcao lido com `pg_get_functiondef` (checa `promocaostatus` e periodo; senao `precousado` 0/1 -> `valorvenda1`, 2..6 -> `valorvenda2..6`).
- Contagens (produtos com `statusproduto = true`, 2410): `imposto` NULL 91; `ipi` NULL 90; `frete` NULL 91; `outroimposto` NULL 91; `valorcustocaixa` NULL 0; `quantidadecaixa` = 0: 0; `valorvenda1` com mais de 2 casas: 303; `valorvenda1` zero ou nulo: 28; `precousado` diferente de 0: 3; `promocaostatus` = true: 0.
- `conf_vendas.permitedescontode` = `100.000`.
- `forma_pagamento` id 5 = `PIX`, `tipodeforma` 4, `status` t.
- Leituras executadas apenas com SELECT e `pg_get_functiondef`. Nenhum INSERT, UPDATE ou DDL foi executado no clone, e nenhuma conexao foi feita ao Athos de producao.

### Execucao local (nesta sessao)
- `npx jest --no-coverage athos-orcamento-calc athos-orcamento.service athos-orcamento-idempotencia` — 3 suites, 95 testes, passaram (11,3 s).
- `npx prisma validate` com `DATABASE_URL` de placeholder (sem conexao) — schema valido.
- `node` (aritmetica de ceil, float versus inteiro) — resultados no Pitfall 3.

### Secondary (MEDIUM)
- `.planning/STATE.md` — decisoes anteriores (env em vez de tabela, 2026-06-17; uso do `Customer`; Fase 44 e Fase 54)
- `memory/athos_postgres_9_0_5.md` (via CLAUDE.md do projeto) — restricoes de SQL para PG 9.0.5

### Tertiary (LOW / ASSUMED)
- Itens da Assumptions Log (A1-A10).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versoes lidas em `package.json` e `node_modules`.
- Architecture: HIGH para o que existe no codigo (Fase 44, pdf-templates, storage); MEDIUM para o desenho proposto (ASSUMED onde marcado).
- Pitfalls: HIGH para 1, 2, 3, 5, 6, 7, 8, 11, 12, 14, 16 (verificados em codigo ou no clone). MEDIUM para 4, 13, 15 (dependem de decisao ou de comportamento do Balcao nao capturado).
- Validation: HIGH para comandos (rodados). MEDIUM para o desenho do IT de escrita (depende do clone estar com a mesma carga de dados).

**Limitacoes:**
- O clone e PostgreSQL 14 com snapshot de 2026-11-09. Producao e 9.0.5 e pode ter configuracao e dados diferentes. Nenhuma leitura de producao foi feita.
- Nao foi capturado o comportamento do Balcao com imposto NULL nem com preco de venda de 3 casas.
- Nao foi lido nenhum valor de configuracao de producao (`conf_vendas`, `forma_pagamento`, envs ATHOS_ORCAMENTO_*).

**Research date:** 2026-11-27
**Valid until:** 2026-12-27 para o codigo (30 dias). Clone e snapshot: revalidar antes de implementar, porque o Athos de producao muda.
