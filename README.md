# Floating Graph

An alternative graph view for Obsidian, inspired by the visualization Matt Pocock uses for his [AI Coding Dictionary](https://github.com/mattpocock/dictionary-of-ai-coding).

- Notes are grey circles with depth: closer ones are larger and darker, and all of them drift slowly.
- Links stay hidden until a note is active, then appear with small dots travelling along them.
- Click a note and the camera glides to it while a side panel slides in with the folder, title, `description` and `tags` from the frontmatter, its connections, and the rendered note. Links inside the panel move around the graph.
- Notes written like the dictionary's entries (`_Usage:_` and `_Avoid:_` sections) get chat bubbles and an "Avoid" section.

## Usage

Click the orbit icon in the left ribbon, or run **Floating Graph: Open graph** from the command palette.

| Action | Result |
|---|---|
| Hover a note | highlights its links |
| Click a note | opens the side panel |
| Click the background or press `Esc` | closes the panel |
| Drag / scroll | pan / zoom |
| **Open note ↗** | opens the note in a split |

## Manual install

Copy `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/Vitor-Tx/obsidian-floating-graph/releases/latest) to `<vault>/.obsidian/plugins/floating-graph/`, then enable **Floating Graph** in Settings → Community plugins.

## Development

```bash
npm install
npm test                # tests for the note parser (src/parse.ts)
npm run build           # type-check and bundle main.js with esbuild
npm run install-vaults  # build and copy to every local vault (Linux)
```

The layout is computed with [d3-force](https://github.com/d3/d3-force) and drawn on a `<canvas>`.

## License

[MIT](LICENSE)
