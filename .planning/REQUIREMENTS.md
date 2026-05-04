# Requirements - v1.3 Estabilidade de Migrations no Docker Compose

Milestone: v1.3
Defined: 2026-05-03
Status: Active

---

## v1.3 Requirements

### Migrations (MIG)

- [x] MIG-01: Operador pode atualizar os containers com Docker Compose sem erro de migration ja aplicada
- [x] MIG-02: Backend executa migrations apenas quando o PostgreSQL estiver pronto para conexoes
- [x] MIG-03: Em falha de migration, logs exibem causa tecnica e comando de acao recomendado
- [x] MIG-04: Fluxo de startup nao entra em loop de restart por falha transitiva de banco nao pronto

### Operacao de Deploy (OPS)

- [x] OPS-01: Existe runbook de update com passos deterministicos para VPS (pull, up, verify)
- [x] OPS-02: Existe procedimento de verificacao pos-deploy para confirmar schema e saude da API

---

## Future Requirements (Next Milestones)

- RBAC por role (ADMIN / VENDEDOR / ATENDENTE)
- Relatorios e exportacao CSV de orcamentos
- Notificacoes em tempo real (WebSocket)
- Templates de mensagem configuraveis pelo painel

---

## Out of Scope (v1.3)

- Mudanca de banco (PostgreSQL permanece)
- Reescrita geral de deploy para Kubernetes
- Refactor completo do modulo quotes

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| MIG-01 | 9 | Complete |
| MIG-02 | 9 | Complete |
| MIG-03 | 9 | Complete |
| MIG-04 | 10 | Complete |
| OPS-01 | 10 | Complete |
| OPS-02 | 10 | Complete |
