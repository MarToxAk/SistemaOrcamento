---
phase: 260722-mqp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/frontend/src/components/password-gate.tsx
  - apps/frontend/src/app/contas-receber/page.tsx
  - apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts
autonomous: true
requirements: [GATE-CR-01]
must_haves:
  truths:
    - "Com CONFIG_PANEL_PASSWORD definida e sem sessao, /contas-receber exibe o prompt de senha em vez do dashboard"
    - "Digitar a senha correta desbloqueia o dashboard e persiste apos reload/nova aba (mesmo cookie orcamento_admin_session de /configuracoes/templates)"
    - "Quem ja desbloqueou /configuracoes/templates entra em /contas-receber sem redigitar (sessao compartilhada)"
    - "Sem CONFIG_PANEL_PASSWORD definida, /contas-receber abre direto (modo interno preservado — falha fechada apenas quando ha senha)"
    - "GET /api/athos/contas-receber/dashboard responde 401 quando ha senha configurada e nao ha sessao valida"
  artifacts:
    - apps/frontend/src/components/password-gate.tsx
    - apps/frontend/src/app/contas-receber/page.tsx
    - apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts
  key_links:
    - "PasswordGate -> GET/POST/DELETE /api/admin/login (reusa cookie orcamento_admin_session, sem nova rota/env)"
    - "dashboard/route.ts -> requireAdminSession de @/lib/admin-session"
---

<objective>
Proteger a pagina /contas-receber com senha, reutilizando exatamente o mecanismo ja usado em /configuracoes/templates: a rota `/api/admin/login`, `admin-session.ts` e a env var `CONFIG_PANEL_PASSWORD` (mesmo cookie de sessao `orcamento_admin_session`). Desbloquear qualquer uma das paginas vale para a outra.

O padrao de gate hoje esta hand-rolled inline dentro de `templates-manager.tsx`. Extraimos esse fluxo para um componente cliente reutilizavel `<PasswordGate>` e o aplicamos em `/contas-receber`, sem tocar na pagina de templates (que ja funciona) e sem alterar a rota `/api/admin/login`.

Purpose: impedir que qualquer pessoa com a URL veja inadimplencia/dados financeiros de clientes, com a mesma protecao leve (cookie httpOnly assinado por HMAC, senha comparada server-side) ja adotada nas configuracoes.
Output: componente `password-gate.tsx` reutilizavel; `/contas-receber` envolta no gate; guarda server-side no proxy do dashboard para o gate ter dentes reais (nao so cosmetico).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Padrao inline a extrair (fonte da verdade do fluxo de gate)
@apps/frontend/src/app/configuracoes/templates/templates-manager.tsx

# Rota e sessao reutilizadas AS-IS (nao alterar login/route.ts nem admin-session.ts alem da guarda)
@apps/frontend/src/app/api/admin/login/route.ts
@apps/frontend/src/lib/admin-session.ts

# Alvos a modificar
@apps/frontend/src/app/contas-receber/page.tsx
@apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts
</context>

<tasks>

