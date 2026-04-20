const testCreateQuote = async () => {
  const payload = {
    cliente: { nome: "Teste DB PublicURL", telefone: "12999999999", email: "teste@db.com" },
    vendedorNome: "Sistema",
    validade: "2 dias",
    prazoEntrega: "2026-04-10",
    condicaoPagamento: "À vista",
    observacoes: "Teste com persistência de publicUrl NO BANCO",
    itens: [
      {
        sequenciaitem: 1,
        produto: { descricaoproduto: "Produto Teste", descricaocurta: "Teste" },
        quantidadeitem: 2,
        valoritem: 150.50,
        valordesconto: 0,
        orcamentovalorfinalitem: 301,
      },
    ],
    carimbos: { quantidade_total: 0, itens: [] },
    totais: { desconto: 0, valoracrescimo: 0, valor: 301 },
    source: "MANUAL",
  };

  console.log("📤 Criando novo orçamento...\n");

  const res = await fetch("http://localhost:4000/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (res.status === 201) {
    const quoteId = data.body?.id;
    const internalId = data.body?.idorcamento_interno;
    const publicUrl = data.body?.documentoPdf?.publicUrl;

    console.log("✅ Orçamento criado com sucesso!");
    console.log(`   - ID do Banco: ${quoteId}`);
    console.log(`   - ID interno: ${internalId}`);
    console.log(`   - PublicUrl retornada: ${publicUrl ? "✓ SIM" : "✗ NÃO"}`);
    
    if (publicUrl) {
      console.log(`   - URL: ${publicUrl}\n`);
    }

    // Agora vou fazer GET para confirmar que publicUrl foi salva no banco
    console.log("🔍 Consultando banco de dados para confirmar persistência...\n");

    const getRes = await fetch(`http://localhost:4000/api/quotes/${quoteId}`);
    const quote = await getRes.json();

    const savedPublicUrl = quote.body?.documentoPdf?.[0]?.publicUrl;

    if (savedPublicUrl) {
      console.log("✅ PUBLIC URL SALVA NO BANCO COM SUCESSO!");
      console.log(`   URL no Banco: ${savedPublicUrl}`);
    } else {
      console.log("⚠️  PublicUrl NÃO foi salva no banco");
      console.log("   Documento salvo:", JSON.stringify(quote.body?.documentoPdf?.[0], null, 2));
    }
  } else {
    console.error("❌ Erro ao criar orçamento:");
    console.error(data);
  }
};

testCreateQuote().catch(console.error);
