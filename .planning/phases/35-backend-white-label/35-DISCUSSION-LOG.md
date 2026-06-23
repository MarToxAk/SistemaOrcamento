# Phase 35: Backend White-Label - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 35-backend-white-label
**Areas discussed:** Carregamento do template .hbs externo, Fail-fast das EMPRESA_* vars, EMPRESA_COR_PRIMARIA no PDF

---

## Área 1: Carregamento do template .hbs externo

### Pergunta 1 — Momento de leitura do template

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Leitura no startup (onModuleInit) | Carrega o template uma vez, falha rápido se arquivo não existe | |
| Leitura a cada PDF gerado | Sempre pega a versão mais recente do arquivo externo | ✓ |
| Claude decide | O que fizer mais sentido para o caso de uso | |

**Escolha do usuário:** Leitura a cada PDF gerado
**Notas:** Útil quando o volume Docker é atualizado sem restart do container.

---

### Pergunta 2 — Fallback quando EMPRESA_PDF_TEMPLATE_PATH não está definida

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Ler o arquivo .hbs do disco sempre | Template sempre é um arquivo externo; se não existir, erro em runtime | |
| Tentar .hbs externo; fallback para string TypeScript embutida | Zero risco de regressão, comportamento atual nunca quebra | ✓ |
| Claude decide | | |

**Escolha do usuário:** Opção 2 — fallback para string TypeScript embutida
**Notas:** Zero risco de regressão — o comportamento atual (string inline) nunca quebra.

---

### Pergunta 3 — Path do template padrão no container

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| apps/backend/templates/quote-default.hbs | Copiado pelo Dockerfile separadamente | |
| apps/backend/dist/templates/quote-default.hbs | Copiado junto com o build TypeScript | |
| Claude decide | O que for mais consistente com o Dockerfile existente | ✓ |

**Escolha do usuário:** Claude decide
**Claude decidiu:** `apps/backend/templates/quote-default.hbs` + nova linha `COPY --from=build /app/apps/backend/templates ./apps/backend/templates` na stage `runtime` do Dockerfile — mesmo padrão de `prisma/` e `scripts/`.

---

### Pergunta 4 — Erro em runtime quando template customizado não é encontrado

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Logar warning e usar fallback | Resiliência máxima, deploy continua funcionando | |
| Lançar erro e falhar a geração do PDF | Falha explícita: variável definida implica arquivo presente | |
| Claude decide | | ✓ |

**Escolha do usuário:** Claude decide
**Claude decidiu:** Erro explícito — se `EMPRESA_PDF_TEMPLATE_PATH` está definida, o arquivo deve existir. Falha silenciosa produziria PDFs com dados da empresa errada.

---

## Área 2: Fail-fast das EMPRESA_* vars

### Pergunta 1 — Vars obrigatórias vs. opcionais

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Nenhuma obrigatória | Fallback para valores BomCusto hardcoded (zero breaking change) | |
| Só EMPRESA_MUNICIPIO_IBGE | Afeta validade jurídica da NFS-e | |
| EMPRESA_NOME + EMPRESA_CNPJ + EMPRESA_MUNICIPIO_IBGE | Dados fiscais mínimos | |
| Todas as EMPRESA_* | Deploy white-label só funciona com tudo configurado | ✓ |

**Escolha do usuário:** Todas obrigatórias
**Notas:** Refinado nas perguntas 3 e 4 — EMPRESA_COR_PRIMARIA e EMPRESA_LOGO_URL tornadas opcionais por terem fallbacks razoáveis.

---

### Pergunta 2 — Onde registrar a validação

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Novo AppConfigService/módulo dedicado | Centraliza todas as EMPRESA_* com mensagens claras | |
| Adicionar no padrão existente (REQUIRED_ENV_VARS) | Padrão canônico já em app.module.ts | |
| Claude decide | Baseado no padrão existente | ✓ |

**Escolha do usuário:** Claude decide
**Claude decidiu:** Adicionar ao `REQUIRED_ENV_VARS` em `app.module.ts` — padrão canônico do projeto, zero nova abstração.

---

### Pergunta 3 — Mensagem de erro de startup

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Formato atual | Lista simples dos nomes das vars ausentes | |
| Adicionar hint | "See .env.example for EMPRESA_* setup instructions" | |
| Claude decide | | ✓ |

