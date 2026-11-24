# Phase 53: Lançamento automático da venda no caixa do Athos com desconto do cupom - Context

**Gathered:** 2026-11-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Permitir que o backend lance no Athos (PostgreSQL 9.0.5) a venda de um orçamento, replicando a sequência observada nas capturas do PDV (`53-CAPTURAS.md`), incluindo o desconto do cupom da pesquisa rateado nos itens. Entrega: serviço de venda a partir de orçamento, em transação única, com modo simulação (dry-run), desligado por padrão, testado apenas contra mocks e contra o clone `athos-teste`. Fora do escopo: emissão e cancelamento da NFC-e, PIX/dinheiro/troco/TEF, cancelamento automático de venda.

</domain>

<decisions>
## Implementation Decisions

### Segurança e ambiente
- Nenhuma escrita no Athos de produção durante desenvolvimento, testes ou verificação. Escrita de teste só no clone `athos-teste` (127.0.0.1:5440, db `athos`, PG14) ou em mocks do cliente `pg` — **Reversibility:** one-way — uma venda gravada no Athos de produção gera nota fiscal e movimenta caixa e estoque reais.
- O recurso nasce DESLIGADO: flag de ambiente (padrão `false`) e modo simulação (dry-run, `BEGIN` + `SET TRANSACTION READ ONLY`, como o `athos-conta-receber-baixa.service.ts` já faz) disponível em todas as chamadas — **Reversibility:** costly — ligar em produção é decisão operacional do dono, fora desta fase.

### Escopo funcional
- Só a forma de pagamento 5 (à vista com `recebimento_cartao` status `AVC`), a única capturada. Qualquer outra forma é recusada com erro claro (sem tentativa de adivinhar PIX/dinheiro/troco) — **Reversibility:** costly — contrato da API de entrada.
- O PDV continua sendo o caminho oficial para NFC-e: o serviço só grava `sfNFCe = 1` e `venda.obs` e deixa o emissor do Athos agir; não emite nem cancela nota — **Reversibility:** one-way — cancelamento fiscal não foi observado no banco.
- Cancelamento automático da venda NÃO entra nesta fase (depende de confirmar o cancelamento da NFC-e).
- Desconto do cupom: o serviço recebe o desconto total em R$ (já calculado pelo cupom: percentual com teto) e rateia pelo `ratear()` já existente em `athos-orcamento-calc.util.ts` (proporcional ao líquido de cada item, método do maior resto, em centavos, empate para o índice maior). Confere com as capturas (5% de 180 e 50 = 9,00 e 2,50). O comportamento do PDV com sobra de centavos não foi capturado e fica marcado para validação em nova captura — **Reversibility:** costly — afeta valor fiscal gravado.

### Integridade dos dados
- Uma única transação (`BEGIN`/`COMMIT`/`ROLLBACK`); `idvenda` por `INSERT ... RETURNING idvenda`, nunca por `order by idvenda desc limit 1` — **Reversibility:** costly.
- Estoque relativo: `estoqueloja = estoqueloja - qtd` somente quando `controlaestoque = true` (nunca o valor absoluto calculado no cliente) — **Reversibility:** costly.
- Idempotência por orçamento: não criar segunda venda se já existir linha em `relacao_orcamento_venda` para o `idorcamento` — **Reversibility:** costly.
- Pré-condições bloqueantes: caixa aberto (`caixa_movimento.status = 'ABE'`), orçamento existente e ainda não usado (`statusorcamento = false`), produtos vendáveis (`statusproduto`/`vendeproduto`), desconto dentro de `descontomaximo` quando houver.
- `senha_pdv`: o `INSERT` usa `(select senha+1 from senha_pdv limit 1)` como o PDV. O plano inclui um spike no `athos-teste` para descobrir se existe trigger que incrementa `senha_pdv`; sem essa confirmação, a tarefa de execução fica bloqueada para esse campo — **Reversibility:** costly.
- Os `update orcamento ... in (110540769)` e `(5682)` (IDs estranhos das capturas) NÃO são replicados; só o `update` do orçamento da própria venda — **Reversibility:** costly.

### Forma de acionamento (preferência)
- Sem gatilho automático por webhook. Endpoint administrativo (POST) acionado de forma explícita para um orçamento, sempre com `dryRun` disponível. Decidido sob a aprovação geral dada pelo dono ("pode aprova tudo"); revisar antes do planejamento se preferir gatilho automático depois da entrega do pedido.

### Decided autonomously
- [Estrutura] Q: "Onde fica o código novo?" → Selected: "Serviço novo `athos-venda.service.ts` no módulo Athos, com util puro de rateio testável separado, reaproveitando `athos-orcamento-calc.util.ts` e o padrão de transação do `athos-conta-receber-baixa.service.ts`" — mover de arquivo é barato
- [Testes] Q: "Como testar sem tocar o Athos?" → Selected: "Jest com cliente `pg` simulado para a sequência de comandos e testes de integração opcionais contra `athos-teste` (pulados sem a variável de ambiente)" — só afeta testes
- [Nomes] Q: "Nomes de DTO/rota/flag" → Selected: "`ATHOS_VENDA_AUTOMATICA` (flag), rota `POST athos/venda/de-orcamento/:idorcamento`" — nomes internos ainda sem consumidores
- [Dry-run] Q: "O dry-run devolve o quê?" → Selected: "A lista dos comandos que seriam executados com os valores calculados (sem expor dados pessoais)" — formato de resposta ainda não consumido

### Claude's Discretion
Detalhes de formato das mensagens de erro, estrutura interna do DTO e organização dos testes.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `athos-conta-receber-baixa.service.ts` — padrão de `BEGIN`/`ROLLBACK`, modo simulação com `SET TRANSACTION READ ONLY` e `FOR UPDATE`.
- `athos-orcamento.service.ts`, `athos-orcamento-calc.util.ts`, `athos-orcamento-idempotencia.service.ts` — criação de orçamento no Athos, cálculo de totais/desconto e idempotência.
- `athos-defaults.service.ts`, `athos-fk.util.ts` — defaults de colunas e validação de FKs.
- `PesquisaCupomService.resgatar` — calcula o desconto do cupom (percentual com teto) e hoje só marca o cupom como usado; o atendente lança o desconto à mão.

### Established Patterns
- Conexão com Athos via `ATHOS_PG_*`; escrita só com GRANT específico; `usuario_leitura` não é somente leitura de fato (tem INSERT em `orcamento`).
- Testes com Jest e mocks do `pg`; PostgreSQL 9.0.5 (sem `pg_sequence_last_value`, sem `information_schema.triggers.action_timing`).

### Integration Points
- Resgate do cupom (`/cupons`, `PesquisaCupomService.resgatar`) → desconto em R$ → serviço de venda.
- `athos.module.ts` (provider/controller novos).

</code_context>

<specifics>
## Specific Ideas

Capturas Frida do PDV em `53-CAPTURAS.md` são a especificação observada da sequência de escritas. Alternativa avaliada e adiada: aplicar o desconto no próprio orçamento (`orcamento_item.valordesconto`) para o atendente finalizar no PDV — depende de uma captura que ainda não existe.

</specifics>

<deferred>
## Deferred Ideas

- PIX, dinheiro, troco, pagamento misto, TEF e cliente identificado (CPF na nota) — precisam de novas capturas.
- Cancelamento automático de venda e da NFC-e.
- Gatilho automático (webhook/evento) para lançar a venda.
- Abertura/fechamento de caixa, sangria e suprimento.
- Aplicar o desconto no orçamento antes do PDV importar (precisa de captura).

</deferred>
