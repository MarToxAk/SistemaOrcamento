---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 02
subsystem: pesquisa-satisfacao
tags: [chatwoot, csat, frontend, nextjs, rota-publica, pagina-publica, ip-real]
status: complete
requires:
  - plano 52-01 (contrato publico do backend /pesquisa/publica/:token)
provides:
  - pagina publica /pesquisa/[token] renderizada no servidor (backendFetch + x-client-ip)
  - formulario de nota 1-5 (estrelas/carinhas) com comentario ate 500 e estados de envio
  - agradecimento com cartao do cupom, bloco Google e estados genericos (ja respondida/indisponivel/erro)
  - proxy POST /pesquisa/[token]/responder fora do prefixo de API
  - ipDoCliente (lib/ip-cliente.ts, so servidor)
affects:
  - planos 52-03 (cupom no agradecimento), 52-11 (roteiro de homologacao por curl)
tech-stack:
  added: []
  patterns:
    - pagina publica com estado resolvido no servidor (padrao de /cobranca/confirmar/[token])
    - proxy de envio fora do prefixo de API (nginx roteia /api/ ao backend)
    - CSS local com prefixo pesquisa-, sem Bootstrap e sem tema fixo (UI-D02)
    - folha de icones com SRI sha384 e crossOrigin anonymous
key-files:
  created:
    - apps/frontend/src/lib/pesquisa-publica.ts
    - apps/frontend/src/app/pesquisa/[token]/pesquisa-cliente.tsx
    - apps/frontend/src/app/pesquisa/[token]/page.tsx
    - apps/frontend/src/app/pesquisa/[token]/responder/route.ts
    - apps/frontend/src/lib/ip-cliente.ts
decisions:
  - "Estados da pagina publica (ABERTA/RESPONDIDA/INDISPONIVEL/ERRO) em EstadoPagina, com OBRIGADO como fase interna do Client Component."
  - "Formatadores de cupom (percentual, reais, data) ficam como funcoes locais do Client Component; o lib expoe so os dois helpers puros do contrato."
metrics:
  duration: "~8min"
  completed: 2026-11-22
commits: 2
plan_head_before: 37bdc65e6e00120e5d8c51f8542270f353ce34ba
plan_head_after: 61f25e677364ce66da39b067e3779279e03c60bd
actuals:
  tokens: 8369
  tasks: 2
  commits: 2
---

# Phase 52 Plan 02: Página pública da pesquisa de satisfação Summary

Página pública `/pesquisa/[token]` renderizada no servidor com formulário de nota 1-5 (estrelas ou carinhas conforme a variante gravada), comentário opcional até 500, agradecimento com cartão do cupom e bloco do Google, estados genéricos (já respondida, indisponível, erro), proxy POST fora do prefixo de API e IP real do cliente — tudo sem Bootstrap CSS e sem código de servidor no bundle do navegador.

## O que foi entregue

- **`lib/pesquisa-publica.ts`** (sem nenhum import de servidor): tipos espelhados do contrato público (`TextosPagina`, `CupomPublico`, `PesquisaPublicaView`, `RespostaPublica`, `EstadoPagina`), constantes `ROTULOS_NOTA`, `TEXTO_LGPD` (isolado para revisão jurídica), `TEXTO_OPT_OUT`, `TEXTO_NOTA_LEGAL_GOOGLE` e os dois helpers puros `linkGoogleSeguro` (só `https://`) e `mensagemErroEnvio` (rede vs 5xx).
- **`pesquisa-cliente.tsx`** (`"use client"`): formulário com `<fieldset>`/`<legend>`, cinco `<input type="radio">` nativos (teclado e leitor de tela sem código extra, visualmente ocultos sem `display:none`), variantes ESTRELAS (`bi-star`/`bi-star-fill` até a nota) e CARINHAS (`bi-emoji-*`), rótulo visível "{n} {rótulo}", comentário opcional com contador `{n}/500` e `maxLength` 500. Envio com ref `emEnvio` contra duplo envio, `aria-busy`, "Enviando..." com indicador, erro sem nota (`role="alert"` + foco no grupo) e erros de rede/5xx com nota e comentário preservados. Agradecimento com cartão do cupom (código monoespaçado 2rem 600 com `overflow-wrap:anywhere`, botão "Copiar código" via `navigator.clipboard` com fallback de seleção), bloco Google (`target="_blank" rel="noopener noreferrer"`) em todos os estados de resposta, e estados RESPONDIDA/INDISPONIVEL/ERRO. CSS 100% local com prefixo `pesquisa-`, wrapper branco com `min-height:100vh` + `100dvh`, `--pesquisa-cor` da `corPrimaria` (ou fallback da empresa), `:focus-visible` de 3px/offset 2px e `prefers-reduced-motion`.
- **`page.tsx`** (Server Component): `dynamic = "force-dynamic"`, `generateMetadata` com `robots` noindex e `referrer: "no-referrer"` (o token está na URL), resolve o estado no servidor com `backendFetch GET /pesquisa/publica/:token` encaminhando `x-client-ip` quando há IP válido (exceção, 5xx ou corpo irreconhecível viram `{ tipo: "ERRO" }`, nunca lança), monta `empresa` de `getEmpresaConfig()` e renderiza o `<link>` do bootstrap-icons 1.11.1 com `integrity` sha384 e `crossOrigin="anonymous"`.
- **`responder/route.ts`**: `POST` público (sem guarda de sessão de admin), fora do prefixo de API, lê o JSON com tolerância a corpo inválido, valida `nota` inteira 1-5 e `comentario` string até 500 (400 com `{ erro }` em português), repassa SOMENTE `nota` e `comentario` ao backend com `x-client-ip` e devolve o corpo/status do backend (200/409/404/429/400) com `Cache-Control: no-store`; exceção de rede vira 502 `{ erro: "indisponivel" }`.
- **`lib/ip-cliente.ts`** (só servidor, usa `node:net.isIP`): `ipDoCliente` lê `x-real-ip` e, se não for IP válido (até 45 chars), o ÚLTIMO elemento de `x-forwarded-for`; sem valor válido devolve `undefined` (a ponta esquerda forjável nunca é usada).

