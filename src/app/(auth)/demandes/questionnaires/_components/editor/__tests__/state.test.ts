import { describe, expect, it } from "vitest";
import { campaignDefinitionSchema, validateDefinition, type CampaignDefinition, type DefinitionItem } from "@/modules/campaigns/schemas";
import {
  addChoice,
  addForm,
  addGroupField,
  addItem,
  addRule,
  addSection,
  blankDefinition,
  changeItemType,
  cloneItem,

  describeTarget,
  duplicateForm,
  duplicateItem,
  duplicateSection,
  fromSimpleRule,
  issuesByTarget,
  move,
  moveForm,
  moveItem,
  moveItemToSection,
  newCode,
  newKey,
  randomChars,
  removeRule,
  targetOfMessage,
  targetOfPath,
  toSimpleRule,
  updateItem,
  validateEditor,
  withOptional,
} from "../state";

/** Aléa déterministe (générateur congruentiel), pour des identifiants reproductibles. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function allIds(def: CampaignDefinition): string[] {
  const ids: string[] = [def.campaign.key];
  const item = (i: DefinitionItem | { code: string; type: string; choices?: { key: string }[]; fields?: unknown[] }) => {
    ids.push(i.code);
    if ("choices" in i && i.choices) ids.push(...i.choices.map((c) => c.key));
    if ("fields" in i && i.fields) (i.fields as DefinitionItem[]).forEach(item);
  };
  for (const f of def.forms) {
    ids.push(f.key, ...f.assignments.map((a) => a.key));
    for (const s of f.sections) {
      ids.push(s.key);
      s.items.forEach(item);
    }
  }
  ids.push(...(def.rules ?? []).map((r) => r.key));
  return ids;
}

const valid = (def: CampaignDefinition) => {
  const parsed = campaignDefinitionSchema.safeParse(def);
  return parsed.success && validateDefinition(parsed.data).length === 0;
};

describe("identifiants", () => {
  it("génère des codes Q_ + 6 base 36 et des clés préfixées, uniques", () => {
    const taken = new Set<string>();
    const code = newCode(taken);
    expect(code).toMatch(/^Q_[0-9A-Z]{6}$/);
    expect(newKey("f", taken)).toMatch(/^f-[0-9a-z]{6}$/);
    expect(taken.size).toBe(2);
  });

  it("ne réutilise jamais un identifiant déjà pris", () => {
    // Aléa constant puis variable : la première valeur est prise, la suivante est différente.
    let n = 0;
    const random = () => (n++ < 6 ? 0 : 0.5);
    const taken = new Set<string>(["Q_000000"]);
    const code = newCode(taken, random);
    expect(code).not.toBe("Q_000000");
    expect(taken.has(code)).toBe(true);
  });

  it("randomChars reste en base 36", () => {
    expect(randomChars(20, () => 0.9999999)).toMatch(/^z{20}$/);
  });
});

describe("document vierge", () => {
  it("est valide : un questionnaire, un destinataire, une section, une question", () => {
    const def = blankDefinition(seeded());
    expect(valid(def)).toBe(true);
    expect(def.forms).toHaveLength(1);
    expect(def.forms[0].assignments).toHaveLength(1);
    expect(def.forms[0].sections).toHaveLength(1);
    expect(def.forms[0].sections[0].items).toHaveLength(1);
    expect(def.campaign.key).toMatch(/^campagne-[0-9a-z]{8}$/);
  });
});

describe("ajout, duplication, suppression, déplacement", () => {
  it("chaque type de question vierge est valide", () => {
    let def = blankDefinition(seeded(2));
    for (const type of ["integer", "decimal", "text", "longtext", "yesno", "single", "multiple", "date", "group", "file_request"] as const) {
      def = addItem(def, 0, 0, type, seeded(type.length));
    }
    expect(valid(def)).toBe(true);
    expect(new Set(allIds(def)).size).toBe(allIds(def).length);
  });

  it("dupliquer un questionnaire génère de nouveaux identifiants partout", () => {
    let def = blankDefinition(seeded(3));
    def = addItem(def, 0, 0, "multiple", seeded(4));
    def = addItem(def, 0, 0, "group", seeded(5));
    def = duplicateForm(def, 0, seeded(6));
    expect(def.forms).toHaveLength(2);
    expect(def.forms[1].title).toBe("Questionnaire (copie)");
    const ids = allIds(def);
    expect(new Set(ids).size).toBe(ids.length);
    expect(valid(def)).toBe(true);
  });

  it("dupliquer une question renouvelle code, sous-champs et choix, et retire le code de restitution", () => {
    const taken = new Set<string>();
    const group: DefinitionItem = {
      code: "Q_GROUP1",
      label: "Groupe",
      type: "group",
      reportCode: "G1",
      fields: [{ code: "Q_FIELD1", label: "Choix", type: "single", choices: [{ key: "c-aaaaaa", label: "A" }] }],
    };
    taken.add("Q_GROUP1").add("Q_FIELD1").add("c-aaaaaa");
    const copy = cloneItem(group, taken, seeded(7));
    expect(copy.code).not.toBe("Q_GROUP1");
    expect(copy.reportCode).toBeUndefined();
    if (copy.type !== "group") throw new Error("type");
    const field = copy.fields[0];
    expect(field.code).not.toBe("Q_FIELD1");
    if (field.type !== "single") throw new Error("type");
    expect(field.choices[0].key).not.toBe("c-aaaaaa");
    expect(field.choices[0].label).toBe("A");
  });

  it("dupliquer une section ou une question l'insère juste après", () => {
    let def = blankDefinition(seeded(8));
    def = addSection(def, 0, seeded(9));
    def = duplicateSection(def, 0, 0, seeded(10));
    expect(def.forms[0].sections.map((s) => s.title)).toEqual(["Nouvelle section", "Nouvelle section (copie)", "Nouvelle section"]);
    def = duplicateItem(def, 0, 0, 0, seeded(11));
    expect(def.forms[0].sections[0].items[1].label).toBe("Nouvelle question (copie)");
    expect(valid(def)).toBe(true);
  });

  it("move : monter, descendre, bornes", () => {
    expect(move(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(move(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(move(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("réordonne questionnaires et questions sans changer les identifiants", () => {
    let def = addForm(blankDefinition(seeded(12)), seeded(13));
    const keys = def.forms.map((f) => f.key);
    def = moveForm(def, 1, -1);
    expect(def.forms.map((f) => f.key)).toEqual([keys[1], keys[0]]);
    def = addItem(def, 0, 0, "text", seeded(14));
    const codes = def.forms[0].sections[0].items.map((i) => i.code);
    def = moveItem(def, 0, 0, 1, -1);
    expect(def.forms[0].sections[0].items.map((i) => i.code)).toEqual([codes[1], codes[0]]);
  });

  it("déplace une question vers une autre section en gardant son code", () => {
    let def = addSection(blankDefinition(seeded(15)), 0, seeded(16));
    const code = def.forms[0].sections[0].items[0].code;
    def = addItem(def, 0, 0, "text", seeded(17));
    def = moveItemToSection(def, 0, 0, 0, 1);
    expect(def.forms[0].sections[0].items).toHaveLength(1);
    expect(def.forms[0].sections[1].items.at(-1)?.code).toBe(code);
    expect(moveItemToSection(def, 0, 1, 0, 1)).toBe(def);
  });

  it("ne modifie jamais le document d'origine", () => {
    const def = blankDefinition(seeded(18));
    const before = JSON.stringify(def);
    addItem(def, 0, 0, "text");
    duplicateForm(def, 0);
    moveItemToSection(addSection(def, 0), 0, 0, 0, 1);
    expect(JSON.stringify(def)).toBe(before);
  });
});

describe("changement de type, choix, groupe", () => {
  it("garde les champs communs et les choix entre choix unique et multiple", () => {
    const taken = new Set<string>();
    const multiple: DefinitionItem = {
      code: "Q_M",
      label: "L",
      help: "aide",
      required: true,
      type: "multiple",
      qualifiers: ["ESTIMATE"],
      choices: [
        { key: "c-1", label: "A" },
        { key: "c-2", label: "Aucun", exclusive: true },
      ],
    };
    const single = changeItemType(multiple, "single", taken);
    expect(single).toEqual({
      code: "Q_M",
      label: "L",
      help: "aide",
      required: true,
      type: "single",
      qualifiers: ["ESTIMATE"],
      choices: [
        { key: "c-1", label: "A" },
        { key: "c-2", label: "Aucun" },
      ],
    });
    const group = changeItemType(single, "group", taken);
    expect(group.type).toBe("group");
    expect("qualifiers" in group).toBe(false);
    expect("choices" in group).toBe(false);
    expect(changeItemType(multiple, "multiple", taken)).toBe(multiple);
  });

  it("entier ⇄ décimal garde les bornes (tronquées en entier)", () => {
    const dec: DefinitionItem = { code: "Q_D", label: "D", type: "decimal", min: 1.5, max: 9.9, decimals: 2, unit: "€" };
    expect(changeItemType(dec, "integer", new Set())).toEqual({ code: "Q_D", label: "D", type: "integer", min: 1, max: 9 });
  });

  it("ajoute un choix et un sous-champ avec de nouveaux identifiants", () => {
    const taken = new Set<string>(["c-1"]);
    const item: DefinitionItem = { code: "Q_S", label: "S", type: "single", choices: [{ key: "c-1", label: "A" }] };
    const next = addChoice(item, taken, seeded(19));
    if (next.type !== "single") throw new Error("type");
    expect(next.choices).toHaveLength(2);
    expect(next.choices[1].label).toBe("Choix 2");
    const group = addGroupField({ code: "Q_G", label: "G", type: "group", fields: [{ code: "Q_F", label: "F", type: "text" }] }, taken);
    if (group.type !== "group") throw new Error("type");
    expect(group.fields).toHaveLength(2);
    expect(addChoice(group, taken)).toBe(group);
  });

  it("withOptional retire une valeur vide", () => {
    expect(withOptional({ a: 1, help: "x" } as { a: number; help?: string }, "help", "  ")).toEqual({ a: 1 });
    expect(withOptional({ a: 1 } as { a: number; help?: string }, "help", "y")).toEqual({ a: 1, help: "y" });
  });
});

describe("contrôles simples", () => {
  it("comparaison et « si … alors … » ⇄ RuleCheck", () => {
    expect(toSimpleRule({ lte: ["Q_A", 10] })).toEqual({
      kind: "compare",
      compare: { op: "lte", left: { kind: "code", code: "Q_A" }, right: { kind: "value", value: 10 } },
    });
    const implies = { implies: [{ eq: ["Q_B", true] }, { gt: ["Q_A", "Q_C"] }] } as const;
    const simple = toSimpleRule(implies as never);
    expect(simple?.kind).toBe("implies");
    expect(fromSimpleRule(simple!)).toEqual(implies);
  });

  it("toute autre forme reste en JSON", () => {
    expect(toSimpleRule({ chain_gte: ["Q_A", "Q_B"] })).toBeNull();
    expect(toSimpleRule({ all: [{ lte: ["Q_A", 1] }] })).toBeNull();
    expect(toSimpleRule({ lte: [{ sum: ["Q_A", "Q_B"] }, 1] })).toBeNull();
    expect(toSimpleRule({ implies: [{ chain_lte: ["Q_A", "Q_B"] }, { lte: ["Q_A", 1] }] })).toBeNull();
  });

  it("ajoute un contrôle sur la première question numérique, et le retire", () => {
    let def = blankDefinition(seeded(20));
    const code = def.forms[0].sections[0].items[0].code;
    def = addRule(def, seeded(21));
    expect(def.rules?.[0].check).toEqual({ lte: [code, 0] });
    expect(def.rules?.[0].key).toMatch(/^r-/);
    expect(valid(def)).toBe(true);
    def = removeRule(def, 0);
    expect(def.rules).toBeUndefined();
  });
});

describe("validation rattachée", () => {
  it("rattache une erreur de schéma à sa question", () => {
    let def = blankDefinition(seeded(22));
    def = updateItem(def, 0, 0, 0, (i) => ({ ...i, label: "" }));
    const issues = validateEditor(def);
    expect(issues).toHaveLength(1);
    expect(issues[0].target).toEqual({ kind: "item", fi: 0, si: 0, ii: 0 });
    expect(issues[0].message).toBe("Libellé : obligatoire");
    expect(issuesByTarget(issues).get("item:0:0:0")).toEqual(["Libellé : obligatoire"]);
    expect(describeTarget(def, issues[0].target)).toBe("Questionnaire › Nouvelle section › question 1");
  });

  it("rattache une erreur sémantique à sa question ou à sa règle", () => {
    let def = blankDefinition(seeded(23));
    def = updateItem(def, 0, 0, 0, (i) => ({ ...i, type: "integer", min: 5, max: 1 }) as DefinitionItem);
    def = { ...def, rules: [{ key: "r-x", message: "m", check: { lte: ["Q_INCONNU", 1] } }] };
    const issues = validateEditor(def);
    expect(issues.map((i) => i.target)).toEqual([
      { kind: "item", fi: 0, si: 0, ii: 0 },
      { kind: "rule", ri: 0 },
    ]);
  });

  it("targetOfPath et targetOfMessage", () => {
    expect(targetOfPath(["campaign", "title"])).toEqual({ kind: "campaign" });
    expect(targetOfPath(["forms", 1, "assignments", 0, "label"])).toEqual({ kind: "assignment", fi: 1, ai: 0 });
    expect(targetOfPath(["forms", 0, "sections", 2, "title"])).toEqual({ kind: "section", fi: 0, si: 2 });
    expect(targetOfPath(["rules", 3, "check"])).toEqual({ kind: "rule", ri: 3 });
    expect(targetOfPath([])).toEqual({ kind: "global" });
    const def = blankDefinition(seeded(24));
    const fk = def.forms[0].key;
    const sk = def.forms[0].sections[0].key;
    const dk = def.forms[0].assignments[0].key;
    expect(targetOfMessage(def, `Questionnaire « ${fk} » : section « ${sk} » en double`)).toEqual({ kind: "section", fi: 0, si: 0 });
    expect(targetOfMessage(def, `Questionnaire « ${fk} » : destinataire « ${dk} » en double`)).toEqual({ kind: "assignment", fi: 0, ai: 0 });
    expect(targetOfMessage(def, "Campagne : le début de période doit précéder sa fin")).toEqual({ kind: "campaign" });
    expect(targetOfMessage(def, "autre")).toEqual({ kind: "global" });
  });
});
