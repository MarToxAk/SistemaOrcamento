"""Fase 21 - Plano 01: adiciona busca Athos no modal NFS-e do frontend"""
import pathlib, sys

ROOT = pathlib.Path(__file__).parent.parent
p = ROOT / "apps/frontend/src/app/orcamento/[id]/page.tsx"
c = p.read_text(encoding="utf-8")

# ============================================================
# 1. Adicionar 5 novos estados após nfseValorTotal
# ============================================================
old_states = '  const [nfseValorTotal, setNfseValorTotal] = useState("");'
new_states = (
    '  const [nfseValorTotal, setNfseValorTotal] = useState("");\n'
    '  const [nfseAthosQuery, setNfseAthosQuery] = useState("");\n'
    '  const [nfseAthosResults, setNfseAthosResults] = useState<Array<{\n'
    '    idcliente: number;\n'
    '    tipoPessoa: "fisico" | "juridico";\n'
    '    nome: string;\n'
    '    documento: string | null;\n'
    '    endereco: { logradouro: string; numero: string; bairro: string; cep: string; codigoMunicipio: string; uf: string } | null;\n'
    '  }>>([]);\n'
    '  const [nfseAthosSearching, setNfseAthosSearching] = useState(false);\n'
    '  const [nfseClienteAthosSelecionado, setNfseClienteAthosSelecionado] = useState<number | null>(null);\n'
    '  const [nfseAthosError, setNfseAthosError] = useState("");'
)
if old_states in c:
    c = c.replace(old_states, new_states, 1)
    print("1. estados Athos adicionados")
else:
    print("WARN: bloco de estados nao encontrado"); sys.exit(1)

# ============================================================
# 2. Adicionar funções searchAthosClientes e selecionarClienteAthos
#    logo antes de "  function syncDesconto"
# ============================================================
old_syncDesc = "  function syncDesconto("
new_syncDesc = (
    "  async function searchAthosClientes() {\n"
    "    const q = nfseAthosQuery.trim();\n"
    "    if (!q) return;\n"
    "    setNfseAthosSearching(true);\n"
    "    setNfseAthosError(\"\");\n"
    "    setNfseAthosResults([]);\n"
    "    try {\n"
    "      const isDoc = /^\\d{3,}$/.test(q.replace(/\\D/g, \"\")) && q.replace(/\\D/g, \"\").length >= 8;\n"
    "      const param = isDoc\n"
    "        ? `documento=${encodeURIComponent(q.replace(/\\D/g, \"\"))}`\n"
    "        : `nome=${encodeURIComponent(q)}`;\n"
    "      const res = await fetch(`/api/athos/clientes?${param}&take=10`);\n"
    "      const data = await res.json().catch(() => ({ error: \"Resposta inválida.\" })) as {\n"
    "        items?: typeof nfseAthosResults;\n"
    "        error?: string;\n"
    "      };\n"
    "      if (!res.ok || data.error) {\n"
    "        setNfseAthosError(data.error ?? \"Erro ao buscar clientes.\");\n"
    "      } else {\n"
    "        setNfseAthosResults(data.items ?? []);\n"
    "        if ((data.items ?? []).length === 0) setNfseAthosError(\"Nenhum cliente encontrado.\");\n"
    "      }\n"
    "    } catch {\n"
    "      setNfseAthosError(\"Falha ao conectar ao backend.\");\n"
    "    } finally {\n"
    "      setNfseAthosSearching(false);\n"
    "    }\n"
    "  }\n"
    "\n"
    "  function selecionarClienteAthos(item: typeof nfseAthosResults[0]) {\n"
    "    setNfseClienteAthosSelecionado(item.idcliente);\n"
    '    setNfseTomadorTipo(item.tipoPessoa === "juridico" ? "cnpj" : "cpf");\n'
    "    setNfseTomadorDoc(item.documento ?? \"\");\n"
    "    setNfseTomadorNome(item.nome);\n"
    "    setNfseTomadorEnderecoLogradouro(item.endereco?.logradouro ?? \"\");\n"
    "    setNfseTomadorEnderecoNumero(item.endereco?.numero ?? \"\");\n"
    "    setNfseTomadorEnderecoBairro(item.endereco?.bairro ?? \"\");\n"
    "    setNfseTomadorEnderecoCep(item.endereco?.cep ?? \"\");\n"
    "    setNfseTomadorEnderecoCodigoMunicipio(item.endereco?.codigoMunicipio ?? \"\");\n"
    "    setNfseTomadorEnderecoUf(item.endereco?.uf ?? \"\");\n"
    "    setNfseAthosResults([]);\n"
    "    setNfseAthosQuery(\"\");\n"
    "  }\n"
    "\n"
    "  function syncDesconto("
)
if old_syncDesc in c:
    c = c.replace(old_syncDesc, new_syncDesc, 1)
    print("2. funcoes searchAthosClientes + selecionarClienteAthos adicionadas")
else:
    print("WARN: syncDesconto nao encontrada"); sys.exit(1)

# ============================================================
# 3. Limpar estados Athos ao abrir modal (em handleAbrirModalNfse)
#    adicionar antes de setNfseModal(true)
# ============================================================
old_open = (
    "    // Sempre abre o modal — usuário pode escolher o serviço e confirmar os dados\n"
    "    setNfseModal(true);"
)
new_open = (
    "    // Sempre abre o modal — usuário pode escolher o serviço e confirmar os dados\n"
    "    setNfseAthosQuery(\"\");\n"
    "    setNfseAthosResults([]);\n"
    "    setNfseAthosSearching(false);\n"
    "    setNfseClienteAthosSelecionado(null);\n"
    "    setNfseAthosError(\"\");\n"
    "    setNfseModal(true);"
)
if old_open in c:
    c = c.replace(old_open, new_open, 1)
    print("3. reset estados Athos ao abrir modal adicionado")
