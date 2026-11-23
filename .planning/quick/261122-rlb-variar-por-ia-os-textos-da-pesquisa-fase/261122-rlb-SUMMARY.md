---
phase: quick-261122-rlb-variar-por-ia-os-textos-da-pesquisa-fase
status: complete
---

# Resumo da execução — quick 261122-rlb (variação por IA dos textos da pesquisa)

## Commits (3, atômicos, na ordem)

1. `feat(quick-261122-rlb): variacao por IA no cupom da pesquisa com conferencia por marcador`
   - `apps/backend/src/modules/pesquisa/pesquisa-variacao.ts` (helpers puros)
   - `apps/backend/src/modules/pesquisa/pesquisa-variacao.service.ts` (`PesquisaVariacaoService.variar`)
   - `apps/backend/src/modules/pesquisa/pesquisa.service.ts` (variarModelo, cupom, enviarComReserva, mensagemJaEnviada)
   - `apps/backend/src/modules/pesquisa/pesquisa.module.ts` (provider)
   - `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts` (tracer do cupom)
2. `feat(quick-261122-rlb): variacao por IA no fechamento e no convite da pesquisa com testes`
   - `apps/backend/src/modules/pesquisa/pesquisa.service.ts` (prepararFechamento e enviarConviteGoogle)
   - `apps/backend/src/modules/pesquisa/pesquisa-variacao.test.ts` (novo)
   - `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts` (cupom/convite com variar falso + re-tentativa do convite)
   - `apps/backend/src/modules/pesquisa/pesquisa.service.test.ts` (fechamento)
3. `feat(quick-261122-rlb): flag PESQUISA_VARIACAO_IA no deploy com teste de consistencia`
   - `deploy/docker-compose.vps.yml`
   - `deploy/docker-compose.box.vps.yml`
   - `deploy/stack.env.example`
   - `apps/backend/src/modules/pesquisa/pesquisa-variacao.env.test.ts` (novo)

## Testes

- Suite completa `src/modules/pesquisa src/modules/integrations/chatwoot`: **21 suites, 531 testes, 0 falhas** (baseline: 19 suites, 490 testes).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: **limpo**.
- Guardas: `git status --porcelain apps/backend/prisma` = 0; guarda de commits (alheios) = 0.
- Consistência de deploy: cada compose tem exatamente 1 linha `PESQUISA_VARIACAO_IA: ${PESQUISA_VARIACAO_IA:-true}`; `stack.env.example` tem exatamente 1 linha `PESQUISA_VARIACAO_IA=true`.

## Desvios do plano (documentados)

1. **Ordem de `validarVariacao` (markdown antes de aspas).** O plano documenta a ordem (ii) aspas e (iii) markdown, mas o próprio teste pede que "três crases" caia em `markdown` (e crase simples em `envolvido_em_aspas`). Como texto entre três crases também começa/termina com crase, verifiquei markdown antes de aspas para satisfazer os casos de teste. Sem impacto no contrato externo.
2. **Exemplo `{ link }` para `chaves_soltas`.** Com a regra declarada no plano (mesma quantidade de `{` e `}`), `{ link }` (com espaços) não altera a contagem de chaves — na prática ele cai em `placeholders` (o espaço quebra o regex). Testei `chaves_soltas` com um caso que realmente altera a contagem (`Responda: {link} }`), mantendo a regra fiel ao plano. Cada `motivo` fixo tem pelo menos um caso de teste coberto.

## Notas

- Nenhuma escrita em banco real e nenhuma migração/schema Prisma tocado.
- Nenhum arquivo alheio entrou nos commits (`git add` sempre com caminhos explícitos).
- `PesquisaVariacaoService.variar` nunca lança; logs só com `motivo=`/`tipo`, sem token, URL, texto ou objeto de erro.
- Construtor do `PesquisaService` com 5 argumentos posicionais continua funcionando (6º `@Optional()`).
