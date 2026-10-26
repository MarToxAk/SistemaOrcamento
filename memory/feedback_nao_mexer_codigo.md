---
name: feedback-nao-mexer-codigo
description: Não editar/alterar código a menos que o usuário peça explicitamente
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0b650e11-7912-4404-aadf-6f3824e88e5b
---

Não modificar arquivos de código (implementação ou testes) a menos que o usuário peça explicitamente para "implementar", "corrigir", "alterar" etc.

**Why:** Em 2026-06-28, ao perguntar "como tem que ser enviado para env" e "quero deixar padrão para mandar para env", o usuário queria a **receita/instruções de formatação** (ex: como montar o valor do certificado para a variável de ambiente), não uma mudança no `efi.service.ts`. Eu editei o código + teste e ele interrompeu: "Não era para mexer no codigo".

**How to apply:** Perguntas investigativas/how-to ("como está X", "onde recebe Y", "como mandar para env", "isso já trata Z?") pedem **explicação e orientação**, não edição. Quando uma mudança de código parecer útil, **proponha e pergunte antes** de editar. Só alterar arquivos com pedido explícito. Relacionado: [[feedback_askuserquestion]].
