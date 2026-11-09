# Phase 44: API de criação de orçamento no Athos para IA - Research

**Researched:** 2026-11-09
**Domain:** NestJS + `pg` direto no PostgreSQL 9.0.5 do ERP Athos (escrita transacional em `orcamento`, `orcamento_item`, `orcamento_forma_pagamento`) + Prisma local (idempotência/auditoria)
**Confidence:** HIGH (schema, invariantes e SQL validados no clone `athos-teste`); MEDIUM em permissões/comportamento do Balcão em produção (não verificável sem tocar o Athos real)

> Convenção de tags: `[VERIFIED: clone]` = consultado/executado nesta sessão no container `athos-teste` (PG14, dump de 2026-11-09). `[VERIFIED: arquivo:linhas]` = arquivo lido nesta sessão. `[CITED: url]` = documentação oficial. `[ASSUMED]` = não verificado (ver Assumptions Log). Nada foi executado contra o Athos original; nenhum `.env` foi lido.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Claude's Discretion
- Organização dos arquivos (service/controller/dto/util), nomes exatos de códigos de erro, formato da
  resposta (desde que inclua idorcamento, senhabalcao, totais e itens).

### Deferred Ideas (OUT OF SCOPE)
- Converter orçamento em venda, editar, cancelar, reimprimir.
- Endereço de entrega, transportadora, validade.
- Comissão do vendedor (`valorcomissao`).
- Espelhar automaticamente como `Quote` no nosso sistema.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md não tem IDs para a Fase 44 (o arquivo cobre o milestone v2.5 COMP-*). IDs locais propostos, derivados de D-01..D-03:

| ID | Description | Research Support |
|----|-------------|------------------|
| ORC-01 | `GET /athos/orcamentos/produtos` busca (nome/id/barras/referência) com preço, promoção, estoque, fracionamento, desconto máx., unidade | Query validada no clone (§Code Examples SQL-1); índice de pitfalls de LIKE/NULL |
| ORC-02 | `GET /athos/orcamentos/formas-pagamento` lista formas ativas (+ condições) | SQL-2 validado; achado: tipodeforma 0/2 exigem condição real |
| ORC-03 | `POST /athos/orcamentos` grava cabeçalho+itens+pagamento em UMA transação com `RETURNING` | E2E com BEGIN/ROLLBACK no clone com role mínimo (§Grants) |
| ORC-04 | Totais/rateio/arredondamento idênticos ao Balcão | Invariantes verificados em 5.865 orçamentos (§Money) |
| ORC-05 | Validações de preço mínimo, fração, produto/cliente/forma + erros `{codigo, mensagem}` legíveis por IA | Regras + dados reais (§Pitfalls) |
| ORC-06 | `simular: true` em `BEGIN; SET TRANSACTION READ ONLY` sem gravar | Padrão Fase 43; `nextval` falha em READ ONLY (verificado) |
| ORC-07 | `GET /athos/orcamentos/:id` devolve cabeçalho+itens+pagamentos | SQL-5 |
| ORC-08 | Segurança: flag `ATHOS_ORCAMENTO_ESCRITA`, trava de host em teste, mapeamento de erro pg (42501 etc.) | Reuso Fase 43 |
| ORC-09 | Idempotência (`Idempotency-Key`) + auditoria no Prisma | Modelo `AthosOrcamentoIa` + migration aditiva |
| ORC-10 | Testes: unit (pg falso) + integração no clone gated por `ATHOS_IT_CLONE=1`; SQL compatível com PG 9.0 | §Validation Architecture |
</phase_requirements>

## Summary

A fase é inteiramente "in-repo + banco Athos": não há biblioteca nova. O módulo `athos` já tem tudo que o padrão exige (pool `pg` próprio por serviço, `getDbConfig`, `assertHostPermitido`, `mapearErroPg`, modo `simular` com `READ ONLY`, DTOs class-validator, guard global `x-internal-api-key`). O trabalho é: (1) um serviço novo `AthosOrcamentoService` + util de cálculo monetário puro (centavos/milésimos inteiros, BigInt) + controller `athos/orcamentos`; (2) um model Prisma de idempotência/auditoria + migration aditiva; (3) env vars em 4 arquivos de deploy; (4) testes unitários e um teste de integração contra o clone.

A introspecção no clone fechou as lacunas do `44-REFERENCIA-SQL-ATHOS.md` e revelou 4 pontos que mudam o plano e precisam de decisão (ver Open Questions): **(a)** formas de pagamento tipo 0/2 (A prazo, Boleto, Cartão) NUNCA usam `idcondicaopagamento=0` nos dados reais — só Dinheiro/PIX usam 0; **(b)** 99,4% dos produtos ativos têm `descontomaximo` NULL/0/0,01, então aplicar a regra de preço mínimo a `descontoTotalRS` tornaria descontos globais praticamente impossíveis; **(c)** TODOS os orçamentos recentes têm exatamente 1 linha em `orcamento_forma_pagamento` (forma opcional na API foge do padrão do Balcão); **(d)** o Balcão arredonda cada linha para centavos (`round2(qtd×valoritem)`) e `orcamento.valor` é a soma das linhas arredondadas — o cálculo bruto em float da D-02 divergiria em centavos para quantidades fracionadas.

Também verificado: o INSERT em `orcamento` dispara uma RULE (`atualizardatahorainsert`: `UPDATE conf_inicial SET datahora = now()`) — executa com privilégios do dono da regra (não exige UPDATE do usuário) mas **mantém lock de linha em `conf_inicial` até o COMMIT**, então a transação de escrita deve ser curta (todas as leituras/validações antes do primeiro INSERT; nada de Prisma/HTTP dentro da transação).

**Primary recommendation:** Implementar `AthosOrcamentoService` copiando a estrutura de `AthosContaReceberBaixaService` (pool próprio, `BEGIN` → leituras+validações → escritas → `COMMIT`, `simular` = `SET TRANSACTION READ ONLY`), com toda a aritmética em inteiros (centavos para linhas/totais, milésimos para preço/quantidade, BigInt no produto) num util puro `athos-orcamento-calc.util.ts`, e Idempotency-Key por reserva-primeiro no Prisma (unique) antes de tocar o Athos.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Autenticação do agente de IA | API / Backend (guard global `InternalAuthGuard`) | — | `APP_GUARD` já aplica a toda rota [VERIFIED: apps/backend/src/modules/app.module.ts:89-95] |
| Busca de produtos / formas de pagamento | API / Backend → Database (Athos, leitura) | — | Preço vem de função plpgsql do Athos (`precovendaproduto`); nunca recalcular no app |
| Cálculo de totais, rateio, arredondamento, validação de preço mínimo | API / Backend (util puro) | — | Precisa ser determinístico/testável sem banco; o Athos não calcula (só armazena) |
| Gravação do orçamento | Database (Athos, transação única) | API / Backend (orquestra) | Sem triggers no Athos; integridade só via FKs, então a validação é do backend |
| Idempotência + auditoria | Database (Postgres do Sistema via Prisma) | API / Backend | Estado local; Athos não deve receber tabelas novas |
| Proteção contra escrita acidental | API / Backend (flag + trava de host) | Infra (GRANTs do DBA) | `usuario_leitura` já tem INSERT em `orcamento`; a única barreira é de processo |

## Standard Stack

### Core (todos já presentes no repo; nenhuma instalação)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` | 8.20.0 (raiz do monorepo) | Pool/cliente PostgreSQL do Athos | Já usado por todos os serviços Athos [VERIFIED: /root/SistemaOrcamento/package.json:19 `"pg": "^8.20.0"`; node_modules/pg/package.json = 8.20.0] |
| `@nestjs/common`/`core` | ^11.1.19 | Controller/DI/HttpException | [VERIFIED: apps/backend/package.json] |
| `class-validator` + `class-transformer` | ^0.14.1 / ^0.5.1 | DTOs (`ValidationPipe` global `whitelist+forbidNonWhitelisted`) | [VERIFIED: apps/backend/src/main.ts:33-39] |
| `@prisma/client` / `prisma` | ^5.22.0 / ^5.19.1 | Model de idempotência/auditoria | Convenção do repo (migration SQL manual aditiva) |
| `@nestjs/swagger` | ^11.4.2 | `@ApiTags/@ApiSecurity("InternalApiKey")` | Padrão dos controllers Athos |
| `@nestjs/throttler` | ^6.5.0 | `@Throttle({ default: THROTTLE_SENSITIVE })` no POST | Padrão em `quotes.controller.ts:83` |
| Node `crypto` (built-in) | Node v22.22.1 | `createHash('sha256')` do payload | built-in |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BigInt/inteiros no util | `decimal.js`/`big.js` | Evita dependência nova; ES2021 target suporta BigInt [VERIFIED: apps/backend/tsconfig.json `"target": "es2021"`] |
| Reserva-primeiro no Prisma | `upsert` Prisma pós-Athos | Upsert pós-gravação deixa janela de duplicata em requisições concorrentes |

