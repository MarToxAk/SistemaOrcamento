const fs = require('fs');

const filePath = 'apps/backend/src/modules/integrations/efi/efi.service.ts';
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
  ['// Envio de mensagem automÃ¡tica ao cliente via Chatwoot com dados do orÃ§amento', '// Envio de mensagem automatica ao cliente via Chatwoot com dados do orcamento'],
  ['const itensList = ((body as any).itens ?? []).slice(0, 10).map((it: any) => `â€¢ ${it.produto?.descricaoproduto ?? it.produto?.descricaocurta ?? "Item"} (${it.quantidadeitem}x) â€” ${Number(it.orcamentovalorfinalitem ?? it.orcamentovalorfinalitem ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);', 'const itensList = ((body as any).itens ?? []).slice(0, 10).map((it: any) => `- ${it.produto?.descricaoproduto ?? it.produto?.descricaocurta ?? "Item"} (${it.quantidadeitem}x) - ${Number(it.orcamentovalorfinalitem ?? it.orcamentovalorfinalitem ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);'],
  ['let mensagem = `OlÃ¡, ${clienteNome}. `;', 'let mensagem = `Ola, ${clienteNome}. `;'],
  ['// Detecta se o pagamento recebido corresponde Ã  metade do total (entrada 50%)', '// Detecta se o pagamento recebido corresponde a metade do total (entrada 50%)'],
  ['mensagem += `\\n\\nðŸ“‹ OrÃ§amento #${numero}`;', 'mensagem += `\\n\\nOrcamento #${numero}`;'],
  ['mensagem += `\\n\\nðŸ’° Total: ${fmt(total)}`;', 'mensagem += `\\n\\nTotal: ${fmt(total)}`;'],
  ['mensagem += "Sua arte serÃ¡ enviada para aprovaÃ§Ã£o. Assim que aprovada, daremos continuidade Ã  produÃ§Ã£o.";', 'mensagem += "Sua arte sera enviada para aprovacao. Assim que aprovada, daremos continuidade a producao.";'],
  ['mensagem += "Seu pedido serÃ¡ enviado para produÃ§Ã£o. O restante do pagamento deverÃ¡ ser realizado na loja no momento da retirada.";', 'mensagem += "Seu pedido sera enviado para producao. O restante do pagamento devera ser realizado na loja no momento da retirada.";'],
  ['mensagem += "Seu pedido serÃ¡ enviado para produÃ§Ã£o.";', 'mensagem += "Seu pedido sera enviado para producao.";'],
  ['mensagem += "Aguardaremos a confirmaÃ§Ã£o do restante do pagamento para prosseguir.";', 'mensagem += "Aguardaremos a confirmacao do restante do pagamento para prosseguir.";'],
  ['mensagem += `\\n\\nðŸ“„ PDF: ${safePdfUrl}`;', 'mensagem += `\\n\\nPDF: ${safePdfUrl}`;'],
  ['this.logger.warn(`Falha ao notificar cliente via Chatwoot apÃ³s pagamento: ${err instanceof Error ? err.message : err}`);', 'this.logger.warn(`Falha ao notificar cliente via Chatwoot apos pagamento: ${err instanceof Error ? err.message : err}`);'],
];

let changed = 0;
for (const [from, to] of replacements) {
  if (content.includes(from)) {
    content = content.replace(from, to);
    changed++;
  }
}

if (changed === 0) {
  console.error('Nenhuma substituicao aplicada.');
  process.exit(1);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`Substituicoes aplicadas: ${changed}`);
