# Phase 50: Contas a receber — boleto atualizado com juros e multa - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning
**Source:** Decisões do usuário em conversa (texto numerado)

<domain>
## Phase Boundary

Na área de Contas a Receber, o operador gera um **boleto atualizado** (EFI) para um título vencido, com juros e multa calculados desde o vencimento original registrado no sistema até o novo vencimento, para enviar ao cliente. Inclui tela de configuração das taxas padrão.

</domain>

<decisions>
## Implementation Decisions

### Novo vencimento
- D-01: O novo vencimento só pode ser **hoje** ou o **próximo dia útil** (ex.: hoje 17/11 terça → máximo 18/11; hoje sexta → máximo segunda). Qualquer data posterior é **bloqueada** (validar no backend E no frontend).
- D-02: "Dia útil" = segunda a sexta (feriados: avaliar no research se há util existente; se não, sáb/dom já basta para v1).

### Cálculo
- D-03: Base do cálculo = **vencimento original registrado no sistema** (ex.: venc. 10/11) até o novo vencimento escolhido.
- D-04: **Juros pro rata por dia**: (taxa mensal / 30) × dias de atraso × valor original. Padrão 0,99% ao mês.
- D-05: **Multa** fixa sobre o valor original: padrão 2%.
- D-06: Juros e multa são **editáveis no momento da geração** (pré-preenchidos com o padrão).

### Configuração
- D-07: Tela de configuração das taxas padrão (juros % a.m. e multa %) dentro de `/configuracoes` (página já existente no frontend). Padrões iniciais: 0,99% e 2%. Persistir no banco (Prisma).

### Boleto original
- D-08: Ao gerar o boleto atualizado, **cancelar o boleto original na EFI** — o cliente fica com um único boleto válido. Registrar o vínculo original → atualizado.

### Athos
- D-09: Quando o boleto atualizado for pago, dar **baixa no título original no Athos lançando juros e multa como encargos** (reaproveitar `athos-baixa-encargos.util.ts` / fluxo de baixa existente da cobrança).

### Envio ao cliente
- D-10: Enviar pelo **fluxo de e-mail de boleto já existente** (com CC padrão — `email-envio.service.ts`, `CobrancaEmailCcPadrao`).

### Claude's Discretion
- Arredondamento (centavos, 2 casas, half-up), exibição do detalhamento (valor original, dias, juros, multa, total) na tela antes de confirmar.
- Se o boleto já estiver pago/cancelado, bloquear geração.

</decisions>

<canonical_refs>
## Canonical References

- `apps/backend/src/modules/cobranca/` — cobrança, boletos EFI, baixa Athos, e-mail de boleto
- `apps/backend/src/modules/integrations/efi/` — emissão/cancelamento de boleto EFI
- `apps/backend/src/modules/integrations/athos/athos-baixa-encargos.util.ts` — baixa com encargos
- `apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts`
- `apps/frontend/.../contas-receber/`, `.../configuracoes/`
- `apps/backend/prisma/schema.prisma` — CobrancaBoleto, CobrancaBoletoTitulo

</canonical_refs>

<deferred>
## Deferred Ideas

- Envio do boleto atualizado via Chatwoot/WhatsApp.
- Calendário de feriados (se não houver util pronto).

</deferred>

---

*Phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa*
*Context gathered: 2026-11-17 via conversa*
