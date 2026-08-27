// Template Handlebars do DANFSe (documento auxiliar em PDF da NFS-e Nacional).
// Layout simplificado inspirado no padrao DANFSe 2.0 (NT 008/2026): blocos de
// Identificacao, Prestador, Tomador, Servico e Valores. Nao reproduz o leiaute
// oficial pixel a pixel, mas cobre todos os campos fiscais exigidos.
export const DANFSE_PDF_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>DANFSe {{numeroNfse}}</title>
<style>
  @page { size: A4; margin: 0; }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0;font-family:system-ui,-apple-system,Arial,sans-serif;color:#0b1220;background:#fff;font-size:10.5pt;line-height:1.4}
  .page{padding:14mm 14mm 10mm}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0b1220;padding-bottom:8px;margin-bottom:12px}
  .header-left{display:flex;align-items:center;gap:10px}
  .header-left img{height:40px;max-width:140px;object-fit:contain}
  .header-title{text-align:center;flex:1}
  .header-title h1{font-size:13pt;margin:0}
  .header-title span{font-size:8.5pt;color:#5b6b80}
  .header-right{text-align:right;font-size:9pt;color:#5b6b80}
  .box{border:1px solid #cfd6e0;border-radius:4px;padding:8px 10px;margin-bottom:10px}
  .box-title{font-size:8pt;font-weight:700;text-transform:uppercase;color:#5b6b80;margin-bottom:4px;letter-spacing:.03em}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
  .field{margin-bottom:2px}
  .field label{display:block;font-size:7.5pt;color:#8a94a3;text-transform:uppercase}
  .field div{font-size:9.5pt}
  .valores{display:flex;justify-content:flex-end;gap:24px;margin-top:6px}
  .valores .item{text-align:right}
  .valores .item label{display:block;font-size:8pt;color:#5b6b80}
  .valores .item .num{font-size:12pt;font-weight:700}
  .chave{font-family:monospace;font-size:9pt;word-break:break-all;background:#f4f6f9;padding:6px 8px;border-radius:4px;margin-top:10px}
  .footer{margin-top:14px;font-size:8pt;color:#8a94a3;text-align:center}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      {{#if empresaLogoUrl}}<img src="{{empresaLogoUrl}}" alt="logo">{{/if}}
    </div>
    <div class="header-title">
      <h1>DANFSe</h1>
      <span>Documento Auxiliar da Nota Fiscal de Serviço Eletrônica</span>
    </div>
    <div class="header-right">
      <div>NFS-e Nº {{numeroNfse}}</div>
      <div>{{dataEmissao}}</div>
      <div>{{municipio}}</div>
    </div>
  </div>

  <div class="box">
    <div class="box-title">Prestador de Serviços</div>
    <div class="grid">
      <div class="field"><label>Razão Social</label><div>{{prestador.nome}}</div></div>
      <div class="field"><label>CNPJ</label><div>{{prestador.cnpj}}</div></div>
      <div class="field" style="grid-column: 1 / -1"><label>Endereço</label><div>{{prestador.endereco}}</div></div>
    </div>
  </div>

  <div class="box">
    <div class="box-title">Tomador de Serviços</div>
    <div class="grid">
      <div class="field"><label>Nome / Razão Social</label><div>{{tomador.nome}}</div></div>
      <div class="field"><label>CPF/CNPJ</label><div>{{tomador.documento}}</div></div>
    </div>
  </div>

  <div class="box">
    <div class="box-title">Discriminação do Serviço</div>
    <div class="field"><div>{{servico.descricao}}</div></div>
    <div class="field" style="margin-top:6px"><label>Código de Tributação Nacional</label><div>{{servico.codigoTributacaoNacional}}</div></div>
  </div>

  <div class="box">
    <div class="box-title">Valores</div>
    <div class="valores">
      {{#if valores.aliquotaIssqn}}
      <div class="item"><label>Alíquota ISSQN</label><div class="num">{{valores.aliquotaIssqn}}%</div></div>
      {{/if}}
      <div class="item"><label>Valor do Serviço</label><div class="num">{{valores.servico}}</div></div>
      <div class="item"><label>Valor Líquido</label><div class="num">{{valores.liquido}}</div></div>
    </div>
  </div>

  <div class="chave">Chave de Acesso: {{chaveAcesso}}</div>

  <div class="footer">
    Consulte a autenticidade desta NFS-e em nfse.gov.br/consultapublica informando a chave de acesso acima.
  </div>
</div>
</body>
</html>`;
