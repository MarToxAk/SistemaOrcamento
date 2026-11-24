---
phase: 53
plan: 03
status: complete
commit: 3dddf0f
---

# 53-03 — Rota admin e flag de deploy

- `POST athos/venda/de-orcamento/:idorcamento` com `@AdminOnly()` e throttle sensivel; corpo `{ idvendedor, idterminal, idcaixaMovimento, descontoCupom?, idformapagamento?, simular? }`; `simular` padrao TRUE.
- Erros tipados: 404, 409 (com `idvenda`), 422, 503, 500 generico sem SQL/host/credenciais.
- `ATHOS_VENDA_AUTOMATICA` (padrao false) nos dois compose e no `stack.env.example`.
- Sem gatilho automatico e sem ligacao com o resgate do cupom (`/cupons` continua manual).
- Backend inteiro: 1778 testes passando, 30 pulados; `tsc` limpo.