**Installation:** nenhuma. **Version verification:** `pg` 8.20.0 conferido em `node_modules/pg/package.json`; Prisma/Nest conferidos em `apps/backend/package.json`.

## Package Legitimacy Audit

Esta fase **não instala nenhum pacote externo**. Todos os módulos usados já estão no `package.json` e são usados por outras fases. Nada a auditar; `gsd-tools package-legitimacy check` não aplicável.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (nenhum novo) | — | — | — | — | — | — |

**Packages removed due to [SLOP]:** none. **Flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
Agente de IA (HTTP, header x-internal-api-key, [Idempotency-Key])
   │
   ▼
Nest: ThrottlerGuard → InternalAuthGuard (global) → ValidationPipe (whitelist/forbidNonWhitelisted)
   │
   ├─ GET  /api/athos/orcamentos/produtos?q=&limit=   ─┐
   ├─ GET  /api/athos/orcamentos/formas-pagamento      ├─► AthosOrcamentoService (leitura, pool Athos)
   ├─ GET  /api/athos/orcamentos/:id                  ─┘        └─► SELECT ... (produto, forma_pagamento, orcamento*)
   │
   └─ POST /api/athos/orcamentos
         │ 1. ESCRITA flag? (só se !simular) ── não ──► 503 ESCRITA_DESABILITADA
         │ 2. Idempotency-Key? → Prisma: reservar chave (unique)
         │        ├─ já existe c/ idorcamento + mesmo hash ─► devolve orçamento existente (GET interno)
         │        ├─ já existe c/ hash diferente ───────────► 409 IDEMPOTENCY_KEY_REUTILIZADA
         │        └─ reserva "processando" sem idorcamento ─► 409 EM_PROCESSAMENTO
         │ 3. assertHostPermitido (NODE_ENV=test) → pool.connect()
         │ 4. BEGIN [; SET TRANSACTION READ ONLY se simular]
         │ 5. LEITURAS + VALIDAÇÕES (produtos ANY($1::int[]), cliente, forma/condição, funcionario/vendedor/terminal)
         │ 6. util puro: centavos/milésimos → linhas, rateio, totais, % desconto, mínimo por descontomaximo
         │ 7. [só gravação] INSERT orcamento RETURNING idorcamento,senhabalcao
         │        → INSERT orcamento_item × N → DELETE+INSERT orcamento_forma_pagamento → COMMIT
         │        (qualquer erro → ROLLBACK → mapearErroPg)
         │ 8. Prisma: gravar idorcamento na linha reservada (auditoria); falha aqui NÃO desfaz o Athos
         ▼
   Resposta { simulado, idorcamento?, senhabalcao?, bruto, desconto, liquido, itens[], pagamento? }
