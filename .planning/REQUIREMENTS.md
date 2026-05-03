# Requirements — v1.2: Mensagens e UX do Cliente

**Milestone:** v1.2
**Created:** 2026-05-03
**Status:** Active

---

## v1.2 Requirements

### Mensagens Automáticas ao Cliente (MSG)

- [ ] **MSG-01**: Quando cliente aprova orçamento via token, Chatwoot envia mensagem com emoji confirmando aprovação e informando próximo passo do serviço
- [ ] **MSG-02**: Quando pagamento PIX parcial é confirmado via webhook EFI, Chatwoot envia mensagem com valor recebido, saldo restante e status atual
- [ ] **MSG-03**: Quando pagamento PIX total é confirmado via webhook EFI, Chatwoot envia mensagem de conclusão/celebração do pagamento completo
- [ ] **MSG-04**: Quando pagamento parcelado é confirmado via webhook EFI, Chatwoot envia mensagem confirmando a parcela recebida e informando restante
- [ ] **MSG-05**: Quando status do orçamento muda para EM_PRODUCAO, PRONTO, ENTREGUE ou CANCELADO, Chatwoot envia mensagem informando o cliente com texto adequado para cada status

### UX das Páginas Públicas do Cliente (UX)

- [ ] **UX-01**: Página de aprovação (`/orcamento/:id/approve`) tem layout visual consistente com identidade da marca Bom Custo e demais páginas do sistema
- [ ] **UX-02**: Página de status (`/orcamento/:id/status`) exibe status atual do serviço de forma clara com ícone/emoji por status e descrição amigável em português
- [ ] **UX-03**: Ambas as páginas têm aparência acolhedora, responsiva e com identidade coesa (logo, gradiente, card branco centralizado)

---

## Future Requirements (Next Milestones)

- RBAC por role (ADMIN / VENDEDOR / ATENDENTE)
- Relatórios e exportação CSV de orçamentos
- Notificações em tempo real (WebSocket) para mudança de status
- Histórico de mensagens enviadas ao cliente

---

## Out of Scope (v1.2)

- Configuração de templates de mensagem pelo painel (v1.2 usa templates fixos no código)
- Canal de comunicação diferente do Chatwoot
- Criação automática de conversa Chatwoot se não houver conversationId

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| MSG-01 | 7 | Planned |
| MSG-02 | 7 | Planned |
| MSG-03 | 7 | Planned |
| MSG-04 | 7 | Planned |
| MSG-05 | 7 | Planned |
| UX-01 | 8 | Planned |
| UX-02 | 8 | Planned |
| UX-03 | 8 | Planned |
