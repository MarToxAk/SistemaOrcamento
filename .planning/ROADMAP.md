# Roadmap — Sistema de Orçamento BomCusto

## Milestones

- ✅ **v1.0 MVP** — Segurança, Confiabilidade e UX — Fases 1-5 (shipped 2026-05-02)
- ✅ **v1.1 Aprovação Athos** — Fase 6 (shipped 2026-05-02)
- ✅ **v1.2 Chatwoot + UX Público** — Fases 7-8 (shipped)
- ✅ **v1.3 Migration/Update** — Fases 9-10 (shipped)
- ✅ **v1.4 Conciliação Athos + NFS-e** — Fases 11-14 (shipped)
- ✅ **v1.5 Encoding NFS-e + UI desconto** — Fases 15-16 (shipped)
- ✅ **v1.6 Cálculo de desconto** — Fase 17 (shipped)
- ✅ **v1.7 RPS e Tomador** — Fase 18 (shipped 2026-05-04)
- ✅ **v1.8 Busca de Cliente Athos** — Fases 19-21 (shipped 2026-05-05)
- ✅ **v2.0 Gestão Financeira, Caixa e Dashboards** — Fases 23-27 (shipped 2026-05-22)
- ✅ **v2.1 Cobrança e Fiscal do Cliente** — Fases 28-31 (shipped 2026-06-08)
- ✅ **v2.2 Gestão de Produtos do Athos (API)** — Fases 32-33 (shipped 2026-06-17) — Phase 34 descartada (decisão: API-only)

---

## v2.2 — Gestão de Produtos do Athos (CRUD)

### Phases

- [x] **Phase 32: API de Busca de Produto** - Endpoint read com filtros, paginação e autenticação (completed 2026-06-15)
- [x] **Phase 33: API de Escrita de Produto** - Create, edit e soft-delete na tabela produto com trigger/constraint/log (completed 2026-06-15)
- ~~[ ] **Phase 34: Frontend de Gestao de Produtos**~~ — **DESCARTADA** (2026-06-17): API-only foi suficiente; nenhum frontend planejado para esta entrega

### Phase Details

#### Phase 32: API de Busca de Produto

**Goal**: Operador pode buscar e consultar produtos do Athos via API REST autenticada
**Depends on**: Phase 31 (Athos read-path estabelecido)
**Requirements**: BPROD-01, BPROD-02, BPROD-03, BPROD-04, BPROD-05, SPROD-02
**Success Criteria** (what must be TRUE):

  1. Operador pode buscar produtos por descrição parcial (case-insensitive) e obter resultados paginados com a linha completa
  2. Operador pode buscar produtos por código de barras (codigobarra1/codigobarra2) e obter resultados paginados
  3. Operador pode filtrar produtos combinando departamento, grupo e/ou marca
  4. Operador pode consultar um produto específico por idproduto e receber todos os campos
  5. Qualquer requisição sem x-internal-api-key válida retorna 401 — o mesmo guard do restante da API

**Plans**: 1 plano

- [x] 32-01-PLAN.md — ProdutoController (busca/id/lookups) + métodos de leitura no AthosService + tipos verificados + testes BPROD-01..05

#### Phase 33: API de Escrita de Produto

**Goal**: Operador pode criar, editar e desativar produtos no Athos de forma segura, com escrita restrita à tabela produto, trigger respeitado e todas as operações registradas em log
**Depends on**: Phase 32
**Requirements**: CPROD-01, CPROD-02, CPROD-03, CPROD-04, EPROD-01, EPROD-02, EPROD-03, EPROD-04, DPROD-01, DPROD-02, DPROD-03, SPROD-01, SPROD-03, SPROD-04
**Success Criteria** (what must be TRUE):

  1. Operador cria um produto: idproduto gerado pelo serial do Athos, datacadastro e idusuariocadastro preenchidos automaticamente, trigger tg_alterarproduto e rules atualizardatahora* disparados sem desabilitá-los
  2. Ao informar campo inválido (descontomaximo fora de 0–100, FK de departamento/grupo/marca inexistente), a API retorna erro 422 com mensagem clara — nenhum dado é gravado
  3. Operador edita preços (valorvenda1..6, promoção, atacado) e informações de cadastro; dataultimaalteracao e idusuarioalteracao são atualizados automaticamente pela trigger/rule
  4. Operador desativa um produto (statusproduto/vendeproduto = false) e pode reativá-lo; nenhum endpoint executa DELETE físico na tabela produto
  5. Toda operação de escrita (create/edit/deactivate/reactivate) gera entrada de log estruturado com quem, quando e o quê foi alterado
  6. Nenhuma outra tabela do Athos além de produto recebe INSERT ou UPDATE em qualquer fluxo do sistema
  7. Todos os endpoints de produto estão documentados no Swagger com payloads de request e response