<task type="tracer" tdd="false">
  <name>Task 1: Extrair componente cliente reutilizavel PasswordGate</name>
  <files>apps/frontend/src/components/password-gate.tsx</files>
  <behavior>
    - Sem CONFIG_PANEL_PASSWORD no servidor (`configured=false` no GET /api/admin/login): renderiza `children` direto (modo interno).
    - Com senha configurada e sessao invalida (`configured=true, authenticated=false`): renderiza o card de prompt de senha; NAO renderiza `children` (garante que a UI/effects protegidos so montam apos autenticar).
    - Com senha configurada e sessao valida (`authenticated=true`): renderiza `children`.
    - Durante a checagem inicial (estado `authed === null`): renderiza um spinner "Verificando acesso...".
    - Submeter senha correta via POST /api/admin/login seta `authed=true` e passa a renderizar `children` sem reload.
    - Submeter senha incorreta exibe a mensagem de erro retornada pela rota (ex: "Senha incorreta.").
  </behavior>
  <action>Criar novo arquivo `apps/frontend/src/components/password-gate.tsx` como componente `"use client"` chamado `PasswordGate`. Portar 1:1 o fluxo de autenticacao hoje inline em `templates-manager.tsx` (estados `authed: boolean | null`, `passwordRequired`, `passwordInput`, `passwordErro`, `loginLoading`; o `useEffect` de mount que faz `GET /api/admin/login` com `cache: "no-store"` e deriva `passwordRequired = Boolean(data.configured)` e `authed = required ? Boolean(data.authenticated) : true`; o `handleLogin` que faz `POST /api/admin/login` com `{ password }` e trata `!res.ok` lendo `data.error`). Props do componente: `children: React.ReactNode`, `title?: string` (default "Acesso restrito"), `description?: string` (texto default explicando que a area exige a senha de configuracoes). Estrutura de render identica aos tres branches de `templates-manager.tsx`: (1) `authed === null` -> bloco de spinner; (2) `passwordRequired && !authed` -> o mesmo card de senha (mesmas classes Bootstrap, `id="config-password"`, `autoComplete="current-password"`, botao Entrar com spinner), usando `title`/`description` das props; (3) caso contrario -> `return <>{children}</>`. Incluir os mesmos assets Bootstrap (o bloco `bootstrapAssets` com `<Script>`/`<link>` de bootstrap 5.3.2 + bootstrap-icons) APENAS nos branches de spinner e de prompt, para o card renderizar estilizado; no branch autenticado renderizar somente `children` (os assets vem da propria pagina filha, evitando duplicar). NAO incluir botao de logout (fora de escopo; a sessao expira em 8h e o logout ja existe em /configuracoes/templates). NAO criar nova env var, rota ou cookie — o componente so consome `/api/admin/login`. NAO modificar `templates-manager.tsx` nesta tarefa (a pagina de templates continua com seu gate inline funcionando).</action>
  <verify>
    <automated>npx tsc --noEmit --project apps/frontend/tsconfig.json</automated>
  </verify>
  <done>Arquivo `password-gate.tsx` existe, exporta `PasswordGate` como default, compila sem erros de tipo, e implementa os tres branches (spinner / prompt de senha / children) consumindo `/api/admin/login`.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Envolver /contas-receber com PasswordGate</name>
  <files>apps/frontend/src/app/contas-receber/page.tsx</files>
  <action>Refatorar `apps/frontend/src/app/contas-receber/page.tsx` para que o dashboard so monte (e so dispare o `fetchDashboard` do `useEffect`) apos autenticacao. Renomear o componente atual `ContasReceberPage` para um componente interno `ContasReceberDashboard` (mesmo corpo, mesmos estados, mesmo JSX, mesmo fetch de `/api/athos/contas-receber/dashboard` — sem alterar nada da UI ou da logica existente). Criar um novo default export `ContasReceberPage` que apenas retorna `<PasswordGate>{"<ContasReceberDashboard />"}</PasswordGate>`, importando `PasswordGate` de `@/components/password-gate`. Manter `"use client"` no topo do arquivo. Como o gate so renderiza `children` quando autenticado (ou quando nao ha senha configurada), o `useEffect` que chama `fetchDashboard` dentro de `ContasReceberDashboard` nao roda enquanto o prompt de senha estiver visivel — preservando o comportamento e evitando fetch antes do desbloqueio. Opcional: passar `title="Contas a Receber"` e uma `description` curta ao `PasswordGate`. NAO alterar as funcoes `formatBRL`, `getBadgeClass`, `getBadgeLabel`, `STATUS_OPTIONS`, os `<Script>`/`<link>` Bootstrap nem o bloco `<style>` — tudo permanece dentro de `ContasReceberDashboard`.</action>
  <verify>
    <automated>npx tsc --noEmit --project apps/frontend/tsconfig.json</automated>
  </verify>
  <done>`page.tsx` exporta um default que envolve o dashboard em `<PasswordGate>`; o componente interno `ContasReceberDashboard` conserva toda a UI/logica original; compila sem erros de tipo.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Guarda server-side no proxy do dashboard</name>
  <files>apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts</files>
  <action>Adicionar `requireAdminSession` (de `@/lib/admin-session`) no inicio do handler `GET` de `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts`, para que o gate tenha efeito real e nao apenas cosmetico no cliente. No topo do `GET(req)`, antes de montar os headers/token, se `requireAdminSession(req)` for `false`, retornar `NextResponse.json({ error: "Nao autorizado." }, { status: 401 })`. Manter todo o resto do handler intacto (token `INTERNAL_API_KEY`, `backendFetch`, tratamento de status/erros). `requireAdminSession` ja falha ABERTO quando `CONFIG_PANEL_PASSWORD` nao esta definida (retorna `true`), preservando o modo interno; quando ha senha, exige o cookie `orcamento_admin_session` valido — que o `PasswordGate` garante estar setado antes do dashboard filho montar e fazer o fetch. NAO adicionar a guarda em nenhuma outra rota (as rotas `/api/athos/contas-receber/cliente/*` alimentam a pagina de detalhe `/contas-receber/[idcliente]`, que esta fora do escopo desta tarefa e nao deve ser afetada).</action>
  <verify>
    <automated>npx tsc --noEmit --project apps/frontend/tsconfig.json</automated>
  </verify>
  <done>O `GET` do dashboard importa e chama `requireAdminSession(req)` e retorna 401 quando a sessao e exigida e invalida; com senha ausente o comportamento anterior (200) e preservado; compila sem erros.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador -> Next.js API (`/api/admin/login`) | senha em texto cruza aqui uma unica vez; validada server-side com timingSafeEqual, nunca devolvida |