```

### Recommended Project Structure
```
apps/backend/src/modules/integrations/athos/
├── athos-orcamento.controller.ts        # @Controller("athos/orcamentos"); estáticas antes de :id
├── athos-orcamento.service.ts           # pool, leituras, transação, mapearErroPg
├── athos-orcamento-calc.util.ts         # PURO: parse milésimos, linha, rateio, %, mínimo (BigInt)
├── athos-orcamento-idempotencia.service.ts  # Prisma: reservar/concluir/liberar chave (ou dentro do service)
├── athos-escrita-guard.util.ts          # HOSTS permitidos + assert (cópia do padrão 43; NÃO alterar a Fase 43)
├── dto/create-athos-orcamento.dto.ts    # + dto de query de produtos
├── *.test.ts                            # unit (pg falso)
└── athos-orcamento.clone.it.test.ts     # integração, gated por ATHOS_IT_CLONE=1
apps/backend/prisma/schema.prisma        # + model AthosOrcamentoIa
apps/backend/prisma/migrations/20261109120000_add_athos_orcamento_ia/migration.sql
.env.example, deploy/stack.env.example, deploy/docker-compose.vps.yml, deploy/docker-compose.box.vps.yml
```

### Pattern 1: Transação única com leituras antes das escritas (copiar da Fase 43)
**What:** `pool.connect()` → `BEGIN` → (`SET TRANSACTION READ ONLY` se simular) → validações → escritas → `COMMIT`; `catch` → `ROLLBACK` → `mapearErroPg`; `finally` → `release()`.
**When:** sempre. **Fonte:** `athos-conta-receber-baixa.service.ts` (`getPool` L348, `assertHostPermitido` L337, `mapearErroPg` L357, `SET TRANSACTION READ ONLY` L427) [VERIFIED: arquivo lido].
**Por que leituras antes:** a RULE de INSERT em `orcamento` faz `UPDATE conf_inicial` e segura o lock até o COMMIT (§Pitfall 2).

### Pattern 2: Erros HTTP legíveis por IA
Lançar `HttpException({ codigo, mensagem, detalhes? }, status)` — o filtro padrão do Nest serializa o objeto. Não há `APP_FILTER` global no repo [VERIFIED: grep `APP_FILTER|ExceptionFilter` em apps/backend/src → 0 resultados]. Mapa sugerido: 422 para regras de negócio (PRODUTO_INEXISTENTE, PRODUTO_INATIVO, PRECO_INDISPONIVEL, PRECO_ABAIXO_MINIMO, QUANTIDADE_FRACIONADA, CLIENTE_INEXISTENTE, CLIENTE_OBRIGATORIO_PRAZO, FORMA_PAGAMENTO_INVALIDA, CONDICAO_PAGAMENTO_INVALIDA, DESCONTO_EXCEDE_TOTAL, TOTAL_LINHA_EXCEDIDO, CONFIG_AUTOR_INVALIDA), 503 ESCRITA_DESABILITADA, 409 IDEMPOTENCY_*, 404 ORCAMENTO_INEXISTENTE, 500 PERMISSAO_NEGADA/ERRO_BANCO. Erros do `ValidationPipe` (400) saem no formato padrão do Nest (`message: string[]`), aceitável para IA.

### Pattern 3: Idempotência reserva-primeiro
1. Sem header → pula (mas ainda grava linha de auditoria após o commit, `idempotencyKey = NULL`; Postgres permite vários NULL em coluna `@unique`).
2. Com header: `create` da linha `{idempotencyKey, payloadHash, status:'processando'}`; `P2002` (unique) → ler a existente: mesmo hash + `idorcamento` preenchido → devolver o existente (re-leitura do Athos por `GET :id`); hash diferente → 409; sem `idorcamento` (em voo ou órfã) → 409 EM_PROCESSAMENTO.
3. Falha ANTES do COMMIT no Athos → apagar a reserva (permite retry). Falha ao atualizar o Prisma DEPOIS do COMMIT → logar `idorcamento` (erro alto); a linha órfã é recuperável pelo marcador no `obs` (§Pitfall 8).
4. `payloadHash = sha256(JSON canônico do body sem `simular`)`. Simulações NÃO consomem chave.

### Anti-Patterns to Avoid
- **Float/`Number` para dinheiro.** `0.1+0.2`, e `qtd×valor` com 3 casas. Usar milésimos/centavos inteiros e BigInt no produto.
- **`MAX(id)+1`** — usar `RETURNING` (bug histórico de `conta_pagar`, citado em REQUIREMENTS.md "Out of Scope").
- **Substituir `valoritem` pelo preço recalculado no cliente.** O preço é sempre lido do Athos na transação.
- **Chamar Prisma/HTTP entre o primeiro INSERT e o COMMIT** (segura o lock de `conf_inicial`).
- **Alterar a Fase 43** para extrair o guard de host: duplicar as 5 linhas num util novo é mais seguro (49 testes da 43 passam hoje).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Preço de venda/promoção | Lógica `valorvenda1..6`/promoção | `precovendaproduto(idproduto)` e `estanapromocao(idproduto)` do Athos | Função plpgsql já resolve `precousado` e janela da promoção [VERIFIED: clone `pg_get_functiondef`] |
| PK/senha do balcão | `MAX+1` | Defaults de sequência + `RETURNING idorcamento, senhabalcao` | Verificado no E2E |
| Higienização de texto para o Athos | Regex própria | `sanitizarTextoAthos(texto, max)` exportado em `athos-conta-receber-baixa.service.ts` | Remove acentos/caracteres que quebram encoding [VERIFIED: arquivo] |
| Data de hoje em São Paulo | `new Date().toISOString()` | `hojeSaoPaulo()` (mesmo arquivo) quando precisar de data no Node | Evita virada de dia por UTC |
| Escape de LIKE | Concatenar entrada | Escapar `\`, `%`, `_` e passar como parâmetro | Evita padrão arbitrário e injeção |
| Validação de FK existente | SQL por entidade | `validarFkExiste` (`athos-fk.util.ts`) — mas usa 422 `UnprocessableEntityException` sem `codigo`; preferir consultas em lote com `codigo` próprio | Ver Pitfall 9 |
| Hash de idempotência | Comparar JSON na mão | `crypto.createHash('sha256')` sobre JSON canônico (chaves ordenadas) | Estável |

**Key insight:** o Athos não valida nada (zero triggers, só FKs) — toda regra de negócio e todo arredondamento têm de ser reproduzidos pelo backend de forma determinística; por isso o util de cálculo puro com testes é o coração da fase.

## Domain Findings (verificados no clone)

### Tipos de domínio e precisão [VERIFIED: clone `pg_type`]
Saída verbatim da consulta a `pg_type`:

| domínio | base |
|---------|------|
| `monetario` | `numeric(9,3)` |
| `monetariobig` | `numeric(16,3)` |
| `quantidade` | `numeric(9,3)` |
| `dmdata` | `date` |
| `hora` | `time without time zone` |
| `descricao_curta` | `character varying(50)` |

Nenhum domínio tem CHECK. Colunas (verbatim de `\d`): `orcamento.valor/desconto/descontors = monetariobig`; `orcamento.valoracrescimo = monetario`; `orcamento_item.valoritem/valordesconto/quantidadeitem/valorcustoitem/valorcomissao = monetariobig`; `orcamento_item.comprimento/pesobruto/pesoliquido = quantidade`; `orcamento_item.orcamentodesconto/orcamentovalorfinalitem = monetario` (**numeric(9,3): máx 999.999,999 por linha → erro `22003` se estourar**); `orcamento_forma_pagamento.valor/valorrecebido = monetariobig`; `produto.descontomaximo = numeric(5,2)` com CHECK `descontomaximo IS NULL OR descontomaximo >= 0 AND descontomaximo <= 100`; `produto_unidade.sigla = character varying(2)`; `orcamento.obs = character varying(2000)`; `orcamento_item.observacao = character varying(1000)`; `codigovariante = descricao_curta` (50).
O driver `pg` devolve todo `numeric` como **string** (`'2.500'`) e `date` como `Date` JS — usar `to_char(...)` nas leituras e parse decimal por string (nunca `parseFloat`) [VERIFIED: execução node-pg contra o clone].

### Invariantes de dinheiro do Balcão [VERIFIED: clone, 5.865 orçamentos com id > 20000, 0 divergências]
- `orcamento.descontors = Σ orcamento_item.orcamentodesconto` (0 divergências).
- `orcamento.desconto = round(descontors / valor × 100, 3)` (0 divergências). Ex.: 25483 → 0,04/177,04 → `0.023`; 25378 → 2,98/8,5 → `35.059`.
- `orcamento.valor − descontors = Σ orcamentovalorfinalitem` (0 divergências).
- **`orcamentovalorfinalitem = round2(quantidadeitem × valoritem) − orcamentodesconto`** e **`orcamento.valor = Σ round2(qtd×valoritem)`**: o Balcão arredonda cada linha a centavos (half-up). Ex. reais: `1.162 × 41.740 = 48.50188 → 48.500`; `1.350 × 41.740 = 56.349 → 56.350`; `2.340 × 41.740 = 97.6716 → 97.670`; orçamento 24764 `valor = 466.750` enquanto Σ bruto sem arredondar = `466.751880`.
- Rateio do desconto global: proporcional ao valor da linha, centavos (ex. 25378: 6,50 e 2,00 de 8,50 com desconto 2,98 → `2.280` e `0.700`; 25483: R$ 0,04 em 4 linhas → `0.010` cada).
- `orcamento_forma_pagamento.valor = valor − descontors` em 5.865/5.865; `valorrecebido = valor` salvo 3 casos.
- `orcamento_item.valordesconto` ≠ 0 aparece em ~0,3% (semântica não identificada) → manter 0 (como D-02).
- `valoritem` ≠ `precovendaproduto` atual em ~10% dos itens recentes (68 menores de 698): o Balcão grava preço editado diretamente em `valoritem` (com `orcamentodesconto = 0`). Logo gravar `valorUnitario` informado em `valoritem` é consistente com os dados.

### Função de preço [VERIFIED: clone `pg_get_functiondef`]
`precovendaproduto(codigoproduto integer) RETURNS monetario` usa `declare rprecovenda float`, seleciona `valorvenda1..6` por `precousado` (0→valorvenda1, 2..6, else valorvenda1) ou `valorvendapromocao` quando `promocaostatus` e `current_date between iniciopromocao and terminopromocao`. Retorna `NULL` quando o produto não tem preço: **897 de 29.066 produtos têm preço NULL e 58 têm preço 0** → exigir `preco > 0` (`PRECO_INDISPONIVEL`). `estanapromocao(int)` retorna boolean (NULL se produto inexistente).

### Cadastro de produtos [VERIFIED: clone]
Ativos (`statusproduto = true`) = 2.415; `statusproduto` NULL em 592 (tratar como inativo — o filtro `= true` já faz). `vendeproduto` NULL em 870 (o `COALESCE(...,true)` da captura os inclui). `permitefracionar` default true, NULL em 0 linhas, false em 7. `descontomaximo` dos ativos: `0.01` → 1.299, NULL → 1.077, `0.00` → 24, `99.00` → 14, `1.00` → 1. Produtos kit (`usaprodutocomposto`) entram como UMA linha em `orcamento_item` (1.995+ linhas reais) — não expandir. Estoque: 50 itens recentes têm `quantidadeitem > estoqueloja` → **o Balcão não bloqueia por estoque**; não validar estoque (apenas informar).

### Formas de pagamento [VERIFIED: clone]
Query da captura retorna 8 formas: `1 DINHEIRO(tipo 1)`, `3 CARTÃO DE CREDITO(2)`, `4 CARTÃO DE DEBITO(2)`, `5 PIX(4)`, `6 A PRAZO(0)`, `7 BOLETO(0)`, `8 LINK DE PAGAMENTO(2)`, `10 BOLETO 2(1)`, `11 CARTÃO(1)` (9 `CARTÃO PRESENTE` tipo 3/preferencial é excluída). `orcamento_forma_pagamento` **não tem FK para `forma_pagamento`** nem para `condicao_pagamento` (só índices) → validar no backend. Uso real de `idcondicaopagamento`: formas 1 e 5 → sempre `0`; formas 3,4,6,7 → sempre uma condição real (1..12). `condicao_pagamento` PK `(idcondicaopagamento, idformapagamento)`; ativas: `2 (forma 4)`, `3 (6)`, `7 (8)`, `10/11/14 (3)`, `12/13 (7)`. Formas A prazo/Boleto aparecem SEMPRE com `idcliente` preenchido (11/11 e 8/8). `conf_vendas`: `permitedescontoitem = t`, `permitedescontode = 100.000`, `limitequantitemporvenda = 10000`.

### Autor / vendedor / terminal [VERIFIED: clone]
`funcionario_usuario` ids 1..6 (`SUPORTE, BOM CUSTO, JOSEJR, FERNANDA, LUCIANA, DIEGO`); `funcionario` ids 1..6 casam 1:1 (`idfuncionario = idfuncionariousuario`). `orcamento.idvendedor` **não tem FK**, mas 100% dos valores existem em `funcionario.idfuncionario` (nunca NULL). `terminal` ids 1..5, todos com `balcaogeraorcamento = t`; o mais usado por usuário: user 6 → terminal 4, user 4 → terminal 5, user 3 → terminal 3. Validar as 3 envs: `funcionario_usuario`, `funcionario` (vendedor) e `terminal`.

### Triggers e rules [VERIFIED: clone]
Triggers de usuário nas 3 tabelas: nenhum. **Rules**: `atualizardatahorainsert AS ON INSERT TO public.orcamento DO UPDATE conf_inicial SET datahora = now();` e `atualizardatahoraupdate` idêntica para UPDATE (a mesma RULE existe em `produto`, que a Fase 40 já grava em produção).

### Grants mínimos para a gravação [VERIFIED: clone, E2E em BEGIN/ROLLBACK com role temporário `NOLOGIN`]
Role só com `SELECT` em todas as tabelas + os GRANTs abaixo gravou header/item/pagamento com sucesso (incluindo o `UPDATE conf_inicial` da RULE, que NÃO precisou de GRANT — consistente com [CITED: postgresql.org/docs/9.0/rules-privileges.html] "Relations that are used due to rules get checked against the privileges of the rule owner, not the user invoking the rule."):
```sql
GRANT INSERT ON orcamento, orcamento_item, orcamento_forma_pagamento TO <usuario>;
GRANT DELETE ON orcamento_forma_pagamento TO <usuario>;
GRANT USAGE ON SEQUENCE orcamento_idorcamento_seq, orcamento_senhabalcao_seq,
  orcamento_item_iditemorcamento_seq, orcamento_forma_pagamento_idformapagamentoorcamento_seq TO <usuario>;
