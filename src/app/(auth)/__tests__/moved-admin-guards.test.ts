import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Spec 092, lot 4 — pages sorties de `/admin`.
 *
 * Sous `/admin`, le layout (`admin/layout.tsx`) exigeait une session et l'accès à l'église courante
 * avant toute page. Les écrans déplacés vers un autre espace (Événements, Personnes, Plateforme)
 * ne passent plus par ce layout : chacun doit porter **sa propre** garde, sinon un compte connecté
 * sans droit atteindrait l'écran. Ce test refuse toute page de ces dossiers sans garde explicite.
 */

const AUTH = join(__dirname, "..");
const MOVED_OUT_OF_ADMIN = [
  "evenements/gestion",
  "evenements/comptes-rendus",
  "evenements/service-accueil",
  "personnes/star",
  "personnes/discipolat",
  "plateforme",
];

/** Racine d'espace : simple redirection vers la première page permise (`redirectToSpace`). */
const SPACE_ROOTS = new Set(["plateforme/page.tsx"]);

/** Garde suffisante à elle seule (permission dans une église, ou Super Admin). */
const STRONG = /\b(requireSuperAdmin|requireChurchPermission|requireCurrentChurchPermission)\s*\(/;
/** Session exigée puis décision explicite sur le rôle ou la lecture pastorale. */
const SESSION = /\brequireAuth\s*\(/;
const DECISION = /\b(isSuperAdmin|hasPastoralRead|rolePermissions)\b/;

function pages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) pages(full, acc);
    else if (entry === "page.tsx") acc.push(full);
  }
  return acc;
}

describe("pages sorties de /admin : garde explicite (spec 092, lot 4)", () => {
  const files = MOVED_OUT_OF_ADMIN.flatMap((d) => {
    const dir = join(AUTH, d);
    return existsSync(dir) ? pages(dir) : [];
  }).map((f) => relative(AUTH, f).split(sep).join("/"));

  it("trouve les pages déplacées", () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
  });

  it("aucun de ces dossiers n'a de layout qui tiendrait lieu de garde implicite", () => {
    // Une garde de layout ne protège pas les appels serveur de la page (rendu parallèle) : la garde
    // est dans la page. Si un layout apparaît, ce test oblige à revoir ce choix.
    for (const d of MOVED_OUT_OF_ADMIN) expect(existsSync(join(AUTH, d, "layout.tsx")), d).toBe(false);
  });

  it.each(
    MOVED_OUT_OF_ADMIN.flatMap((d) => {
      const dir = join(AUTH, d);
      return existsSync(dir) ? pages(dir).map((f) => relative(AUTH, f).split(sep).join("/")) : [];
    }).filter((f) => !SPACE_ROOTS.has(f))
  )("%s vérifie les droits elle-même", (rel) => {
    const src = readFileSync(join(AUTH, rel), "utf8");
    const guarded = STRONG.test(src) || (SESSION.test(src) && DECISION.test(src));
    expect(guarded, `${rel} : ajouter requireChurchPermission / requireSuperAdmin (ou équivalent)`).toBe(true);
  });

  it("la racine Plateforme ne fait que rediriger", () => {
    const src = readFileSync(join(AUTH, "plateforme/page.tsx"), "utf8");
    expect(src).toMatch(/redirectToSpace\(/);
  });
});
