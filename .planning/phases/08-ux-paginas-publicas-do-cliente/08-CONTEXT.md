# Phase 8: UX das Páginas Públicas do Cliente — Contexto

**Coletado:** 2026-05-03
**Status:** Pronto para planejamento
**Fonte:** Discussão com o usuário

<domain>
## Escopo da Fase

Melhorar a experiência do cliente nas duas páginas públicas do sistema:

- `/orcamento/[id]/approve` — página de aprovação de orçamento por token
- `/orcamento/[id]/status` — página de acompanhamento do status do pedido

**O que NÃO faz:**
- Não altera APIs ou lógica de negócio — apenas apresentação
- Não cria novas páginas públicas
- Não adiciona autenticação ou login às páginas públicas
</domain>

<decisions>
## Decisões de Implementação

### D-01 — Descrições por status na página `/status` [LOCKED]

Implementar mapa de emoji + label + descrição para cada status. Exibir como badge com emoji inline (opção 2: emoji e texto no mesmo elemento). Abaixo do badge, exibir a descrição em português.

Mapa completo (usar exatamente estes textos):

| statusKey | Emoji + Label | Descrição |
|-----------|---------------|-----------|
| `pendente` | 🕐 Pendente | "Seu orçamento foi recebido e está aguardando confirmação." |
| `enviado` | 📤 Enviado | "O orçamento foi enviado para análise. Aguardando sua aprovação." |
| `aprovado` | ✅ Aprovado | "Orçamento aprovado! Em breve seu pedido entra em produção." |
| `em_producao` | 🎨 Em Produção | "Seu pedido está sendo produzido pela nossa equipe." |
| `pronto_para_entrega` | 📦 Pronto para Retirada | "Seu pedido está pronto! Pode passar na loja quando quiser." |
| `entregue` | 🎉 Entregue | "Pedido entregue. Obrigado pela preferência!" |
| `cancelado` | ❌ Cancelado | "Este orçamento foi cancelado. Dúvidas? Fale conosco." |

### D-02 — Apresentação do badge de status [LOCKED]

Usar badge com emoji inline (emoji + texto no mesmo pill/badge). Não usar emoji grande separado acima. Manter o estilo `.status-pill` existente, apenas incorporar o emoji no label.

Remover o mapa `STATUS_CLASS` com classes Bootstrap (bg-success, bg-warning, etc.) e usar cores semânticas próprias por status para manter identidade visual consistente.

### D-03 — Estado de sucesso na página `/approve` [LOCKED]

Substituir o `alert-success` simples por um estado mais celebratório:
- Ícone ✅ grande (font-size ~3rem ou equivalente) centralizado
- Título: "Orçamento Aprovado!"
- Texto de próximo passo: "Nossa equipe já foi notificada e em breve seu pedido entra em produção. Avisaremos assim que estiver pronto."
- Manter o número do orçamento visível

### D-04 — Re-acesso ao link de aprovação após já aprovado [LOCKED]

Quando `data?.approved === true` no carregamento inicial (cliente acessa o link depois de já ter aprovado anteriormente), mostrar mensagem **específica e diferente** do estado de sucesso pós-clique:

- Ícone ✅ grande
- Título: "Orçamento já aprovado"
- Texto: "Você já aprovou este orçamento anteriormente. Nossa equipe está cuidando do seu pedido."
- Número do orçamento visível
- Link de contato WhatsApp abaixo (já existe o padrão `wa.me/5512996484918`)

Diferenciar via um state separado, ex: `"already-approved"`, distinto do `"success"` (pós-clique).

### Decisões a cargo do Claude
- Cores semânticas exatas para cada status badge (usar paleta coerente com o gradiente existente: tons de verde, azul, laranja, cinza)
- Tipografia e espaçamento exatos do estado de sucesso melhorado
- Se reutilizar o `STATUS_CLASS` como lookup ou substituir por objeto com `{ emoji, label, description, color }`
</decisions>

<canonical_refs>
## Referências Canônicas

Downstream agents MUST read these before planning or implementing.

### Páginas a modificar
- `apps/frontend/src/app/orcamento/[id]/approve/page.tsx` — página de aprovação
- `apps/frontend/src/app/orcamento/[id]/status/page.tsx` — página de status

### Padrão visual existente (extraído das páginas atuais)
- Fundo: `#f9f7ed`
- Gradiente do header: `linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%)`
- Card: `border-radius: 16px`, `box-shadow: 0 4px 24px rgba(0,0,0,0.10)`, `max-width: 480px`
- Cor primária: `#7dc8aa` (botão de aprovação)
- Logo: `/media/logo_new.svg`, `maxWidth: 140`, fundo branco com `borderRadius: 8, padding: 6`
- Contato WhatsApp: `https://wa.me/5512996484918`
</canonical_refs>

<deferred>
## Ideias Adiadas

- Configuração de textos de status pelo painel — v1.2 usa textos fixos no código
- Animação/confetti no estado de sucesso — manter simples por ora
</deferred>

---

*Phase: 08-ux-paginas-publicas-do-cliente*
*Context gathered: 2026-05-03 via discuss-phase*
