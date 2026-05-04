# Requirements - Sistema de Orcamento BomCusto

Milestone: v1.6 — Correcao NFS-e: Calculo de Desconto e Valor Final
Date: 2026-05-04

---

## v1.6 Requirements

### Correcao do Modal NFS-e

- [ ] **NFSC-01**: Usuario ve o campo "valor total" pre-preenchido com o total real do orcamento ao abrir a secao de desconto no modal NFS-e
- [ ] **NFSC-02**: Usuario digita um percentual de desconto e os campos R$ desconto e valor total atualizam automaticamente com base no total correto do orcamento
- [ ] **NFSC-03**: Usuario digita um valor de desconto em R$ e os campos % e valor total atualizam automaticamente com base no total correto do orcamento
- [ ] **NFSC-04**: Usuario digita um valor total e os campos % e R$ desconto atualizam automaticamente; sistema impede valor total maior que o total do orcamento
- [ ] **NFSC-05**: Ao emitir a NFS-e com desconto ativo, o valor pos-desconto e enviado corretamente ao backend e ao SOAP da NFS-e

### Future Requirements

- Desconto por item individual na NFS-e (fora do escopo v1.6)
- Historico de descontos aplicados por NFS-e (fora do escopo v1.6)

### Out of Scope

- Recalculo retroativo de NFS-e ja emitida
- Alteracao do modelo de desconto no backend (segue logica atual)
- Mudanca no formato do XML SOAP alem do valor de desconto

---

## Traceability

| REQ-ID  | Phase | Status |
|---------|-------|--------|
| NFSC-01 | 17    | pending |
| NFSC-02 | 17    | pending |
| NFSC-03 | 17    | pending |
| NFSC-04 | 17    | pending |
| NFSC-05 | 17    | pending |
