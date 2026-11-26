/**
 * Tests — schémas du module campaigns (spec 090) : format d'import v1 et corps des routes.
 */
import { describe, it, expect } from "vitest";
import {
  answersBodySchema,
  campaignDefinitionSchema,
  campaignSettingsSchema,
  exportQuerySchema,
  importBodySchema,
  respondentAddSchema,
  reviewSchema,
  storedFormDefinitionSchema,
} from "../schemas";

const sampleDefinition = () => ({
  format: "koinonia.campaign",
  version: 1,
  campaign: { key: "f9-2026", title: "F9 2026", periodStart: "2026-01-01", periodEnd: "2026-11-30", dueAt: "2026-12-04" },
  forms: [
    {
      key: "integration",
      title: "Intégration",
      assignments: [{ key: "integration", label: "Intégration", respondents: ["a@exemple.org"] }],
      sections: [
        {
          key: "accueil",
          title: "Accueil",
          items: [
            { code: "V1", type: "integer", label: "Nouveaux", required: true, min: 0 },
            { code: "V2", type: "decimal", label: "Taux", decimals: 1, unit: "%" },
            {
              code: "D6",
              type: "group",
              label: "Responsables",
              fields: [{ code: "D6_NOM", type: "text", label: "Nom", required: true }],
            },
            { code: "F1", type: "file_request", label: "Export", accept: ["xlsx"] },
          ],
        },
      ],
    },
  ],
  rules: [{ key: "r1", message: "V1 ≥ 0", check: { gte: ["V1", 0] } }],
});

describe("campaignDefinitionSchema", () => {
  it("accepte une définition v1", () => {
    expect(campaignDefinitionSchema.safeParse(sampleDefinition()).success).toBe(true);
  });

  it("refuse une autre version ou un autre format", () => {
    expect(campaignDefinitionSchema.safeParse({ ...sampleDefinition(), version: 2 }).success).toBe(false);
    expect(campaignDefinitionSchema.safeParse({ ...sampleDefinition(), format: "x" }).success).toBe(false);
  });

  it("refuse un type inconnu, un code invalide, une propriété inconnue", () => {
    const def = sampleDefinition();
    const items = def.forms[0].sections[0].items as unknown[];
    expect(campaignDefinitionSchema.safeParse({ ...def }).success).toBe(true);
    items[0] = { code: "V1", type: "money", label: "x" };
    expect(campaignDefinitionSchema.safeParse(def).success).toBe(false);
    items[0] = { code: "1V", type: "integer", label: "x" };
    expect(campaignDefinitionSchema.safeParse(def).success).toBe(false);
    items[0] = { code: "V1", type: "integer", label: "x", decimals: 2 };
    expect(campaignDefinitionSchema.safeParse(def).success).toBe(false);
  });

  it("refuse un groupe ou une demande de fichier dans un groupe", () => {
    const def = sampleDefinition();
    const group = def.forms[0].sections[0].items[2] as { fields: unknown[] };
    group.fields.push({ code: "D6_F", type: "file_request", label: "x" });
    expect(campaignDefinitionSchema.safeParse(def).success).toBe(false);
  });

  it("refuse une date impossible", () => {
    const def = sampleDefinition();
    def.campaign.periodEnd = "2026-02-30";
    expect(campaignDefinitionSchema.safeParse(def).success).toBe(false);
  });

  it("accepte des règles imbriquées", () => {
    const def = sampleDefinition();
    def.rules = [
      {
        key: "r",
        message: "m",
        check: { implies: [{ eq: ["V1", 0] }, { all: [{ lte: ["V2", { sum: ["V1", 1] }] }] }] } as never,
      },
    ];
    expect(campaignDefinitionSchema.safeParse(def).success).toBe(true);
  });
});

describe("storedFormDefinitionSchema", () => {
  it("accepte { intro, sections }", () => {
    const sections = sampleDefinition().forms[0].sections;
    expect(storedFormDefinitionSchema.safeParse({ intro: "Bonjour", sections }).success).toBe(true);
  });
});

describe("corps des routes", () => {
  it("import : dryRun par défaut", () => {
    expect(importBodySchema.parse({ definition: {} }).dryRun).toBe(true);
  });

  it("paramètres : durée de conservation bornée, période ordonnée", () => {
    expect(campaignSettingsSchema.safeParse({ fileRetentionDays: 0 }).success).toBe(false);
    expect(campaignSettingsSchema.safeParse({ fileRetentionDays: 366 }).success).toBe(false);
    expect(campaignSettingsSchema.safeParse({ fileRetentionDays: 30, dueAt: null }).success).toBe(true);
    expect(campaignSettingsSchema.safeParse({ periodStart: "2026-12-01", periodEnd: "2026-01-01" }).success).toBe(false);
  });

  it("réponses : 100 au plus, note ≤ 1000, code unique", () => {
    const one = { code: "V1", value: 0 };
    expect(answersBodySchema.safeParse({ answers: [one] }).success).toBe(true);
    expect(answersBodySchema.safeParse({ answers: Array.from({ length: 101 }, (_, i) => ({ code: `C${i}`, value: 1 })) }).success).toBe(false);
    expect(answersBodySchema.safeParse({ answers: [{ ...one, note: "x".repeat(1001) }] }).success).toBe(false);
    expect(answersBodySchema.safeParse({ answers: [one, one] }).success).toBe(false);
    expect(answersBodySchema.safeParse({ answers: [{ ...one, qualifier: "FOO" }] }).success).toBe(false);
  });

  it("revue : motif obligatoire pour une correction", () => {
    expect(reviewSchema.safeParse({ action: "request_changes" }).success).toBe(false);
    expect(reviewSchema.safeParse({ action: "request_changes", reason: "  " }).success).toBe(false);
    expect(reviewSchema.safeParse({ action: "request_changes", reason: "Chiffres" }).success).toBe(true);
    expect(reviewSchema.safeParse({ action: "validate", pastoralValidated: true }).success).toBe(true);
  });

  it("répondant : compte ou nom + email", () => {
    expect(respondentAddSchema.safeParse({ userId: "u1" }).success).toBe(true);
    expect(respondentAddSchema.safeParse({ name: "A", email: "a@exemple.org" }).success).toBe(true);
    expect(respondentAddSchema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("export : xlsx par défaut", () => {
    expect(exportQuerySchema.parse({}).format).toBe("xlsx");
    expect(exportQuerySchema.safeParse({ format: "pdf" }).success).toBe(false);
  });
});
