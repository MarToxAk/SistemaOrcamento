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

### Decisões pós-research (2026-11-17)
- D-11: Juros e multa entram no boleto como **itens/linhas de cobrança a mais** ("Juros de mora", "Multa por atraso") somados ao principal — valor explícito para o cliente (o cálculo automático da EFI não mostra o valor, só cobra).
- D-12: Novo boleto é emitido COM `configurations.fine/interest` da EFI (mesmas taxas padrão) valendo **somente após o novo vencimento** — se o cliente atrasar de novo, incide juros e multa sobre o valor atualizado. **Mensagem informativa obrigatória** na observação/mensagem do boleto (campo `message` da EFI) **e no e-mail enviado**, ex.: "Valor atualizado com juros de R$ X e multa de R$ Y referentes ao vencimento original DD/MM. Em caso de novo atraso apos DD/MM, incidirao juros de 0,99% a.m. e multa de 2% sobre o valor atualizado."
- D-13 (A1): Vencimento original = `datavencimento` de **cada título no Athos**; cálculo por título.
- D-14: Ordem = **criar novo → persistir → cancelar original** (cancelamento estrito, sem apagar registro, marca `cancelado`).
- D-15: Pagamento do boleto original já cancelado → **apenas alerta** (log/aviso interno), sem cancelar o novo automaticamente.
- D-16: Editáveis = **taxas** (% juros a.m. e % multa); valores em R$ derivados. **Tetos de validação: juros ≤ 1% a.m., multa ≤ 2%** (backend e frontend; também na tela de configuração).
- D-17: Incluir **checkpoint humano de homologação** antes de produção: gerar boleto real de valor baixo na EFI e validar baixa no clone `athos-teste` (NUNCA no Athos de produção).
- D-18: `/configuracoes` não existe → criar `/configuracoes/cobranca` (PasswordGate/AdminShell) e item de menu.

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
