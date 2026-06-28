---
phase: 38
slug: aplica-o-de-defaults-na-cria-o-de-produto
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-06-28
---

# Phase 38 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| operador HTTP → ProdutoController → AthosProdutoService | DTO do operador (input não confiável) cruza para a montagem do INSERT | Campos de produto (texto/numérico/boolean), incl. fiscais |
| AthosProdutoService → tabela `produto` (Athos) | Escrita na única tabela permitida (exceção controlada v2.2) | Registro de produto |
| AthosDefaultsService → SELECT read-only do catálogo Athos | Leitura para cálculo de moda (Fase 37, fora de escopo de escrita) | Valores de moda (não sensíveis) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-38-01 | Tampering | Montagem do INSERT em `criarProduto` | medium | mitigate | Allowlist `optionalFields` hardcoded + placeholders `$N` parametrizados; novos campos default entram na allowlist estática (sem nomes de coluna vindos de input); valores validados por class-validator no DTO (V5). Confirmado no code-review. | closed |
| T-38-02 | Elevation of Privilege | Caminho de edição (`editarProduto`) | medium | mitigate | D-11: lógica de defaults vive SÓ em `criarProduto`, sem helper compartilhado; teste assert `getDefaults` não chamado por `editarProduto` (`toHaveBeenCalledTimes(0)`). Confirmado por grep do verifier + teste verde. | closed |
| T-38-03 | Information Disclosure | Linha de log D-12 | low | accept | Loga apenas os valores aplicados ao produto único em criação (aceitável por D-12), nunca a moda do catálogo inteiro (regra preservada da Fase 37). | closed |
| T-38-04 | Denial of Service | `getDefaults()` durante criação | low | mitigate | `getDefaults` usa cache de 24h e nunca lança por lógica de moda (Fase 37 D-13); falha de DB cai no catch existente → 500 sem escrita parcial. | closed |
| T-38-SC | Tampering | Dependências npm | low | accept | Nenhuma instalação de pacote nesta fase — sem nova superfície de supply chain; reúsa apenas módulos internos já entregues. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Nenhuma ameaça em severidade `high`/`critical`; todas as 5 estão fechadas (mitigadas-no-código ou risco aceito documentado). `threats_open: 0`.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-38-01 | T-38-03 | Log dos defaults aplicados ao produto único em criação é aceitável para auditoria (decisão D-12); não expõe a moda do catálogo inteiro. | José J | 2026-06-28 |
| AR-38-02 | T-38-SC | Sem instalação de pacotes nesta fase; sem nova superfície de supply chain. | José J | 2026-06-28 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-28 | 5 | 5 | 0 | /gsd-secure-phase (L1 short-circuit — register authored at plan time, ASVS L1, 0 threats ≥ high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-28
