# API Athos — Integração com ERP Legado

**Módulo**: `apps/backend/src/modules/integrations/athos/`  
**Banco**: PostgreSQL direto (não usa Prisma)  
**Autenticação**: Bearer token via header `x-api-token` ou `Authorization: Bearer {token}`

---

## 📋 Endpoints

### 1. GET /athos/contas-pagar — Listar Contas a Pagar

**Descrição**: Retorna contas a pagar do banco Athos com todas as 35+ colunas. Padrão: últimos 30 dias até +30 dias.

**Query Parameters**:
| Param | Tipo | Obrigatório | Exemplo | Descrição |
|-------|------|-------------|---------|-----------|
| `dataInicio` | string (YYYY-MM-DD) | Não | `2026-05-01` | Início do filtro de vencimento |
| `dataFinal` | string (YYYY-MM-DD) | Não | `2026-05-31` | Fim do filtro de vencimento |
| `statusconta` | string | Não | `ABE` | Filtro por status: `ABE` (aberto), `PAG` (pago), `CAN` (cancelado) |

**Headers**:
```
Authorization: Bearer {ATHOS_API_TOKEN}
  ou
x-api-token: {ATHOS_API_TOKEN}
```

**Resposta 200**:
```json
[
  {
    "idcontapagar": 42,
    "idfornecedor": 8,
    "idfuncionario": 3,
    "idtipoconta": 2,
    "idcentrocusto": 6,
    "idgrupoconta": 8,
    "idsubgrupoconta": 3,
    "idconta": 15,
    "idloja": 1,
    "idbudget": null,
    "descricaoconta": "Aluguel escritório maio/2026",
    "dataemissao": "2026-05-01",
    "datavencimento": "2026-05-31",
    "datapagamento": null,
    "datalancamento": "2026-05-01T10:30:00Z",
    "ultimaalteracao": "2026-05-11T14:22:15Z",
    "valorconta": 4500.00,
    "valorpago": 0.00,
    "jurosconta": 0.00,
    "multaconta": 0.00,
    "desconto": 0.00,
    "statusconta": "ABE",
    "numerodocumento": "NF-001",
    "numeronota": null,
    "observacao": "Pagamento até dia 15",
    "historicocontabil": "ALUGUEL ESCRITÓRIO",
    "competenciames": "05",
    "competenciaano": "2026",
    "enviaalerta": true,
    "recorrenciafornecedor": false,
    "exibemsgrecorrencia": false,
    "agruparconta": false,
    "sincronizado": true,
    "idorigempagamento": null
  }
]
```

**Respostas de Erro**:
- `401 Unauthorized` — Token ausente ou inválido
- `500 Internal Server Error` — ATHOS_API_TOKEN não configurado no servidor

---

### 2. POST /athos/contas-pagar — Criar Conta a Pagar

**Descrição**: Insere novo registro na tabela `conta_pagar` do banco Athos.

**Headers**:
```
Authorization: Bearer {ATHOS_API_TOKEN}
Content-Type: application/json
```

**Body** (todos os campos opcionais exceto `descricaoconta`, `datavencimento`, `valorconta`):
```json
{
  "descricaoconta": "Fatura de serviços profissionais",
  "datavencimento": "2026-06-15",
  "valorconta": 2500.00,
  "idtipoconta": 2,
  "idgrupoconta": 8,
  "idsubgrupoconta": 3,
  "idconta": 15,
  "idcentrocusto": 6,
  "idfornecedor": 8,
  "idfuncionario": 3,
  "dataemissao": "2026-05-01",
  "numerodocumento": "NF-12345",
  "numeronota": "5500",
  "observacao": "Vencimento normal",
  "statusconta": "ABE",
  "jurosconta": 0.00,
  "competenciames": "05",
  "competenciaano": "2026",
  "multaconta": 0.00,
  "desconto": 0.00,
  "idloja": 1,
  "idbudget": null,
  "recorrenciafornecedor": false,
  "exibemsgrecorrencia": false
}
```

**Resposta 201**:
```json
{
  "idcontapagar": 127
}
```

**Respostas de Erro**:
- `400 Bad Request` — Campos obrigatórios ausentes
- `401 Unauthorized` — Token ausente ou inválido

---

### 3. PATCH /athos/contas-pagar/{id} — Atualizar Conta a Pagar ✨ NOVO

**Descrição**: Atualiza parcialmente qualquer campo suportado. Retorna o registro completo após update.

Quando `statusconta = "PAG"`, o backend executa automaticamente a liquidação tripla em transação SQL:
- Update em `conta_pagar`
- Insert em `livro_registro_io` (lançamento de saída)
- Insert em `caixa_saida` (movimentação de caixa)

