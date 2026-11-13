# Phase 47: Contas a receber: páginas separadas, boletos e notas fiscais PDF/XML - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Reorganizar a área de contas a receber do frontend em páginas/abas mais funcionais, melhorar a visualização dos
boletos e permitir baixar notas fiscais em PDF e XML. Reorganização + melhoria visual: as regras de boleto, baixa
no Athos e avisos NÃO mudam. Backend: apenas a rota nova de XML (e, se aprovado no plano, ZIP em lote).

</domain>

<decisions>
## Implementation Decisions

### Estrutura de páginas
- D-01 Abas por rota: `/contas-receber` (resumo e clientes), `/contas-receber/boletos` (boletos consolidados), `/contas-receber/notas` (notas fiscais); navegação no `admin-shell`.
- D-02 Tela do cliente `/contas-receber/[idcliente]` com abas: Contas em aberto, Gerar boleto, Boletos, Notas fiscais; cada aba vira componente em arquivo próprio (hoje 2.778 linhas em um arquivo).
- D-03 Sem mudança de comportamento: regras de boleto, baixa/estorno no Athos e avisos permanecem.
- D-04 Aba e filtros na URL (`?aba=`, `?status=`) para links compartilháveis.

### Visualização dos boletos
- D-05 Tabela compacta com linha expansível: cliente, valor, vencimento (dias para vencer/atraso), status, selos de NFS-e e baixa no Athos.
- D-06 Detalhe (linha expandida/painel): linha digitável com botão copiar, PIX copia e cola, títulos incluídos, último aviso, histórico de baixa.
- D-07 Ações no mesmo lugar: PDF, copiar linha digitável, verificar pagamento, cancelar, baixar no Athos, estornar (só as que já existem).
- D-08 Filtros: status, situação (a vencer/atrasado), período de vencimento, busca por cliente.

### Notas fiscais (PDF e XML)
- D-09 Escopo: NFS-e emitidas (`NfseEmitida`) e NF-e/DANFE já suportada em `nfe/danfe`.
- D-10 PDF: reutilizar rotas existentes (`nfse/:id/pdf`, `nfe/danfe`), botão na aba Notas e na aba do cliente.
- D-11 XML: rota nova `GET /api/cobranca/nfse/:id/xml` (fonte `xmlNacional`, senão `linkNfse`); sem XML salvo → 404 com mensagem e a tela mostra "XML indisponível". Não inventar XML.
- D-12 Lote: botão "Baixar PDF e XML" por nota e seleção de várias notas para ZIP.

### Ampliação aprovada pelo usuário (2026-11-13, após plan-check)
- D-13 Plano 47-03 pode criar rotas backend SOMENTE LEITURA: `GET boleto/:id/detalhe` (consulta a EFI para linha digitável/PIX, com cache em memória de 60 s), `GET cobranca/notas` e `AthosService.buscarNfeResumoPorTitulos` (SELECT compatível com PG 9.0.5, validado no clone `athos-teste`). Campo da EFI (`banking_billet.barcode`/`pix.qrcode`) é suposição: conferir com boleto real na verificação final.

### Claude's Discretion
Nomes de componentes/arquivos, estilo visual dentro do design system existente (skill bom-custo-design), formato do ZIP, paginação.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/frontend/src/app/contas-receber/` (page.tsx 1072 linhas com `BoletosConsolidadosPanel` e `ContasReceberDashboard`; admin-shell.tsx; cliente-autocomplete.tsx; [idcliente]/page.tsx 2778 linhas).
- Backend `cobranca.controller.ts`: `boleto/dashboard`, `boleto/cliente/:id`, `boleto/:id/pdf`, `nfse/cliente/:id`, `nfse/:id/pdf`, `nfe/danfe`, ações de cancelar/verificar/baixar/estornar.
- Prisma `NfseEmitida` (`xmlNacional`, `linkNfse`, `arquivoPath` MinIO), `CobrancaBoleto`.

### Established Patterns
- Next.js 14 App Router com proxy `/api/cobranca/*`; NestJS + Jest; design system BomCusto.

### Integration Points
- `admin-shell.tsx` (navegação), rotas Next em `app/api/cobranca/...` (proxy para XML/ZIP), `cobranca.service.ts`.

</code_context>

<specifics>
## Specific Ideas

Separar para facilitar a visualização, na parte geral e na parte do cliente (que gera os boletos e vê as contas).

</specifics>

<deferred>
## Deferred Ideas

Mudar regras de cobrança/baixa; emissão de NF-e nova; envio automático de XML por e-mail.

</deferred>
