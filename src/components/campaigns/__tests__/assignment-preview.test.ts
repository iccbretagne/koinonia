import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AssignmentPreview from "../AssignmentPreview";

const form = {
  key: "f-abc123",
  title: "Effectifs",
  intro: "Consignes du questionnaire",
  sections: [
    {
      key: "s-abc123",
      title: "Section A",
      items: [
        { code: "Q_AAAAAA", label: "Nombre de membres", type: "integer" as const, required: true },
        { code: "Q_BBBBBB", label: "Justificatif", type: "file_request" as const },
      ],
    },
  ],
};

describe("AssignmentPreview (spec 091, EVOL-03)", () => {
  it("rend la saisie en mode aperçu : bandeau, questions, sans lien de téléchargement", () => {
    const html = renderToStaticMarkup(
      createElement(AssignmentPreview, {
        campaign: { title: "Campagne 2026" },
        form,
        assignments: [{ key: "d-abc123", label: "Accueil" }],
      })
    );
    expect(html).toContain("Aperçu : rien n&#x27;est enregistré");
    expect(html).toContain("Nombre de membres");
    expect(html).toContain("Justificatif");
    expect(html).toContain("Téléphone");
    expect(html).not.toContain("/api/campaigns");
  });

  it("propose le choix du destinataire quand il y en a plusieurs", () => {
    const html = renderToStaticMarkup(
      createElement(AssignmentPreview, {
        campaign: { title: "Campagne 2026" },
        form,
        assignments: [
          { key: "d-abc123", label: "Accueil" },
          { key: "d-def456", label: "Louange" },
        ],
      })
    );
    expect(html).toContain("Destinataire");
    expect(html).toContain("Louange");
  });
});
