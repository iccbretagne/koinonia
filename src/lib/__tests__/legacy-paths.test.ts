import { describe, it, expect } from "vitest";
import {
  LEGACY_PATHS,
  LEGACY_SCREEN_PREFIXES,
  currentHref,
  legacyAndCurrent,
  matchLegacyPath,
  reverseLegacyPath,
  rewriteScreenPrefix,
  rewriteStoredHref,
} from "@/lib/legacy-paths";
import { SCREENS } from "@/lib/paths";
import { routeTable } from "@/lib/module-routes";

/** Spec 092, lot 4 — table fixe ancienne → nouvelle adresse. */

const screenRegex = (pattern: string) =>
  new RegExp(`^${pattern.replace(/[\\^$.*+?(){}|]/g, "\\$&").replace(/\[[A-Za-z]+\]/g, "[^/]+")}$`);
const SCREEN_PATTERNS = Object.values(SCREENS).map(screenRegex);
const isScreen = (path: string) => SCREEN_PATTERNS.some((r) => r.test(path));
/** Modèle → adresse d'exemple (`:id` → `x1`). */
const sample = (pattern: string) => pattern.split("?")[0].replace(/:[A-Za-z]+/g, "x1");

/** Adresses publiques ou d'un hôte de site : jamais redirigées. */
const NEVER = [
  "/media/c", "/media/d", "/media/g", "/media/v", "/billet", "/reservation", "/inscription", "/collecte",
  "/f", "/servir", "/entretien", "/donner", "/rejoindre", "/agenda-public", "/installer", "/site", "/api",
  "/accueil", "/profile", "/guide", "/messages", "/mcp/autoriser", "/_next",
];
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

describe("table des anciennes adresses (spec 092, lot 4)", () => {
  it("chaque ancienne adresse est unique, et sa cible est un écran actuel", () => {
    const froms = LEGACY_PATHS.map((e) => e.from);
    expect(new Set(froms).size).toBe(froms.length);
    for (const e of LEGACY_PATHS) {
      expect(isScreen(sample(e.to)), `${e.from} → ${e.to}`).toBe(true);
      // Mêmes paramètres des deux côtés (aucun paramètre inventé à la cible).
      const params = (s: string) => (s.match(/:[A-Za-z]+/g) ?? []).sort();
      for (const p of params(e.to)) expect(params(e.from), e.from).toContain(p);
    }
  });

  it("aucune chaîne : une cible n'est jamais elle-même une ancienne adresse", () => {
    for (const e of LEGACY_PATHS) {
      expect(matchLegacyPath(sample(e.to)), `${e.to} redirigerait encore`).toBeNull();
    }
  });

  it("aucune ancienne adresse n'est un écran actuel (aucune page masquée par la redirection)", () => {
    // Seule collision admise : un segment fixe (`new`) à la place d'un identifiant d'écran
    // (`/admin/messages/[id]`) — un identifiant (cuid) ne vaut jamais `new`.
    const STATIC_OVER_ID = /\/(new|edit|onboard)$/;
    const hits = LEGACY_PATHS.map((e) => e.from).filter((f) => isScreen(sample(f)) && !STATIC_OVER_ID.test(f));
    expect(hits).toEqual([]);
  });

  it("aucune adresse publique, d'hôte de site, d'API, ni l'Accueil, le profil, le guide, les messages", () => {
    for (const e of LEGACY_PATHS) {
      for (const p of NEVER) expect(under(e.from, p), `${e.from} sous ${p}`).toBe(false);
      // Aucune ancienne adresse n'est une route publique déclarée.
      expect(routeTable.isPublic(sample(e.from), "GET"), e.from).toBe(false);
    }
  });

  it("chaque ancienne adresse est reconnue et rend sa cible, paramètres substitués", () => {
    for (const e of LEGACY_PATHS) {
      const m = matchLegacyPath(sample(e.from));
      expect(m, e.from).not.toBeNull();
      expect(m!.pathname + (m!.query ? `?${m!.query}` : "")).toBe(e.to.replace(/:[A-Za-z]+/g, "x1"));
    }
    expect(matchLegacyPath("/accounting/requests/abc_123-X")).toMatchObject({ pathname: "/finances/demandes/abc_123-X" });
    expect(matchLegacyPath("/jobs/new")?.pathname).not.toBe(matchLegacyPath("/jobs/x1")?.pathname);
  });

  it.each([
    ["//evil.com"],
    ["/accounting/requests//evil.com"],
    ["/accounting/requests/%2F%2Fevil.com"],
    ["/accounting/requests/a%2Fb"],
    ["/accounting/requests/a\\evil.com"],
    ["/accounting/requests/\\\\evil.com"],
    ["/accounting/requests/%2e%2e"],
    ["/accounting/requests/.."],
    ["/accounting/requests/%0d%0aLocation:%20https://evil.com"],
    ["/accounting/requests/a\r\nSet-Cookie:x=1"],
    ["/accounting/requests/a b"],
    ["/accounting/requests/https:"],
    ["/accounting/requests/" + "a".repeat(65)],
    ["/events/"],
    ["/EVENTS"],
    ["/events/x1/star-view/extra"],
  ])("entrée hostile %j : aucune correspondance", (path) => {
    expect(matchLegacyPath(path)).toBeNull();
  });

  it("table inverse : retour à l'ancienne adresse, requête fixe comprise", () => {
    expect(reverseLegacyPath("/finances/demandes/r1")).toMatchObject({ pathname: "/accounting/requests/r1" });
    expect(reverseLegacyPath("/evenements")).toMatchObject({ pathname: "/events" });
    for (const e of LEGACY_PATHS.filter((x) => !x.alias)) {
      const [path, query = ""] = sample(e.to).split("?").concat(e.to.split("?")[1] ?? "").slice(0, 2);
      const back = reverseLegacyPath(path, query);
      expect(back?.pathname, e.to).toBe(sample(e.from));
    }
  });

  it("préfixes d'aide partagés : couverture écran par écran", () => {
    expect([...rewriteScreenPrefix("/accounting")].sort()).toEqual([...LEGACY_SCREEN_PREFIXES["/accounting"]].sort());
    expect(rewriteScreenPrefix("/events")).toContain("/evenements");
    // Un préfixe d'écran déjà à jour revient tel quel.
    for (const p of ["/finances/demandes", "/evenements", "/personnes/star"]) expect(rewriteScreenPrefix(p)).toEqual([p]);
    // `/admin` couvrait aussi les écrans sortis de l'administration : il les garde.
    expect(rewriteScreenPrefix("/admin")).toEqual(expect.arrayContaining(["/admin", "/evenements/gestion", "/plateforme/eglises"]));
    // Idempotent sur un ensemble : réécrire deux fois ne change plus rien.
    const once = (list: string[]) => [...new Set(list.flatMap((p) => rewriteScreenPrefix(p)))].sort();
    for (const start of [["/admin"], ["/accounting", "/events"], ["/pastoral"], ["/integration", "/care"]]) {
      expect(once(once(start))).toEqual(once(start));
    }
  });
});