```
Em produção só se sabe que `usuario_leitura` tem INSERT em `orcamento` (44-CONTEXT `<specifics>`); os demais GRANTs são `[ASSUMED]` e devem entrar na mensagem `PERMISSAO_NEGADA` (42501) + roteiro de verificação manual.

## Common Pitfalls

### Pitfall 1: Aritmética de dinheiro em float / sem arredondar a linha
**What goes wrong:** `valor` do cabeçalho diverge em centavos do Balcão para qtd fracionada (ex. 24764); `numeric(9,3)` estoura ou grava 3 casas "sujas".
**How to avoid:** milésimos inteiros (`paraMilli`), `linhaCentavos = (qMilli × vMilli + 5000n) / 10000n` (half-up, BigInt), `valor = Σ linhaCentavos`, enviar ao pg como string `"48.50"`. **Warning signs:** testes com `0.1+0.2`, `1.162×41.74`, `2.505×3`.

### Pitfall 2: Lock de `conf_inicial` pela RULE
**What goes wrong:** o INSERT em `orcamento` faz `UPDATE conf_inicial` (linha única) e segura o lock até o COMMIT; outro INSERT/UPDATE em `orcamento`/`produto` (Balcão, Fase 40) bloqueia.
**How to avoid:** todas as leituras/validações/cálculos ANTES do primeiro INSERT; nada assíncrono externo dentro da transação; `SET LOCAL statement_timeout = 15000` (existe no 9.0; `lock_timeout` só existe a partir do 9.3 — NÃO usar). [CITED: contexto — `lock_timeout` ausente em 9.0 é conhecimento de treinamento, `[ASSUMED]`]

### Pitfall 3: `idcondicaopagamento = 0` só vale para Dinheiro/PIX
**What goes wrong:** D-02 grava `0` sempre; para A prazo/Boleto/Cartão o Balcão guarda a condição real — o orçamento fica inconsistente no Balcão (parcelas/taxas).
**How to avoid:** devolver `condicoes[]` em `formas-pagamento`; aceitar `idcondicaopagamento?` no POST; exigir quando `tipodeforma IN (0,2)` (`CONDICAO_PAGAMENTO_INVALIDA` se não pertencer à forma ou `status=false`); `0` quando tipo 1/4. Exigir `idcliente` quando `tipodeforma = 0`.

### Pitfall 4: Regra `descontomaximo` torna descontos globais inviáveis
Ver Open Question 1. Mínimo por unidade: `minUnitMilli = ceilDiv(precoMilli × (10000 − dmCentesimos), 10000)` (dm `numeric(5,2)` → centésimos; `0.01%` com preço `2.500` → `2499.75` → ceil → `2500`, sem tolerância indevida). Comparar na linha: `liquidoLinha ≥ ceilDiv(qMilli × minUnitMilli, 10000)`.

### Pitfall 5: `GET :id` capturando as rotas estáticas
**What goes wrong:** `GET /athos/orcamentos/produtos` cai em `:id` + `ParseIntPipe` → 400. **How to avoid:** declarar `produtos` e `formas-pagamento` ANTES de `:id` (mesma nota do `athos-produto.controller.ts`, "Rotas estáticas declaradas ANTES da rota paramétrica") [VERIFIED: arquivo lido].

### Pitfall 6: `ValidationPipe` global com `forbidNonWhitelisted: true`
Todo campo do DTO precisa de decorator; array aninhado exige `@ValidateNested({ each: true }) @Type(() => ItemDto)`, `@ArrayMinSize(1)`, `@ArrayMaxSize(200)`; números com `@IsNumber({ maxDecimalPlaces: 3 })`; `simular` com `@IsBoolean()`; `idproduto` `@IsInt() @Min(1)`. Query `limit` chega como string → `@Type(() => Number)`.

### Pitfall 7: Busca textual
Quebrar `q` em tokens (AND), `ILIKE` com escape de `\ % _`, `$n` parametrizado; ordenar exatos (idproduto/barras/referência) primeiro. `produto.descricaoproduto` é domínio `descricao` — `ILIKE` funciona [VERIFIED: execução]. NÃO usar `unaccent` (extensão pode não existir no 9.0 do cliente). `LIMIT` clampado a 1..50 no servidor.

### Pitfall 8: Atomicidade Athos × Prisma
Commit no Athos e escrita no Prisma não são atômicos. Mitigar: reserva prévia (Pattern 3) e marcador no `obs`: `[IA] ref:<12 primeiros hex do hash da chave> <texto sanitizado>` — permite localizar órfão com `SELECT idorcamento FROM orcamento WHERE obs LIKE '[IA] ref:abc123%'`. (Estende D-02 sem contradizê-la.)

### Pitfall 9: `validarFkExiste` não serve para tudo
Usa `"${tabela}"` quoted (identificadores minúsculos funcionam) e lança `UnprocessableEntityException` sem `codigo`. Para erros `{codigo,mensagem}` fazer consultas em lote próprias (`WHERE idproduto = ANY($1::int[])`) e comparar conjuntos.

### Pitfall 10: Encoding do texto
`obs` do usuário deve passar por `sanitizarTextoAthos(texto, max)` (remove acentos e caracteres fora de `[A-Za-z0-9 .,:/-]`); o prefixo `[IA]` é literal fixo, inserido DEPOIS da sanitização (os colchetes seriam removidos). Teto: `obs` ≤ 2000.

### Pitfall 11: Sequências queimadas / testes de IT
`nextval` não é transacional: o E2E em `ROLLBACK` já queimou ids no clone. Irrelevante para correção, mas o IT não deve assertar ids absolutos. Em `READ ONLY` o `nextval` falha (`25006 cannot execute nextval() in a read-only transaction`, verificado) → simulação não devolve `senhabalcao`/`idorcamento`.

### Pitfall 12: CI roda a suíte inteira
`.github/workflows/ci.yml` roda `npm --workspace @orcamento/backend run test`; o IT precisa de `describe.skip` sem `ATHOS_IT_CLONE=1` [VERIFIED: ci.yml linhas 26-35].

## Code Examples

### SQL-1 — busca de produtos (validada no clone via node-pg; só recursos de 9.0)
```sql
SELECT p.idproduto, p.descricaoproduto, pm.nome AS marca, p.referencia, p.codigobarra1,
       precovendaproduto(p.idproduto) AS preco, estanapromocao(p.idproduto) AS empromocao,
       COALESCE(p.estoqueloja, 0) AS estoqueloja, COALESCE(p.estoquedeposito, 0) AS estoquedeposito,
       COALESCE(p.permitefracionar, true) AS permitefracionar, COALESCE(p.descontomaximo, 0) AS descontomaximo,
       pu.sigla AS unidade
  FROM produto p
  LEFT JOIN produto_marca pm ON pm.idmarca = p.idmarca
  LEFT JOIN produto_unidade pu ON pu.idunidade = p.idunidade
 WHERE p.statusproduto = true AND COALESCE(p.vendeproduto, true) = true
   AND ( (p.descricaoproduto ILIKE $1 OR p.referencia ILIKE $1 OR p.codigobarra1 ILIKE $1)  -- um bloco por token, AND entre eles
         [OR p.idproduto = $k::int  -- somente se q for só dígitos e <= 2147483647] )
 ORDER BY (p.idproduto = $k::int OR p.codigobarra1 = $q OR p.referencia = $q) DESC, p.descricaoproduto
 LIMIT $n
