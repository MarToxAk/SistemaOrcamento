Correção: Link de Aprovação de Orçamento não Enviado

Problema: Ao associar um cliente ao orçamento e realizar o envio, o link que permite a aprovação online não está sendo gerado ou incluído na mensagem.

1. Diagnóstico Técnico

O link de aprovação (Approval Link) geralmente é composto por:
{BASE_URL}/aprovar/{HASH_UNICO_ORCAMENTO}

Verificamos que na tabela orcamento:

Não existe um campo explícito de hash_aprovacao.

O campo statusmobile (atualmente 1 no orç. 15208) pode estar sendo usado como gatilho, mas sem o token de segurança, o link não é gerado.

2. Script de Ajuste de Infraestrutura (Opcional)

Se o sistema exigir um token persistente, recomenda-se usar o campo history_code (se disponível) ou gerar um dinamicamente baseado no idorcamento e dataorcamento.

3. Instruções para o /gsd-quick

Utilize o prompt abaixo para que o GSD corrija a lógica de geração do link.

Prompt para o /gsd-quick:

Task: Restaurar Link de Aprovação no Envio de Orçamentos

1. Geração de Token de Aprovação:

No AthosService, crie uma função generateApprovalLink(orcamentoId: number).

Use uma biblioteca de criptografia simples (ex: crypto) para gerar um hash MD5 ou SHA1 baseado no idorcamento + SECRET_KEY.

O link final deve seguir o padrão: https://meuathos.com.br/aprovar?t={TOKEN}.

2. Integração com o Fluxo de Envio:

Localize o método que associa o idcliente ao orçamento.

No momento do envio (seja via E-mail ou WhatsApp/n8n), garanta que a variável link_aprovacao seja injetada no template da mensagem.

Atualize o campo statusorcamento para garantir que o orçamento não esteja "Cancelado" antes de gerar o link.

3. Validação de Endpoint:

Crie ou verifique o endpoint GET /athos/orcamentos/validar-link/:token.

Este endpoint deve descriptografar o token, localizar o idorcamento e retornar os dados básicos para o cliente aprovar.

4. Verificação:

Teste o envio para o orçamento 15208 e verifique se a string de retorno agora contém uma URL válida.

4. Relação com Tabelas

Tabela orcamento: Atualizar statusorcamento após o envio do link.

Tabela cliente: Usar o e-mail/telefone do idcliente para o destino do link.