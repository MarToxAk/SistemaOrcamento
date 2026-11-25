---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 07
subsystem: frontend-nfse
tags: [nfse, pagamento, senha-liberacao, nextjs, proxy]
requires: ["54-06"]
provides:
  - proxy GET /api/quotes/:id/nfse/pagamento (sem cache)
  - proxy de emissao repassando x-client-ip e x-client-user-agent
  - tela orcamento/[id] com pagamento identificado, valor pre-preenchido e senha de liberacao
affects: [54-12]
tech-stack:
  added: []
  patterns: ["front so reflete a decisao do backend", "senha apenas em estado local, limpa apos cada tentativa"]
key-files:
  created:
    - apps/frontend/src/app/api/quotes/[id]/nfse/pagamento/route.ts
  modified:
    - apps/frontend/src/app/api/quotes/[id]/nfse/emitir/route.ts
    - apps/frontend/src/app/orcamento/[id]/page.tsx
key-decisions:
  - "Codigos de senha (invalida, bloqueada, nao configurada, liberado-por obrigatorio) e PAGAMENTO_INTEGRAL_NAO_CONFIRMADO aparecem dentro do bloco de senha, nao no alerta global."
  - "VALOR_ACIMA_DO_PAGO usa o valorMaximo do backend formatado em BRL; sem o numero, mostra a mensagem do backend."
  - "Ao abrir o formulario, o pagamento e relido, mas o valor so e trocado se o operador ainda nao editou o campo."
status: complete
metrics:
  duration: "~25 min"
  completed: 2026-11-25
commits: 2
plan_head_before: 086ca091a25f8dad5a4f7acf26fa951d004b74c6
plan_head_after: 14c7252804670fd0851e6231cf2760fe3a6c874b
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Phase 54 Plan 07: Pagamento identificado e senha de liberacao na tela do orcamento Summary

A tela do orcamento mostra o pagamento identificado (PIX ou caixa), pre-preenche o valor da NFS-e com o valor efetivamente pago e so pede senha de liberacao quando o backend informa pagamento nao integral; o proxy de emissao repassa o IP real e o user-agent do operador.

## O que foi feito

- **Tarefa 1 (44066f0):** `nfse/pagamento/route.ts` (GET, `Cache-Control: no-store`, padrao do `tomador`). `nfse/emitir/route.ts` passa `x-client-ip` (somente de `ipDoCliente(req.headers)`, nunca de um `x-client-ip` do navegador) e `x-client-user-agent` (ate 200 caracteres). O corpo e repassado sem ser lido nem logado. `nfse/route.ts` (anexo manual) nao foi tocado (D-16).
- **Tarefa 2 (14c7252):** em `orcamento/[id]/page.tsx`:
  - Tipo `PagamentoNfse` espelhando o backend e `carregarPagamentoNfse` (`cache: "no-store"`), chamada apos o `fetchDetail` e ao abrir o formulario.
  - Valor do servico pre-preenchido com `valorSugeridoNota` nos dois pontos (carga inicial e `abrirFormularioEmissao`); fallback para o total do orcamento so se a leitura falhar.
  - Selo-resumo ao lado do botao e bloco "Pagamento identificado" no card (situacao, valor pago, desconto PIX se maior que zero, total, data/hora America/Sao_Paulo, E2E em `code` selecionavel, origem PIX/caixa com a nota do caixa).
  - Campos "Senha de liberacao" (`type=password`, `autoComplete=new-password`) e "Quem esta liberando" (max. 80) so quando `exigeSenha` ou apos 403 `PAGAMENTO_INTEGRAL_NAO_CONFIRMADO`; Emitir fica desabilitado sem os dois.
  - `senhaLiberacao`/`liberadoPor` entram no POST apenas no modo de liberacao; nada de "pago" e enviado.
  - Tratamento dos codigos: `PAGAMENTO_INTEGRAL_NAO_CONFIRMADO` abre os campos; `SENHA_LIBERACAO_INVALIDA`, `LIBERACAO_BLOQUEADA`, `LIBERACAO_NAO_CONFIGURADA` (e `LIBERADO_POR_OBRIGATORIO`) mostram a mensagem do backend; `VALOR_ACIMA_DO_PAGO` mostra o maximo em BRL.
  - Senha apagada no `finally` de toda tentativa e em cancelar/fechar/sucesso; "quem libera" apagado em cancelar/fechar/sucesso/senha invalida. Sem URL, storage ou console.

## Verificacao

- `tsc --noEmit -p tsconfig.json` em `apps/frontend` (worktree): limpo, apos cada tarefa.
- `next build` em `apps/frontend`: concluido com sucesso; rota `/api/quotes/[id]/nfse/pagamento` listada.
- `grep` em `page.tsx`: nenhum `console.`, `localStorage` ou `sessionStorage`.
- Diff do plano limitado a 3 arquivos; `nfse/route.ts` (anexo manual) e os arquivos do 54-04 (backend EFI) intactos.
- Frontend sem runner de testes; verificacao visual ponta a ponta fica no checkpoint do 54-12.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Ambiente] node_modules ausente no worktree**
- Symlinks locais nao versionados (`node_modules` e `apps/frontend/node_modules` apontando para o repo principal); `tsc` e `next build` rodados direto em `apps/frontend` do worktree (o `npm exec -w` apontaria para o repo principal). Os symlinks aparecem como untracked e NAO foram commitados.
- `next build` regravou `apps/frontend/next-env.d.ts`; revertido com `git checkout --` neste arquivo.

**2. [Observacao] Ledger do plano**
- O ledger em `.git` nao foi gravado (sandbox do worktree); base registrada no frontmatter e `commits` medido por contagem dos commits da tarefa (2, antes do commit deste SUMMARY).

**3. [Escolha de UI] Mensagens de senha no bloco da senha**
- Erros da familia "senha" ficam no bloco de senha (nao no alerta global do topo) para ficarem junto dos campos. Nao altera o contrato do plano.

Fora isso, o plano foi executado como escrito. STATE.md e ROADMAP.md nao foram atualizados (worktree paralelo; fica com o orquestrador).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum alem do threat_model do plano (T-54-20 e T-54-21 mitigados; T-54-SC aceito, nenhum pacote instalado).

## Self-Check: PASSED

- Arquivos existem: `nfse/pagamento/route.ts`, `nfse/emitir/route.ts`, `orcamento/[id]/page.tsx`.
- Commits 44066f0 e 14c7252 presentes no historico.
