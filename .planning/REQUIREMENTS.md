# Requirements - Sistema de Orcamento BomCusto

Milestone: v1.8 - Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos
Date: 2026-05-05

---

## v1.8 Requirements

### Regra de Aprovacao

- [ ] **APR-01**: Orcamento so pode ser aprovado/entrar em producao quando estiver associado a cliente Athos valido (idcliente > 0)
- [ ] **APR-02**: Tentativa de aprovacao sem associacao obrigatoria retorna erro 400 com mensagem clara e sem texto quebrado
- [ ] **APR-03**: Mensagem de bloqueio distingue motivo de recusa: sem associacao, sem pagamento, ou ambos

### Conciliacao Caixa Athos

- [ ] **ATHC-01**: Ao abrir um orcamento (GET /quotes/:id), backend verifica pagamento no Athos usando relacao_orcamento_venda
- [ ] **ATHC-02**: Consulta considera vinculo idorcamento -> idvenda em relacao_orcamento_venda e atualiza status local quando pagamento confirmado
- [ ] **ATHC-03**: Falhas de consulta Athos geram logs diagnosticos sem quebrar resposta do endpoint

### Gatilho de Pagamento

- [ ] **TRG-01**: Insercao/atualizacao em relacao_orcamento_venda aciona o mesmo processo de conciliacao usado para PIX/cartao
- [ ] **TRG-02**: Fluxo de trigger evita processamento duplicado (idempotencia) por orcamento/venda
- [ ] **TRG-03**: Atualizacao por trigger respeita as mesmas transicoes de status do fluxo existente de pagamento

### Qualidade de Texto

- [ ] **TXT-01**: Textos quebrados/mojibake em mensagens de aprovacao, validacao e pagamento sao corrigidos para UTF-8
- [ ] **TXT-02**: Logs e respostas de erro relacionados a aprovacao/pagamento ficam consistentes e legiveis

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Alterar schema principal de quotes para nova modelagem de aprovacao | Escopo v1.8 e corretivo/evolutivo sobre fluxo atual |
| Reintroduzir n8n para roteamento de gatilhos | Diretriz do projeto e manter tudo no backend principal |
| Criar novo meio de pagamento fora do fluxo Athos/PIX/cartao existente | Nao necessario para corrigir aprovacao e conciliacao atual |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| APR-01 | 19 | pending |
| APR-02 | 19 | pending |
| APR-03 | 19 | pending |
| ATHC-01 | 19 | pending |
| ATHC-02 | 19 | pending |
| ATHC-03 | 19 | pending |
| TRG-01 | 19 | pending |
| TRG-02 | 19 | pending |
| TRG-03 | 19 | pending |
| TXT-01 | 19 | pending |
| TXT-02 | 19 | pending |

---
*Requirements defined: 2026-05-05*
*Last updated: 2026-05-05*
