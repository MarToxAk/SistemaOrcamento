# Requirements - Sistema de Orcamento BomCusto

## v2.1 — Cobrança e Fiscal do Cliente

---

### CLI — Detalhe do Cliente

**CLI-01 — Página de detalhe do cliente acessível de /contas-receber**

Contexto: O operador está no dashboard de contas a receber e quer agir sobre um cliente específico. Precisa de uma tela dedicada com dados completos do cliente e seus títulos.

Requisito: Clicar em um card de cliente na página /contas-receber navega para /contas-receber/[idcliente] com dados cadastrais e lista de títulos.

Critérios:
1. Rota /contas-receber/[idcliente] existe e carrega sem erro.
2. Dados cadastrais (nome, telefone, email, limite de crédito) exibidos via consulta Athos.
3. Link "Ver Detalhe" ou clique no card navega para a rota.

---

**CLI-02 — Lista de títulos do cliente com seleção por checkbox**

Contexto: O operador precisa escolher quais títulos incluir no boleto ou na NFS-e.

Requisito: A página de detalhe lista todos os títulos em aberto (AVC + VEN) do cliente com checkbox individual e seleção total.

Critérios:
1. Tabela de títulos com colunas: checkbox, numerotitulo, datavencimento, valor, status.
2. Checkbox "Selecionar todos" na thead.
3. Contador de títulos selecionados e valor total selecionado exibidos em tempo real.

---

**CLI-03 — Barra de ações para títulos selecionados**

Contexto: Com títulos selecionados, o operador precisa escolher a ação.

Requisito: Quando ao menos um título está selecionado, uma barra de ações aparece com os botões "Gerar Boleto" e "Emitir NFS-e".

Critérios:
1. Barra aparece apenas com seleção ativa (≥1 título).
2. Botões "Gerar Boleto" e "Emitir NFS-e" visíveis na barra.
3. Barra exibe valor total dos títulos selecionados.

---

### BOL — Boleto Consolidado EFI Bank

**BOL-01 — Gerar boleto único consolidando múltiplos títulos**

Contexto: O operador selecionou um ou mais títulos e clicou em "Gerar Boleto". O sistema gera um único boleto com o valor somado de todos os títulos selecionados.

Requisito: POST /api/cobranca/boleto recebe lista de idcontareceber e gera cobrança EFI com valor igual à soma dos títulos.

Critérios:
1. Endpoint aceita array de idcontareceber com ≥1 item.
2. Valor do boleto = soma dos valores dos títulos selecionados.
3. Cobrança criada com sucesso na API EFI e retorna txid/link.

---

**BOL-02 — Boleto retorna link de pagamento e QR Code Pix**

Contexto: Após a geração, o operador precisa compartilhar o boleto com o cliente.

Requisito: Resposta do endpoint inclui link do boleto bancário e payload Pix (QR Code).

Critérios:
1. Resposta contém link_boleto (URL do PDF/boleto) e pix_payload (copia-e-cola).
2. Frontend exibe modal com link copiável e QR Code.
3. Operador pode copiar o Pix e/ou abrir o boleto em nova aba.

---

**BOL-03 — Registro da cobrança gerada**

Contexto: Rastreabilidade — o sistema precisa registrar que aqueles títulos geraram um boleto.

Requisito: Nova tabela Prisma registra cada cobrança gerada com: txid EFI, idcliente Athos, lista de idcontareceber, valor, data de geração, status.

Critérios:
1. Migration Prisma cria tabela cobranca_boleto (ou similar).
2. Registro criado a cada boleto gerado com todos os campos.
3. Status atualizado via webhook EFI existente quando boleto for pago.

---

### NFR — NFS-e a partir de Títulos

**NFR-01 — Modal de emissão de NFS-e para títulos selecionados**

Contexto: O operador selecionou títulos e clicou em "Emitir NFS-e". Um modal permite confirmar/ajustar antes de emitir.

Requisito: Modal de NFS-e abre pré-preenchido com valor igual à soma dos títulos selecionados e dados do cliente (nome, documento via Athos).

Critérios:
1. Modal exibe campo de valor editável, pré-preenchido com soma dos títulos.
2. Nome e documento do cliente carregados via busca Athos (reutilizar buscarClientePorId).
3. Campos de descrição do serviço e alíquota ISS editáveis.

---

**NFR-02 — Operador ajusta valor antes de emitir**

Contexto: O valor da NFS-e pode diferir da soma exata dos títulos (ex: desconto negociado).

