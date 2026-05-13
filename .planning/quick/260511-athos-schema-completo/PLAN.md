---
slug: athos-schema-completo
task: Implementar Schema Completo Athos
description: Expandir GET/POST/PATCH de conta_pagar com schema completo baseado em DATABASE_SCHEMA.md
created: 2026-05-11
---

# Quick Task: Schema Completo Athos

## Objetivo

Atualizar a integração Athos de contas a pagar para trabalhar com o schema completo da tabela conta_pagar, incluindo GET com todos os campos relevantes, POST aceitando DTO expandido e novo PATCH para atualização parcial.

## Trabalho

1. Centralizar o schema de conta_pagar em util compartilhado
2. Expandir CreateContaPagarDto e criar UpdateContaPagarDto
3. Atualizar AthosService para listar, criar e atualizar com o schema completo
4. Expor PATCH no AthosController
5. Cobrir o fluxo com testes focados

## Verificação

- [x] Build do backend: OK
- [x] Testes Athos: 40 passaram
- [x] idcontapagar presente nos retornos relevantes