**Plans**: TBD

#### Phase 34: Frontend de Gestão de Produtos

**Goal**: Operador pode buscar, criar, editar e desativar/reativar produtos diretamente pela interface do Sistema de Orçamento, sem abrir o Athos
**Depends on**: Phase 33
**Requirements**: UPROD-01, UPROD-02, UPROD-03, UPROD-04
**Success Criteria** (what must be TRUE):

  1. Operador acessa a tela de produtos, digita uma descrição (ou código de barras, ou seleciona departamento/grupo/marca) e vê a lista paginada com os campos do produto
  2. Operador clica em "Novo produto", preenche o formulário e salva — o produto aparece na busca com os dados informados
  3. Operador seleciona um produto, edita preço ou informações de cadastro e confirma — as alterações são refletidas imediatamente na tela de detalhe
  4. Operador desativa um produto ativo e pode reativá-lo pela mesma interface; produto desativado fica visualmente diferenciado na listagem

**Plans**: TBD
**UI hint**: yes

### Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. API de Busca de Produto | 1/1 | Complete    | 2026-06-15 |
| 33. API de Escrita de Produto | 4/4 | Complete    | 2026-06-16 |
| 34. Frontend de Gestão de Produtos | — | **Descartada** (API-only) | 2026-06-17 |

---

## v2.3 — White-Label Multi-Empresa

### Phases

- [x] **Phase 35: Backend White-Label** - Env vars documentadas, NFS-e dehardcoded, template PDF extraído para .hbs e variáveis de empresa passadas ao renderer (completed 2026-06-19)
- [x] **Phase 36: Frontend White-Label** - 8 arquivos frontend dehardcoded; nome, logo, CNPJ, endereço e cor lidos de env vars; CSS theming via custom property (completed 2026-06-22)

### Phase Details

#### Phase 35: Backend White-Label

**Goal**: Sistema backend completamente configurável por empresa via env vars — dados fiscais e PDF apontam para a empresa do deploy, não para BomCusto hardcoded
**Depends on**: Phase 34 (fundação v2.2 completa)
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04, CFG-05, PDF-01, PDF-02, PDF-03, PDF-04, PDF-05, NFSE-01
**Success Criteria** (what must be TRUE):

  1. Ao copiar `.env.example` e preencher as variáveis `EMPRESA_*`, um novo deploy do backend exibe nos PDFs gerados o nome, CNPJ, endereço e logo da nova empresa — sem editar nenhum arquivo TypeScript
  2. PDF gerado usa o template `.hbs` externo em `apps/backend/templates/quote-default.hbs`; ao definir `EMPRESA_PDF_TEMPLATE_PATH` apontando para um `.hbs` customizado montado via volume Docker, o PDF usa esse template alternativo
  3. NFS-e emitida usa o código IBGE do município lido de `EMPRESA_MUNICIPIO_IBGE` — a string `"3520400"` não existe mais no código-fonte
  4. `.env.example` lista todas as variáveis `EMPRESA_*` com os valores atuais da BomCusto como defaults e comentários explicativos para cada uma

**Plans**: 3/3 plans complete

- [x] 35-01-PLAN.md — NfseService: CODIGO_MUNICIPIO vira getter computado lendo EMPRESA_MUNICIPIO_IBGE (NFSE-01, CFG-04)
- [x] 35-02-PLAN.md — Template PDF extraído para quote-default.hbs com variáveis de empresa + COPY no Dockerfile (PDF-02/03/05, CFG-02/03/05)
- [x] 35-03-PLAN.md — renderHtml cadeia de fallback + dados de empresa, REQUIRED_ENV_VARS e .env.example (PDF-01/04, CFG-01..05)

#### Phase 36: Frontend White-Label

