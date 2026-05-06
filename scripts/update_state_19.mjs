import { readFileSync, writeFileSync } from 'fs';

const path = '.planning/STATE.md';
let content = readFileSync(path, 'utf8');

const CRLF = content.includes('\r\n');
const NL = CRLF ? '\r\n' : '\n';

// Update last updated date and current phase
content = content.replace(
  /Last updated: \d{4}-\d{2}-\d{2}/,
  'Last updated: 2026-05-05'
);
content = content.replace(
  /Current phase: —/,
  'Current phase: 19 (complete)'
);
content = content.replace(
  /Phase: Not started \(defining requirements\)/,
  'Phase: 19 - aprovacao-associada-caixa-athos (complete)'
);
content = content.replace(
  /Status: Defining requirements/,
  'Status: Phase 19 complete'
);
content = content.replace(
  /Last activity: 2026-05-05 - Milestone v1.8 started/,
  'Last activity: 2026-05-05 - Phase 19 complete (commits 8fd4df7, fd36b4e)'
);

// Add phase 19 to the table after phase 18
const phase18Row = '| 18 | Correcoes NFS-e - RPS e Tomador | complete (v1.7) |';
if (content.includes(phase18Row)) {
  const nl = CRLF ? '\r\n' : '\n';
  content = content.replace(
    phase18Row,
    phase18Row + nl + '| 19 | Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos | complete (v1.8) |'
  );
  console.log('Phase 19 row added');
}

writeFileSync(path, content, 'utf8');
console.log('STATE.md updated');
