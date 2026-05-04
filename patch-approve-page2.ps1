$path = "apps\frontend\src\app\orcamento\[id]\approve\page.tsx"
$lines = Get-Content -LiteralPath $path
$output = [System.Collections.Generic.List[string]]::new()
$stateLines = @(
    "  const [quoteTotal, setQuoteTotal] = useState<number | null>(null);",
    "  const [quoteItems, setQuoteItems] = useState<Array<{",
    "    descricao: string;",
    "    quantidade: number;",
    "    valorUnitario: number;",
    "    subtotal: number;",
    "  }>>([]);"
)
$setterLines = @(
    "        setQuoteTotal(data?.body?.totais?.valor ?? null);",
    "        setQuoteItems(",
    "          (data?.body?.itens ?? []).map((item: Record<string, unknown>) => ({",
    "            descricao:",
    '              String((item.produto as Record<string, unknown>)?.descricaocurta ?? "") ||',
    '              String((item.produto as Record<string, unknown>)?.descricaoproduto ?? ""),',
    "            quantidade: Number(item.quantidadeitem ?? 0),",
    "            valorUnitario: Number(item.valoritem ?? 0),",
    "            subtotal: Number(item.orcamentovalorfinalitem ?? 0),",
    "          }))",
    "        );"
)
$tL = @(
    '                {quoteItems.length > 0 && (',
    '                  <div className="mb-4 text-start">',
    '                    <table className="table table-sm table-borderless mb-1">',
    '                      <thead>',
    '                        <tr className="small text-muted border-bottom">',
    "                          <th>Item</th>",
    '                          <th className="text-end">Qtd</th>',
    '                          <th className="text-end">Unit.</th>',
    '                          <th className="text-end">Total</th>',
    "                        </tr>",
    "                      </thead>",
    "                      <tbody>",
    "                        {quoteItems.map((item, idx) => (",
    '                          <tr key={idx} className="small">',
    "                            <td>{item.descricao}</td>",
    '                            <td className="text-end">{item.quantidade}</td>',
    '                            <td className="text-end">',
    '                              {item.valorUnitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}',
    "                            </td>",
    '                            <td className="text-end">',
    '                              {item.subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}',
    "                            </td>",
    "                          </tr>",
    "                        ))}",
    "                      </tbody>",
    "                    </table>",
    "                    {quoteTotal !== null && (",
    '                      <div className="text-end fw-semibold small border-top pt-1">',
    '                        Total:{" "}',
    '                        {quoteTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}',
    "                      </div>",
    "                    )}",
    "                  </div>",
    "                )}"
)
$iS=$false;$iSe=$false;$iT=$false
foreach ($line in $lines) {
    $output.Add($line)
    if (-not $iS -and $line.TrimEnd() -eq '  const [errorMessage, setErrorMessage] = useState<string>("");') { foreach ($sl in $stateLines) { $output.Add($sl) }; $iS=$true; Write-Host "OK states" }
    if (-not $iSe -and $line.TrimEnd() -eq '        setClientName(data?.body?.cliente?.nome ?? "");') { foreach ($sl in $setterLines) { $output.Add($sl) }; $iSe=$true; Write-Host "OK setters" }
    if (-not $iT -and $line.TrimEnd() -eq '                {clientName && <div className="text-muted mb-4 small">{clientName}</div>}') { foreach ($sl in $tL) { $output.Add($sl) }; $iT=$true; Write-Host "OK table" }
}
if (-not $iS -or -not $iSe -or -not $iT) { Write-Error "A insertion point NOT found: states=$iS setters=$iSe table=$iT"; exit 1 }
Set-Content -LiteralPath $path -Value $output -Encoding UTF8
Write-Host "Done. Lines: $($output.Count)"
