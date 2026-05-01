---
name: Pacote Compartilhado (@bomcusto/shared)
description: Tipos TypeScript compartilhados entre backend e frontend
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Pacote Compartilhado (@bomcusto/shared)

**Localização**: `packages/shared/src/index.ts`

## O que exporta

```typescript
// Status possíveis de um orçamento (versão simplificada para o frontend)
export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "cancelled";

// Resumo de orçamento para listagens
export type QuoteSummary = {
  id: string;
  customerName: string;
  status: QuoteStatus;
  total: number;
  updatedAt: string;
};
```

## Uso
- Importado pelo **frontend** para tipagem das respostas de API
- Importado pelo **backend** para garantir consistência nos DTOs de resposta

**Nota**: O `QuoteStatus` do pacote shared usa valores em inglês minúsculo (draft, sent, approved...) — diferente do enum Prisma `QuoteStatus` no backend que usa valores em CAPS em português (PENDENTE, ENVIADO, APROVADO...). O backend faz a conversão.

**How to apply:** Ao adicionar novo status ou campo ao orçamento, avaliar se precisa atualizar este pacote para manter tipagem consistente no frontend.
