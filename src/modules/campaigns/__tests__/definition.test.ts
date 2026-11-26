/**
 * Tests — définition d'une campagne (spec 090) : contrôles sémantiques, validation des réponses,
 * complétude. Zéro est une valeur ; vide n'est jamais converti.
 */
import { describe, it, expect } from "vitest";
import { campaignDefinitionSchema, type CampaignDefinition, type DefinitionItem } from "../schemas";
import {
  completeness,
  flattenItems,
  isAnswered,
  itemIndex,
  validateAnswerValue,
  validateDefinition,
  type StoredAnswer,
} from "../services/definition";

const item = (raw: Record<string, unknown>) => raw as unknown as DefinitionItem;

const parseDef = (raw: unknown): CampaignDefinition => campaignDefinitionSchema.parse(raw);

const baseDef = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  format: "koinonia.campaign",
  version: 1,
  campaign: { key: "c", title: "C" },
  forms: [
    {
      key: "f1",
      title: "F1",
      assignments: [{ key: "a1", label: "A1" }],
      sections: [{ key: "s1", title: "S1", items }],
    },
  ],
  ...extra,
});

describe("validateDefinition", () => {
  it("définition cohérente : aucune erreur", () => {
    const def = parseDef(
      baseDef([{ code: "E3", type: "integer", label: "E3" }, { code: "E4", type: "integer", label: "E4" }], {
        rules: [{ key: "r", message: "m", check: { gte: ["E3", "E4"] } }],
      })
    );
    expect(validateDefinition(def)).toEqual([]);
  });

  it("code en double, y compris un champ de groupe", () => {
    const def = parseDef(
      baseDef([
        { code: "A", type: "integer", label: "A" },
        { code: "G", type: "group", label: "G", fields: [{ code: "A", type: "text", label: "x" }] },
      ])
    );
    expect(validateDefinition(def).join()).toMatch(/« A » déjà utilisé/);
  });

  it("code en double entre deux questionnaires", () => {
    const raw = baseDef([{ code: "A", type: "integer", label: "A" }]);
    raw.forms.push({ ...raw.forms[0], key: "f2" });
    expect(validateDefinition(parseDef(raw)).join()).toMatch(/« A » déjà utilisé/);
  });

  it("clés de questionnaire, destinataire, section, choix en double", () => {
    const raw = baseDef([
      { code: "S", type: "single", label: "S", choices: [{ key: "x", label: "X" }, { key: "x", label: "Y" }] },
    ]);
    raw.forms[0].assignments.push({ key: "a1", label: "bis" });
    raw.forms[0].sections.push({ key: "s1", title: "bis", items: [{ code: "B", type: "yesno", label: "B" }] });
    raw.forms.push({ ...raw.forms[0], key: "f1", sections: [{ key: "s9", title: "s", items: [{ code: "Z", type: "yesno", label: "Z" }] }] });
    const errors = validateDefinition(parseDef(raw)).join("\n");
    expect(errors).toMatch(/choix « x » en double/);
    expect(errors).toMatch(/destinataire « a1 » en double/);
    expect(errors).toMatch(/section « s1 » en double/);
    expect(errors).toMatch(/Questionnaire « f1 » : clé en double/);
  });

  it("règles : code inconnu, champ de groupe, fichier, texte refusés", () => {
    const def = parseDef(
      baseDef(
        [
          { code: "G", type: "group", label: "G", fields: [{ code: "G_N", type: "integer", label: "n" }] },
          { code: "F", type: "file_request", label: "F" },
          { code: "T", type: "text", label: "T" },
        ],
        {
          rules: [
            { key: "r1", message: "m", check: { gte: ["NOPE", 0] } },
            { key: "r2", message: "m", check: { gte: ["G_N", 0] } },
            { key: "r3", message: "m", check: { eq: ["F", 0] } },
            { key: "r4", message: "m", check: { eq: ["T", 0] } },
            { key: "r4", message: "m", check: { eq: [1, 1] } },
          ],
        }
      )
    );
    const errors = validateDefinition(def).join("\n");
    expect(errors).toMatch(/« NOPE » inconnu/);
    expect(errors).toMatch(/« G_N » est un champ de groupe/);
    expect(errors).toMatch(/« F » \(file_request\)/);
    expect(errors).toMatch(/« T » \(text\)/);
    expect(errors).toMatch(/r4 » : clé en double/);
    expect(errors).toMatch(/aucun code/);
  });

  it("choix exclusif hors choix multiple, min > max", () => {
    const def = parseDef(
      baseDef([
        { code: "S", type: "single", label: "S", choices: [{ key: "a", label: "A", exclusive: true }] },
        { code: "N", type: "integer", label: "N", min: 5, max: 1 },
        { code: "G", type: "group", label: "G", minRows: 4, maxRows: 2, fields: [{ code: "G_A", type: "yesno", label: "a" }] },
      ])
    );
    const errors = validateDefinition(def).join("\n");
    expect(errors).toMatch(/exclusif/);
    expect(errors).toMatch(/N : minimum supérieur/);
    expect(errors).toMatch(/lignes\) : minimum supérieur/);
  });

  it("flattenItems et itemIndex", () => {
    const def = parseDef(baseDef([{ code: "A", type: "yesno", label: "A" }, { code: "B", type: "date", label: "B" }]));
    expect(flattenItems(def.forms[0].sections).map((i) => i.code)).toEqual(["A", "B"]);
    expect(itemIndex(def.forms[0].sections).get("B")?.type).toBe("date");
  });
});