describe("réécriture d'un lien mémorisé", () => {
  const APP = "https://koinonia.example.org";

  it("relatif : chemin réécrit, requête et ancre conservées", () => {
    expect(rewriteStoredHref("/accounting/requests/r1?tab=pieces#p2", "forward")).toBe("/finances/demandes/r1?tab=pieces#p2");
    expect(rewriteStoredHref("/formulaires/mes-reponses", "forward")).toBe("/evenements/mes-inscriptions?vue=formulaires");
  });

  it("absolu : seulement vers l'origine de l'application", () => {
    expect(rewriteStoredHref(`${APP}/events`, "forward", APP)).toBe(`${APP}/evenements`);
    expect(rewriteStoredHref("https://evil.example/events", "forward", APP)).toBeNull();
    expect(rewriteStoredHref(`${APP}.evil.example/events`, "forward", APP)).toBeNull();
    expect(rewriteStoredHref(`${APP}/events`, "forward")).toBeNull();
  });

  it("jamais : autre schéma, protocole relatif, adresse inconnue, adresse publique", () => {
    for (const href of ["mailto:a@b.c", "javascript:alert(1)", "//evil.com/events", "/\\evil.com", "/inconnu", "/billet/abc", "/media/v/tok", "events"]) {
      expect(rewriteStoredHref(href, "forward", APP), href).toBeNull();
    }
  });

  it("idempotent, et réversible", () => {
    for (const e of LEGACY_PATHS.filter((x) => !x.alias && !x.to.includes("?"))) {
      const old = sample(e.from);
      const next = rewriteStoredHref(old, "forward")!;
      expect(rewriteStoredHref(next, "forward"), `${old} réécrit deux fois`).toBeNull();
      expect(rewriteStoredHref(next, "reverse"), next).toBe(old);
    }
  });

  it("forme actuelle et anciennes formes d'un lien (effacements, dédoublonnage)", () => {
    expect(legacyAndCurrent("/personnes/integration/dossiers/i1")).toEqual(
      expect.arrayContaining(["/personnes/integration/dossiers/i1", "/integration/requests/i1", "/admin/integration/requests/i1"])
    );
    expect(legacyAndCurrent("/personnes/integration/dossiers/i1")[0]).toBe("/personnes/integration/dossiers/i1");
    expect(currentHref("/integration/requests/i1")).toBe("/personnes/integration/dossiers/i1");
    expect(currentHref("/personnes/integration/dossiers/i1")).toBe("/personnes/integration/dossiers/i1");
  });
});
