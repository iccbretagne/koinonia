import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const calls: { method: string; args: unknown[] }[] = [];
let pages = 1;
vi.mock("jspdf", () => ({
  jsPDF: class {
    constructor() {
      pages = 1;
    }
    addPage() {
      pages++;
      calls.push({ method: "addPage", args: [] });
    }
    getNumberOfPages() {
      return pages;
    }
    text(...args: unknown[]) {
      calls.push({ method: "text", args });
    }
    splitTextToSize(text: string) {
      return text.split("\n");
    }
    getTextWidth(text: string) {
      return text.length;
    }
    save(...args: unknown[]) {
      calls.push({ method: "save", args });
    }
    setPage(...args: unknown[]) {
      calls.push({ method: "setPage", args });
    }
    setFontSize() {}
    setFont() {}
    setTextColor() {}
    setDrawColor() {}
    setLineWidth() {}
    line() {}
  },
}));

const { formatReportWhatsApp, generateReportPDF } = await import("../report-export");
type Data = Parameters<typeof formatReportWhatsApp>[0];

function data(overrides: Partial<Data> = {}): Data {
  return {
    event: { title: "Culte: dimanche", date: "2026-03-01T10:00:00.000Z", type: "CULTE" },
    notes: "Belle louange",
    decisions: "Racheter des gobelets",
    author: "Jean",
    sections: [
      { label: "Sainte-Cène", position: 2, stats: { supportsUtilises: 120, supportsRestants: null }, notes: null },
      { label: "Accueil", position: 1, stats: { hommes: 40, femmes: 50, enfants: 10 }, notes: "RAS" },
      { label: "Intégration Rennes", position: 3, stats: { hommes: 2, femmes: 3, passage: 1, convertis: 2, voeux: 0 }, notes: "  " },
      { label: "Son", position: 4, stats: { micros: 6, retours: null }, notes: null },
      { label: "Vide", position: 5, stats: {}, notes: " " },
      { label: "Accueil", position: 6, stats: { hommes: 4, femmes: null }, notes: null },
    ],
    ...overrides,
  };
}

describe("formatReportWhatsApp", () => {
  it("formate chaque section selon son type de département, dans l'ordre", () => {
    expect(formatReportWhatsApp(data()).split("\n")).toEqual([
      "*Compte rendu — Culte: dimanche*",
      "dimanche 1 mars 2026",
      "",
      "*ACCUEIL*",
      "Hommes : 40 | Femmes : 50 | Enfants : 10",
      "Total adultes : 90 | Total général : 100",
      "RAS",
      "",
      "*SAINTE-CÈNE*",
      "Supports utilisés : 120 | Restants : -",
      "",
      "*INTÉGRATION RENNES*",
      "Hommes : 2 | Femmes : 3",
      "De passage : 1 | Convertis : 2 | Voeux : 0",
      "",
      "*SON*",
      "micros : 6",
      "retours : -",
      "",
      "*ACCUEIL*",
      "Hommes : 4 | Femmes : - | Enfants : -",
      "Total adultes : - | Total général : -",
      "",
      "*OBSERVATIONS GENERALES*",
      "Belle louange",
      "",
      "*DECISIONS / ACTIONS*",
      "Racheter des gobelets",
    ]);
  });

  it("omet les observations et décisions vides, garde une section aux seules notes", () => {
    const text = formatReportWhatsApp(
      data({ notes: " ", decisions: null, sections: [{ label: "Parking", position: 1, stats: null, notes: "Plein" }] })
    );
    expect(text.split("\n")).toEqual(["*Compte rendu — Culte: dimanche*", "dimanche 1 mars 2026", "", "*PARKING*", "Plein"]);
  });
});

describe("generateReportPDF", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 2, 9, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  const texts = () => calls.filter((c) => c.method === "text").map((c) => c.args[0]);

  it("écrit titre, sections, observations, décisions et pied de page, puis enregistre", () => {
    generateReportPDF(data());
    expect(texts()).toEqual([
      ["Compte rendu — Culte: dimanche"],
      "dimanche 1 mars 2026",
      "Accueil",
      "Hommes :", ["40"],
      "Femmes :", ["50"],
      "Enfants :", ["10"],
      "Total adultes :", ["90"],
      "Total général :", ["100"],
      "Observations :", ["RAS"],
      "Sainte-Cène",
      "Supports utilisés :", ["120"],
      "Supports restants :", ["-"],
      "Intégration Rennes",
      "Hommes :", ["2"],
      "Femmes :", ["3"],
      "De passage :", ["1"],
      "Nouveaux convertis :", ["2"],
      "Renouvellement de vœux :", ["0"],
      "Son",
      "micros :", ["6"],
      "retours :", ["-"],
      "Accueil",
      "Hommes :", ["4"],
      "Femmes :", ["-"],
      "Enfants :", ["-"],
      "Total adultes :", ["-"],
      "Total général :", ["-"],
      "Observations générales",
      ["Belle louange"],
      "Décisions / Actions",
      ["Racheter des gobelets"],
      ...Array.from({ length: pages }, (_, i) => ["Généré le 02 mars 2026 par Jean", `${i + 1} / ${pages}`]).flat(),
    ]);
    expect(calls.at(-1)).toEqual({ method: "save", args: ["CR-Culte- dimanche-2026-03-01.pdf"] });
  });

  it("passe à la page suivante quand le contenu déborde, et numérote chaque page", () => {
    generateReportPDF(
      data({
        author: null,
        notes: null,
        decisions: null,
        sections: Array.from({ length: 40 }, (_, i) => ({ label: `D${i}`, position: i, stats: { a: i }, notes: null })),
      })
    );
    expect(pages).toBeGreaterThan(1);
    expect(texts().slice(-2)).toEqual(["Généré le 02 mars 2026", `${pages} / ${pages}`]);
  });
});