Se qualquer etapa falhar, a transação faz rollback e nenhuma alteração é persistida.

**Headers**:
```
Authorization: Bearer {ATHOS_API_TOKEN}
Content-Type: application/json
```

**Path Parameter**:
| Param | Tipo | Exemplo | Descrição |
|-------|------|---------|-----------|
| `id` | integer | 42 | ID da conta a pagar no Athos |

**Body** (todos os campos são opcionais — envie apenas os que deseja atualizar):

#### Exemplo 1: Marcar como Pago com liquidação automática
```json
{
  "statusconta": "PAG",
  "datapagamento": "2026-05-11",
  "valorpago": 4500.00,
  "idfuncionario": 3,
  "idcaixacentral": 1,
  "observacao": "Pagamento efetuado - baixa automática em livro_registro_io e caixa_saida"
}
```

#### Exemplo 2: Aplicar Multa e Juros
```json
{
  "jurosconta": 45.00,
  "multaconta": 22.50,
  "observacao": "Multa por atraso de 3 dias aplicada automaticamente"
}
```

#### Exemplo 3: Ajustar Desconto
```json
{
  "desconto": 225.00,
  "valorconta": 4275.00,
  "observacao": "Desconto de 5% concedido via telefone"
}
```

#### Exemplo 4: Atualizar Competência
```json
{
  "competenciames": "06",
  "competenciaano": "2026",
  "observacao": "Relocado para competência de junho"
}
```

#### Exemplo 5: Atualizar Centro de Custo (ajuste contábil)
```json
{
  "idcentrocusto": 9,
  "idconta": 18,
  "observacao": "Reclassificação contábil conforme solicitação do controller"
}
```

**Resposta 200**:
```json
{
  "idcontapagar": 42,
  "idfornecedor": 8,
  "idfuncionario": 3,
  "idtipoconta": 2,
  "idcentrocusto": 9,
  "idgrupoconta": 8,
  "idsubgrupoconta": 3,
  "idconta": 18,
  "idloja": 1,
  "idbudget": null,
  "descricaoconta": "Aluguel escritório maio/2026",
  "dataemissao": "2026-05-01",
  "datavencimento": "2026-05-31",
  "datapagamento": "2026-05-11",
  "datalancamento": "2026-05-01T10:30:00Z",
  "ultimaalteracao": "2026-05-11T15:45:22Z",
  "valorconta": 4275.00,
  "valorpago": 4500.00,
  "jurosconta": 45.00,
  "multaconta": 22.50,
  "desconto": 225.00,
  "statusconta": "PAG",
  "numerodocumento": "NF-001",
  "numeronota": null,
  "observacao": "Reclassificação contábil conforme solicitação do controller",
  "historicocontabil": "ALUGUEL ESCRITÓRIO",
  "competenciames": "06",
  "competenciaano": "2026",
  "enviaalerta": true,
  "recorrenciafornecedor": false,
  "exibemsgrecorrencia": false,
  "agruparconta": false,
  "sincronizado": true,
  "idorigempagamento": null
}
```

**Respostas de Erro**:
- `400 Bad Request` — Nenhum campo válido informado para atualização
- `400 Bad Request` — `idcaixacentral` obrigatório quando `statusconta = PAG`
- `400 Bad Request` — `idfuncionario` obrigatório para liquidação de pagamento
- `401 Unauthorized` — Token ausente ou inválido
- `404 Not Found` — Conta com esse ID não encontrada

---

### 4. POST /athos/contas-pagar/{id}/anexo — Anexar Arquivo

**Descrição**: Envia arquivo (PDF/PNG/JPG, máx 10MB) para conta a pagar. Salva em `\\192.168.3.203\html\Anexo\contapagar\{id}\` com nome tokenizado (32 chars hex).

**Headers**:
```
Authorization: Bearer {ATHOS_API_TOKEN}
Content-Type: multipart/form-data
```

**Path Parameter**:
| Param | Tipo | Exemplo | Descrição |
|-------|------|---------|-----------|
| `id` | integer | 42 | ID da conta a pagar |

**Body** (form-data):
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `file` | file | Sim | PDF, PNG ou JPG (máx 10MB) |
| `idfuncionario` | integer | Sim | ID do funcionário que está anexando |

**Resposta 201**:
```json
{
  "idanexo": 127,
  "idcontapagar": 42,
  "arquivo": "fatura_abc.pdf",
  "caminhoanexo": "\\\\192.168.3.203\\html\\Anexo\\contapagar\\42\\a1b2c3d4e5f67890abcd1234ef567890.pdf"
}
```

**Respostas de Erro**:
- `400 Bad Request` — Arquivo inválido (tipo/tamanho)
- `401 Unauthorized` — Token ausente ou inválido
- `500 Internal Server Error` — Erro ao salvar arquivo no UNC path

---

## 🔐 Autenticação

### Configuração

```bash
# .env
ATHOS_API_TOKEN=seu-token-secreto-aqui
```

### Padrão de Uso

**Via header `x-api-token` (recomendado)**:
```bash
curl -H "x-api-token: seu-token" \
  https://api.bomcusto.com/api/athos/contas-pagar
