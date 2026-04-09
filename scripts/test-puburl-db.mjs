const payload = {
  cliente: { nome: "Teste pubURL no Banco", telefone: "12999999999", email: "teste@bomcusto.com" },
  vendedorNome: "Sistema",
  validade: "2 dias",
  prazoEntrega: "2026-04-10",
  condicaoPagamento: "À vista",
  observacoes: "Teste com persistência de publicUrl",
  itens: [
    {
      sequenciaitem: 1,
      produto: { descricaoproduto: "Teste Item", descricaocurta: "Item" },
      quantidadeitem: 1,
      valoritem: 100,
      valordesconto: 0,
      orcamentovalorfinalitem: 100,
    },
  ],
  carimbos: { quantidade_total: 0, itens: [] },
  totais: { desconto: 0, valoracrescimo: 0, valor: 100 },
  source: "MANUAL",
};

const run = async () => {
  const res = await fetch("http://localhost:4000/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  console.log("Status:", res.status);
  if (res.status === 201) {
    console.log("✓ Orçamento criado:", json.body?.idorcamento_interno);
    console.log("✓ PublicUrl retornada:", !!json.body?.documentoPdf?.publicUrl);
    if (json.body?.documentoPdf?.publicUrl) {
      console.log("  URL:", json.body.documentoPdf.publicUrl);
    }
  } else {
    console.error("Erro:", json);
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