```
Resultado real: `caneta bic` → 9 linhas (ex. `29246 ATAC CANETA ESF BIC CRISTAL`, `preco '68.000'`, `descontomaximo '0.01'`, `unidade 'UN'`). Montar o `ORDER BY` com parâmetros apenas quando `q` numérico (senão omitir o termo). Estoque pode vir NULL → `COALESCE`.

### SQL-2 — formas de pagamento (query da captura, validada: 9 linhas incl. tipo 1 "BOLETO 2" e "CARTÃO")
```sql
SELECT f.idformapagamento, f.descricao, f.tipodeforma, f.tipopix
  FROM forma_pagamento f
 WHERE (f.tipodeforma IN (1,3,4) AND f.status = true
        OR f.tipodeforma IN (0,2) AND f.status = true
           AND f.idformapagamento IN (SELECT idformapagamento FROM condicao_pagamento WHERE status = true))
   AND f.utilizacartaopreferencial = false AND f.tipodeforma <> 3
 ORDER BY f.idformapagamento;
-- condições: SELECT idcondicaopagamento, idformapagamento, descricao, quantidadeparcela
--              FROM condicao_pagamento WHERE status = true ORDER BY idformapagamento, idcondicaopagamento;
-- (a query da captura também lê conta_corrente/PIX e AVG(taxajurosrecebimentocartao); desnecessário para a IA)
-- Validação no POST: reaplicar o mesmo WHERE com AND f.idformapagamento = $1.
```
`forma_pagamento.descricao` é `descricao_curta` com acentos (`CARTÃO`) → serializar UTF-8 normal.

### SQL-3 — validações em lote dentro da transação
```sql
SELECT p.idproduto, p.statusproduto, COALESCE(p.vendeproduto, true) AS vende,
       precovendaproduto(p.idproduto) AS preco, COALESCE(p.permitefracionar, true) AS permitefracionar,
       COALESCE(p.descontomaximo, 0) AS descontomaximo,
       CASE WHEN p.quantidadecaixa > 0
            THEN (p.valorcustocaixa / p.quantidadecaixa) + ((p.valorcustocaixa / p.quantidadecaixa) * (p.imposto + p.ipi + p.frete + p.outroimposto) / 100)
            ELSE p.valorcustocaixa + (p.valorcustocaixa * (p.imposto + p.ipi + p.frete + p.outroimposto) / 100)
       END AS valorcustounitario
  FROM produto p WHERE p.idproduto = ANY($1::int[]);
SELECT 1 FROM cliente WHERE idcliente = $1;
SELECT 1 FROM funcionario_usuario WHERE idfuncionariousuario = $1;   -- ATHOS_ORCAMENTO_ID_FUNCIONARIO
SELECT 1 FROM funcionario WHERE idfuncionario = $1;                  -- ATHOS_ORCAMENTO_ID_VENDEDOR
SELECT 1 FROM terminal WHERE idterminal = $1;                        -- ATHOS_ORCAMENTO_ID_TERMINAL
SELECT permitedescontoitem, permitedescontode FROM conf_vendas;     -- opcional (teto de desconto global)
```
O `valorcustounitario` é `numeric` sem escala (ex. `33.07500000000000000000`) e pode ser NULL (custo/impostos NULL) → `COALESCE(...,0)`, arredondar a 3 casas (HALF_UP) antes de gravar em `valorcustoitem` (`monetariobig`, 16,3); o gap de 3→cheio é aceito pelo pg (ele arredonda), mas arredondar no app mantém o `RETURNING`/resposta idênticos.

### SQL-4 — gravação (E2E validado no clone dentro de BEGIN/ROLLBACK, role mínimo)
```sql
INSERT INTO orcamento(descontors, idvendedor, idcliente, idfuncionariousuario, idterminal, dataorcamento, hora,
                      validadeorcamento, valor, desconto, statusorcamento, obs, idtransportadora, dataentrega,
                      idenderecocliente, valoracrescimo, statusimpressao)
VALUES ($1, $2, $3, $4, $5, current_date, cast(current_time(0) as time), NULL, $6, $7, NULL, $8, NULL, NULL, 0, 0, false)
RETURNING idorcamento, senhabalcao;
-- por item (idorcamento do RETURNING como parâmetro; NÃO usar currval):
INSERT INTO orcamento_item(idorcamento, sequenciaitem, idproduto, quantidadeitem, valoritem, valordesconto,
                           valorcustoitem, valorcomissao, codigovariante, comprimento, pesoliquido, pesobruto,
                           observacao, depositoloja, orcamentodesconto, orcamentovalorfinalitem)
VALUES ($1, $2, $3, $4, $5, 0, $6, 0, '', 0, 0, 0, '', false, $7, $8)
RETURNING iditemorcamento;
DELETE FROM orcamento_forma_pagamento WHERE idorcamento = $1;
INSERT INTO orcamento_forma_pagamento(idorcamento, idformapagamento, valor, valorrecebido, idcondicaopagamento)
VALUES ($1, $2, $3, $3, $4) RETURNING idformapagamentoorcamento;
```
Saída do E2E: `idorcamento 25866, senhabalcao 25866, statusimpressao f`; item `iditemorcamento 50689`; pagamento `25874`; `SELECT` de volta `valor 12.500 | desconto 10.000 | descontors 1.250`; `SELECT count(*) FROM orcamento WHERE obs like '[IA]%'` após ROLLBACK = `0`. `RETURNING` convive com a RULE `DO ALSO UPDATE` sem problema. `$3` reutilizado em `valor, valorrecebido` exige cast se tipos divergirem — passar `$3::numeric`.
Data/hora: manter `current_date`/`cast(current_time(0) as time)` (D-02, mesmo que Fase 43); a hora do Balcão em `orcamento.hora` é local do servidor Athos.

### SQL-5 — leitura (`GET :id`)
```sql
SELECT idorcamento, senhabalcao, idcliente, idvendedor, idfuncionariousuario, idterminal,
       to_char(dataorcamento,'YYYY-MM-DD') AS data, to_char(hora,'HH24:MI:SS') AS hora,
       valor, desconto, descontors, statusorcamento, statusimpressao, cancelado, obs
  FROM orcamento WHERE idorcamento = $1;
SELECT i.sequenciaitem, i.idproduto, p.descricaoproduto, i.quantidadeitem, i.valoritem,
       i.orcamentodesconto, i.orcamentovalorfinalitem
  FROM orcamento_item i JOIN produto p ON p.idproduto = i.idproduto
 WHERE i.idorcamento = $1 ORDER BY i.sequenciaitem;
SELECT ofp.idformapagamento, f.descricao, ofp.valor, ofp.valorrecebido, ofp.idcondicaopagamento
  FROM orcamento_forma_pagamento ofp LEFT JOIN forma_pagamento f ON f.idformapagamento = ofp.idformapagamento
 WHERE ofp.idorcamento = $1 ORDER BY ofp.idformapagamentoorcamento;
