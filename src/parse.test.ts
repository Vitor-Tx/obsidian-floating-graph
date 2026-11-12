import { test } from "node:test";
import assert from "node:assert/strict";
import { splitNote, hash, pairs, matches } from "./parse.ts";

test("agrupa falas em conversas de duas", () => {
  assert.deepEqual(pairs(["a", "b", "c"]), [["a", "b"], ["c"]]);
  assert.deepEqual(pairs([]), []);
});

test("busca por título ou alias, sem diferenciar maiúsculas", () => {
  assert.ok(matches("cont", ["Context window"]));
  assert.ok(matches("LLM", ["Model", "llm"]));
  assert.ok(!matches("xyz", ["Model"]));
  assert.ok(matches("  ", ["Model"]));
});

test("separa definição, Avoid e Usage", () => {
  const p = splitNote('---\ndescription: x\n---\n\nTexto [a](./A.md).\n\n_Avoid:_ "y" — vago.\n\n_Usage:_\n\n"Pergunta?"\n\n"Resposta."\n');
  assert.equal(p.body, "Texto [a](./A.md).");
  assert.deepEqual(p.avoid, ['"y" — vago.']);
  assert.deepEqual(p.quotes, ["Pergunta?", "Resposta."]);
});

test("nota comum volta inteira", () => {
  assert.deepEqual(splitNote("# Título\n\nCorpo"), { body: "# Título\n\nCorpo", avoid: [], quotes: [] });
});

test("hash é estável e fica entre 0 e 1", () => {
  assert.equal(hash("Token"), hash("Token"));
  assert.ok(hash("Token") >= 0 && hash("Token") <= 1);
});
