import { describe, expect, it, vi } from "vitest";

const db = { campaign: { findUnique: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: db }));
// `campaigns.ts` (contrôles) importe les gardes et les notifications : neutralisés ici.
vi.mock("../auth", () => ({ hasCampaignsManage: vi.fn() }));
vi.mock("../services/notify", () => ({ notifyCampaignOpened: vi.fn() }));

const { exportCampaign } = await import("../services/exports");

const definition = {
  sections: [
    {
      key: "s",
      title: "Section",
      items: [
        { code: "V1", type: "integer", label: "Nouveaux", reportCode: "V1" },
        { code: "V2", type: "yesno", label: "Suivi" },
        { code: "D6", type: "group", label: "Lieux", fields: [{ code: "D6_NOM", type: "text", label: "Nom" }, { code: "D6_N", type: "integer", label: "Nombre" }] },
      ],
    },
  ],
};

db.campaign.findUnique.mockResolvedValue({
  id: "c1",
  key: "bilan",
  title: "Bilan",
  dueAt: null,
  rules: [{ key: "r1", message: "V1 au moins 5", check: { gte: ["V1", 5] } }],
  forms: [
    {
      id: "f1",
      key: "integration",
      title: "Intégration",
      definition,
      assignments: [
        {
          id: "a1",
          label: "Intégration",
          status: "SUBMITTED",
          dueAt: null,
          submittedAt: new Date("2026-12-01T10:00:00Z"),
          submittedByName: "Resp",
          validatedAt: null,
          pastoralValidated: false,
          answers: [
            { code: "V1", value: 12, qualifier: "ESTIMATE", note: "=calcul approché", updatedAt: new Date("2026-12-01T09:00:00Z") },
            { code: "V2", value: true, qualifier: "EXACT", note: null, updatedAt: new Date("2026-12-01T09:00:00Z") },
            { code: "D6", value: { rows: [{ D6_NOM: "Rennes", D6_N: 4 }] }, qualifier: "EXACT", note: null, updatedAt: new Date("2026-12-01T09:00:00Z") },
          ],
          files: [],
        },
      ],
    },
  ],
});

describe("exportCampaign", () => {
  it("xlsx : feuilles du plan, nombres restés nombres, formules neutralisées", async () => {
    const { buffer, fileName, contentType } = await exportCampaign("c1", { format: "xlsx" });
    expect(fileName).toBe("bilan-reponses.xlsx");
    expect(contentType).toContain("spreadsheetml");

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["Réponses", "Groupes", "États", "Contrôles", "Fichiers"]);

    const responses = wb.getWorksheet("Réponses")!;
    const header = (responses.getRow(1).values as unknown[]).slice(1);
    const col = (name: string) => header.indexOf(name) + 1;
    const v1 = responses.getRow(2);
    expect(v1.getCell(col("Code")).value).toBe("V1");
    expect(v1.getCell(col("Valeur")).value).toBe(12);
    expect(typeof v1.getCell(col("Valeur")).value).toBe("number");
    expect(v1.getCell(col("Qualificatif")).value).toBe("Estimation");
    expect(v1.getCell(col("Précision")).value).toBe("'=calcul approché");
    expect(responses.getRow(3).getCell(col("Valeur")).value).toBe("Oui");

    const groups = wb.getWorksheet("Groupes")!;
    expect(groups.rowCount).toBe(3);
    expect(groups.getRow(3).getCell(5).value).toBe(4);

    const checks = wb.getWorksheet("Contrôles")!;
    expect(checks.getRow(2).getCell(4).value).toBe("Conforme");
  });

  it("csv : feuille Réponses, BOM, séparateur point-virgule", async () => {
    const { buffer, fileName } = await exportCampaign("c1", { format: "csv" });
    expect(fileName).toBe("bilan-reponses.csv");
    const text = buffer.toString("utf8");
    expect(text.startsWith("﻿")).toBe(true);
    const lines = text.slice(1).trim().split("\r\n");
    expect(lines[0].split(";")[4]).toBe("Code");
    expect(lines[1].split(";")[8]).toBe("12");
    expect(lines).toHaveLength(4);
  });

  it("questionnaire inconnu : 404", async () => {
    await expect(exportCampaign("c1", { format: "xlsx", formKey: "autre" })).rejects.toMatchObject({ statusCode: 404 });
  });
});
