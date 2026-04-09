# Validação Chatwoot - Backend

## Resumo
A validação Chatwoot foi implementada no `QuotesService` para garantir que dados de contexto do Chatwoot sejam válidos quando informados.

## Validações Implementadas

### 1. **conversationId**
- ✅ Se informado: deve ser um número > 0
- ✅ Se não informado: opcional (null/undefined)
- ❌ Se 0 ou negativo: lança `BadRequestException`

### 2. **chatwootContactId**
- ✅ Se informado: deve ser um número > 0
- ✅ Se não informado: opcional (null/undefined)
- ❌ Se 0 ou negativo: lança `BadRequestException`

### 3. **Validação Complementar**
- ⚠️ Se um campo está informado mas o outro não, registra `console.warn` (não é erro, apenas avisoão informativo)

## Método Implementado

```typescript
private validateChatwootContext(payload: CreateQuoteDto): void
```

Chamado automaticamente no início de `create()` após validar cliente e itens.

## Como Testar (Manual)

### Teste 1: Request com IDs válidos
```bash
curl -X POST http://localhost:4000/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "cliente": { "nome": "João Silva" },
    "itens": [{"produto": {"descricaoproduto": "Produto A"}, "quantidadeitem": 1, "valoritem": 100}],
    "conversationId": 12345,
    "chatwootContactId": 67890
  }'
```
✅ Vai aceitar e criar orçamento

### Teste 2: Request sem IDs Chatwoot
```bash
curl -X POST http://localhost:4000/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "cliente": { "nome": "Maria" },
    "itens": [{"produto": {"descricaoproduto": "Produto B"}, "quantidadeitem": 2, "valoritem": 50}]
  }'
```
✅ Vai aceitar (Chatwoot é opcional)

### Teste 3: conversationId inválido (0)
```bash
curl -X POST http://localhost:4000/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "cliente": { "nome": "João" },
    "itens": [{"produto": {"descricaoproduto": "Produto"}, "quantidadeitem": 1, "valoritem": 100}],
    "conversationId": 0
  }'
```
❌ Vai retornar erro:
```json
{
  "statusCode": 400,
  "message": "conversationId invalido: deve ser um número positivo"
}
```

### Teste 4: chatwootContactId negativo
```bash
curl -X POST http://localhost:4000/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "cliente": { "nome": "Pedro" },
    "itens": [{"produto": {"descricaoproduto": "Produto"}, "quantidadeitem": 1, "valoritem": 75}],
    "chatwootContactId": -99
  }'
```
❌ Vai retornar erro:
```json
{
  "statusCode": 400,
  "message": "chatwootContactId invalido: deve ser um número positivo"
}
```

## Integração com Frontend

O frontend agora envia `conversationId` e `chatwootContactId` como parte do payload POST. O backend valida:

1. ✅ Se é um número positivo
2. ✅ Se há contexto incompleto (um presente, outro não) - aviso no console
3. ✅ Salva ambos os campos no banco de dados

## Arquivos Modificados

- `apps/backend/src/modules/quotes/quotes.service.ts` - Adicionado método `validateChatwootContext()` e chamada em `create()`
- `apps/backend/src/modules/quotes/quotes.service.chatwoot.test.ts` - Arquivo de testes (não é compilado no build, apenas para referência)

## Próximas Etapas (Opcional)

1. Configurar Jest se desejar testes completos no pipeline CI/CD
2. Adicionar logs estruturados para rastrear contextos Chatwoot incompletos
3. Criar dashboard de métricas para uso de contextos Chatwoot
