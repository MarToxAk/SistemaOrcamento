const fs = require('fs');
const filePath = 'apps/backend/src/modules/integrations/athos/athos.service.ts';
let c = fs.readFileSync(filePath, 'utf8');

c = c.replace('client?.release();\r\n\r\n  async buscarClientes', 'client?.release();\r\n    }\r\n  }\r\n\r\n  async buscarClientes');
c = c.replace('client?.release();\n\n  async buscarClientes', 'client?.release();\n    }\n  }\n\n  async buscarClientes');

fs.writeFileSync(filePath, c, 'utf8');
console.log('athos.service.ts braces fixed');
