# Phase 36: Frontend White-Label - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 36-frontend-white-label
**Areas discussed:** Estratégia de vars no frontend, CSS theming, Email hardcoded, Logo fallback

---

## Estratégia de Vars no Frontend

| Option | Description | Selected |
|--------|-------------|----------|
| `NEXT_PUBLIC_EMPRESA_*` | Baked at build; segue padrão existente `NEXT_PUBLIC_API_URL`; funciona em Client Components | ✓ |
| Context Provider server-side | layout.tsx lê process.env e passa por contexto React; mais código | |
| API route `/api/empresa-config` | Client Components fazem fetch; loading state + round-trip de rede | |

**User's choice:** `NEXT_PUBLIC_EMPRESA_*`
**Notes:** Todas as 7 páginas são Client Components — `NEXT_PUBLIC_*` é a única opção sem rewiring adicional.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Vars com prefixo separadas | `NEXT_PUBLIC_EMPRESA_*` em `apps/frontend/.env.local`, separadas do backend | ✓ |
| Compartilhar via Docker Compose | Vars `EMPRESA_*` passadas como `NEXT_PUBLIC_EMPRESA_*=${EMPRESA_*}` no stack.env | |

**User's choice:** Vars separadas com prefixo `NEXT_PUBLIC_`
**Notes:** Modelo é deploy separado por empresa; cada deploy configura dois `.env` independentes.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Criar `apps/frontend/.env.example` | Documenta vars com valores BomCusto como defaults | ✓ (Claude recomendou) |
| Só `.env.local` | Sem `.env.example`; vars implícitas pelo backend | |

**User's choice:** Delegado ao Claude → criar `apps/frontend/.env.example`

---

| Option | Description | Selected |
|--------|-------------|----------|
| Módulo central `empresa.ts` | `apps/frontend/src/lib/empresa.ts` exporta constantes; páginas importam | ✓ (Claude recomendou) |
| Sem módulo central | Cada página lê `process.env.NEXT_PUBLIC_*` diretamente | |

**User's choice:** Delegado ao Claude → módulo central `empresa.ts`

---

## CSS Theming — Profundidade

| Option | Description | Selected |
|--------|-------------|----------|
| Injetar `--cor-primaria` + substituir `#0d6efd` no globals.css | Theming real; atende success criteria 3 | ✓ (Claude recomendou) |
| Só injetar `--cor-primaria`; globals.css inalterado | Theming parcial; não atende SC-3 | |

**User's choice:** Delegado ao Claude → substituição completa

---

| Option | Description | Selected |
|--------|-------------|----------|
| `--cor-primaria` | Explícito, consistente com nome da env var; não colide com Bootstrap | ✓ (Claude recomendou) |
| `--primary` | Curto; risco de colisão com `--bs-primary` | |

**User's choice:** Delegado ao Claude → `--cor-primaria`

---

| Option | Description | Selected |
|--------|-------------|----------|
| `<style>` inline no `<head>` do layout.tsx | Server Component lê process.env; CSS var disponível para todo o DOM | ✓ (Claude recomendou) |
| Arquivo CSS separado | Não suporta valor dinâmico de env var | |

**User's choice:** Delegado ao Claude → `<style>` inline em layout.tsx

---

| Option | Description | Selected |
|--------|-------------|----------|
| `generateMetadata()` dinâmico | Lê `NEXT_PUBLIC_EMPRESA_NOME`; padrão Next.js para title dinâmico | ✓ (Claude recomendou) |
| `export const metadata` estático | Não permite valor de env var dinâmico no title | |

**User's choice:** Delegado ao Claude → `generateMetadata()`

---

## Email Hardcoded

| Option | Description | Selected |
|--------|-------------|----------|
| Parameterizar `NEXT_PUBLIC_EMPRESA_EMAIL` | Elimina referência "bomcusto" no email; consistente com ROADMAP goal | ✓ (Claude recomendou) |
| Deixar hardcoded | Strict scope = FRONT-01..04; email fora dos requisitos formais | |

**User's choice:** Delegado ao Claude → parameterizar email
**Notes:** Email `orcamento@bomcustoilhabela.com.br` contém "bomcusto" diretamente; ROADMAP goal é eliminar todas as referências.

---

## Logo Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback para `/media/logo-primary.png` | Zero regressão BomCusto; novo deploy sem logo configurado vê logo padrão | ✓ (Claude recomendou) |
| Sem fallback (omite logo) | Consistente com comportamento do PDF (fase 35 D-08) | |

**User's choice:** Delegado ao Claude → fallback para logo estático
**Notes:** Comportamento intencionalmente diferente do PDF — no header web um logo ausente é pior UX que logo padrão.

---

## Claude's Discretion

- Todas as perguntas Q2-Q4 das áreas 2, 3 e 4 foram delegadas ao Claude pelo usuário ("pode escolher o que você recomendar")
- Ordem das exports no módulo `empresa.ts`
- `alt` text do `<img>` logo (sugestão: usar `EMPRESA_NOME`)
- Quais seletores exatos no `globals.css` contêm `#0d6efd` (pesquisador verifica via grep)

## Deferred Ideas

- Painel admin para editar configurações sem acessar o servidor → WL-01 (backlog)
- Upload de logo pelo sistema (MinIO) → WL-02 (backlog)
- Templates PDF gerenciados por painel admin → WL-03 (backlog)
- Single source of truth via Docker Compose vars `${EMPRESA_*}` → melhoria DevOps futura
