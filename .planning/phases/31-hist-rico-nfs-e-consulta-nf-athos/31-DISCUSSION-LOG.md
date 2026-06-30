# Phase 31: Histórico NFS-e + Consulta NF Athos - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-27
**Phase:** 31-hist-rico-nfs-e-consulta-nf-athos
**Areas discussed:** Layout da página, Seção NFS-e Emitidas, Seção NF Athos, Busca NFAT

---

## Layout da Página

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Seções empilhadas | NFS-e Emitidas e NF Athos abaixo da tabela de títulos com scroll vertical | ✓ |
| Abas (nav-tabs) | Dividir página em Títulos em Aberto / NFS-e Emitidas / NF Athos | |

**Escolha do usuário:** Seções empilhadas
**Notas:** Usuário pediu exemplo visual antes de decidir — mockup ASCII apresentado mostrando ambas as opções com a página real como base.

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Carregamento junto com a página | useEffect inicial carrega tudo de uma vez | |
| Lazy via Intersection Observer | Dados buscados apenas quando seção entra na viewport | ✓ |
| Você decide | Deixar para quem implementar | |

**Escolha do usuário:** Lazy via Intersection Observer

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Seções fixas (sempre abertas) | Sem recolher, sempre expandidas | |
| Seções colapsáveis | Cabeçalho clicável, fechadas por padrão | ✓ |

**Escolha do usuário:** Colapsáveis, fechadas por padrão

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Mensagem simples | Texto cinza centralizado quando sem dados | ✓ |
| Ocultar seção | Não exibir cabeçalho se sem dados | |

**Escolha do usuário:** Mensagem simples

---

## Seção NFS-e Emitidas

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Mínimo | Data / Nº NFS-e / Valor / Títulos vinculados | |
| Completo | Data / Nº NFS-e / Nº RPS / Valor / Títulos vinculados / Link download | ✓ |

**Escolha do usuário:** Colunas completas com link download condicional

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Incluir botão cancelar | cancelarNfseEmitida() já implementado | ✓ |
| Sem cancelar | Histórico somente leitura | |

**Escolha do usuário:** Incluir botão cancelar
**Notas:** Usuário sinalizou que o endpoint SOAP de cancelamento na prefeitura pode não funcionar (prefeitura pode não suportar cancelamento via ABRASF). cancelarNfseEmitida() já trata isso — remove do banco local independente do resultado SOAP.

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Tooltip no botão | Ícone ⓘ com aviso sobre limitação do cancelamento | ✓ |
| No modal de confirmação | Aviso só aparece antes de confirmar | ✓ |

**Escolha do usuário:** Ambos — tooltip + aviso no modal de confirmação

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| GET /cobranca/nfse/cliente/:id | Novo endpoint no CobrancaController | ✓ |
| Reutilizar /titulos-em-uso | Passando todos os idcontareceber do cliente | |

**Escolha do usuário:** Novo endpoint dedicado por cliente

---

## Seção NF Athos

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Essencial | Nº / Data emissão / Valor / Tipo | ✓ |
| Com chave de acesso | + nfechaveacesso truncada com tooltip | |

**Escolha do usuário:** Campos essenciais

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| AthosController | GET /athos/clientes/:id/notas-fiscais | ✓ |
| CobrancaController | Junto com endpoints de cobrança | |

**Escolha do usuário:** AthosController — semântico e consistente

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Mais recentes primeiro | ORDER BY dataemissao DESC LIMIT 50 | ✓ |
| Mais antigas primeiro | ORDER BY dataemissao ASC LIMIT 50 | |

**Escolha do usuário:** Mais recentes primeiro

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Filtrar canceladas | WHERE COALESCE(n.cancelada, false) = false | ✓ |
| Mostrar com badge | Incluir canceladas com badge vermelho | |

**Escolha do usuário:** Só ativas — padrão consistente com verificarNFTitulos()

---

## Busca NFAT

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Botão Buscar | Query só dispara ao clicar/Enter | ✓ |
| Debounce automático | 500ms após parar de digitar | |

**Escolha do usuário:** Botão Buscar

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Exato | WHERE n.numero = $busca | ✓ |
| Parcial | WHERE n.numero LIKE '%$busca%' | |

**Escolha do usuário:** Match exato

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Substitui a lista | Resultado substitui os 50 registros (com botão Limpar) | |
| Exibe separado | Lista de 50 permanece, resultado aparece destacado | ✓ |

**Escolha do usuário:** Separado — lista de 50 coexiste com resultado de busca

---

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Acima da lista | Resultado no topo, antes dos 50 | ✓ |
| Abaixo do campo | Resultado entre input e lista geral | |

**Escolha do usuário:** Acima da lista

---

## Claude's Discretion

- Estrutura exata da query SQL para `buscarNotasFiscaisCliente()` — verificar campos disponíveis na instância Athos
- Novo Route Handler `GET /api/athos/clientes/[idcliente]/notas-fiscais/route.ts` — implementar seguindo padrão backendFetch existente
- Formato de exibição de "Títulos vinculados" (badges de idcontareceber)
- Verificar se DELETE para cancelar NFS-e no frontend já foi criado na Phase 30 ou precisa ser criado aqui

## Deferred Ideas

- Paginação da lista NF Athos (além de 50) → backlog
- Chave de acesso NF-e completa com copy → backlog
- Download/visualização via chave de acesso → backlog
- Histórico global cross-cliente de NFS-e → backlog
- Notas canceladas com badge → backlog
