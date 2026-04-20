# Instruções de Design — Pasta `grafica`

Estas instruções servem para replicar o visual moderno e responsivo do projeto "grafica" em outros projetos.

## Estrutura Visual
- Layout centralizado, com conteúdo principal em um card com sombra e bordas arredondadas.
- Utilize containers do Bootstrap para responsividade e alinhamento.
- Cabeçalho visual (logo centralizado) acima do card principal.

## Paleta de Cores
- **Tema escuro:** fundo `#1f1f1f`, textos `#f3f3f3`, cards `#2b2b2b` ou `#323232`.
- **Tema claro:** fundo `#f5f5f5`, textos `#222`, cards `#fff` ou `#f4f4f4`.
- **Destaques e botões:** tons de azul (`#0d6efd`) e laranja (`#fd7e14`).
- **Alertas:** vermelho (`#ff6b6b`), verde para confirmações.

## Tipografia
- Fonte: "Inter", "Segoe UI", system-ui, sans-serif.
- Títulos grandes e em negrito, subtítulos com opacidade reduzida.

## Componentes
- **Botões:** arredondados, padding generoso, cores de fundo e borda que mudam no hover.
- **Cards:** bordas arredondadas, sombra leve, padding interno.
- **Formulários:** campos com bordas arredondadas, preenchimento confortável, labels claras.
- **Modais:** centralizados, botões de ação destacados (vermelho/verde).

## Utilitários CSS
- `.hidden` para esconder elementos.
- `.toast` para notificações flutuantes no canto inferior direito.
- `.badge-new` para destaques pequenos e arredondados.
- `.summary`, `.status-list`, `.tabs`, `.carimbos-list` para grids e listas responsivas.

## Temas
- Suporte a tema claro e escuro via classes no `<body>`, alterando cores de fundo, texto e componentes.

## Exemplo de Uso

```html
<link rel="stylesheet" href="styles.css">
<body class="theme-light">
  <div class="app">
    <div class="app-header">
      <div class="title">
        <h1>Título</h1>
        <p>Subtítulo</p>
      </div>
      <div class="actions">
        <button class="btn btn-accent">Ação</button>
      </div>
    </div>
    <div class="summary">
      <div class="summary-card">Conteúdo</div>
    </div>
  </div>
</body>
```

---

Basta copiar o CSS da pasta `grafica` e seguir esta estrutura para obter o mesmo visual em outros projetos.
