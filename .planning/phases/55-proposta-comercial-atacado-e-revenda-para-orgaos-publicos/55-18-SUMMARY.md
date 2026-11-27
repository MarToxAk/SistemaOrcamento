---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 18
subsystem: frontend/propostas
tags: [nextjs, propostas, lancamento, athos, confirmacao, proxy, pdf, regras-puras]
status: complete
requires: [55-08, 55-10, 55-13, 55-17]
provides:
  - lista permitida do proxy /api/propostas estendida (POST gerar/recuperar/duplicar, PATCH status, GET pdf/previa)
  - podeGerar e acoesDisponiveis (regras puras provadas por script)
  - ConfirmarLancamento (modal com texto explicito, caixa de ciencia e assinante)
  - AcoesProposta (previa, gerar, PDF oficial, duplicar, fechar, cancelar e recuperar)
  - banner de status e acoes no topo de /propostas/[id]
affects: [55-11, 55-15]
requirements-completed: [P55-ATHOS, P55-CICLO, P55-PDF]
tech-stack:
  added: []
  patterns:
    - "Regra de habilitacao e de acoes por status em funcoes puras (podeGerar, acoesDisponiveis); componentes so as usam"
    - "Um unico estado pendente + ref sincrona trava todos os botoes (sem duplo disparo)"
    - "PDF por fetch autenticado -> blob -> URL de objeto revogada depois; nada persistido"
key-files:
  created:
    - apps/frontend/src/app/propostas/_componentes/acoes-proposta.tsx
    - apps/frontend/src/app/propostas/_componentes/confirmar-lancamento.tsx
  modified:
    - apps/frontend/src/lib/propostas-rotas.ts
    - apps/frontend/scripts/checar-propostas-rotas.mjs
    - apps/frontend/src/app/propostas/_shared/formatadores.ts
    - apps/frontend/scripts/checar-propostas-formatadores.mjs
    - apps/frontend/src/app/propostas/[id]/page.tsx
key-decisions:
  - "Acoes que devolvem corpo diferente de PropostaDetalhe (gerar, recuperar, status) usam fetch proprio em AcoesProposta e recarregam a proposta com carregar(); a funcao enviar da pagina nao serve porque trocaria o estado por um corpo parcial."
  - "A previa abre a aba dentro do clique (window.open) antes da chamada, para nao ser bloqueada como pop-up; sem aba ou com erro, a aba e fechada e a mensagem do servidor e exibida."
  - "DetalheProposta recebe key={id}: depois de duplicar, navegar para o novo id remonta a tela e reinicia o assinante e o estado."
  - "O aviso antigo 'ja foi lancada' foi substituido por BannerStatus, porque tambem aparecia em LANCANDO, onde nao era verdadeiro."
metrics:
  duration: 35 min
  completed: 2026-11-27
actuals:
  tokens: 14500
  tasks: 2
  commits: 2
plan_head_before: c18d480493f72d43835401e813487386122fe109
plan_head_after: d27b310595d4a8e832f6d5aee753cc11436cc299
---

# Phase 55 Plan 18: Acoes da proposta e confirmacao do lancamento Summary

Tela da proposta completa com previa, gerar e lancar no Athos atras de uma confirmacao explicita (texto de aviso, caixa de ciencia e assinante), PDF oficial, duplicar, fechar, cancelar com aviso de cancelamento local e recuperar, com as seis rotas de ciclo de vida liberadas no proxy por metodo e UUID estritos e as regras de estado provadas por script.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | rotas de ciclo de vida no proxy e regras puras podeGerar e acoesDisponiveis | 33a2dba |
| 2 | modal de confirmacao e acoes da proposta | d27b310 |

## Accomplishments

