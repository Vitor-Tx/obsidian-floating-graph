import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // O Obsidian já fornece estes módulos em tempo de execução
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2022",
  outfile: "main.js",
  logLevel: "info",
});
