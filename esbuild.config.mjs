import { build } from "esbuild";
import { readFileSync } from "node:fs";

// A licença ISC do d3 exige o aviso de copyright em toda cópia, inclusive no main.js da release
const d3License = readFileSync("node_modules/d3-force/LICENSE", "utf8").replace("2010-2021", "2010-2026");

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // O Obsidian já fornece estes módulos em tempo de execução
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2022",
  outfile: "main.js",
  banner: { js: `/*! Floating Graph — MIT License, Copyright (c) 2026 Vitor Teixeira.\nBundles d3-force, d3-quadtree, d3-dispatch and d3-timer (ISC License):\n\n${d3License}*/` },
  logLevel: "info",
});
