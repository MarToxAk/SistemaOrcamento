# Arquitetura

## Contexto

O backend proprio centraliza regras de negocio que antes ficavam espalhadas em fluxos n8n. O n8n pode continuar para automacoes perifericas, sem ser o core transacional.

## Blocos

1. Frontend Next.js
- Dashboard operacional para criar e acompanhar orcamentos.

2. Backend NestJS
- API REST para clientes, orcamentos e status.
- Integracao com Chatwoot (contatos, conversa, retorno de status).
- Integracao com PDV (leitura de dados para enriquecer orcamento).

3. Banco PostgreSQL principal
- Persistencia de clientes, orcamentos, itens e historico de status.

## Integracoes

1. Chatwoot
- Busca de contato por nome/telefone/email.
- Criacao de orcamento a partir de conversa.
- Atualizacao de status e envio de link/PDF.

2. PDV legado
- Leitura por conector dedicado.
- Sem escrita na V1 para reduzir risco.