else:
    print("WARN: setNfseModal(true) nao encontrado no contexto esperado"); sys.exit(1)

# ============================================================
# 4. Injetar clienteAthosId no body de emissão (handleEmitirNfse)
#    adicionar antes do fetch de emissão
# ============================================================
old_fetch = '      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/nfse`, {'
new_fetch = (
    "      if (nfseClienteAthosSelecionado != null) {\n"
    "        body.clienteAthosId = nfseClienteAthosSelecionado;\n"
    "      }\n"
    '      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/nfse`, {'
)
if old_fetch in c:
    c = c.replace(old_fetch, new_fetch, 1)
    print("4. clienteAthosId injetado no body de emissao")
else:
    print("WARN: fetch de emissao nao encontrado"); sys.exit(1)

# ============================================================
# 5. Inserir seção de busca Athos no modal NFS-e
#    antes da div "Serviço" (primeira div do modal)
# ============================================================
old_servico_div = (
    '            <div className="mb-3">\n'
    '              <label className="form-label fw-semibold">Serviço</label>'
)
new_servico_div = (
    '            {/* Busca cliente Athos */}\n'
    '            <div className="mb-3">\n'
    '              <label className="form-label fw-semibold">Buscar cliente Athos</label>\n'
    '              {nfseClienteAthosSelecionado ? (\n'
    '                <div className="alert alert-success py-2 d-flex justify-content-between align-items-center">\n'
    '                  <span>\n'
    '                    <i className="bi bi-person-check me-2" />\n'
    '                    <strong>{nfseTomadorNome}</strong>\n'
    '                    {nfseTomadorDoc ? ` — ${nfseTomadorDoc}` : ""}\n'
    '                    <small className="text-muted ms-2">(id {nfseClienteAthosSelecionado})</small>\n'
    '                  </span>\n'
    '                  <button\n'
    '                    type="button"\n'
    '                    className="btn-close btn-sm"\n'
    '                    aria-label="Remover seleção"\n'
    '                    onClick={() => {\n'
    '                      setNfseClienteAthosSelecionado(null);\n'
    '                      setNfseTomadorDoc("");\n'
    '                      setNfseTomadorNome("");\n'
    '                      setNfseAthosResults([]);\n'
    '                      setNfseAthosQuery("");\n'
    '                      setNfseAthosError("");\n'
    '                    }}\n'
    '                  />\n'
    '                </div>\n'
    '              ) : (\n'
    '                <>\n'
    '                  <div className="input-group mb-1">\n'
    '                    <input\n'
    '                      className="form-control"\n'
    '                      placeholder="Nome ou CPF/CNPJ"\n'
    '                      value={nfseAthosQuery}\n'
    '                      onChange={e => setNfseAthosQuery(e.target.value)}\n'
    '                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void searchAthosClientes(); } }}\n'
    '                    />\n'
    '                    <button\n'
    '                      type="button"\n'
    '                      className="btn btn-outline-secondary"\n'
    '                      onClick={() => void searchAthosClientes()}\n'
    '                      disabled={nfseAthosSearching || !nfseAthosQuery.trim()}\n'
    '                    >\n'
    '                      {nfseAthosSearching\n'
    '                        ? <span className="spinner-border spinner-border-sm" role="status" />\n'
    '                        : <i className="bi bi-search" />}\n'
    '                    </button>\n'
    '                  </div>\n'
    '                  {nfseAthosError && <div className="text-danger small">{nfseAthosError}</div>}\n'
    '                  {nfseAthosResults.length > 0 && (\n'
    '                    <ul className="list-group list-group-flush border rounded" style={{ maxHeight: 180, overflowY: "auto" }}>\n'
    '                      {nfseAthosResults.map(item => (\n'
    '                        <li key={item.idcliente} className="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center">\n'
    '                          <span>\n'
    '                            <span className={`badge me-2 ${item.tipoPessoa === "juridico" ? "bg-info text-dark" : "bg-secondary"}`}>\n'
    '                              {item.tipoPessoa === "juridico" ? "PJ" : "PF"}\n'
    '                            </span>\n'
    '                            <strong>{item.nome}</strong>\n'
    '                            {item.documento ? <small className="text-muted ms-2">{item.documento}</small> : null}\n'
    '                          </span>\n'
    '                          <button\n'
    '                            type="button"\n'
    '                            className="btn btn-sm btn-outline-primary"\n'
    '                            onClick={() => selecionarClienteAthos(item)}\n'
    '                          >\n'
    '                            Selecionar\n'
    '                          </button>\n'
    '                        </li>\n'
    '                      ))}\n'
    '                    </ul>\n'
    '                  )}\n'
    '                </>\n'
    '              )}\n'
    '            </div>\n'
    '\n'
    '            <div className="mb-3">\n'
    '              <label className="form-label fw-semibold">Serviço</label>'
)
if old_servico_div in c:
    c = c.replace(old_servico_div, new_servico_div, 1)
    print("5. secao de busca Athos inserida no modal")
else:
    print("WARN: div do Servico nao encontrada"); sys.exit(1)

# ============================================================
# 6. Atualizar alerta informativo no modal
# ============================================================
old_alert = "Se o tomador não estiver associado no Athos, preencha documento e endereço manualmente para emitir a NFS-e."
new_alert = "Use a busca acima para selecionar um cliente Athos. Se preferir, preencha documento e endereço manualmente."
if old_alert in c:
    c = c.replace(old_alert, new_alert, 1)
    print("6. alerta informativo atualizado")
else:
    print("WARN: alerta informativo nao encontrado (nao critico)")

p.write_text(c, encoding="utf-8")
print("page.tsx salvo")
print("DONE")
