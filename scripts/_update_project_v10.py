import re

c = open('.planning/PROJECT.md', encoding='utf-8').read()

new_validated_block = '''### Validated

- checkmark Criacao de orcamentos com itens e carimbos -- fase 0
- checkmark Geracao de PDF e upload MinIO -- fase 0
- checkmark Envio via Chatwoot + link de aprovacao por token -- fase 0
- checkmark Emissao de NFS-e via SOAP iiBrasil -- fase 0
- checkmark Cobranca PIX via EFI Pay com webhooks -- fase 0
- checkmark Integracao read-only Athos ERP e PDV -- fase 0
- checkmark Deploy CI/CD via GitHub Actions + VPS Tailscale -- fase 0
- checkmark Autenticacao global via x-internal-api-key + guard NestJS -- v1.0
- checkmark Webhooks EFI validados com HMAC-SHA256 -- v1.0
- checkmark Fail-fast de variaveis de ambiente criticas -- v1.0
- checkmark Rate limiting global -- v1.0
- checkmark Logger estruturado em todas as integracoes -- v1.0
- checkmark enviarParaCliente assicrono (fire-and-forget) -- v1.0
- checkmark pg.Pool para Athos (max 5 conexoes) -- v1.0
- checkmark Health check com status das integracoes -- v1.0
- checkmark Maquina de estados integra (approveByToken via changeStatus) -- v1.0
- checkmark Paginacao take=50, max 200, retorna total -- v1.0
- checkmark isAssociated como campo booleano real no response -- v1.0
- checkmark 32 testes automatizados (Jest) + CI GitHub Actions -- v1.0
- checkmark Filter pills, toast feedback, validacao de form -- v1.0
- checkmark Badges de integracao (NFS-e, PIX, aprovacao) no painel -- v1.0
- checkmark Paginas do cliente para aprovacao e status -- v1.0'''

new_active_block = '''### Active

<!-- v1.1 scope -->

- [ ] Envio automatico de link de aprovacao ao associar idcliente no Athos
- [ ] Pagina publica de aprovacao com validacao via Athos
- [ ] RBAC por role (ADMIN / VENDEDOR / ATENDENTE)'''

pattern = r'### Validated.*?(?=### Active)'
c_new = re.sub(pattern, new_validated_block + '\n\n', c, flags=re.DOTALL)

pattern2 = r'### Active.*?(?=### Out of Scope)'
c_new = re.sub(pattern2, new_active_block + '\n\n', c_new, flags=re.DOTALL)

c_new = c_new.replace(
    '*Last updated: 2026-05-01',
    '*Last updated: 2026-05-02 -- v1.0 milestone shipped (Phases 1-5). Originally: 2026-05-01'
)

open('.planning/PROJECT.md', 'w', encoding='utf-8').write(c_new)
print('done')
