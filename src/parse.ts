// Partes do texto de uma nota que o painel mostra separadas (formato do AI Coding Dictionary).
// Nota sem "_Usage:_" nem "_Avoid:_" volta inteira em `body`.
export interface NoteParts { body: string; quotes: string[]; avoid: string[] }

export function splitNote(text: string): NoteParts {
  const content = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  const [main, usage = ""] = content.split("_Usage:_");
  const lines = main.trim().split("\n");
  return {
    body: lines.filter((l) => !l.startsWith("_Avoid:_")).join("\n").trim(),
    avoid: lines.filter((l) => l.startsWith("_Avoid:_")).map((l) => l.replace(/^_Avoid:_\s*/, "")),
    quotes: usage.split("\n").map((l) => l.trim()).filter((l) => l.startsWith('"')).map((l) => l.replace(/^"|"$/g, "")),
  };
}

// Falas do "Heard in the wild" em conversas de pergunta + resposta (um slide do carrossel cada)
export function pairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

// Busca: o texto aparece no título ou num alias, sem diferenciar maiúsculas
export function matches(query: string, names: string[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || names.some((n) => n.toLowerCase().includes(q));
}

// Hash estável do nome: a mesma nota fica sempre na mesma profundidade e fase da flutuação.
export function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}
