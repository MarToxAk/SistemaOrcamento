Título: tests: estabiliza validações NFS-e e evita timers do Athos listener bloquearem o Jest

Resumo
- Corrige instabilidades em testes unitários que causavam timeouts e warnings de handles abertos no Jest.

Principais mudanças
- Mock explícito de `getInfoNfse()` nos testes de validação de desconto em `apps/backend/src/modules/integrations/nfse/nfse.discount.test.ts` para evitar chamadas externas indesejadas.
- Evita chamadas duplicadas de `service.emitir()` nos testes — reutiliza a mesma Promise para asserções de rejeição.
- Marca timers de keep-alive/reconexão no `AthosListenerService` com `unref()` para que não mantenham o event loop vivo (`apps/backend/src/modules/integrations/athos/athos-listener.service.ts`).
- Garante teardown nos testes do listener chamando `onApplicationShutdown()` em `afterEach` para limpar timers e fechar o client (`apps/backend/src/modules/integrations/athos/athos-listener.service.test.ts`).

Validação
- Testes locais executados com `--detectOpenHandles`.
- Resultado: suíte completa do backend passou (12 suítes, 162 testes).

Como testar localmente
```bash
git checkout fix/tests/nfse-athos-teardown
npm --workspace @orcamento/backend run test
```

Observações
- O push não foi executado automaticamente porque este repositório não tem `origin` configurado localmente. Para publicar a branch e abrir o PR, adicione o remote e execute:
```bash
git remote add origin <URL_DO_REPOSITORIO>
git push -u origin fix/tests/nfse-athos-teardown
```

Sugestão de título do PR
- "tests: estabiliza validações NFS-e e evita timers do Athos listener bloquearem o Jest"

Descrição resumida (p/ template do PR)
- Causa: timers do listener (setInterval/setTimeout) mantinham handles vivos; testes de validação chamavam código que requeria a API auxiliar, causando hangs quando não mockada.
- Correção: mock local de `getInfoNfse()`, uso de `unref()` em timers e cleanup obrigatório em testes.