**Goal**: Todas as páginas do sistema exibem nome, logo, CNPJ, endereço e cor da empresa a partir de env vars — nenhuma referência a "BomCusto" permanece hardcoded no frontend
**Depends on**: Phase 35
**Requirements**: FRONT-01, FRONT-02, FRONT-03, FRONT-04
**Success Criteria** (what must be TRUE):

  1. Ao definir `EMPRESA_NOME=Outra Empresa` e restartar o servidor Next.js, a aba do navegador, o cabeçalho das 5 páginas internas e as 2 páginas públicas exibem "Outra Empresa" — sem nenhum "BomCusto" visível
  2. Logo exibida em todas as páginas internas e públicas vem de `EMPRESA_LOGO_URL`, não do arquivo estático `/media/logo-primary.png`
  3. Ao definir `EMPRESA_COR_PRIMARIA=#e63946`, todos os elementos de branding (botões primários, bordas de destaque, links de ação) assumem a nova cor — a troca afeta o sistema inteiro via CSS custom property sem editar CSS
  4. Páginas públicas de aprovação e status (`/orcamento/[id]/approve` e `/orcamento/[id]/status`) exibem o logo e o nome corretos da empresa mesmo sem autenticação

**Plans**: 3/3 plans complete

Plans:

- [x] 36-01-PLAN.md — empresa.ts + layout.tsx (generateMetadata + CSS var) + globals.css + .env.example
- [x] 36-02-PLAN.md — 5 páginas internas dehardcoded (logo/nome/CNPJ/endereço/email de empresa.ts)
- [x] 36-03-PLAN.md — 2 páginas públicas dehardcoded (logo + nome de empresa.ts)

**UI hint**: yes

### Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 35. Backend White-Label | 3/3 | Complete    | 2026-06-19 |
| 36. Frontend White-Label | 3/3 | Complete   | 2026-06-22 |

---

## Backlog

### Phase 999.1: Gerenciamento de layout do PDF de orçamento pela interface (BACKLOG)

**Goal:** Permitir trocar o layout/template do PDF de orçamento a qualquer momento pelo próprio sistema (usuário final), sem alterar código/git nem reiniciar o servidor.
**Requirements:** TBD (relacionados às ideias deferidas WL-01 painel admin e WL-03 templates PDF gerenciados, ver 36-CONTEXT.md)
**Plans:** 0 plans

**Contexto / escopo capturado:**
- **Backend:** armazenar templates Handlebars fora do código (MinIO ou tabela no banco) como single source of truth editável em runtime; endpoints para listar modelos, selecionar o template ativo, subir um novo e marcar qual está em uso; refatorar `renderHtml()` em `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` (hoje lê `quote-default.hbs`/`EMPRESA_PDF_TEMPLATE_PATH` via `readFileSync` por requisição) para buscar o template ativo do storage.
- **Frontend:** tela de configuração com galeria de modelos prontos, botão "usar este", upload de `.hbs` e idealmente preview do PDF antes de salvar.
- **Modelos prontos:** desenhar 2-3 layouts iniciais (colorido atual + minimalista + clássico) corrigindo o contato hardcoded da BomCusto que ainda existe em `quote-default.hbs` (telefones, email `orcamento@bomcustoilhabela.com.br`, `@bomcustopapelaria`).
- **⚠ Segurança (requer /gsd-secure-phase):** upload de template arbitrário renderizado por Handlebars + Puppeteer abre risco de injeção de template, SSRF (PDF buscando URLs externas) e execução de conteúdo arbitrário no Chrome headless. Mitigações: sanitização, allowlist de helpers Handlebars, sandbox/flags do Puppeteer, restrição de fontes de rede.
- **Relação:** extensão das fases 35 (backend white-label) e 36 (frontend white-label).

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

---

## Estado atual

**Milestone v2.3 em andamento.** Roadmap definido em 2026-06-17. Fases 35-36 pendentes de planejamento e execução.

Próximo passo: `/gsd-plan-phase 35`

## Histórico arquivado

Cada milestone tem roadmap e requisitos completos em `.planning/milestones/`:

- `v{X.Y}-ROADMAP.md` — fases, planos e critérios de sucesso
- `v{X.Y}-REQUIREMENTS.md` — requisitos com rastreabilidade
- `v2.1-MILESTONE-AUDIT.md` — auditoria de fechamento (status: passed)
