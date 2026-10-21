import { describe, it, expect } from "vitest";
import { CHURCH_NAME_CLASSES } from "../church-name";

describe("classes du nom de l'église (spec 066)", () => {
  it("trois rendus distincts, tous avec retour à la ligne", () => {
    const values = Object.values(CHURCH_NAME_CLASSES);
    expect(new Set(values).size).toBe(3);
    for (const classes of values) expect(classes).toContain("break-words");
  });

  it("Petit reproduit le rendu d'origine", () => {
    expect(CHURCH_NAME_CLASSES.SMALL).toContain("text-xs");
    expect(CHURCH_NAME_CLASSES.SMALL).toContain("tracking-widest");
  });
});
