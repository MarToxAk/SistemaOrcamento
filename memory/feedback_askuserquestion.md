---
name: feedback-askuserquestion
description: Usuário rejeita a ferramenta AskUserQuestion — preferir perguntas em texto simples numerado
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9f9700ec-69a8-42c7-ae7f-98064b547bd3
---

Não usar AskUserQuestion neste projeto. Apresentar perguntas como lista numerada em texto simples e aguardar resposta via mensagem normal.

**Why:** O usuário rejeitou a tool call AskUserQuestion durante o discuss-phase da Fase 27 (Contas a Receber). Padrão observado: preferência por interação via texto, não via componente interativo.

**How to apply:** Em qualquer workflow que normalmente chama AskUserQuestion (discuss-phase, etc.), usar modo texto: apresentar opções numeradas em markdown e aguardar o usuário digitar a resposta.
