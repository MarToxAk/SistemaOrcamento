# Phase 31: Histórico NFS-e + Consulta NF Athos - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar à página `/contas-receber/[idcliente]` duas seções de histórico/consulta: (1) **NFS-e Emitidas** — lidas do banco próprio (`NfseEmitida` via Prisma), com colunas completas e botão cancelar; (2) **Notas Fiscais Athos** — NF-e não-serviço do cliente lidas do Athos (`venda JOIN venda_nota JOIN nota`), com listagem de até 50 registros e busca por número exato via server-side query. Ambas as seções são colapsáveis, carregam lazy (Intersection Observer) e aparecem empilhadas abaixo da tabela de títulos existente.

</domain>

<decisions>
## Implementation Decisions

### Layout da Página

- **D-01:** Seções **empilhadas** — "NFS-e Emitidas" e "Notas Fiscais Athos" aparecem abaixo da tabela de títulos, com `<hr>` + cabeçalho de seção. Sem abas — sem mudança no layout existente.
- **D-02:** **Carregamento lazy via Intersection Observer** — cada seção só busca dados quando entra na viewport. Não carrega junto com o `useEffect` inicial da página.
- **D-03:** **Seções colapsáveis** — cabeçalho clicável (accordion Bootstrap ou `<details>`), fechadas por padrão ao carregar a página. Abre ao clicar.
- **D-04:** **Estado vazio** — mensagem simples centralizada em texto cinza: *"Nenhuma NFS-e emitida para este cliente"* / *"Nenhuma nota fiscal encontrada no Athos"*. Seção permanece visível mesmo sem dados.

### Seção NFS-e Emitidas

- **D-05:** **Colunas completas** — Data de emissão | Nº NFS-e | Nº RPS | Valor | Títulos vinculados (`idcontareceber[]`) | Link download (botão só aparece quando `linkNfse` não for null).
- **D-06:** **Botão cancelar incluído** — cada linha tem botão "Cancelar". Comportamento: remove do banco local + tenta SOAP `CancelarNfse` (falha SOAP não bloqueia a remoção do banco). Reutiliza `cancelarNfseEmitida()` já implementado no `CobrancaService`. **Importante:** o endpoint de cancelamento na prefeitura (iiBrasil) pode não estar disponível — o cancelamento é garantido apenas no banco local do sistema.
- **D-07:** **Dupla camada de aviso sobre cancelamento:** (a) ícone `ⓘ` tooltip no botão: *"Remove do sistema. O cancelamento na prefeitura pode não ser suportado."* (b) modal de confirmação antes de cancelar também exibe o aviso.
- **D-08:** **Novo endpoint** `GET /cobranca/nfse/cliente/:idclienteAthos` no `CobrancaController` existente — retorna array de `NfseEmitida` com `titulos` vinculados (`NfseEmitidaTitulo[]`).

### Seção Notas Fiscais Athos

- **D-09:** **Campos** — Nº da nota | Data emissão | Valor | Tipo ("NF-e"). Sem chave de acesso na tabela.
- **D-10:** **Endpoint** `GET /athos/clientes/:idcliente/notas-fiscais` no `AthosController` existente — semântico, consistente com `GET /athos/contas-receber/cliente/:idcliente`.
- **D-11:** **Ordenação e limite** — `ORDER BY n.dataemissao DESC LIMIT 50`. Sem paginação.
- **D-12:** **Apenas notas ativas** — `WHERE COALESCE(n.cancelada, false) = false`, igual ao padrão de `verificarNFTitulos()`.

### Busca NFAT por Número

- **D-13:** **Acionamento manual** — campo de texto + botão "Buscar". Query ao Athos só dispara ao clicar ou pressionar Enter. Sem debounce automático.
- **D-14:** **Match exato** — `WHERE n.numero = $busca`. Operador digita número completo. Reutiliza o mesmo endpoint `GET /athos/clientes/:idcliente/notas-fiscais?numero=X`.
- **D-15:** **Lista de 50 permanece visível** quando há resultado de busca — os dois conjuntos coexistem na seção. Resultado da busca aparece destacado e separado da lista geral.
- **D-16:** **Posição do resultado** — resultado da busca exibido **acima** da lista de 50, no topo da seção.

### Claude's Discretion

- Estrutura da query SQL para `buscarNotasFiscaisCliente(idcliente)`: `SELECT n.numero, n.dataemissao, n.valornota, 'NF-e' as tipo FROM venda v JOIN venda_nota vn ON vn.idvenda = v.idvenda JOIN nota n ON n.idnota = vn.idnota WHERE v.idcliente = $1 AND COALESCE(n.cancelada, false) = false AND n.nfechaveacesso IS NOT NULL ORDER BY n.dataemissao DESC LIMIT 50` — verificar campos exatos disponíveis na instância Athos.
- Novo Route Handler frontend: `GET /api/cobranca/nfse/cliente/[idcliente]/route.ts` e `GET /api/athos/clientes/[idcliente]/notas-fiscais/route.ts` — padrão `backendFetch` com `x-internal-api-key`.
- Novo DTO/endpoint de cancelamento frontend já existe via `DELETE /api/cobranca/nfse/[id]/route.ts` (verificar se já foi criado na Phase 30 ou criar aqui).
- Formato de exibição de "Títulos vinculados" na tabela NFS-e: listar `idcontareceber` como badges separados por vírgula.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Banco Próprio — Prisma
- `apps/backend/prisma/schema.prisma` — modelos `NfseEmitida`, `NfseEmitidaTitulo` (com `idvenda`, `linkNfse`, `numeroNfse`, `valorServico`)

