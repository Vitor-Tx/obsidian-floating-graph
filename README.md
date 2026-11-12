# Floating Graph

Plugin do Obsidian que mostra o vault como um grafo flutuante, inspirado na visualização que o Matt Pocock usa para o [AI Coding Dictionary](https://github.com/mattpocock/dictionary-of-ai-coding).

- Bolinhas em tons de cinza com profundidade (perto = maior e mais escura) que flutuam devagar.
- As linhas só aparecem na nota ativa, com pontinhos correndo por elas.
- Ao clicar, a câmera desliza até a nota e um painel entra pela direita com pasta, título, `description` e `tags` do frontmatter, as conexões e a nota renderizada. Os links do painel navegam pelo grafo.
- Notas no formato do dicionário (`_Usage:_` e `_Avoid:_`) ganham balões de conversa e uma seção "Avoid".

## Instalar (manual)

```bash
git clone https://github.com/Vitor-Tx/obsidian-floating-graph
cd obsidian-floating-graph
npm install
npm run build
```

Copie `main.js`, `manifest.json` e `styles.css` para `<seu-vault>/.obsidian/plugins/floating-graph/` e ative **Floating Graph** em Settings → Community plugins. No Linux, `npm run install-vaults` faz a cópia para todos os vaults listados em `~/.config/obsidian/obsidian.json`.

Para abrir: ícone de órbita na barra lateral, ou `Ctrl+P` → "Abrir floating graph".

## Desenvolvimento

| Comando | O que faz |
|---|---|
| `npm test` | testa o separador de partes da nota (`src/parse.ts`) |
| `npm run build` | checa os tipos e gera `main.js` com esbuild |
| `npm run install-vaults` | build + cópia para os vaults locais |

O layout é calculado com [d3-force](https://github.com/d3/d3-force) e desenhado num `<canvas>`.
