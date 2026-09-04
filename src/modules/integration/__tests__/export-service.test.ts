import { describe, expect, it } from "vitest";
import {
  buildIntegrationExportRows,
  EXPORT_COLUMNS,
  type IntegrationExportInput,
} from "../services/export-service";

function makeRequest(overrides: Partial<IntegrationExportInput> = {}): IntegrationExportInput {
  return {
    firstName: "Marie",
    lastName: "Durand",
    phone: "0612345678",
    email: "marie@exemple.fr",
    address: "12 rue des Lilas",
    city: "Rennes",
    ageRange: "ADULT",
    churchStatus: "VISITOR",
    salvationCall: true,
    pastoralCareRequested: false,
    assignedFamilyName: "Famille Nord",
    assignedBerger: { name: "Paul Berger", displayName: null },
    status: "CONTACTED",
    submittedAt: new Date("2026-09-01"),
    assignedAt: new Date("2026-09-03"),
    contactedAt: new Date("2026-09-05"),
    whatsappAddedAt: null,
    integratedAt: null,
    ...overrides,
  };
}

describe("buildIntegrationExportRows", () => {
  it("produit les 18 colonnes de la spec, dans l'ordre", () => {
    const [row] = buildIntegrationExportRows([makeRequest()]);
    expect(Object.keys(row)).toEqual([...EXPORT_COLUMNS]);
    expect(EXPORT_COLUMNS).toHaveLength(18);
  });

  it("projette les codes vers les libellés français, jamais le code brut", () => {
    const [row] = buildIntegrationExportRows([
      makeRequest({ ageRange: "ADULT", churchStatus: "VISITOR", status: "SUBMITTED" }),
    ]);
    expect(row["Tranche d'âge"]).toBe("Adulte (30–60 ans)");
    expect(row["Statut dans l'église"]).toBe("Visiteur");
    expect(row["Statut de la demande"]).toBe("En attente");
  });

  it("rend Oui / Non pour les marqueurs pastoraux", () => {
    const [row] = buildIntegrationExportRows([
      makeRequest({ salvationCall: true, pastoralCareRequested: false }),
    ]);
    expect(row["Appel au salut"]).toBe("Oui");
    expect(row["Soin pastoral demandé"]).toBe("Non");
  });

  it("laisse vides les dates des étapes non atteintes", () => {
    const [row] = buildIntegrationExportRows([
      makeRequest({ whatsappAddedAt: null, integratedAt: null }),
    ]);
    expect(row["Date d'ajout WhatsApp"]).toBe("");
    expect(row["Date d'intégration"]).toBe("");
    expect(row["Date de soumission"]).not.toBe("");
  });

  it("rend une chaîne vide (jamais \"null\") pour les champs optionnels absents", () => {
    const [row] = buildIntegrationExportRows([
      makeRequest({
        phone: null,
        email: null,
        address: null,
        city: null,
        assignedFamilyName: null,
        assignedBerger: null,
      }),
    ]);
    for (const key of ["Téléphone", "Email", "Adresse", "Ville", "Famille assignée", "Berger assigné"]) {
      expect(row[key]).toBe("");
    }
  });

  it("préfère le displayName du berger quand il existe", () => {
    const [row] = buildIntegrationExportRows([
      makeRequest({ assignedBerger: { name: "Paul B.", displayName: "Paul Berger" } }),
    ]);
    expect(row["Berger assigné"]).toBe("Paul Berger");
  });

  it("expose l'adresse postale quand elle est renseignée", () => {
    const [row] = buildIntegrationExportRows([makeRequest({ address: "12 rue des Lilas" })]);
    expect(row["Adresse"]).toBe("12 rue des Lilas");
  });

  it("n'expose ni notes internes, ni motif d'abandon", () => {
    const [row] = buildIntegrationExportRows([makeRequest()]);
    const keys = Object.keys(row).join(" ").toLowerCase();
    expect(keys).not.toContain("note");
    expect(keys).not.toContain("abandon");
  });
});