### Backend — Módulos existentes a estender
- `apps/backend/src/modules/cobranca/cobranca.service.ts` — `cancelarNfseEmitida()` (L600+), `buscarNfseEmitidaParaTitulos()` (L573+) — padrão a seguir para novo `buscarNfseEmitidaCliente()`
- `apps/backend/src/modules/cobranca/cobranca.controller.ts` — adicionar `GET /cobranca/nfse/cliente/:idclienteAthos` aqui
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — `verificarNFTitulos()` (L1816+): padrão de query `venda_nota JOIN nota` a seguir para `buscarNotasFiscaisCliente()`
- `apps/backend/src/modules/integrations/athos/athos.controller.ts` — adicionar `GET /athos/clientes/:idcliente/notas-fiscais` aqui

### Frontend — Página a estender
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` — página que receberá as duas novas seções (já tem estado para boleto + NFS-e modals; adicionar estado para seções de histórico)

### Padrões de Route Handler
- `apps/frontend/src/app/api/cobranca/boleto/route.ts` — padrão `backendFetch` + `x-internal-api-key` a seguir
- `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/route.ts` — padrão de Route Handler dinâmico a seguir

### Requisitos
- `.planning/REQUIREMENTS.md` — NFR-05, NFAT-01, NFAT-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CobrancaService.cancelarNfseEmitida(id)` — já implementado, chama SOAP + remove do banco. Apenas expor via endpoint + Route Handler.
- `CobrancaService.buscarNfseEmitidaParaTitulos(ids[])` — retorna NFS-e por `idcontareceber[]`. Novo método `buscarNfseEmitidaCliente(idclienteAthos)` terá estrutura similar mas filtra por `NfseEmitida.idclienteAthos`.
- `verificarNFTitulos()` em `AthosService` — query `venda_nota JOIN nota` já validada. Novo método usa mesma estrutura mas filtra por `v.idcliente` em vez de `idcontareceber`.
- Intersection Observer: não existe no projeto ainda — implementar via `useEffect` + `useRef` no componente da seção.

### Established Patterns
- Accordion Bootstrap colapsável: padrão já usado no dashboard `/contas-receber` (accordion lazy para títulos por cliente)
- Lazy fetch via Intersection Observer: padrão novo a introduzir, mas `useEffect` + `useRef` é padrão React establishado
- Badge de NF na tabela de títulos: `badgeClassName(tipoNf)` já existe em `page.tsx` — reutilizar lógica de exibição
- Tooltip Bootstrap: `data-bs-toggle="tooltip"` já disponível no projeto

### Integration Points
- `page.tsx`: adicionar dois novos `useRef` (um por seção) para o Intersection Observer + dois novos estados (`nfseEmitidas`, `notasFiscaisAthos`, `buscaNumeroNf`, `resultadoBuscaNf`)
- `CobrancaController`: novo `GET /cobranca/nfse/cliente/:idclienteAthos` + novo `DELETE /cobranca/nfse/:id` (se não existir da Phase 30)
- `AthosController`: novo `GET /athos/clientes/:idcliente/notas-fiscais?numero=X`
- `CobrancaService`: novo `buscarNfseEmitidaCliente(idclienteAthos)`
- `AthosService`: novo `buscarNotasFiscaisCliente(idcliente, numero?)` com query `venda JOIN venda_nota JOIN nota`

</code_context>

<specifics>
## Specific Ideas

- Layout colapsável para cada seção:
  ```tsx
  <div className="mt-4">
    <button
      className="btn btn-link p-0 text-decoration-none fw-semibold"
      onClick={() => setNfseAberta(!nfseAberta)}
    >
      {nfseAberta ? "▼" : "►"} NFS-e Emitidas
    </button>
    {nfseAberta && <div ref={nfseRef}>...</div>}
  </div>
  ```
- Intersection Observer para lazy load:
  ```tsx
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !nfseCarregada) {
        carregarNfseEmitidas();
        setNfseCarregada(true);
      }
    });
    if (nfseRef.current) observer.observe(nfseRef.current);
    return () => observer.disconnect();
  }, [nfseAberta]);
  ```
- Resultado de busca NF Athos separado da lista geral:
  ```tsx
  {resultadoBuscaNf && (
    <div className="alert alert-info mb-2">
      <strong>Resultado da busca — Nota Nº {buscaNumeroNf}:</strong>
      {resultadoBuscaNf.length === 0
        ? ' Nenhuma nota encontrada com este número.'
        : <NfTable notas={resultadoBuscaNf} />}
    </div>
  )}
  <NfTable notas={notasFiscaisAthos} /> {/* lista de 50 */}
  ```
- Aviso cancelamento NFS-e:
  ```tsx
  <button title="Remove do sistema. O cancelamento na prefeitura pode não ser suportado.">
    Cancelar ⓘ
  </button>
  ```

</specifics>

<deferred>
## Deferred Ideas

- Paginação da lista de NF Athos (além de 50 registros) → backlog
- Exibir chave de acesso NF-e completa (com copy) → backlog
- Download/visualização da NF-e Athos via link de chave de acesso → backlog
- Histórico global de NFS-e emitidas (cross-cliente) → backlog
- Notas canceladas visíveis com badge → backlog (decidido não incluir nesta fase)

</deferred>

---

*Phase: 31-hist-rico-nfs-e-consulta-nf-athos*
*Context gathered: 2026-05-27*
