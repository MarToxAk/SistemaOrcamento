// Fase 54 (plano 54-03): template Handlebars do comprovante interno do PIX (layout proprio, D-04/D-05).
// Todos os valores chegam ja formatados como string; apenas expressoes simples e o `if` nativo
// (sem helpers customizados). Compilado com noEscape false: texto do pagador sai escapado.
export const PIX_COMPROVANTE_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Comprovante PIX {{numeroOrcamento}}</title>
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0;background:#eef2f7;font-family:system-ui,-apple-system,Arial,sans-serif;color:#0b1220;font-size:14px;line-height:1.4}
  .card{width:480px;background:#fff;padding:24px 24px 18px}
  .topo{border-bottom:2px solid #0b1220;padding-bottom:10px;margin-bottom:14px}
  .empresa{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#5b6b80}
  .titulo{font-size:18px;font-weight:700;margin-top:2px}
  .destaque{background:#e8f6ee;border:1px solid #b7e1c8;border-radius:8px;padding:12px 14px;margin-bottom:14px;text-align:center}
  .destaque .rotulo{font-size:11px;text-transform:uppercase;color:#2f6b49;letter-spacing:.04em}
  .destaque .valor{font-size:28px;font-weight:800;color:#14532d}
  .destaque .situacao{font-size:12px;color:#2f6b49;margin-top:2px}
  .linha{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #e3e8ef}
  .linha .k{color:#5b6b80;font-size:12px;white-space:nowrap}
  .linha .v{text-align:right;font-weight:600;word-break:break-all}
  .linha .v.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;font-weight:500}
  .rodape{margin-top:14px;font-size:10px;color:#8a94a3;text-align:center}
</style>
</head>
<body>
<div class="card">
  <div class="topo">
    <div class="empresa">{{empresaNome}}</div>
    <div class="titulo">Comprovante de pagamento PIX</div>
  </div>

  <div class="destaque">
    <div class="rotulo">Valor pago</div>
    <div class="valor">{{valorPago}}</div>
    <div class="situacao">{{situacao}}</div>
  </div>

  <div class="linha"><span class="k">Orçamento</span><span class="v">#{{numeroOrcamento}}</span></div>
  {{#if desconto}}<div class="linha"><span class="k">Desconto PIX à vista</span><span class="v">{{desconto}}</span></div>{{/if}}
  <div class="linha"><span class="k">Total do orçamento</span><span class="v">{{totalOrcamento}}</span></div>
  <div class="linha"><span class="k">Data/hora</span><span class="v">{{dataHora}}</span></div>
  {{#if pagador}}<div class="linha"><span class="k">Pagador</span><span class="v">{{pagador}}</span></div>{{/if}}
  {{#if infoPagador}}<div class="linha"><span class="k">Mensagem do pagador</span><span class="v">{{infoPagador}}</span></div>{{/if}}
  <div class="linha"><span class="k">E2E</span><span class="v mono">{{e2eId}}</span></div>
  <div class="linha"><span class="k">TXID</span><span class="v mono">{{txid}}</span></div>

  <div class="rodape">
    Comprovante interno gerado pelo sistema a partir da notificação PIX da EFI.
    Não é o recibo oficial do banco.{{#if empresaCnpj}} {{empresaNome}} - CNPJ {{empresaCnpj}}.{{/if}}
  </div>
</div>
</body>
</html>`;