## Verificacao

- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: sem erros (após as duas tasks).
- `npm --workspace @orcamento/frontend run build`: conclui sem erro; as rotas `/pesquisa/[token]` e `/pesquisa/[token]/responder` aparecem na saída (Dynamic/server-rendered).
- Greps de aceitação das duas tasks: todos passam (radio nativo presente, sem `dangerouslySetInnerHTML`, sem `backend-client` no cliente nem no lib, `emEnvio`/`aria-busy`/`bi-emoji-laughing` presentes, SRI presente, proxy público sem `/api/pesquisa` nem `node:net` no cliente, `x-real-ip`/`isIP` no `ip-cliente.ts`).
- SRI do bootstrap-icons recomputado com `curl | openssl dgst -sha384 -binary | base64 -A`: `4LISF5TTJX/fLmGSxO53rV4miRxdg84mZsxmO8Rx5jGtp/LbrixFETvWa5a6sESd`, igual ao valor do plano e do UI-SPEC.

## Deviations from Plan

Nenhuma correção de bug, funcionalidade ausente ou bloqueio. Observações operacionais sem desvio de escopo:

- O worktree não tem `node_modules`; para rodar `tsc` e `next build` foram criados symlinks temporários para o `node_modules` do checkout principal (ancestral do worktree), removidos ao final. O working tree terminou limpo.
- O `next build` regenera `apps/frontend/next-env.d.ts` (troca a referência `.next/dev/types` por `.next/types`). Esse é efeito colateral do build, fora dos arquivos do plano; foi revertido com `git checkout -- <arquivo>` antes de cada commit e não entrou em nenhum commit.
- O mapeamento `PesquisaPublicaView -> EstadoPagina` tem uma versão local em `pesquisa-cliente.tsx` (caso 409) e outra em `page.tsx` (estado inicial); é duplicação mínima e intencional para não inflar o `lib/pesquisa-publica.ts` além dos dois helpers puros definidos no plano.

## Known Stubs

Nenhum stub que impeça o objetivo. `RespostaPublica.cupom` ainda vem `null` do backend (o cupom é do plano 52-03); a tela de agradecimento trata os dois casos (com e sem cupom), então o estado "Obrigado por responder." com o texto `obrigadoSemRecompensa` é o comportamento correto até o 52-03.

## Threat Flags

Nenhuma além do `threat_model` do plano (T-52-09 a T-52-14, T-52-71, T-52-SC). A página não injeta HTML bruto, declara `referrer: no-referrer`/`robots` noindex, renderiza o link do Google só quando começa com `https://` com `rel="noopener noreferrer"`, e o proxy público repassa somente duas chaves validadas.

## Self-Check: PASSED

- Arquivos criados existem no disco e nos commits `66ab44a` (Task 1) e `61f25e6` (Task 2).
- `git rev-list --count 37bdc65..HEAD` = 2, batendo com `commits: 2`.
