import { describe, it, expect } from "vitest";
import { chunk, legacyMentions, rewriteLink, rewriteScreens } from "@/lib/stored-paths";

const APP = "https://koinonia.example.org";

describe("réécriture des adresses mémorisées (spec 092, lot 4)", () => {
  it("lien relatif ou absolu de l'application ; rien d'autre", () => {
    expect(rewriteLink("/accounting/requests/r1", "forward")).toBe("/finances/demandes/r1");
    expect(rewriteLink(`${APP}/care/requests/r1?x=1`, "forward", APP)).toBe(`${APP}/pastoral/suivi/rendez-vous/r1?x=1`);
    for (const v of [null, undefined, "", "/finances/demandes/r1", "https://autre.example/events", "mailto:x@y.z", "//evil.com/events", "/billet/tok"]) {
      expect(rewriteLink(v, "forward", APP), String(v)).toBeNull();
    }
  });

  it("idempotent et réversible", () => {
    const old = "/admin/events/e1/report";
    const next = rewriteLink(old, "forward")!;
    expect(next).toBe("/evenements/comptes-rendus/e1");
    expect(rewriteLink(next, "forward")).toBeNull();
    expect(rewriteLink(next, "reverse")).toBe(old);
    expect(rewriteLink(old, "reverse")).toBeNull();
  });

  it("préfixes d'aide : liste réécrite sans doublon, inchangée si déjà à jour", () => {
    expect(rewriteScreens(["/events", "/planning/events"], "forward")).toEqual(["/evenements"]);
    expect(rewriteScreens(["/evenements"], "forward")).toBeNull();
    expect(rewriteScreens(["/accounting"], "forward")).toEqual(
      expect.arrayContaining(["/finances/demandes", "/finances/statistiques", "/finances/navette", "/finances/tresorerie"])
    );
    const once = rewriteScreens(["/accounting", "/dashboard"], "forward")!;
    expect(rewriteScreens(once, "forward")).toBeNull();
    // Valeur inattendue : jamais touchée.
    expect(rewriteScreens("x", "forward")).toBeNull();
    expect(rewriteScreens([1, 2], "forward")).toBeNull();
  });

  it("préfixes d'aide : retour arrière", () => {
    expect(rewriteScreens(["/evenements", "/planning/departements"], "reverse")).toEqual(["/events", "/dashboard"]);
  });

  it("anciennes adresses citées dans une réponse (relecture manuelle)", () => {
    expect(legacyMentions("Ouvrez /accounting/requests puis « /events ». Voir aussi /finances/demandes.")).toEqual([
      "/accounting/requests",
      "/events",
    ]);
    expect(legacyMentions(null)).toEqual([]);
  });

  it("lots de 500", () => {
    const items = Array.from({ length: 1201 }, (_, i) => i);
    expect(chunk(items).map((c) => c.length)).toEqual([500, 500, 201]);
    expect(chunk([])).toEqual([]);
  });
});
