import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderApplicationPdf, yesNoLabel, type PdfApplication } from "../pdf";

const app: PdfApplication = {
  firstName: "Marie",
  lastName: "Kouassi",
  birthDate: new Date("1995-04-12T00:00:00Z"),
  profession: "Infirmière",
  maritalStatus: "MARRIED",
  childrenCount: 2,
  street: "1 rue de la Paix",
  city: "Rennes",
  postalCode: "35000",
  country: "France",
  phone: "0600000000",
  email: "marie@example.org",
  baptized: null,
  baptismDate: null,
  baptismPlace: null,
  previousChurch: false,
  previousChurchName: null,
  previousChurchLocation: null,
  pcncTrainings: ["101"],
  hasServed: true,
  servedDepartment: "Accueil",
  ministryService: null,
  communityService: null,
  otherRoles: null,
  availableToServe: true,
  interests: "Louange",
  observations: null,
  journeyDetails: null,
  spiritualGoals: null,
  specificDetails: null,
  createdAt: new Date("2026-10-28T10:00:00Z"),
};

describe("yesNoLabel", () => {
  it("une question sans réponse est « Non renseigné », jamais « Non »", () => {
    expect(yesNoLabel(null)).toBe("Non renseigné");
    expect(yesNoLabel(false)).toBe("Non");
    expect(yesNoLabel(true)).toBe("Oui");
  });
});

describe("renderApplicationPdf", () => {
  it("produit un PDF non vide", async () => {
    const photo = await sharp({ create: { width: 60, height: 80, channels: 3, background: "#888888" } }).jpeg().toBuffer();
    const pdf = await renderApplicationPdf(app, photo, { name: "ICC Rennes", logo: null });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  }, 30_000);
});
