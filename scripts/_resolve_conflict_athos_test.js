const fs = require('fs');
const filePath = 'apps/backend/src/modules/integrations/athos/athos.service.test.ts';
let content = fs.readFileSync(filePath, 'utf8');

const conflictRegex = /<<<<<<< HEAD\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> origin\/main/g;

let count = 0;
let resolved = content.replace(conflictRegex, (match, headSection, mainSection) => {
  count++;
  return headSection.trimEnd() + '\n\n' + mainSection.trimEnd();
});

if (count === 0) {
  console.error('No conflict markers found');
  process.exit(1);
}

fs.writeFileSync(filePath, resolved, 'utf8');
console.log(`Resolved ${count} conflict(s) in ${filePath}`);
