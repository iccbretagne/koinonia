import { describe, expect, it } from "vitest";
import { applicationFormSchema } from "../schemas";

const minimal = { firstName: "Marie", lastName: "Kouassi", birthDate: "1995-04-12", consent: "true" };

describe("applicationFormSchema", () => {
  it("les champs vides deviennent null", () => {
    const out = applicationFormSchema.parse({ ...minimal, profession: "", email: "", city: "  ", childrenCount: "" });
    expect(out.profession).toBeNull();
    expect(out.email).toBeNull();
    expect(out.city).toBeNull();
    expect(out.childrenCount).toBeNull();
    expect(out.pcncTrainings).toEqual([]);
  });
  it("une question Oui/Non sans réponse vaut null, jamais false", () => {
    const out = applicationFormSchema.parse({ ...minimal, baptized: "", hasServed: "non", availableToServe: "oui" });
    expect(out.baptized).toBeNull();
    expect(out.previousChurch).toBeNull();
    expect(out.hasServed).toBe(false);
    expect(out.availableToServe).toBe(true);
  });
  it("le consentement est requis", () => {
    const { consent: _consent, ...withoutConsent } = minimal;
    expect(applicationFormSchema.safeParse(withoutConsent).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...minimal, consent: "false" }).success).toBe(false);
  });
  it("une formation hors liste est refusée", () => {
    expect(applicationFormSchema.safeParse({ ...minimal, pcncTrainings: ["101", "XYZ"] }).success).toBe(false);
    expect(applicationFormSchema.parse({ ...minimal, pcncTrainings: ["101", "IEBI"] }).pcncTrainings).toEqual(["101", "IEBI"]);
  });
  it("une date impossible ou future est refusée", () => {
    expect(applicationFormSchema.safeParse({ ...minimal, birthDate: "1995-02-31" }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...minimal, birthDate: "2999-01-01" }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...minimal, baptismDate: "pas une date" }).success).toBe(false);
  });
  it("prénom et nom sont requis", () => {
    expect(applicationFormSchema.safeParse({ ...minimal, firstName: " " }).success).toBe(false);
  });
});