```

### Util de cálculo (esqueleto, aritmética inteira — validado manualmente com os casos reais acima)
```typescript
// athos-orcamento-calc.util.ts  (PURO; sem I/O)
export const paraMilli = (v: string | number): bigint => {
  const s = typeof v === "number" ? v.toFixed(3) : v;            // '2.500' | '2' | '41.74'
  const [i, f = ""] = s.split(".");
  return BigInt(i) * 1000n + BigInt((f + "000").slice(0, 3));    // validar sinal/formato antes
};
// round2(qtd*valor) em centavos, half-up: 1.162 x 41.740 -> 4850 ; 1.350 x 41.740 -> 5635
export const linhaCentavos = (qMilli: bigint, vMilli: bigint): bigint => (qMilli * vMilli + 5000n) / 10000n;
// preço mínimo por unidade (milésimos), dm em centésimos (0.01% -> 1); ceil para nunca permitir abaixo
export const minUnitMilli = (precoMilli: bigint, dmCentesimos: bigint): bigint =>
  (precoMilli * (10000n - dmCentesimos) + 9999n) / 10000n;
// % do cabeçalho (3 casas) = round(descCentavos*100000/brutoCentavos) / 1000 : 4/17704 -> 23 -> 0.023 ; 298/850 -> 35059 -> 35.059
export const percentualMilli = (descC: bigint, brutoC: bigint): bigint => (descC * 100000n + brutoC / 2n) / brutoC;
// rateio (maior resto): cota_i = floor(D*liq_i/Σliq); sobra de centavos distribuída 1 a 1 pelas linhas de maior resto
// (cada cota <= liq_i garantido quando D <= Σliq); empate -> ÚLTIMA linha (alinha com D-02 "ajuste no último item")
export function ratear(descontoC: bigint, liquidos: bigint[]): bigint[] { /* ... */ return []; }
export const centavosParaTexto = (c: bigint): string => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
```
Limites BigInt: `q` até 999.999.999 milésimos × `v` até 999.999.999 → 1e18 > 2^53; por isso BigInt (não `Number`).

### Esqueleto do teste de integração (gated)
```typescript
// athos-orcamento.clone.it.test.ts
const rodar = process.env.ATHOS_IT_CLONE === "1" ? describe : describe.skip;
rodar("IT clone athos-teste", () => {
  beforeAll(() => {
    // trava dupla: só 127.0.0.1:5440/athos
    if (process.env.ATHOS_PG_HOST !== "127.0.0.1" || process.env.ATHOS_PG_PORT !== "5440" || process.env.ATHOS_PG_DB !== "athos") {
      throw new Error("IT bloqueado: só o clone local 127.0.0.1:5440");
    }
    process.env.ATHOS_ORCAMENTO_ESCRITA = "true";
  });
  // sem jest.mock("pg"); Prisma mockado; criar via service; conferir 3 tabelas; afterAll: DELETE por id no clone
});
```
Comando: `ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos ATHOS_PG_USER=postgres ATHOS_PG_PASS=athosteste ATHOS_ORCAMENTO_ID_FUNCIONARIO=3 ATHOS_ORCAMENTO_ID_VENDEDOR=3 ATHOS_ORCAMENTO_ID_TERMINAL=3 npm --prefix apps/backend run test -- athos-orcamento.clone --no-coverage`.

### Modelo Prisma + migration (convenção aditiva/idempotente, como `20261106120000_add_cobranca_baixa_athos`)
```prisma
/// Idempotência e auditoria dos orçamentos criados pela IA no Athos - Fase 44. Sem FK (banco do Athos é externo).
model AthosOrcamentoIa {
  id             Int      @id @default(autoincrement())
  idempotencyKey String?  @unique          // NULL quando o chamador não envia o header
  payloadHash    String
  status         String   @default("processando") // processando | criado
  idorcamento    Int?                             // preenchido após COMMIT no Athos
  senhabalcao    Int?
  valorBruto     Decimal? @db.Decimal(12, 2)
  valorLiquido   Decimal? @db.Decimal(12, 2)
  request        Json?                            // payload normalizado (auditoria)
  criadoEm       DateTime @default(now())
  atualizadoEm   DateTime @updatedAt
  @@index([idorcamento])
}
```
```sql
CREATE TABLE IF NOT EXISTS "AthosOrcamentoIa" ( "id" SERIAL NOT NULL, "idempotencyKey" TEXT, "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processando', "idorcamento" INTEGER, "senhabalcao" INTEGER, "valorBruto" DECIMAL(12,2),
  "valorLiquido" DECIMAL(12,2), "request" JSONB, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL, CONSTRAINT "AthosOrcamentoIa_pkey" PRIMARY KEY ("id") );
