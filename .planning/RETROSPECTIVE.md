# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.4 — Defaults Inteligentes no Cadastro de Produto

**Shipped:** 2026-06-28
**Phases:** 2 (37-38) | **Plans:** 2 | **Sessions:** ~1 (planejamento→execução→verificação contínuos)

### What Was Built
- **Motor de defaults por moda** (`AthosDefaultsService`, Fase 37): função pura `computeModeFromRows`, cache em memória TTL 24h com promise-lock anti-stampede, fallback seguro (estoque `false`, fiscal omitido), leitura read-only do catálogo Athos via `pg` Pool.
- **Aplicação dos defaults na criação** (Fase 38): `criarProduto` injeta o motor e preenche campos omitidos — operacionais fixos (status/vende/controlaestoque/baixarestoque=true, estoqueloja="10") + fiscais por moda — com override total do operador e log campo→valor por cadastro; edição intocada.
- DTO de criação estendido com 16 campos opcionais; `ALLOWED_UPDATE_FIELDS` ampliado (fix de review) para a edição gravar esses campos sem aplicar defaults.

### What Worked
- **Separação de fases limpa:** Fase 37 (motor, read-only) e Fase 38 (aplicação) com fronteira nítida — a Fase 38 só consumiu o serviço já entregue, sem reabrir a 37.
- **CONTEXT detalhado antecipou decisões:** as 11 (F37) e 13 (F38) decisões travadas no discuss reduziram ambiguidade; o planner/executor pouco precisaram inferir.
- **Pattern-mapper apontou o `== null`** como detecção correta de omissão (preserva `false`/`0`/`""`), evitando um bug clássico de override.
- **Gates pegaram problemas reais:** code-review da F38 achou o silent-drop do `editarProduto` (WR-02) e o guard de env (WR-01); o decision-coverage gate da F37 forçou citar as prohibitions D-02/D-04/D-10.

### What Was Inefficient
- **Conflito de decisão tardio na F38:** o pedido inicial de `statusproduto/vendeproduto` default `false` contradizia a Fase 37 + roadmap + PROJECT.md, exigindo uma rodada extra de esclarecimento. Surfacing antecipado de "decisões já travadas" no discuss teria evitado.
- **`optionalFields` como lista paralela:** risco de drift com `FISCAL_FIELDS` (registrado como dívida) — derivação automática teria sido mais robusta desde o início.
- **Flags Nyquist não viradas:** VALIDATION.md criados com testes verdes, mas `nyquist_compliant` ficou `false` (bookkeeping) — gap de marcação detectado só na auditoria.

### Patterns Established
- **Defaults = moda (fiscais) + valores fixos operacionais:** separação que mapeia DFIS→motor e DOPR→constante nomeada local.
- **Detecção de omissão por `== null`** (undefined OU null) como padrão para merge de defaults preservando valores falsy do operador.
- **Reúso de allowlist como fonte única** (`FISCAL_FIELDS`) dirigindo DTO + aplicação, evitando listas divergentes.

### Key Lessons
1. Surfacing de "decisões já travadas em fases anteriores" no início do discuss evita conflitos tardios (caso status/vende=false da F38).
2. Listas paralelas de campos (allowlist do INSERT vs. allowlist de defaults) devem ser derivadas ou cobertas por teste de igualdade — drift silencioso é caro.
3. Virar o flag `nyquist_compliant` ao fim da execução (quando os testes passam) fecha o gap de marcação antes da auditoria.

### Cost Observations
- Model mix: planner em opus; researcher/checker/executor/verifier/reviewer/fixer em sonnet.
- Sessions: ~1 contínua (plan→execute→verify→secure→audit→complete).
- Notable: execução sequencial (sem worktree) por divergência de base de branch — adequada a planos únicos.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v2.4 | ~1 | 2 | Fluxo GSD completo com gates de code-review + segurança + auditoria de milestone |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v2.4 | 324 (backend) — +79 novos (33 F37 + 46 F38) | suíte verde | 0 pacotes novos (só módulos internos) |

### Top Lessons (Verified Across Milestones)

1. CONTEXT.md detalhado (decisões travadas) reduz drasticamente ambiguidade downstream.
2. Os gates do GSD (decision-coverage, code-review, integration-check) capturam problemas reais que os testes verdes não pegam.