| navegador -> proxy dashboard (`/api/athos/contas-receber/dashboard`) | dados financeiros de clientes; agora exige sessao quando ha senha configurada |
| cookie `orcamento_admin_session` | httpOnly, sameSite=strict, secure em producao; assinado por HMAC (admin-session.ts) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-mqp-01 | Information Disclosure | /contas-receber (dados de inadimplencia) | high | mitigate | Gate de senha no cliente (Task 1+2) + guarda `requireAdminSession` no proxy do dashboard (Task 3) — endpoint deixa de ser acessivel sem sessao quando ha senha |
| T-mqp-02 | Spoofing | POST /api/admin/login | medium | transfer | Reusa rota existente: comparacao timing-safe + rate-limit por IP (`login-rate-limit`) ja implementados; nenhuma mudanca na rota |
| T-mqp-03 | Elevation of Privilege | requireAdminSession fail-open | low | accept | Sem `CONFIG_PANEL_PASSWORD` a guarda abre (modo deploy interno, decisao D-03 pre-existente); risco aceito e identico ao gate de /configuracoes/* ja em uso |
| T-mqp-04 | Information Disclosure | rotas /api/athos/contas-receber/cliente/* (pagina de detalhe) | medium | accept | Fora do escopo deste quick task; a pagina de detalhe [idcliente] nao e protegida aqui — registrar como follow-up se protecao ampla for desejada |
</threat_model>

<verification>
Apos as tres tarefas:

1. Typecheck: `npx tsc --noEmit --project apps/frontend/tsconfig.json` passa sem erros.
2. Com `CONFIG_PANEL_PASSWORD` definida e sem sessao: abrir `/contas-receber` mostra o card de senha; `curl` sem cookie em `/api/athos/contas-receber/dashboard` retorna 401.
3. Digitar a senha correta desbloqueia o dashboard; recarregar a pagina mantem desbloqueado (cookie de 8h).
4. Ter desbloqueado antes `/configuracoes/templates` (mesma senha) entra direto em `/contas-receber` sem novo prompt (sessao compartilhada).
5. Sem `CONFIG_PANEL_PASSWORD`: `/contas-receber` abre direto e o dashboard carrega normalmente (fail-open preservado).
</verification>

<success_criteria>
- `/contas-receber` fica atras de senha quando `CONFIG_PANEL_PASSWORD` esta definida, reutilizando a MESMA sessao/cookie/rota de `/configuracoes/templates` (sem nova env var, rota ou senha).
- Desbloqueio compartilhado entre as duas paginas em ambos os sentidos.
- Toda a UI e o fetch do dashboard originais preservados, apenas envoltos no gate.
- Proxy do dashboard exige sessao valida (401 sem sessao quando ha senha), sem afetar a pagina de detalhe [idcliente].
- `templates-manager.tsx` e `/api/admin/login/route.ts` permanecem inalterados.
</success_criteria>

<output>
Create `.planning/quick/260722-mqp-adicionar-protecao-por-senha-na-pagina-c/260722-mqp-SUMMARY.md` when done
</output>
