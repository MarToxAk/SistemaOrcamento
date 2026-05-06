const fs = require('fs');
const path = '.planning/PROJECT.md';
let content = fs.readFileSync(path, 'utf8');

// 1. Update Last Shipped Milestone section
const lastShippedNew = [
  '## Last Shipped Milestone: v1.8 - Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos',
  '',
  'Shipped em 2026-05-05.',
  '',
  'Entregas principais:',
  '- Guard EM_PRODUCAO: aprovacao/producao so ocorre com associacao Athos valida e pagamento confirmado',
  '- Conciliacao caixa via relacao_orcamento_venda ao abrir orcamento (fire-and-forget)',
  '- Badge "Pago no Caixa - Venda #N" na pagina publica do cliente',
  '- Notificacao Chatwoot ao confirmar pagamento via caixa',
  '- Mensagens de erro em ASCII, logs diagnosticos estruturados',
  '',
  '',
].join('\n');

const lastShippedMatch = content.match(/## Last Shipped Milestone:.*?(?=## Current Milestone:)/s);
if (!lastShippedMatch) { console.error('Last Shipped section not found'); process.exit(1); }
content = content.replace(lastShippedMatch[0], lastShippedNew);

// 2. Update Current Milestone section
const currentNew = [
  '## Current Milestone: v1.9 - Relatorios e Exportacao CSV',
  '',
  '**Goal:** Entregar visoes operacionais e exportacao CSV para acompanhamento comercial e financeiro.',
  '',
  '**Target features:**',
  '- Exportacao CSV de orcamentos com filtros basicos',
  '- Campos essenciais: orcamento, cliente, status, valores, datas',
  '- Performance preservada nas telas principais',
  '',
  '',
].join('\n');

const currentMatch = content.match(/## Current Milestone: v1\.8.*?(?=## Requirements)/s);
if (!currentMatch) { console.error('Current Milestone section not found'); process.exit(1); }
content = content.replace(currentMatch[0], currentNew);

// 3. Update last updated footer
content = content.replace(
  /\*Last updated:.*$/m,
  '*Last updated: 2026-05-05 after v1.8 milestone - v1.9 started*'
);

fs.writeFileSync(path, content, 'utf8');
console.log('PROJECT.md updated OK');
