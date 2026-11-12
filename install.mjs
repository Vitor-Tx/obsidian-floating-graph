// Copia o plugin para a pasta de plugins de cada vault que o Obsidian conhece.
import { readFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const { vaults } = JSON.parse(readFileSync(join(homedir(), ".config/obsidian/obsidian.json"), "utf8"));
for (const { path } of Object.values(vaults)) {
  if (!existsSync(path)) continue;
  const dest = join(path, ".obsidian/plugins/floating-graph");
  mkdirSync(dest, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(f, join(dest, f));
  console.log("instalado em", dest);
}
