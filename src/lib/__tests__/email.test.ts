import { describe, it, expect } from "vitest";
import {
  parseEmailList,
  formatEmailList,
  buildAccountingStatusEmail,
  buildJobOfferEmail,
} from "@/lib/email";

describe("parseEmailList", () => {
  it("retourne une liste vide pour null/undefined/chaîne vide", () => {
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
  });

  it("parse une seule adresse", () => {
    expect(parseEmailList("compta@icc.fr")).toEqual(["compta@icc.fr"]);
  });

  it("parse plusieurs adresses séparées par virgule", () => {
    expect(parseEmailList("a@icc.fr,b@icc.fr")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });

  it("parse plusieurs adresses séparées par point-virgule", () => {
    expect(parseEmailList("a@icc.fr;b@icc.fr")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });

  it("parse plusieurs adresses séparées par retour à la ligne", () => {
    expect(parseEmailList("a@icc.fr\nb@icc.fr")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });

  it("déduplique les adresses (insensible à la casse)", () => {
    expect(parseEmailList("a@icc.fr, A@ICC.FR, a@icc.fr")).toEqual(["a@icc.fr"]);
  });

  it("retire les espaces superflus et normalise en minuscules", () => {
    expect(parseEmailList("  A@ICC.FR  ,  b@icc.fr  ")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });

  it("ignore les segments vides (séparateurs consécutifs)", () => {
    expect(parseEmailList("a@icc.fr,,b@icc.fr,")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });
});

describe("formatEmailList", () => {
  it("retourne null pour une liste vide", () => {
    expect(formatEmailList([])).toBeNull();
  });

  it("formate une seule adresse", () => {
    expect(formatEmailList(["compta@icc.fr"])).toBe("compta@icc.fr");
  });

  it("formate plusieurs adresses séparées par virgule", () => {
    expect(formatEmailList(["a@icc.fr", "b@icc.fr"])).toBe("a@icc.fr, b@icc.fr");
  });

  it("déduplique et normalise avant de formater", () => {
    expect(formatEmailList(["A@ICC.FR", " a@icc.fr "])).toBe("a@icc.fr");
  });
});

describe("buildAccountingStatusEmail — prise en charge", () => {
  const base = {
    userName: "Jean",
    requestLabel: "Sono",
    requestAmount: "120 €",
    status: "PROCESSING" as const,
    churchName: "ICC Rennes",
    requestUrl: "https://x/requests/1",
  };

  it("annonce un traitement prioritaire pour une demande urgente", () => {
    const { html } = buildAccountingStatusEmail({ ...base, priority: "URGENT" });
    expect(html).toContain("urgente");
  });

  it("annonce un traitement dans les meilleurs délais sinon", () => {
    const { html } = buildAccountingStatusEmail(base);
    expect(html).toContain("dans les meilleurs délais");
  });
});

describe("buildJobOfferEmail — type et contact", () => {
  const base = {
    subscriberName: "Jean",
    jobTitle: "Développeur",
    company: "ACME",
    location: null,
    duration: null,
    deadline: null,
    description: "Poste",
    contactEmail: null,
    contactUrl: null,
    jobUrl: "https://x/jobs/1",
  };

  it.each([
    ["EMPLOI", "Emploi"],
    ["STAGE", "Stage"],
    ["ALTERNANCE", "Alternance"],
  ])("libelle le type %s en %s", (type, label) => {
    expect(buildJobOfferEmail({ ...base, type }).html).toContain(label);
  });

  it("préfère l'email de candidature à l'URL", () => {
    const { html } = buildJobOfferEmail({ ...base, type: "EMPLOI", contactEmail: "rh@acme.fr", contactUrl: "https://acme.fr" });
    expect(html).toContain("mailto:rh@acme.fr");
    expect(html).not.toContain("Postuler en ligne");
  });

  it("propose l'URL à défaut d'email", () => {
    const { html } = buildJobOfferEmail({ ...base, type: "EMPLOI", contactUrl: "https://acme.fr" });
    expect(html).toContain("Postuler en ligne");
  });

  it("n'affiche aucun contact sans email ni URL", () => {
    const { html } = buildJobOfferEmail({ ...base, type: "EMPLOI" });
    expect(html).not.toContain("Candidature");
    expect(html).not.toContain("Postuler en ligne");
  });
});