```

**Via header `Authorization` (Bearer)**:
```bash
curl -H "Authorization: Bearer seu-token" \
  https://api.bomcusto.com/api/athos/contas-pagar
```

### Validação

- Se `ATHOS_API_TOKEN` não estiver configurado: retorna `500` com mensagem `"ATHOS_API_TOKEN nao configurado no servidor"`
- Se token não corresponder: retorna `401` com mensagem `"Token invalido ou ausente"`

---

## 📊 Schema Completo (35+ campos)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `idcontapagar` | int | ID primário (PK, serial) |
| `idfornecedor` | int | Referência ao fornecedor |
| `idfuncionario` | int | Referência ao funcionário responsável |
| `idtipoconta` | int | Tipo de conta (ex: 2 = Fornecedor) |
| `idcentrocusto` | int | Centro de custo para contabilidade |
| `idgrupoconta` | int | Grupo de conta para classificação |
| `idsubgrupoconta` | int | Subgrupo de conta |
| `idconta` | int | Conta contábil (plano de contas) |
| `idloja` | int | ID da loja/filial |
| `idbudget` | int? | Referência a budget (opcional) |
| `descricaoconta` | string | Descrição livre da conta |
| `dataemissao` | date? | Data de emissão do documento |
| `datavencimento` | date | Data de vencimento (obrigatório) |
| `datapagamento` | date? | Data quando foi paga |
| `datalancamento` | datetime | Timestamp de criação no sistema |
| `ultimaalteracao` | datetime | Timestamp da última modificação |
| `valorconta` | decimal | Valor total (obrigatório) |
| `valorpago` | decimal | Valor já pago |
| `jurosconta` | decimal | Juros acumulados |
| `multaconta` | decimal | Multa por atraso |
| `desconto` | decimal | Desconto concedido |
| `statusconta` | varchar(3) | Status: `ABE`, `PAG`, `CAN`, etc |
| `numerodocumento` | string? | Número da NF, RPA, etc |
| `numeronota` | string? | Número de nota complementar |
| `observacao` | text? | Campo livre para notas |
| `historicocontabil` | string? | Histórico para lançamento |
| `competenciames` | string(2) | Mês de competência (01-12) |
| `competenciaano` | string(4) | Ano de competência (YYYY) |
| `enviaalerta` | boolean | Sinaliza alertas pendentes |
| `recorrenciafornecedor` | boolean | É uma conta recorrente? |
| `exibemsgrecorrencia` | boolean | Mostrar mensagem de recorrência? |
| `agruparconta` | boolean | Agrupar com outras contas? |
| `sincronizado` | boolean | Status de sincronização com Athos |
| `idorigempagamento` | int? | Origem do pagamento |

---

## 🧪 Exemplo de Fluxo Completo

```bash
# 1. Listar contas em aberto
curl -H "x-api-token: token123" \
  "https://api.bomcusto.com/api/athos/contas-pagar?statusconta=ABE"

# Resposta inclui conta com idcontapagar: 42

# 2. Atualizar status para pago
curl -X PATCH -H "x-api-token: token123" \
  -H "Content-Type: application/json" \
  -d '{
    "statusconta": "PAG",
    "datapagamento": "2026-05-11",
    "valorpago": 4500.00
  }' \
  https://api.bomcusto.com/api/athos/contas-pagar/42

# 3. Anexar comprovante de pagamento
curl -X POST -H "x-api-token: token123" \
  -F "file=@comprovante.pdf" \
  -F "idfuncionario=3" \
  https://api.bomcusto.com/api/athos/contas-pagar/42/anexo
```

---

## 📝 Histórico de Mudanças

**2026-05-11**:
- ✨ Novo endpoint `PATCH /athos/contas-pagar/:id` para atualizações parciais
- 📊 Expandido schema completo de 7 para 35+ campos em GET/POST
- 🔐 Centralizado mapeamento de schema em `athos-conta-pagar.util.ts`
- 🎁 Filenames de anexo agora tokenizados (32-char hex) para segurança
- ✅ 40 testes validando todos os endpoints

**2026-05-01**:
- ✅ Adicionado `idcontapagar` a resposta de GET /athos/contas-pagar
- ✅ Documentação atualizada para refletir novo schema