- **Proxy (T-55-59):** `rotaPropostaPermitida` aceita apenas POST `[uuid]/gerar|recuperar|duplicar`, PATCH `[uuid]/status` e GET `[uuid]/pdf|previa`; cada rota com um unico metodo. `checar-propostas-rotas.mjs` imprime OK para os seis aceitos e para 12 recusados novos (metodo errado, segmento extra, UUID em maiuscula ou invalido). `templates/preview` continua fora (plano 55-15).
- **Regras puras (T-55-43):** `podeGerar({ciencia, assinanteNome, pendente})` so e verdadeira com ciencia, nome nao vazio apos trim e sem chamada pendente; `acoesDisponiveis(status, pdfDisponivel)` devolve as acoes por status na ordem do plano, "gerar" so em RASCUNHO, "pdf" so com `pdfDisponivel`, status desconhecido ou em caixa diferente = lista vazia. O script afirma que "gerar" nao aparece fora de RASCUNHO.
- **`ConfirmarLancamento`:** modal Bootstrap (`modal d-block` + `modal-backdrop show`, sem JS do Bootstrap) com o texto explicito sobre orcamento real no Athos de producao, edicao encerrada e cancelamento apenas local; resumo (cliente, itens, total); assinante (nome obrigatorio, cargo e CPF opcionais) com os valores da pagina; caixa "Entendi e quero lançar no Athos"; botao desabilitado por `!podeGerar(...)`. Escape fecha so quando nao ha chamada pendente.
- **`AcoesProposta`:** renderiza exatamente as acoes de `acoesDisponiveis`. Gerar envia `{ assinanteNome, assinanteCargo, assinanteCpf, confirmar: true }` (cargo e CPF omitidos quando vazios) e mostra a `mensagem` original do servidor no modal e na tela (flag desligada 503, cliente obrigatorio 422, em andamento 409); apos erro a proposta e recarregada, para que um LANCANDO ambiguo passe a oferecer "Recuperar lançamento". Previa e PDF oficial por blob com `URL.createObjectURL` revogada depois (T-55-63). Cancelar repete "O orçamento nº N continua aberto no Athos; cancele-o pelo Balcão. Este cancelamento é só local." e exibe o `aviso` devolvido. Rotulos citam o numero quando existe; nenhum botao dispara duas vezes.
- **Pagina:** `AcoesProposta` e `BannerStatus` acima dos paineis. O assinante lido do estado da pagina (nota do 55-10) e passado ao modal; ao confirmar, a pagina guarda o valor editado.

## Verification

- `node apps/frontend/scripts/checar-propostas-formatadores.mjs`: exit 0, 83 linhas OK (inclui 6 de `podeGerar` e 16 de `acoesDisponiveis`), zero SKIP.
- `node apps/frontend/scripts/checar-propostas-rotas.mjs`: exit 0, 69 linhas OK, zero SKIP.
- `npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json`: exit 0, sem `error TS`.
- Greps de aceitacao: `confirmar: true` = 1; `Entendi e quero lançar no Athos` = 1; `/gerar` em acoes = 1; `continua aberto no Athos` = 1; `podeGerar` em confirmar-lancamento = 3; `acoesDisponiveis` em acoes = 3; `recuperar` em propostas-rotas.ts >= 1. Nenhum `dangerouslySetInnerHTML`, `localStorage` ou `sessionStorage` nos dois componentes novos.
- Nao executado: verificacao visual no navegador e chamada real ao backend (plano 55-11); nao ha harness de teste de componentes React neste frontend. Nenhuma conexao ao Athos.

## Deviations from Plan

### Notas de interpretacao (sem desvio de comportamento)

- `BannerStatus` substitui o alerta "ja foi lancada" que o plano 55-14 deixou na pagina; o plano pedia o banner e o alerta antigo ficaria duplicado e incorreto em LANCANDO. CANCELADA sem numero (rascunho cancelado) usa o texto "Proposta cancelada antes de ser lançada...".
- `key={id}` em `DetalheProposta` (nao previsto) para a navegacao apos duplicar reiniciar o estado da tela.
- Nao foi incluida rejeicao de `templates/preview` em `checar-propostas-rotas.mjs` (o plano nao pede e o 55-15 a libera, evitando conflito entre planos da mesma onda).
- `npm ci` na raiz do worktree (sem node_modules); nada versionado.

None - no Rule 1-3 auto-fixes were required.

## Known Stubs

None.

## Threat Flags

None alem do threat_model do plano. T-55-43 (confirmacao + ciencia + `podeGerar` + "gerar" so em RASCUNHO), T-55-44 (estado pendente e ref sincrona), T-55-45 (aviso repetido na confirmacao e na resposta), T-55-59 (seis combinacoes estritas, provadas por script) e T-55-63 (blob revogado, nada persistido) mitigados.

## Self-Check: PASSED

- Arquivos existem: acoes-proposta.tsx, confirmar-lancamento.tsx, propostas-rotas.ts, formatadores.ts, ambos os scripts e `[id]/page.tsx`.
- Commits 33a2dba e d27b310 sao ancestrais de HEAD.
