# Phase 55: Proposta comercial atacado e revenda para orgaos publicos - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-27
**Phase:** 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
**Areas discussed:** Ciclo da proposta, Tela de montagem e precos, Cliente e lancamento no Athos, Conteudo do PDF

Decisoes anteriores a discussao (mesma conversa): preco base padrao do Athos (promocao so se valida), ajuste por % arredondando para cima ou digitado, ajuste nao e desconto, nome original no Athos / alterado + codigo no PDF, produto precisa existir no Athos, dados de orgao opcionais, PDF com prazo de entrega, dados bancarios, assinatura e validade.

---

## Ciclo da proposta

| Option | Description | Selected |
|--------|-------------|----------|
| Status rascunho/enviada/fechada/cancelada | sugerido pelo Claude | ✓ |
| Editar apos lancar no Athos | | |
| Duplicar apos lancar no Athos | | ✓ |
| Snapshot dos precos | mantem o que ja tinha | ✓ |

**User's choice:** "pode deixa esses status que voce sugeriu. se ja foi lancado no athos tem que duplicar, mantem o que ja tinha."

## Tela de montagem e precos

| Option | Description | Selected |
|--------|-------------|----------|
| % por item | | ✓ |
| % geral | opcao extra "aplicar em todos" | ✓ (como acao adicional) |
| Custo/margem visiveis | so na tela | ✓ |

**User's choice:** "por item, nao por geral, mas se possivel ter uma opcao de aplicar porcentagem no geral." / "Na hora de comecar monta o orcamento gostaria que tivesse o valor de custo para comparacao"

## Cliente e lancamento no Athos

| Option | Description | Selected |
|--------|-------------|----------|
| Cliente do Athos vai no orcamento | | ✓ |
| Botao fechar e lancar com confirmacao | | ✓ |
| Orgao sem cadastro: lanca sem cliente | | |
| Orgao sem cadastro: obriga cadastrar no Athos antes | | ✓ |

**User's choice:** "Sim, sim." / "B"

## Conteudo do PDF

| Option | Description | Selected |
|--------|-------------|----------|
| Numero do Athos | | ✓ |
| Numero proprio | | |
| Lancar no Athos ao gerar o PDF | A | ✓ |
| Previa sem numero, oficial so ao fechar | B | |
| Santander / EFI / ambos | | Santander |
| Assinante fixo / escolhido na hora | | escolhido na hora |

**User's choice:** "seria o numero do athos, Santander, Escolhe na hora, validade de 1 dia pode ter campo de observacao" / "A" / "Prazo de validade 1 dia e Prazo de Entrega 15 Dias"

## Claude's Discretion

- Layout/navegacao, modelo de dados, aviso de preco abaixo do custo (vermelho, sem bloquear), lista de assinantes salvos, previa do PDF no rascunho.

## Deferred Ideas

- Cadastro de cliente no Athos pelo sistema online.
- Gravar validade/obs/prazo no orcamento do Athos (exige nova captura).
- Cancelar orcamento no Athos.
- Envio da proposta por e-mail/WhatsApp.
