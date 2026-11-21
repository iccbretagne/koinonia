/**
 * Spec 084 / ADR-0031 : les sites d'événement vivent sur d'autres hôtes ; les cookies Auth.js ne
 * doivent jamais leur être envoyés. Auth.js pose ses cookies sans attribut `Domain` (donc propres à
 * l'hôte exact) tant que la configuration n'en définit pas : ce test échoue si quelqu'un en ajoute.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("cookies de session Auth.js", () => {
  const file = readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf8");
  // Configuration NextAuth seule : le reste du fichier parle d'autres « domain » (médias, emails).
  const start = file.indexOf("NextAuth({");
  const source = file.slice(start, file.indexOf("\n});", start));

  it("la configuration NextAuth ne personnalise pas les cookies", () => {
    expect(source).not.toMatch(/\bcookies\s*:/);
  });

  it("aucun attribut `domain` de cookie dans la configuration", () => {
    expect(source).not.toMatch(/\bdomain\s*:/);
    expect(source).not.toMatch(/Domain=/i);
  });
});