CREATE UNIQUE INDEX IF NOT EXISTS "AthosOrcamentoIa_idempotencyKey_key" ON "AthosOrcamentoIa"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "AthosOrcamentoIa_idorcamento_idx" ON "AthosOrcamentoIa"("idorcamento");
```
Nome da migration sugerido: `20261109120000_add_athos_orcamento_ia` (última existente: `20261106120000_add_cobranca_baixa_athos` [VERIFIED: ls prisma/migrations]). `PrismaService` vem de `DatabaseModule` (já importado por `AthosModule`).

### Wiring
`athos.module.ts`: adicionar `AthosOrcamentoService` em `providers` e `AthosOrcamentoController` em `controllers` [VERIFIED: arquivo lido]. Env vars (4 arquivos): `.env.example`, `deploy/stack.env.example`, `deploy/docker-compose.vps.yml`, `deploy/docker-compose.box.vps.yml` — o compose repassa env explicitamente (ex. `ATHOS_BAIXA_AUTO: ${ATHOS_BAIXA_AUTO:-true}`), então variável nova NÃO chega ao container sem entrada no compose. `ATHOS_ORCAMENTO_ESCRITA` default `false` (`${ATHOS_ORCAMENTO_ESCRITA:-false}`); só o texto `true` habilita (inverso da 43).

## Route Collision Check [VERIFIED: grep `@Controller(` + `@Get/@Post` em athos.controller.ts / athos-produto.controller.ts]
Controllers existentes sob `/athos`: `AthosController` (`athos`: `orcamento-correcoes`, `contas-pagar[...]`, `clientes[...]`, `livros-registro`, `contas-receber/...`, `venda/...`), `ProdutoController` (`athos/produtos[...]`), `ProdutoCompostoController` (`athos/produtos/:id/composicao`). Nenhuma rota `athos/orcamentos[...]` existe; `orcamento-correcoes` (singular, composto) não colide. Sem rotas paramétricas de 1º nível em `athos` que capturem `orcamentos`. Seguro: novo `@Controller("athos/orcamentos")`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Captura pktmon sem BEGIN, comandos soltos | Uma transação com `RETURNING` | Esta fase | Atomicidade; sem `SELECT ... ORDER BY id DESC LIMIT 1` |
| `valor` bruto simples (D-02) | `valor = Σ round2(linha)` | Achado desta pesquisa | Idêntico ao Balcão em qtd fracionada |

**Deprecated/outdated:** nada de lib. Produção é PG 9.0.5 (EOL) — escrever SQL conservador.

## Runtime State Inventory
Não é rename/refactor/migration → seção omitida (fase greenfield de API).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `usuario_leitura` (produção) NÃO tem ainda INSERT em `orcamento_item`/`orcamento_forma_pagamento`, DELETE em `orcamento_forma_pagamento` e USAGE nas 4 sequências | Grants | POST real falha com `42501`; mitigado pela mensagem `PERMISSAO_NEGADA` + roteiro manual |
| A2 | Orçamento com `statusimpressao=false` e sem `monitoramento` aparece normalmente no Balcão/PDV de produção | Domain/D-02 | IA cria orçamento "invisível"/ com aviso de reimpressão; validar na verificação manual |
| A3 | O terminal gravado em `idterminal` não restringe a visibilidade do orçamento no Balcão (qualquer terminal vê) | Autor | Orçamento só aparece em outro balcão; confirmar com o usuário qual terminal usar |
| A4 | PG 9.0.5 aceita todo o SQL desta pesquisa (testado só em PG14; recursos usados — `ILIKE`, `= ANY($1::int[])`, `RETURNING`, multi-param, `to_char`, `COALESCE`, `current_time(0)`, `SET LOCAL statement_timeout`, `SET TRANSACTION READ ONLY` — existem no 9.0) | SQL | Erro de sintaxe só visível em produção; READ ONLY confirmado em [CITED: postgresql.org/docs/9.0/sql-set-transaction.html]; demais itens por conhecimento |
| A5 | `lock_timeout` não existe no 9.0 (adicionado no 9.3) | Pitfall 2 | Se existisse, seria opção melhor; usar `statement_timeout` não é incorreto |
| A6 | `conf_vendas.limitequantitemporvenda` (10000) é limite de quantidade por item/venda | Domain | Cap próprio (itens ≤ 200, quantidade ≤ 10000) pode ser mais restritivo/menos restritivo que o Balcão |
| A7 | A RULE de INSERT em `orcamento` existe e se comporta igual em produção (o clone é `pg_dump` de produção) | Pitfall 2 | Lock/permissão diferentes |
| A8 | Dados reais de produção ≈ clone de 2026-11-09 (25.833 orçamentos); invariantes seguem valendo | Money | Regras de arredondamento divergem para casos raros |

## Open Questions

1. **`descontomaximo` e descontos globais/por item**
   - Know: D-01 só cita `valorUnitario`; 2.400 de 2.415 produtos ativos têm `descontomaximo` NULL/0/0,01 (ou seja, efetivamente 0%); `conf_vendas.permitedescontode = 100`, `funcionario.descontomaximo = 100`. O Balcão real grava preços editados com `descontomaximo = 0.01` (não impõe a regra).
   - Unclear: `desconto` (por item) e `descontoTotalRS` também devem respeitar `descontomaximo`?
   - Recommendation: aplicar a regra a `valorUnitario` E `desconto` por item (mesmo efeito econômico); para `descontoTotalRS` validar apenas `≤ Σ líquido` (`DESCONTO_EXCEDE_TOTAL`) e `≤ permitedescontode%` do bruto — levar ao usuário a decisão antes de planejar (se for estrita, descontos globais ficam inutilizáveis).
2. **Forma de pagamento opcional vs. padrão do Balcão** — 100% dos orçamentos recentes têm 1 linha de pagamento. Recomendação: `idformapagamento` opcional na API, porém com default configurável `ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO` (sugestão `1` DINHEIRO) para sempre gravar uma linha; ou manter sem pagamento e validar no Balcão (A2). Decisão do usuário.
3. **Semântica de `itens[].desconto`**: R$ da linha inteira (recomendado, = `orcamentodesconto`) vs. %. Recomendação: R$ por linha, nomeado `descontoRS` no DTO para evitar ambiguidade (D-01 escreve `desconto?`); documentar no Swagger.
4. **Quais ids usar nas envs** (`ATHOS_ORCAMENTO_ID_FUNCIONARIO/VENDEDOR/TERMINAL`): dados existentes: usuários 1..6; sugerido `SUPORTE (1)` como Fase 43 ou criar funcionário "IA" (fora do escopo). Terminal 3 "BALÇÃO 1" é o da captura. Usuário decide; código só valida existência.
5. **`idcondicaopagamento`** (Pitfall 3) — aceitar o campo opcional extra e `condicoes[]` na listagem (recomendado) vs. manter `0` fixo e restringir `formas-pagamento` a tipos 1/4. Decisão do usuário (afeta Boleto/A prazo/Cartão).
6. **Permissões em produção (A1)** — precisa do DBA; deve constar no roteiro manual (nova `43-ROTEIRO`-like para a 44, executado só pelo usuário).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + container `athos-teste` | IT e pesquisa SQL | ✓ (Up) | PostgreSQL 14.24 | — (IT gated; unit tests não precisam) |
| Node | build/test | ✓ | v22.22.1 | — |
| npm/jest | testes | ✓ | jest ^30.3.0; suíte `athos-conta-receber-baixa.service` roda em ~7s (49 testes ok) | — |
| Postgres do Sistema (Prisma) | migration/runtime | ✓ (`orcamento-postgres` healthy) | — | testes mockam Prisma |
| Athos real (PG 9.0.5) | produção | N/A para execução (proibido) | 9.0.5 | verificação manual do usuário |

**Missing dependencies with no fallback:** nenhuma para planejar/implementar. O CI não tem o clone → IT é `describe.skip` lá.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest ^30.3.0 + ts-jest ^29.4.9 [VERIFIED: apps/backend/package.json] |
| Config file | `apps/backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`, ts-jest CommonJS) [VERIFIED: arquivo lido] |
| Quick run command | `npm --prefix apps/backend run test -- athos-orcamento --no-coverage` |
| Full suite command | `npm --workspace @orcamento/backend run test` (o que o CI roda) |
| Padrão de pg falso | `jest.mock("pg", () => ({ Pool: jest.fn(() => mPool), __mClient, __mPool }))` + classificador `tipo(sql)` por regex [VERIFIED: athos-conta-receber-baixa.service.test.ts:1-60] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORC-04 | `linhaCentavos` (1.162×41.74=48.50; 1.35×41.74=56.35; 2.505×3), `ratear` (soma exata; cota ≤ líquido; 25378 → 2.28/0.70), `percentualMilli` (0.023; 35.059), `minUnitMilli` (0.01% de 2.500 → 2.500), 22003 guard | unit | `npm --prefix apps/backend run test -- athos-orcamento-calc.util --no-coverage` | ❌ Wave 0 |
| ORC-01 | SQL-1 parametrizado: tokens, escape `\ % _`, q numérico, limit 1..50, mapeamento de resposta (NULL→0, numeric string) | unit (pg falso) | `... -- athos-orcamento.service --no-coverage` | ❌ Wave 0 |
| ORC-02 | formas + condições; validação de forma/condição (tipo 0/2 exigem condição; tipo 0 exige cliente) | unit | idem | ❌ Wave 0 |
| ORC-03 | ordem exata das instruções: `BEGIN` → leituras → `INSERT orcamento` → N× `INSERT orcamento_item` → `DELETE`+`INSERT orcamento_forma_pagamento` → `COMMIT`; ROLLBACK em erro no meio; `release()` sempre; parâmetros (valor bruto, `descontors`, `desconto`, `obs` com `[IA]`) | unit | idem | ❌ Wave 0 |
| ORC-05 | cada código de erro (PRODUTO_INEXISTENTE/INATIVO, PRECO_INDISPONIVEL, PRECO_ABAIXO_MINIMO, QUANTIDADE_FRACIONADA, CLIENTE_INEXISTENTE, FORMA_PAGAMENTO_INVALIDA, DESCONTO_EXCEDE_TOTAL, CONFIG_AUTOR_INVALIDA) com status HTTP e `codigo` | unit | idem | ❌ Wave 0 |
| ORC-06 | `simular: true`: `SET TRANSACTION READ ONLY` emitido, NENHUM `INSERT/UPDATE/DELETE`, termina em `ROLLBACK`, sem `idorcamento`; funciona com `ESCRITA` desligada | unit | idem | ❌ Wave 0 |
| ORC-07 | `GET :id`: 404 `ORCAMENTO_INEXISTENTE`; mapeamento header+itens+pagamentos; ordem de rotas (estáticas antes de `:id`) | unit + controller test | `... -- athos-orcamento.controller --no-coverage` | ❌ Wave 0 |
| ORC-08 | flag: ausente/`false` → 503 `ESCRITA_DESABILITADA` (sem tocar o pool); `assertHostPermitido` lança com host real em `NODE_ENV=test`; `42501` → `PERMISSAO_NEGADA` com GRANT sugerido; `22003`/`22001`/`23503` mapeados | unit | idem | ❌ Wave 0 |
| ORC-09 | idempotência: chave nova reserva→cria→conclui; mesma chave+mesmo hash devolve existente sem novo INSERT; hash diferente → 409; `P2002` concorrente → 409/replay; falha pré-commit libera reserva; sem header grava auditoria | unit (Prisma mockado) | `... -- athos-orcamento-idempotencia --no-coverage` | ❌ Wave 0 |
| ORC-10 | IT real no clone: cria orçamento (item fracionado + desconto global + forma 1), relê as 3 tabelas e confere invariantes (`descontors=Σ`, `valor−descontors=Σ final`, `statusorcamento IS NULL`, `statusimpressao=false`, `obs LIKE '[IA]%'`); simulação não altera contagens | integration (gated) | `ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos ATHOS_PG_USER=postgres ATHOS_PG_PASS=athosteste ATHOS_ORCAMENTO_ID_FUNCIONARIO=3 ATHOS_ORCAMENTO_ID_VENDEDOR=3 ATHOS_ORCAMENTO_ID_TERMINAL=3 npm --prefix apps/backend run test -- athos-orcamento.clone --no-coverage` | ❌ Wave 0 |
| ORC-10 (9.0) | varredura estática dos literais SQL do service: proibir `ON CONFLICT`, `FILTER (`, `jsonb`, `WITH ... INSERT`, `GENERATED`, `lock_timeout`, `unaccent`, `pg_sequence_last_value` | unit | `... -- athos-orcamento.service --no-coverage` (teste "SQL compatível com 9.0") | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm --prefix apps/backend run test -- athos-orcamento --no-coverage` (~7-10 s)
- **Per wave merge:** `npm --workspace @orcamento/backend run test` + `npm run build` (tsc) 
- **Phase gate:** suíte completa verde + IT no clone executado uma vez (manual, com `ATHOS_IT_CLONE=1`) antes de `/gsd-verify-work`; verificação manual em produção é do usuário (roteiro estilo 43)

### Wave 0 Gaps
- [ ] `athos-orcamento-calc.util.test.ts` — ORC-04
- [ ] `athos-orcamento.service.test.ts` (+ fixtures de pg falso) — ORC-01,02,03,05,06,08, compat 9.0
- [ ] `athos-orcamento.controller.test.ts` — ORC-07 e contrato HTTP (DTO/ValidationPipe via `Test.createTestingModule` ou chamada direta como `athos-produto.controller.test.ts`)
- [ ] `athos-orcamento-idempotencia.test.ts` — ORC-09 (Prisma mockado)
- [ ] `athos-orcamento.clone.it.test.ts` — ORC-10 (gated)
- [ ] Nenhum framework a instalar.

## Security Domain

`security_enforcement` não está definido em `.planning/config.json` (ausente = habilitado).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `InternalAuthGuard` global (`x-internal-api-key`, `timingSafeEqual`) [VERIFIED: internal-auth.guard.ts] — não criar guard novo |
| V3 Session Management | no | API stateless por chave |
| V4 Access Control | yes | Chave única interna; `GET :id` lê qualquer orçamento (aceito: mesma chave já lê o Athos); gravação atrás de `ATHOS_ORCAMENTO_ESCRITA=true` |
| V5 Input Validation | yes | class-validator (whitelist/forbidNonWhitelisted, `ArrayMaxSize`, `IsNumber maxDecimalPlaces:3`, `Min/Max`), SQL 100% parametrizado, escape de LIKE, `sanitizarTextoAthos` em `obs`; `Idempotency-Key` com regex `^[A-Za-z0-9._:-]{8,128}$` |
| V6 Cryptography | yes (leve) | SHA-256 do `crypto` built-in para payload hash; sem cripto própria |
| V7 Logging/Errors | yes | Logar `idorcamento`, nº de itens, resultado; NUNCA logar senha/ENV; mensagens de erro sem vazar SQL (`mapearErroPg` genérico) |
| V11 Business Logic | yes | Preço sempre do Athos, preço mínimo por `descontomaximo`, limite de itens/valores, idempotência contra duplicata |

### Known Threat Patterns for NestJS + pg direto

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection (busca `q`, ids) | Tampering | Apenas parâmetros `$n`; identificadores fixos em constantes; `limit` clampado |
| Agente de IA repete/alucina chamadas (duplicata de orçamento) | Repudiation/Tampering | `Idempotency-Key` + auditoria `AthosOrcamentoIa` + `@Throttle(THROTTLE_SENSITIVE)` no POST |
| Escrita acidental no Athos real durante testes | Tampering | Flag default OFF; `assertHostPermitido` em `NODE_ENV=test`; IT com trava dupla (host/porta/db) e `describe.skip` sem env |
| Manipulação de preço pela IA | Tampering | Preço lido na transação; `valorUnitario` ≥ mínimo; totais recalculados no servidor (nunca confiar em totais do cliente) |
| Estouro de domínio `numeric(9,3)` / DoS por payload gigante | DoS | Limites de itens (≤ 200), linha < 1.000.000, `statement_timeout` |
| Lock prolongado de `conf_inicial` bloqueando o Balcão | DoS | Transação curta; validar antes de escrever |
| Vazamento de credencial (clone: `postgres/athosteste`) | Info disclosure | Não commitar a senha do clone em arquivos; passar por env na execução do IT |

## Project Constraints (from CLAUDE.md)
- Responder e escrever documentação em **português brasileiro**; código/identificadores seguem a convenção do projeto (arquivos Athos em português sem acento, ex. `athos-conta-receber-baixa`) [CLAUDE.md global + `memory/feedback_idioma.md`].
- **Não usar `AskUserQuestion`**; perguntas como lista numerada em texto (`feedback_askuserquestion.md`) — aplicar na discuss/plan se as Open Questions forem levadas ao usuário.
- **Não mexer em código/testes sem pedido explícito** (`feedback_nao_mexer_codigo.md`) — esta pesquisa não alterou código.
- Backend preferencial VPS `orcamentoapi.bomcustoilhabela.com.br`, fallback `localhost:4000` (`project_urls.md`).
- **Athos = PostgreSQL 9.0.5**: usar `pg_catalog`, sem `pg_sequence_last_value`; `RETURNING` OK (`athos_postgres_9_0_5.md`).
- Regras de negócio globais do CLAUDE.md do usuário (aluguel, DAS, etc.) e da API Athos HTTP (`/api/athos/contas-pagar`, headers) **não se aplicam** a esta fase (acesso é direto via SQL, não pela API HTTP do Athos); a observação "sem caracteres especiais em `observacao`" é espelhada por `sanitizarTextoAthos` por precaução.
- Memória versionada em `memory/`; novas memórias vão para lá e para `MEMORY.md` (não requerido por esta fase).

## Sources

### Primary (HIGH confidence)
- Clone `athos-teste` (PG 14.24, dump 2026-11-09), consultas `psql`/`node-pg` desta sessão: `\d orcamento|orcamento_item|orcamento_forma_pagamento|produto|forma_pagamento|condicao_pagamento|funcionario|terminal|cliente`, `pg_type` dos domínios, `pg_rules`, `pg_get_functiondef(precovendaproduto/estanapromocao)`, invariantes SQL em 5.865 orçamentos, E2E em `BEGIN/ROLLBACK` com role `NOLOGIN` de privilégios mínimos.
- `/root/SistemaOrcamento/.planning/phases/44-.../44-CONTEXT.md` e `44-REFERENCIA-SQL-ATHOS.md`.
- Código: `athos-conta-receber-baixa.service.ts` (L100, L137, L317-L365, L427), `athos-fk.util.ts`, `athos.module.ts`, `athos-produto.controller.ts`, `athos.controller.ts`, `internal-auth.guard.ts`, `security.constants.ts`, `app.module.ts` (APP_GUARD L89-95), `main.ts`, `jest.config.js`, `tsconfig.json`, `schema.prisma`, migration `20261106120000_add_cobranca_baixa_athos`, `ci.yml`, `.env.example`, `deploy/*.yml`.
- [CITED: https://www.postgresql.org/docs/9.0/rules-privileges.html] privilégios de ação de RULE = dono da regra.
- [CITED: https://www.postgresql.org/docs/9.0/sql-set-transaction.html] READ ONLY proíbe INSERT/UPDATE/DELETE (a página não menciona `nextval`; o bloqueio de `nextval` foi observado no PG14 do clone: `25006 cannot execute nextval() in a read-only transaction`).

### Secondary (MEDIUM confidence)
- Fase 43 `43-CONTEXT.md`, `43-01-SUMMARY.md`, `43-ROTEIRO-VERIFICACAO-MANUAL.md` (padrões de transação/simulação/roteiro manual).

### Tertiary (LOW confidence)
- Comportamento do Balcão real em produção com `statusimpressao=false` (A2), visibilidade por terminal (A3), GRANTs de produção (A1) — só confirmáveis pelo usuário.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhuma dependência nova; versões conferidas.
- Architecture: HIGH — espelha a Fase 43 (49 testes passando).
- Pitfalls/SQL: HIGH no PG14 do clone; MEDIUM para o PG 9.0.5 real (A4).
- Regras de negócio de desconto/condição/forma: MEDIUM — dependem das decisões das Open Questions 1-5.

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 (estável; revalidar invariantes se o dump do clone for refeito)
