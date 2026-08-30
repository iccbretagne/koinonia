import { describe, expect, it } from "vitest";
import { sanitizeExcelValue, sanitizeRow } from "@/lib/excel";

describe("sanitizeExcelValue", () => {
  it("préfixe d'une apostrophe les chaînes commençant par un caractère d'amorce de formule", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", "\tSUM", "\rSUM"]) {
      expect(sanitizeExcelValue(bad)).toBe(`'${bad}`);
    }
  });

  it("laisse les chaînes ordinaires inchangées", () => {
    for (const ok of ["Dupont", "jean@exemple.fr", "06 12 34 56 78", "Église (Nord)", ""]) {
      expect(sanitizeExcelValue(ok)).toBe(ok);
    }
  });

  it("ne touche pas aux valeurs non-chaînes", () => {
    const d = new Date("2026-09-01");
    expect(sanitizeExcelValue(42)).toBe(42);
    expect(sanitizeExcelValue(true)).toBe(true);
    expect(sanitizeExcelValue(null)).toBe(null);
    expect(sanitizeExcelValue(undefined)).toBe(undefined);
    expect(sanitizeExcelValue(d)).toBe(d);
  });
});

describe("sanitizeRow", () => {
  it("traite toutes les valeurs et préserve les clés", () => {
    const out = sanitizeRow({
      Nom: "=cmd",
      Prénom: "Marie",
      Note: "-10",
      Age: 30,
    });
    expect(out).toEqual({ Nom: "'=cmd", Prénom: "Marie", Note: "'-10", Age: 30 });
    expect(Object.keys(out)).toEqual(["Nom", "Prénom", "Note", "Age"]);
  });
});
