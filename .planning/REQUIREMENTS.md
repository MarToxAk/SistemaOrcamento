# Requirements: Sistema de Orcamento BomCusto — Milestone v2.3

**Defined:** 2026-06-17
**Milestone:** v2.3 — White-Label Multi-Empresa
**Core Value:** Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## v1 Requirements

Requisitos do milestone v2.3. Sistema configurável por empresa via variáveis de ambiente — sem editar código, sem banco de dados novo. Deploy separado por empresa com `.env` próprio.

### Configuração da Empresa (CFG)

- [x] **CFG-01**: `.env.example` documenta todas as variáveis novas com valores BomCusto como defaults e comentários explicativos
- [x] **CFG-02**: `EMPRESA_LOGO_URL` — URL pública do logo da empresa, usada no frontend e no PDF
- [x] **CFG-03**: `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO` — dados textuais exibidos no frontend, PDF e assinaturas
- [x] **CFG-04**: `EMPRESA_MUNICIPIO_IBGE` — código IBGE do município do prestador, substitui `"3520400"` hardcoded no NFS-e
- [x] **CFG-05**: `EMPRESA_COR_PRIMARIA` (hex, ex: `#0d6efd`) — cor primária da marca aplicada via CSS custom property

### Frontend Dinâmico (FRONT)

- [x] **FRONT-01**: `layout.tsx` usa `EMPRESA_NOME` no `metadata.title` em vez de "BomCusto Orcamento" hardcoded
- [x] **FRONT-02**: 5 páginas internas (`orcamento/page`, `orcamento/novo`, `orcamento/[id]`, `contas-receber/page`, `contas-receber/[idcliente]`) exibem logo/nome/CNPJ/endereço lidos das env vars
- [ ] **FRONT-03**: 2 páginas públicas (`orcamento/[id]/approve`, `orcamento/[id]/status`) exibem logo e nome lidos das env vars
- [x] **FRONT-04**: Cor primária (`EMPRESA_COR_PRIMARIA`) injetada como CSS custom property no `layout.tsx`, substituindo cores hardcoded de branding

### PDF Dinâmico e Customizável (PDF)

- [x] **PDF-01**: Backend passa `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO` e `EMPRESA_LOGO_URL` ao renderizador do template PDF via env vars
- [x] **PDF-02**: Template padrão usa as variáveis de empresa em vez de texto hardcoded (nome, CNPJ, endereço, assinatura "equipe X", logo)
- [x] **PDF-03**: Template PDF extraído de string inline em TypeScript para arquivo `.hbs` externo em `apps/backend/templates/quote-default.hbs`
- [x] **PDF-04**: `EMPRESA_PDF_TEMPLATE_PATH` (opcional) aponta para template customizado — fallback para o template padrão do sistema se ausente; template customizado pode ser montado via volume Docker
- [x] **PDF-05**: Template padrão documenta via comentários Handlebars todas as variáveis disponíveis (dados da empresa, cliente, itens, totais, carimbos)

### NFS-e Dinâmico (NFSE)

- [x] **NFSE-01**: `CODIGO_MUNICIPIO` no `NfseService` (`"3520400"` hardcoded na linha 60) lido de `EMPRESA_MUNICIPIO_IBGE` via `ConfigService`

## v2 Requirements

Reconhecidos, porém deferidos — não entram no roadmap atual.

### Produto Avançado (carregado de v2.2)

- **PADV-01**: Gestão de grade de produto (usagrade/utilizagrade)
- **PADV-02**: Gestão de produto composto e controle de série

### Frontend de Gestão de Produtos (carregado de v2.2)

- **UPROD-01**: Tela de busca de produtos com filtros
- **UPROD-02**: Formulário para criar produto
- **UPROD-03**: Tela para editar preço e cadastro de produto
- **UPROD-04**: Ação para desativar/reativar produto

### White-Label Avançado (futuro)

- **WL-01**: Painel admin no sistema para editar configurações sem acessar o servidor
- **WL-02**: Upload de logo pelo sistema (MinIO) sem editar `.env`
- **WL-03**: Templates PDF gerenciados pelo painel admin (upload/preview/ativação)

## Out of Scope

- Credenciais de integração no painel admin (Athos DB, EFI, Chatwoot, iiBrasil permanecem em env vars por segurança)
- Multi-tenant (shared deploy para múltiplas empresas) — modelo é deploy separado por empresa
- Editor visual de template PDF (WYSIWYG)
- Reintroduzir n8n para roteamento de pagamentos
- Recalculo retroativo de NFS-e já emitida
- Troca de ORM (Prisma permanece)
- Mudança de provedor de banco
- Pagamento por cartão de crédito

## Traceability

| REQ-ID | Phase | Plan |
|--------|-------|------|
| CFG-01..05 | 35 | TBD |
| NFSE-01 | 35 | TBD |
| PDF-01..05 | 35 | TBD |
| FRONT-01..04 | 36 | TBD |
