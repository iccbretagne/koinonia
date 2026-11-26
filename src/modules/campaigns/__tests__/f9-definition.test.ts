import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { campaignDefinitionSchema } from "../schemas";
import { validateDefinition } from "../services/definition";

const OFFICIAL_CODES = [
  "M0", "M1", "A1", "A2", "V1", "V2",
  ...[1, 2, 3, 4, 5, 6].map((n) => `E${n}`),
  ...[1, 2, 3, 4].map((n) => `R${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `G${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `C${n}`),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `D${n}`),
  "S1", "S2", "B1", "B2",
  ...[1, 2, 3, 4].map((n) => `P${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `F${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `L${n}`),
  "EV1", "EV2", "EV3", "DI1", "DI2", "DI3",
  ...[1, 2, 3, 4].map((n) => `K${n}`),
  ...[1, 2, 3].map((n) => `H${n}`),
  ...[1, 2, 3, 4].map((n) => `X${n}`),
  "EX1", "EX2",
  ...[1, 2, 3, 4, 5, 6].map((n) => `I${n}`),
];

type Item = { code: string; internal?: boolean; fields?: Item[] };
type Def = {
  forms: { sections: { items: Item[] }[] }[];
  rules: { check: unknown }[];
};

const raw = readFileSync(
  path.resolve(__dirname, "../../../../specs/090-campagnes-collecte/f9-2026.json"),
  "utf8",
);
const def = JSON.parse(raw) as Def;

const allItems = (): Item[] =>
  def.forms.flatMap((f) => f.sections.flatMap((s) => s.items.flatMap((i) => [i, ...(i.fields ?? [])])));

function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => strings(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach((n) => strings(n, out));
  return out;
}

describe("définition F9 2026", () => {
  it("est valide (schéma Zod et validation sémantique)", () => {
    const parsed = campaignDefinitionSchema.parse(def);
    const result = validateDefinition(parsed) as unknown;
    if (Array.isArray(result)) expect(result).toEqual([]);
  });

  it("compte 15 questionnaires", () => {
    expect(def.forms).toHaveLength(15);
  });

  it("contient les 79 codes officiels exactement une fois, non internes", () => {
    expect(OFFICIAL_CODES).toHaveLength(79);
    const visible = allItems().filter((i) => !i.internal).map((i) => i.code);
    for (const code of OFFICIAL_CODES) {
      expect(visible.filter((c) => c === code), code).toHaveLength(1);
    }
    const official = new Set(OFFICIAL_CODES);
    for (const i of allItems().filter((i) => official.has(i.code))) {
      expect(i.internal, i.code).toBeFalsy();
    }
  });

  it("chaque règle référence des codes existants", () => {
    const codes = new Set(allItems().map((i) => i.code));
    for (const rule of def.rules) {
      for (const code of strings(rule.check)) expect(codes.has(code), code).toBe(true);
    }
  });
});