describe("validateAnswerValue", () => {
  const int = item({ code: "N", type: "integer", label: "N", min: 0, max: 100 });
  const dec = item({ code: "D", type: "decimal", label: "D", decimals: 1, qualifiers: ["ESTIMATE", "NOT_APPLICABLE"] });

  it("zéro est une valeur", () => {
    expect(validateAnswerValue(int, 0)).toEqual({ ok: true, value: 0, qualifier: "EXACT", note: null });
  });

  it("vide en EXACT = effacement, jamais 0", () => {
    for (const empty of [null, "", "  ", []]) {
      const r = validateAnswerValue(int, empty);
      expect(r).toMatchObject({ ok: true, value: null });
    }
  });

  it("entier : décimal, chaîne, bornes refusés", () => {
    expect(validateAnswerValue(int, 1.5).ok).toBe(false);
    expect(validateAnswerValue(int, "3").ok).toBe(false);
    expect(validateAnswerValue(int, -1).ok).toBe(false);
    expect(validateAnswerValue(int, 101).ok).toBe(false);
    expect(validateAnswerValue(int, Number.NaN).ok).toBe(false);
  });

  it("décimal : nombre de décimales", () => {
    expect(validateAnswerValue(dec, 12.5).ok).toBe(true);
    expect(validateAnswerValue(dec, 12.55).ok).toBe(false);
    expect(validateAnswerValue(item({ code: "X", type: "decimal", label: "X" }), 1.2345).ok).toBe(true);
    expect(validateAnswerValue(item({ code: "X", type: "decimal", label: "X" }), 1.23456).ok).toBe(false);
  });

  it("texte : trim et longueur", () => {
    const text = item({ code: "T", type: "text", label: "T", maxLength: 5 });
    expect(validateAnswerValue(text, "  abc ")).toMatchObject({ ok: true, value: "abc" });
    expect(validateAnswerValue(text, "abcdef").ok).toBe(false);
    expect(validateAnswerValue(item({ code: "T", type: "text", label: "T" }), "x".repeat(301)).ok).toBe(false);
  });

  it("oui/non, date", () => {
    const yn = item({ code: "Y", type: "yesno", label: "Y" });
    expect(validateAnswerValue(yn, false)).toMatchObject({ ok: true, value: false });
    expect(validateAnswerValue(yn, "non").ok).toBe(false);
    const date = item({ code: "J", type: "date", label: "J" });
    expect(validateAnswerValue(date, "2026-02-28").ok).toBe(true);
    expect(validateAnswerValue(date, "2026-02-30").ok).toBe(false);
    expect(validateAnswerValue(date, "28/02/2026").ok).toBe(false);
  });

  it("choix unique et multiple, choix exclusif seul", () => {
    const single = item({ code: "S", type: "single", label: "S", choices: [{ key: "a", label: "A" }] });
    expect(validateAnswerValue(single, "a").ok).toBe(true);
    expect(validateAnswerValue(single, "b").ok).toBe(false);
    const multi = item({
      code: "M",
      type: "multiple",
      label: "M",
      choices: [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        { key: "none", label: "Aucun", exclusive: true },
      ],
    });
    expect(validateAnswerValue(multi, ["b", "a", "b"])).toMatchObject({ ok: true, value: ["a", "b"] });
    expect(validateAnswerValue(multi, ["none"]).ok).toBe(true);
    expect(validateAnswerValue(multi, ["none", "a"]).ok).toBe(false);
    expect(validateAnswerValue(multi, ["z"]).ok).toBe(false);
  });

  it("groupe : aucune ligne, lignes validées, champ inconnu, maxRows", () => {
    const group = item({
      code: "G",
      type: "group",
      label: "G",
      maxRows: 2,
      fields: [
        { code: "G_NOM", type: "text", label: "Nom", required: true },
        { code: "G_N", type: "integer", label: "N" },
      ],
    });
    expect(validateAnswerValue(group, { none: true })).toMatchObject({ ok: true, value: { none: true } });
    expect(validateAnswerValue(group, { rows: [{ G_NOM: " Ana ", G_N: 0 }] })).toMatchObject({
      ok: true,
      value: { rows: [{ G_NOM: "Ana", G_N: 0 }] },
    });
    // Champ obligatoire vide accepté en brouillon (vérifié à la soumission).
    expect(validateAnswerValue(group, { rows: [{ G_N: 2 }] })).toMatchObject({ ok: true, value: { rows: [{ G_NOM: null, G_N: 2 }] } });
    expect(validateAnswerValue(group, { rows: [{ G_N: 1.5 }] }).ok).toBe(false);
    expect(validateAnswerValue(group, { rows: [{ X: 1 }] }).ok).toBe(false);
    expect(validateAnswerValue(group, { rows: [{}, {}, {}] }).ok).toBe(false);
    expect(validateAnswerValue(group, { none: false }).ok).toBe(false);
    expect(validateAnswerValue(group, { rows: [] })).toMatchObject({ ok: true, value: null });
    expect(validateAnswerValue(group, null, "ESTIMATE", "x").ok).toBe(false);
  });

  it("demande de fichier : état connu, pas de qualificatif", () => {
    const file = item({ code: "F", type: "file_request", label: "F" });
    expect(validateAnswerValue(file, { status: "FILE_SENT" })).toMatchObject({ ok: true, value: { status: "FILE_SENT" } });
    expect(validateAnswerValue(file, { status: "PERDU" }).ok).toBe(false);
    expect(validateAnswerValue(file, { status: "FILE_SENT", x: 1 }).ok).toBe(false);
    expect(validateAnswerValue(file, null, "TO_RESEARCH", "note").ok).toBe(false);
  });

  it("qualificatifs : autorisés par item, estimation = valeur + note", () => {
    expect(validateAnswerValue(int, 3, "ESTIMATE", "environ")).toMatchObject({ ok: true, value: 3, qualifier: "ESTIMATE", note: "environ" });
    expect(validateAnswerValue(int, 3, "ESTIMATE").ok).toBe(false);
    expect(validateAnswerValue(int, null, "ESTIMATE", "environ").ok).toBe(false);
    expect(validateAnswerValue(int, null, "NSP").ok).toBe(false); // non déclaré (défaut ESTIMATE, TO_RESEARCH)
    expect(validateAnswerValue(dec, null, "TO_RESEARCH", "x").ok).toBe(false); // non déclaré
  });

  it("à rechercher : note obligatoire, valeur facultative", () => {
    expect(validateAnswerValue(int, null, "TO_RESEARCH", "à voir")).toMatchObject({ ok: true, value: null });
    expect(validateAnswerValue(int, 4, "TO_RESEARCH", "à voir")).toMatchObject({ ok: true, value: 4 });
    expect(validateAnswerValue(int, null, "TO_RESEARCH", " ").ok).toBe(false);
  });

  it("sans objet / NSP : valeur nulle", () => {
    expect(validateAnswerValue(dec, null, "NOT_APPLICABLE")).toMatchObject({ ok: true, value: null, qualifier: "NOT_APPLICABLE" });
    expect(validateAnswerValue(dec, 0, "NOT_APPLICABLE").ok).toBe(false);
  });

  it("note trop longue refusée", () => {
    expect(validateAnswerValue(int, 1, "EXACT", "x".repeat(1001)).ok).toBe(false);
  });
});

