# Summary 14-01 — Desconto Controlado na NFS-e

## Resultado
Implementação completa. Todos os requisitos NFSD-01 a NFSD-05 entregues.

## Mudanças realizadas

### `nfse.service.ts`
- Interface `EmitirNfseInput`: adicionados `descontoAtivo`, `descontoPorcentagem`, `descontoValor`, `totalPago`
- `buildRpsXml()`: novo parâmetro `descontoIncondicionado: number`; XML agora usa template dinâmico
- `emitir()`: bloco de cálculo e validação de desconto (pós `valorServicos`, pré `discriminacao`)

### `nfse.discount.test.ts` (novo)
- 8 testes criados e passando: 4 para XML, 4 para validações

## Verificações
- `tsc --noEmit`: sem erros
- `jest nfse.discount`: 8/8 passing
