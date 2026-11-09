# Phase 44: API de criação de orçamento no Athos para IA - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Um agente de IA externo monta e grava um orçamento REAL no Athos (aparece no Balcão/PDV) via API REST
protegida por `x-internal-api-key`. Escopo: buscar produtos com preço/estoque, listar formas de pagamento,
criar orçamento (cabeçalho + itens + forma de pagamento) em UMA transação, simular sem gravar, e consultar
o orçamento criado. Referência SQL obrigatória: `44-REFERENCIA-SQL-ATHOS.md` (captura do Balcao.exe +
achados de introspecção no clone). Backend-only (sem UI).

</domain>

<decisions>
## Implementation Decisions

### D-01 Contrato da API
- Endpoints (prefixo global `/api`, guard InternalApiKey de classe):
  - `GET /athos/orcamentos/produtos?q=&limit=` — busca por nome/idproduto/codigobarra1/referencia, só
    `statusproduto=true` e `coalesce(vendeproduto,true)`; retorna idproduto, descricao, marca, referencia,
    codigobarra, preço (`precovendaproduto`), emPromocao (`estanapromocao`), estoqueloja/deposito,
    permitefracionar, descontomaximo, unidade. Limite padrão 20, máx 50.
  - `GET /athos/orcamentos/formas-pagamento` — formas ativas (query da captura).
  - `POST /athos/orcamentos` — cria (ou simula) o orçamento.
  - `GET /athos/orcamentos/:id` — cabeçalho + itens + pagamentos.
- Payload POST: `itens[{idproduto, quantidade, valorUnitario?, desconto?}]` (mín 1), `idcliente?`,
  `idformapagamento?`, `obs?`, `descontoTotalRS?`, `simular?`.
- Preço: padrão `precovendaproduto(idproduto)`. `valorUnitario` informado só é aceito se
  `>= preco * (1 - descontomaximo/100)` (quando descontomaximo=0, não pode ficar abaixo do preço);
  senão 422 com mensagem clara para a IA. Quantidade fracionada só se `permitefracionar`.
- `simular: true` → calcula e valida tudo dentro de `BEGIN; SET TRANSACTION READ ONLY` e devolve totais
  sem gravar (padrão da Fase 43).
- Erros devem ser legíveis por IA: código + mensagem (ex.: PRODUTO_INEXISTENTE, PRODUTO_INATIVO,
  PRECO_ABAIXO_MINIMO, QUANTIDADE_FRACIONADA, CLIENTE_INEXISTENTE, FORMA_PAGAMENTO_INVALIDA,
  ESCRITA_DESABILITADA).

### D-02 Gravação no Athos
- Autor via env novas: `ATHOS_ORCAMENTO_ID_FUNCIONARIO` (idfuncionariousuario), `ATHOS_ORCAMENTO_ID_VENDEDOR`
  (idvendedor), `ATHOS_ORCAMENTO_ID_TERMINAL` (idterminal) — validados contra as tabelas.
- `statusorcamento = NULL` (aberto), `statusimpressao = false`, `obs` prefixada com `[IA]`,
  `dataorcamento = current_date`, `hora = current_time(0)`, `validadeorcamento NULL`, `valoracrescimo 0`,
  `idenderecocliente 0` (como na captura), `idtransportadora NULL`, `dataentrega NULL`.
- `senhabalcao` e PKs vêm dos defaults/sequências; id do orçamento via `RETURNING idorcamento`.
- Totais: `valor` = bruto (soma qtd×valoritem). Desconto global em R$ rateado por item proporcional em
  `orcamentodesconto` (ajuste de centavos no último item), grava `descontors` (R$) e `desconto` (%).
  Desconto por item (se informado) também vai em `orcamentodesconto`. `orcamentovalorfinalitem` =
  qtd×valoritem − orcamentodesconto. `valordesconto` = 0. `sequenciaitem` 1..N.
- `valorcustoitem` = fórmula `valorcustounitario` da captura; `valorcomissao` = 0 (v1); `codigovariante ''`,
  `comprimento/pesoliquido/pesobruto 0`, `observacao ''`, `depositoloja false`.
- Forma de pagamento opcional: se vier, `delete` + `insert orcamento_forma_pagamento(idorcamento,
  idformapagamento, valor=liquido, valorrecebido=liquido, idcondicaopagamento=0)`.
- Tudo em UMA transação (BEGIN/COMMIT, ROLLBACK em erro). SQL compatível com PostgreSQL 9.0.5
  (sem ON CONFLICT, FILTER, jsonb, CTE de escrita).
- Sem `monitoramento` e sem `statusimpressao=true` (isso é do Balcão).

### D-03 Segurança e testes
- Flag `ATHOS_ORCAMENTO_ESCRITA=true` habilita gravação; ausente/false → POST não-simulado responde 503
  ESCRITA_DESABILITADA (simulação e GETs continuam funcionando).
