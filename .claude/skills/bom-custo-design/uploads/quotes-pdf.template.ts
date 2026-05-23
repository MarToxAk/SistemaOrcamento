export const QUOTES_PDF_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Orçamento de Impressão</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        :root {
            --white: #ffffff;
            --bg-soft: #f8f9fa;
        }
        html, body {
            background: var(--bg-soft);
            width: 100%;
            margin: 0;
            padding: 0;
            font-size: 13px;
        }
        .container.my-0 {
            max-width: 210mm;
            width: 210mm;
            margin: 0 auto 0 auto;
            background: var(--white);
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            border-radius: 8px;
            padding: 0;
        }
        .orcamento-section {
            padding: 1.25rem 1.5rem;
            font-size: 0.82rem;
        }
        @media print {
            html, body {
                width: 210mm;
                height: 297mm;
                margin: 0;
                padding: 0;
                background: white !important;
            }
            .container.my-0 {
                width: 210mm;
                min-height: 297mm;
                max-width: 210mm;
                margin: 0 auto 0 auto;
                box-shadow: none;
                border-radius: 0;
                page-break-after: always;
                padding-top: 0 !important;
            }
            body {
                margin-top: 0 !important;
                padding-top: 0 !important;
            }
            html {
                margin-top: 0 !important;
                padding-top: 0 !important;
            }
        }
        .orcamento-header {
            background: linear-gradient(135deg, #c5f2e8 0%, #cbe1f9 25%, #e7d8f9 50%, #f9e7f5 75%, #f0cacb 100%);
            color: #222222;
            border-radius: 8px 8px 0 0;
            padding: 0.75rem 1rem;
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            align-items: center;
            justify-content: space-between;
        }
        .orcamento-header h3 {
            font-size: 1rem;
            font-weight: 700;
            margin-bottom: 0;
        }
        .orcamento-header h5 {
            font-size: 0.88rem;
            font-weight: 700;
            margin-bottom: 0.15rem;
        }
        .orcamento-header .small {
            font-size: 0.72rem;
        }
        .logo {
            max-width: 180px !important;
            max-height: 80px !important;
            width: auto !important;
            height: auto !important;
            background: linear-gradient(180deg, var(--white), var(--bg-soft));
            border-radius: 8px;
            padding: 6px;
            display: block;
        }
        .cliente-dados-compacto {
            font-size: 0.80rem;
            font-weight: 400;
        }
        .cliente-dados-compacto h5 {
            font-size: 0.92rem;
            margin-bottom: 0.13rem;
            font-weight: 700;
        }
        .orcamento-table th, .orcamento-table td {
            padding: 0.3rem 0.5rem;
            font-size: 0.78rem;
        }
        .orcamento-table th {
            background: #f9e7f5;
            color: #222;
            border-bottom: 1px solid #f0cacb;
        }
        .orcamento-table td {
            border-bottom: 1px solid #f3f3f3;
        }
        .orcamento-total {
            font-size: 0.76rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: .4rem;
            color: #d9534f;
        }
        .valor-destaque {
            font-size: 0.9rem;
            font-weight: 800;
            color: #ee3637;
        }
        .total-label {
            color: #d9534f;
            font-size: 0.74rem;
        }
        .bg-light.p-3.rounded {
            background: #f9f7ed;
            color: #222;
            font-size: 0.76rem;
            padding: 0.5rem;
        }
        .assinatura-bloco {
            margin-top: 0.18rem;
            margin-bottom: 0.01rem;
        }
        .assinatura-bloco .border-top {
            margin-top: 0.05rem;
            padding-top: 0.05rem;
        }
        .assinatura-bloco span, .assinatura-bloco div {
            font-size: 0.60rem;
        }
        .border.rounded.p-2 {
            background: #fff;
            font-size: 0.76rem;
            border: 1px solid #e7d8f9;
            padding: 0.35rem 0.6rem;
        }
    </style>
</head>
<body>
<div class="container my-0">
    <div class="orcamento-header d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center">
            <img src="https://autopyweb.com.br/logo_new.svg" alt="Logo Bom Custo" class="logo me-3">
            <div>
                <h3 class="mb-0">Bom Custo Papelaria &amp; Gráfica Rápida LTDA</h3>
                <div class="small">CNPJ: 62.391.927/0001-57</div>
                <div class="small">Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê</div>
                <div class="small">Ilhabela - SP, CEP: 11633-078</div>
                <div class="small">
                    Telefones: (12) 99648-4918 / (12) 3896-1474 / (12) 99678-2405<br>
                    E-mail: orcamento@bomcustoilhabela.com.br
                </div>
            </div>
        </div>
        <div class="text-end">
            <h5 class="mb-1">Orçamento Nº {{idorcamento}}</h5>
            <div>{{dataorcamento}}</div>
        </div>
    </div>
    <div class="orcamento-section">
        <div class="row mb-4">
            <div class="col-md-6 cliente-dados-compacto">
                <h5>{{cliente.nome}}</h5>
                <div>Telefone: {{cliente.telefone}}</div>
                <div>E-mail: {{cliente.email}}</div>
            </div>
        </div>
        <p>Prezado cliente, apresentamos nossa Orçamento para sua avaliação.</p>
        <div class="table-responsive">
            <table class="table orcamento-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Descrição</th>
                        <th class="text-center">Quant.</th>
                        <th class="text-center">Valor Unit.</th>
                        <th class="text-center">Valor Original</th>
                        <th class="text-center">Valor Total</th>
                    </tr>
                </thead>
                <tbody>
                {{#each itens}}
                <tr>
                    <td>{{sequenciaitem}}</td>
                    <td>
                        {{produto.descricaoproduto}}
                        {{#if produto.descricaocurta}}<br><small>{{produto.descricaocurta}}</small>{{/if}}
                    </td>
                    <td class="text-center">{{quantidadeitem}}</td>
                    <td class="text-center">R$&nbsp;{{valoritem}}</td>
                    <td class="text-center">R$&nbsp;{{orcamentovalorfinalitem}}</td>
                    <td class="text-center">R$&nbsp;{{orcamentovalorfinalitem}}</td>
                </tr>
                {{/each}}
                </tbody>
            </table>
        </div>
        {{#if carimbos.itens.length}}
        <div class="mt-4">
            <h6 style="color: #333; margin-bottom: 0.75rem; font-weight: 600; font-size: 0.95rem;">
                <i class="bi bi-stamp"></i> Visualização de Carimbos
            </h6>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                {{#each carimbos.itens}}
                <div style="border: 2px solid #ccc; border-radius: 6px; padding: 12px; background: white; min-height: 100px;">
                    <div style="font-weight: bold; color: #d9534f; font-size: 14px; margin-bottom: 6px;">Carimbo {{numero}}</div>
                    <div style="color: #333; font-size: 12px; line-height: 1.4; margin-bottom: 6px; text-align: center; white-space: pre-wrap;">{{descricao}}</div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px;">
                        <span style="color: #0066cc;">{{dimensoes}}</span>
                        <span style="color: #d9534f;">{{carimbo}}</span>
                    </div>
                </div>
                {{/each}}
            </div>
        </div>
        {{/if}}
        <div class="row mt-4">
            <div class="col-md-6">
                <div class="bg-light p-3 rounded">
                    <strong>Observações do Orçamento</strong>
                    <p class="mb-0">{{observacoes}}</p>
                </div>
            </div>
            <div class="col-md-6 text-end">
                <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-end;">
                    <div class="orcamento-total" style="width: 100%; justify-content: flex-end;">
                        <div class="total-label" style="width: 100%;">Valor Original:</div>
                        <div><span id="valorOriginalTotal" style="font-size: 1rem; font-weight: 600;">R$&nbsp;{{totais.valor}}</span></div>
                    </div>
                    <div class="orcamento-total" style="width: 100%; justify-content: flex-end; color: #d9534f;">
                        <div class="total-label" style="width: 100%; color: #d9534f;">Desconto:</div>
                        <div><span id="valorDescontoTotal" style="font-size: 1rem; font-weight: 600;">{{#if totais.desconto}}R$&nbsp;{{totais.desconto}}{{else}}Isento{{/if}}</span></div>
                    </div>
                    <hr style="width: 60%; margin: 0.5rem 0;border-top: 2px solid #ccc;">
                    <div class="orcamento-total" style="width: 100%; justify-content: flex-end;">
                        <div class="total-label">Total:</div>
                        <div><span class="valor-destaque">R$&nbsp;{{totais.valor}}</span></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="row mt-4 g-3">
            <div class="col-md-6">
                <div class="border rounded p-2"><strong>Vendedor:</strong> {{vendedorNome}}</div>
            </div>
            <div class="col-md-6">
                <div class="border rounded p-2"><strong>Validade da Orçamento:</strong> {{validade}}</div>
            </div>
            <div class="col-md-6">
                <div class="border rounded p-2" style="color: #d9534f;"><strong>Prazo de Entrega:</strong> {{prazoEntrega}}</div>
            </div>
            <div class="col-md-6">
                <div class="border rounded p-2"><strong>Cond. pagamento:</strong> {{condicaoPagamento}}</div>
            </div>
        </div>
        <div class="mt-4">
            <p>Estamos à disposição e aguardamos seu retorno.<br>Atenciosamente,</p>
            <div style="margin-top: 24px; text-align: center;">
                {{#if aceitarUrl}}<a href="{{aceitarUrl}}" style="background: #28a745; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-right: 12px;">Aceitar Orçamento</a>{{/if}}
                {{#if recusarUrl}}<a href="{{recusarUrl}}" style="background: #dc3545; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Recusar Orçamento</a>{{/if}}
            </div>
        </div>
        <div class="text-center mt-5 mb-3 assinatura-bloco">
            <!-- Assinatura removida conforme solicitado -->
        </div>
    </div>
</div>
</body>
</html>`;