describe("isAnswered et completeness", () => {
  const items = [
    item({ code: "A", type: "integer", label: "A", required: true }),
    item({ code: "B", type: "integer", label: "B", required: true }),
    item({ code: "C", type: "integer", label: "C" }),
    item({ code: "G", type: "group", label: "G", required: true, fields: [{ code: "G_X", type: "text", label: "x", required: true }] }),
    item({ code: "F", type: "file_request", label: "F", required: true }),
    item({ code: "F2", type: "file_request", label: "F2" }),
  ];
  const ans = (value: unknown, qualifier: StoredAnswer["qualifier"] = "EXACT", note: string | null = null): StoredAnswer => ({
    value,
    qualifier,
    note,
  });

  it("zéro compte comme renseigné, vide non", () => {
    expect(isAnswered(items[0], ans(0))).toBe(true);
    expect(isAnswered(items[0], ans(null))).toBe(false);
    expect(isAnswered(items[0], undefined)).toBe(false);
    expect(isAnswered(items[0], ans(null, "TO_RESEARCH", "x"))).toBe(true);
  });

  it("groupe : ligne incomplète non renseignée, aucune ligne renseignée", () => {
    expect(isAnswered(items[3], ans({ rows: [{ G_X: null }] }))).toBe(false);
    expect(isAnswered(items[3], ans({ rows: [{ G_X: "a" }] }))).toBe(true);
    expect(isAnswered(items[3], ans({ none: true }))).toBe(true);
  });

  it("fichier transmis sans fichier : manquant", () => {
    expect(isAnswered(items[4], ans({ status: "FILE_SENT" }), 0)).toBe(false);
    expect(isAnswered(items[4], ans({ status: "FILE_SENT" }), 1)).toBe(true);
    expect(isAnswered(items[4], ans({ status: "CROSS_FIGURE" }))).toBe(true);
  });

  it("synthèse", () => {
    const answers = new Map<string, StoredAnswer>([
      ["A", ans(0)],
      ["B", ans(12, "ESTIMATE", "environ")],
      ["C", ans(null, "TO_RESEARCH", "à voir")],
      ["G", ans({ none: true })],
      ["F", ans({ status: "FILE_SENT" })],
      ["F2", ans({ status: "FILE_SENT" })],
    ]);
    expect(completeness(items, answers, new Map([["F", 2]]))).toEqual({
      missing: ["F2"],
      estimates: ["B"],
      toResearch: ["C"],
      filesExpected: 2,
      filesReceived: 1,
    });
    expect(completeness(items, new Map()).missing).toEqual(["A", "B", "G", "F"]);
  });
});