- Trava de host em `NODE_ENV=test` (reusar padrão `assertHostPermitido` da Fase 43).
- Testes: unitários com pg falso (cálculo, rateio, validações, SQL emitido) + teste de integração real
  contra o clone `athos-teste` (127.0.0.1:5440, db athos, postgres/athosteste), habilitado por env
  (ex. `ATHOS_IT_CLONE=1`), que cria orçamento e confere as 3 tabelas. NUNCA contra o Athos original.
- Idempotência: header opcional `Idempotency-Key`; tabela Prisma nova (ex. `AthosOrcamentoIa`:
  idempotencyKey único, idorcamento, payload hash, criadoEm) — mesma chave devolve o orçamento existente.
- Log de auditoria: registrar no nosso banco cada orçamento criado pela IA (mesma tabela).

### D-04 Decisões pós-pesquisa (usuário, 2026-11-09) — PREVALECEM sobre D-01/D-02 onde conflitarem
- **Desconto deve funcionar** (por item em R$ — `descontoRS` — e global `descontoTotalRS`). Como ~99% dos
  produtos têm `descontomaximo` NULL/0/0,01, `descontomaximo` NÃO bloqueia desconto (só informativo na busca).
  Limites: desconto da linha ≤ total da linha; desconto global ≤ Σ líquido; desconto total (%) ≤
  `conf_vendas.permitedescontode` (hoje 100). `valorUnitario` abaixo do preço é tratado como desconto
  (mesmo limite), não como erro de preço mínimo. Erro `DESCONTO_ACIMA_LIMITE`.
- **Pagamento: sempre PIX** para orçamentos da IA. A IA NÃO escolhe forma de pagamento: sempre uma linha
  em `orcamento_forma_pagamento` com `idformapagamento = ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO` (default 5 = PIX
  nesta instalação), `idcondicaopagamento = 0`, valor = valorrecebido = líquido. Remover `idformapagamento`
  do payload; o endpoint `GET formas-pagamento` sai do escopo (deferred).
- `idcliente` continua opcional (PIX não exige cliente).
- Arredondamento conforme RESEARCH: cada linha arredondada a centavos (half-up), `valor` = Σ linhas
  arredondadas; invariantes `descontors = Σ orcamentodesconto`, `desconto = round(descontors/valor*100,3)`,
  `valor − descontors = Σ orcamentovalorfinalitem` = pagamento. Aritmética em inteiros.
- Produto sem preço (NULL/0) → `PRECO_INDISPONIVEL`. Estoque não bloqueia (só informado).
- Autor (funcionário/vendedor/terminal): via env obrigatórias e validadas; usuário ainda não escolheu os
  ids de produção — testes no clone usam 1/1/1; roteiro de verificação manual pede ao usuário definir.
- Incluir roteiro de verificação manual em produção (estilo Fase 43): aparece no Balcão, GRANTs, PG 9.0.5.

### Claude's Discretion
- Organização dos arquivos (service/controller/dto/util), nomes exatos de códigos de erro, formato da
  resposta (desde que inclua idorcamento, senhabalcao, totais e itens).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts`: pool de escrita
  próprio (`getPool`), `getDbConfig`, `assertHostPermitido` (HOSTS_PERMITIDOS_EM_TESTE), `mapearErroPg`,
  modo `simular` com READ ONLY.
- `athos-fk.util.ts` (`validarFkExiste`), `athos-produto-composto.controller.ts` (padrão de controller com
  `@ApiSecurity("InternalApiKey")`), `athos-produto.service.ts` (consultas de produto).
- `modules/security` — guard global de `x-internal-api-key`.

### Established Patterns
- NestJS + class-validator DTOs, Jest com pg falso, Prisma para estado local, env por constante.

### Integration Points
- `athos.module.ts` (registrar controller/service), `prisma/schema.prisma` (+ migration),
  `.env.example` (novas envs), Swagger.

</code_context>

<specifics>
## Specific Ideas

- Referência obrigatória: `44-REFERENCIA-SQL-ATHOS.md`.
- O usuário `usuario_leitura` de produção TEM INSERT em `orcamento`: a proteção é a flag + trava de teste.
- Clone `athos-teste` é PG14; produção é PG 9.0.5 — escrever SQL compatível com 9.0.

</specifics>

<deferred>
## Deferred Ideas

- Escolha de forma de pagamento pela IA / endpoint de formas de pagamento (v1 = sempre PIX).
- Converter orçamento em venda, editar, cancelar, reimprimir.
- Endereço de entrega, transportadora, validade.
- Comissão do vendedor (`valorcomissao`).
- Espelhar automaticamente como `Quote` no nosso sistema.

</deferred>