Requisito: Campo de valor no modal é editável. Operador pode alterar antes de confirmar.

Critérios:
1. Campo valor aceita entrada manual em BRL.
2. Valor mínimo = R$0,01; máximo sem restrição.
3. Valor enviado ao NfseService é o valor editado pelo operador, não o calculado.

---

**NFR-03 — NFS-e emitida via NfseService existente**

Contexto: O sistema já tem NfseService funcionando para orçamentos. Reutilizar a mesma lógica.

Requisito: Endpoint de emissão chama NfseService.emitirNfse() com os dados do modal, reaproveitando o fluxo SOAP iiBrasil já validado.

Critérios:
1. NfseService.emitirNfse() chamado com tomador resolvido via clienteAthosId.
2. RPS gerado sem conflito com numeração existente de orçamentos.
3. Resposta inclui número da NFS-e emitida ou erro descritivo.

---

**NFR-04 — NFS-e emitida registrada no banco próprio**

Contexto: O Athos é read-only. O histórico de NFS-e emitidas fica no banco do sistema (Prisma).

Requisito: Migration Prisma cria tabela nfse_emitida com: numeroNfse, numeroRps, idclienteAthos, valorServico, dataEmissao, idcontareceber[] vinculados, status.

Critérios:
1. Migration Prisma cria tabela nfse_emitida com todos os campos.
2. Registro criado após retorno bem-sucedido do NfseService.
3. Campos numeroNfse e numeroRps preenchidos com valores reais da resposta iiBrasil.

---

**NFR-05 — Histórico de NFS-e visível na página do cliente**

Contexto: O operador precisa ver quais NFS-e já foram emitidas para aquele cliente.

Requisito: Seção "NFS-e Emitidas" na página de detalhe do cliente lista as NFS-e registradas no banco próprio para aquele idclienteAthos.

Critérios:
1. Seção lista: data, número NFS-e, valor, títulos vinculados.
2. Dados lidos do banco próprio (Prisma), não do Athos.
3. Exibido mesmo quando não há registros ("Nenhuma NFS-e emitida para este cliente").

---

### NFAT — Notas Fiscais no Athos (consulta)

**NFAT-01 — Consultar notas fiscais não-serviço do cliente no Athos**

Contexto: O cliente pode ter NF-e ou NFC-e de produtos emitidas pelo Athos. O operador precisa consultar essas notas para referência ou conciliação.

Requisito: Seção "Notas Fiscais Athos" na página do cliente lista notas fiscais (não-serviço) do Athos para aquele idcliente via query read-only.

Critérios:
1. Query ao Athos busca notas fiscais do cliente (tabela nota ou similar no schema Athos).
2. Exibe: número da nota, data, valor, tipo.
3. Limitado aos últimos 50 registros para performance.

---

**NFAT-02 — Busca de NF por numeração no Athos**

Contexto: O operador quer localizar uma nota específica pelo número para verificar ou informar ao cliente.

Requisito: Campo de busca por número de nota na seção NFAT permite filtrar a lista.

Critérios:
1. Campo de busca filtra a lista pelo número da nota (busca parcial).
2. Busca executa no Athos (não apenas filtro frontend).
3. Resultado exibe nota encontrada ou "Nenhuma nota encontrada com este número".

---

## Future Requirements (Deferred)

- Real-time SSE no dashboard de contas a receber (requer DDL no Athos)
- Envio automático do boleto por WhatsApp/Chatwoot ao cliente
- Cancelamento de NFS-e emitida
- Relatório de NFS-e emitidas por período (CSV export)
- RBAC por role (ADMIN/VENDEDOR/ATENDENTE)

## Out of Scope

- Gravar qualquer dado no banco Athos (somente leitura)
- Emissão de NF-e de produto (apenas NFS-e de serviço)
- Parcelamento de boleto
- Integração com gateway de pagamento diferente de EFI Bank
- Reescrita do NfseService (reutilização apenas)

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CLI-01 | 28 | pending |
| CLI-02 | 28 | pending |
| CLI-03 | 28 | pending |
| BOL-01 | 29 | pending |
| BOL-02 | 29 | pending |
| BOL-03 | 29 | pending |
| NFR-01 | 30 | pending |
| NFR-02 | 30 | pending |
| NFR-03 | 30 | pending |
| NFR-04 | 30 | pending |
| NFR-05 | 31 | pending |
| NFAT-01 | 31 | pending |
| NFAT-02 | 31 | pending |
