---
name: project_proposta_atacado_orgao_publico
description: Nova funcao de proposta atacado/revenda para orgaos publicos (pedida 2026-11-27) - decisoes ja tomadas
metadata:
  type: project
---

Pedido de 2026-11-27: modulo de orcamento/proposta de atacado e revenda aceito por orgaos publicos, separado do fluxo da grafica. Produtos vem do cadastro do Athos; nome e descricao curta editaveis so na proposta (nunca alterar o Athos); preco alteravel por % ou digitado; cliente associado (Athos/cadastro local, com dados de orgao publico); PDF com perfil serio usando o sistema de templates (`pdf-templates`).

Decisao (2026-11-27): **alteracao de preco NAO e desconto.** O preco ajustado (por % ou digitado) substitui o valor unitario do item. No PDF aparece so o valor final (sem "de/por", sem coluna de desconto) e, ao fechar/enviar, vai como valor original do item com desconto 0.

**Why:** o usuario quer que o fechamento saia como se o preco ajustado fosse o preco de tabela.
**How to apply:** nao reaproveitar a regra D-04 de `athos-orcamento-calc.util.ts` (preco abaixo do cadastro vira desconto implicito) para esta funcao; se a proposta for gravada no Athos, gravar o preco ajustado como valor do item e desconto zerado. 

Decisao (2026-11-27): **preco base = preco padrao do Athos**, o mesmo que a busca da Fase 44 ja usa (funcao `precovendaproduto(idproduto)` do Athos, que ja considera promocao). Sem colunas separadas de atacado/revenda; o ajuste e feito na proposta por % ou digitado.

Decisoes (2026-11-27, respostas do usuario):
- Ao fechar, a proposta e **lancada como orcamento no Athos** (reaproveitar a escrita da Fase 44, mas com preco ajustado = valor do item e desconto 0).
- No Athos o item vai com **nome/descricao originais**; no PDF vai o **nome alterado + codigo do produto** (idproduto).
- Produto **precisa existir no Athos** antes (sem item avulso); se faltar, cadastrar pela tela de produto que ja existe.
- Dados de orgao publico no cliente: a criterio do Claude, **nenhum obrigatorio**.
- Ajuste por %: **sempre arredondar para cima** no centavo.
- PDF precisa ter: prazo de entrega, dados bancarios, assinatura do responsavel, validade da proposta (nao pediu marca, valor por extenso nem declaracoes).
- Promocao: usar o preco promocional so se valida; `precovendaproduto` ja confere promocaostatus e o periodo de datas.
- Validado: o Balcao do Athos grava preco alterado como `valoritem` com desconto 0 (captura Frida 2026-11-27) e o clone aceitou o insert (teste com ROLLBACK). Rules DO ALSO em `orcamento` impedem INSERT em CTE.
- Docs do Athos (RAR no Drive do usuario) copiadas em `.planning/phases/55-.../referencia/`.