**Escolha do usuário:** Claude decide
**Claude decidiu:** Adicionar hint — valor alto para onboarding de operador novo fazendo primeiro deploy white-label.

---

### Pergunta 4 — EMPRESA_LOGO_URL sem logo definido

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Manter obrigatória | Deploy sem logo é deploy incompleto | |
| Optional — PDF omite tag img se ausente | Sem imagem quebrada | ✓ |
| Optional — logo BomCusto como fallback | Usa logo atual como padrão | |

**Escolha do usuário:** Opcional — PDF omite a tag `<img>` do logo quando ausente.

---

## Área 3: EMPRESA_COR_PRIMARIA no PDF

### Pergunta 0 — Recomendação solicitada pelo usuário

**Pergunta do usuário:** "o que você recomenda?"

**Recomendação Claude:** Opção 1 (usar a cor no PDF) — template está sendo reescrito de qualquer forma; cor BomCusto já está hardcoded; PDF com dados corretos mas cores erradas é white-label incompleto; fácil implementar com `var(--primary)`.

---

### Pergunta 1 — O PDF usa a cor primária na fase 35?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Sim — cor substitui cores BomCusto hardcoded no .hbs | Implementação completa | ✓ |
| Não — só documenta a var no .env.example | Fase 36 cuida disso | |
| Não — var declarada mas template não a usa | | |

**Escolha do usuário:** Sim — cor primária aplicada no PDF via variável Handlebars.

---

### Pergunta 2 — Onde a cor é aplicada no template

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| CSS custom property no :root | `--primary: {{empresaCor}}` em todo o template | |
| Só no cabeçalho | Mudança cirúrgica, menor risco | |
| Claude decide | Consistente com template atual | ✓ |

**Escolha do usuário:** Claude decide
**Claude decidiu:** CSS custom property `--primary` no `:root`, aplicada em todos os elementos com cor BomCusto hardcoded — alinhado com o que a fase 36 fará no frontend.

---

### Pergunta 3 — Fallback de cor quando empresaCor não é passada

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Fallback no CSS (helper Handlebars) | `{{empresaCor | default "#0d6efd"}}` no template | |
| Fallback no ConfigService (TypeScript) | `configService.get("EMPRESA_COR_PRIMARIA") ?? "#0d6efd"` | |
| Claude decide | | ✓ |

**Escolha do usuário:** Claude decide
**Claude decidiu:** Fallback no serviço TypeScript — template sempre recebe um valor concreto; consistente com padrão `MINIO_REGION ?? "us-east-1"` do projeto.

---

### Pergunta 4 — EMPRESA_COR_PRIMARIA na lista de obrigatórias

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Manter obrigatória | Força o operador a declarar explicitamente | |
| Tornar opcional | Fallback #0d6efd cobre a omissão | |
| Claude decide | | ✓ |

**Escolha do usuário:** Claude decide
**Claude decidiu:** Opcional — cor é estética; diferente de `EMPRESA_NOME`/`EMPRESA_CNPJ` que são dados fiscais que não têm fallback seguro para outra empresa.

---

## Claude's Discretion

- Path do template padrão no Dockerfile
- Erro explícito vs. fallback silencioso para template customizado ausente
- Onde registrar validação de vars obrigatórias
- Mensagem de erro de startup (hint vs. sem hint)
- Onde aplicar cor primária no template (`:root` vs. parcial)
- Fallback de cor (TypeScript vs. template)
- `EMPRESA_COR_PRIMARIA` obrigatória vs. opcional
- Getter vs. property para `CODIGO_MUNICIPIO` no `NfseService` (Claude recomenda getter para manter consistência com `WSDL_URL`, `ENDPOINT`, `AUX_URL`)
- `DEFAULT_ENDPOINT`/`DEFAULT_AUX_URL` com "3520400" hardcoded: pesquisador avalia se é necessário limpar

## Deferred Ideas

- Painel admin para editar configurações sem acessar o servidor (WL-01)
- Upload de logo pelo sistema sem editar `.env` (WL-02)
- Templates PDF gerenciados pelo painel admin (WL-03)
- Frontend dinâmico (title, logo, nome) → Phase 36
