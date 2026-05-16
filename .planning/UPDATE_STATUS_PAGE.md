Para criar um prompt eficiente para outra IA, analisei a estrutura do repositório **Get Shit Done (GSD)**. Ele é focado em uma arquitetura de microsserviços, utilizando **Node.js/TypeScript** no backend, **React** no frontend e comunicação via **RabbitMQ** ou **WebSockets** para mensageria.

Abaixo está o prompt estruturado para você enviar à outra IA (como Cursor, Claude ou GPT-4). Ele contextualiza o projeto e dá as instruções técnicas exatas para as novas funcionalidades.

---

### Prompt para a IA

**Contexto do Projeto:**
Estou trabalhando em um sistema baseado no repositório `gsd-build/get-shit-done`. O projeto utiliza uma arquitetura de microsserviços com **Node.js**, **React (Vite)**, **TypeScript** e **Tailwind CSS**. A comunicação em tempo real deve seguir o padrão de eventos já estabelecido no projeto (provavelmente via Socket.io ou notificações via mensageria).

**Objetivo:**
Implementar uma nova Dashboard de Orçamentos ("Visão do Gestor") que seja puramente informativa, interativa e atualizada em tempo real.

**Requisitos Técnicos e Funcionais:**

1. **Página Principal de Orçamentos (Read-only):**
* Crie uma visualização de "Dashboard" onde não seja possível editar dados, apenas visualizar.
* Exibir cards ou uma tabela moderna com: **Número do Pedido**, **Valor**, **Cliente** e **Status Atual**.


2. **Atualização em Tempo Real:**
* Implemente a integração com o WebSocket do projeto para que, sempre que um status de orçamento mudar no backend, a interface reflita a mudança instantaneamente sem refresh.
* Destaque visualmente (ex: um brilho ou borda colorida temporária) quando um pedido mudar de status.


3. **Informações de Caixa:**
* Adicionar um campo específico em cada pedido indicando se o "Pagamento foi realizado no Caixa" (booleano vindo da API).


4. **Sistema de Notificações:**
* **Toast/Popup:** Notificação no canto da tela sempre que um novo pedido entrar no sistema.
* **Banner Persistente:** Um aviso no topo da página mostrando o "Último Pedido Recebido". Este banner deve ser persistente (ficar lá mesmo após o refresh), mas deve conter um botão "Fechar/Dispensar" que limpa o estado local.


5. **Aba de Carimbos:**
* Criar uma aba lateral ou seção específica para "Acompanhamento de Carimbos" (Fidelidade/Processo), listando o progresso de selos de cada pedido ou cliente.


6. **Integrações e Links:**
* Adicionar um botão flutuante ou no menu lateral com o link direto para o atendimento no **Chatwoot**.
* Adicionar um botão de atalho rápido para a página de "Criação de Novo Orçamento".



**Instruções de Estilo:**

* Mantenha o padrão de componentes do Shadcn/UI (se disponível) ou Tailwind puro seguindo o design system do GSD.
* O código deve ser limpo, tipado com TypeScript e seguir o padrão de Hooks do React.

---

### Dicas para você aplicar no seu projeto:

* **No Backend (GSD):** Verifique se o serviço de `orders` ou `quotes` está emitindo eventos para o barramento de mensagens quando um status é alterado. Você precisará que o serviço de Gateway/Socket repasse isso para o Front.
* **No Frontend:** Utilize bibliotecas como `react-query` (ou `swr`) para o estado dos dados e `socket.io-client` para capturar os eventos em tempo real.
* **Persistência da Notificação:** Para o banner persistente que pode ser desativado, peça para a IA usar o `localStorage` do navegador para salvar se o usuário já "fechou" aquela notificação específica.