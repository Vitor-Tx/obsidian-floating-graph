# Floating Graph

An alternative graph view for Obsidian, inspired by the visualization Matt Pocock uses for his [AI Coding Dictionary](https://github.com/mattpocock/dictionary-of-ai-coding).

- Notes are grey circles with depth: closer ones are larger and darker, and all of them drift slowly.
- Links stay hidden until a note is active, then appear with small dots travelling along them.
- Click a note and the camera glides to it while a side panel slides in with the folder, its position ("12 / 80"), title, aliases, `description` and `tags` from the frontmatter, its connections, and the rendered note (collapsed with "Read more"). Links inside the panel move around the graph.
- Notes written like the dictionary's entries (`_Usage:_` and `_Avoid:_` sections) get chat bubbles, in a carousel when there is more than one exchange, and an "Avoid" section.
- Search filters the graph live by title or alias.
- Folder colors: the whole view takes the color of the open note's folder.
- The open note and the color mode are saved with your workspace.

## Usage

Click the orbit icon in the left ribbon, or run **Floating Graph: Open graph** from the command palette.

| Action | Result |
|---|---|
| Hover a note | highlights its links |
| Click a note | opens the side panel |
| Click the background or press `Esc` | closes the panel |
| Drag / scroll | pan / zoom |
| `/` or the search icon | search; `Enter` opens the first match, `Esc` clears. `/` only works while the graph tab is active and can be turned off in the plugin settings; to use another key, set a hotkey for **Search notes in graph** in Settings → Hotkeys |
| `←` / `→` or **Prev / Next** | previous / next note (by folder, then name) |
| Palette icon (bottom right) | switch between grayscale and folder colors |
| **Open note ↗** | opens the note in a split |
| **Copy markdown** / **Copy link** | copies the note's Markdown or an `obsidian://` link to it |

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

[MIT](LICENSE).

The bundled `main.js` includes [d3-force](https://github.com/d3/d3-force), [d3-quadtree](https://github.com/d3/d3-quadtree), [d3-dispatch](https://github.com/d3/d3-dispatch) and [d3-timer](https://github.com/d3/d3-timer) by Mike Bostock, under the ISC License. Their license notice is kept at the top of `main.js`.

This plugin makes no network requests. It lists the Markdown files in your vault and their links to build the graph, and reads a note only when you open it in the panel. It never writes or deletes files.
