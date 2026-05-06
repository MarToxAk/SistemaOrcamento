const fs = require('fs');
const filePath = 'apps/backend/src/modules/integrations/athos/athos.service.ts';
let content = fs.readFileSync(filePath, 'utf8');

// The conflict block has:
// <<<<<<< HEAD
// ...buscarRelacaoOrcamentoVenda...
// =======
// ...buscarClientes...
// >>>>>>> origin/main

const conflictRegex = /<<<<<<< HEAD\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> origin\/main/g;

let resolved = content.replace(conflictRegex, (match, headSection, mainSection) => {
  // Keep both methods — HEAD first, then origin/main
  return headSection.trimEnd() + '\n\n' + mainSection.trimEnd();
});

if (resolved === content) {
  console.error('No conflict markers found or pattern did not match');
  process.exit(1);
}

fs.writeFileSync(filePath, resolved, 'utf8');
console.log('Conflict resolved: both methods kept');
