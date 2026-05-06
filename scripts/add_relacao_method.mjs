import { readFileSync, writeFileSync, statSync } from 'fs';

const path = 'apps/backend/src/modules/integrations/athos/athos.service.ts';
let content = readFileSync(path, 'utf8');

const newMethod = `
  async buscarRelacaoOrcamentoVenda(idorcamento: number): Promise<{ idvenda: number | null }> {
    this.logger.log(\`buscarRelacaoOrcamentoVenda: idorcamento=\${idorcamento}\`);
    const pool = this.getPool();
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      const result = await client.query(
        'SELECT idvenda FROM relacao_orcamento_venda WHERE idorcamento = $1 ORDER BY idrelataocaorcamentovenda DESC LIMIT 1',
        [idorcamento],
      );
      if (result.rows.length === 0) {
        this.logger.log(\`buscarRelacaoOrcamentoVenda: nenhuma venda encontrada para idorcamento=\${idorcamento}\`);
        return { idvenda: null };
      }
      const raw = result.rows[0].idvenda;
      const idvenda = typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : Number.isFinite(Number(raw)) ? Number(raw) : null;
      this.logger.log(\`buscarRelacaoOrcamentoVenda: idorcamento=\${idorcamento} -> idvenda=\${idvenda}\`);
      return { idvenda };
    } catch (error) {
      this.logger.warn(
        \`buscarRelacaoOrcamentoVenda: erro para idorcamento=\${idorcamento}: \${error instanceof Error ? error.message : String(error)}\`,
      );
      return { idvenda: null };
    } finally {
      client?.release();
    }
  }
`;

// Insert before the last closing brace of the class
const lastBrace = content.lastIndexOf('\n}');
if (lastBrace === -1) {
  console.error('Could not find closing brace of class');
  process.exit(1);
}

content = content.substring(0, lastBrace) + '\n' + newMethod + '\n}';
writeFileSync(path, content, 'utf8');
console.log('Done. File size:', statSync(path).size);
