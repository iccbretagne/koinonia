import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { prismaMock } from "@/__mocks__/prisma";
import { ALL_MODULES, ROLE_PERMISSIONS, viewerFor } from "./test-viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { BUILTIN_ENTRIES } = await import("../knowledge");
const { loadKnowledge, invalidateKnowledge, viewerEntries, moduleOf, entriesForScreen } = await import(
  "../services/knowledge"
);

/** Routes réelles des pages (`page.tsx`), groupes de routes retirés. */
function pageRoutes(): Set<string> {
  const root = path.join(process.cwd(), "src/app");
  const routes = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "page.tsx") {
        const route = path
          .relative(root, dir)
          .split(path.sep)
          .filter((seg) => seg && !/^\(.*\)$/.test(seg))
          .join("/");
        routes.add(`/${route}`);
      }
    }
  };
  walk(root);
  return routes;
}

/** Permission exigée par la garde de l'écran (pages relevées à la main, spec 075). */
const SCREEN_PERMISSION: Record<string, string> = {
  "/dashboard": "planning:department",
  "/dashboard/stats": "planning:department",
  "/disponibilites/collectes": "availability:settings",
  "/admin/members": "members:view",
  "/admin/access": "access:manage",
  "/admin/events": "events:manage",
  "/admin/reports": "reports:view",
  "/admin/welcome-duty": "events:manage",
  "/admin/discipleship": "discipleship:view",
  "/admin/messages": "messages:publish",
  "/requests": "members:view",
  "/requests/new": "members:view",
  "/rooms": "rooms:view",
  "/dons": "giving:manage",
  "/accounting/tresorerie": "treasury:manage",
  "/care/request": "planning:view",
  "/events/announcement-sheets": "planning:view",
};

describe("base de connaissances fournie (spec 075)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateKnowledge();
  });

  it("a des clés uniques et des formulations", () => {
    const keys = BUILTIN_ENTRIES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of BUILTIN_ENTRIES) expect(e.questions.length, e.key).toBeGreaterThan(0);
  });

  it("chaque lien ouvre une page existante, interne", () => {
    const routes = pageRoutes();
    for (const e of BUILTIN_ENTRIES.filter((x) => x.href)) {
      expect(e.href, e.key).toMatch(/^\/(?!\/)/);
      expect(routes.has(e.href!.split("?")[0]), `${e.key} → ${e.href}`).toBe(true);
    }
  });

  it("chaque lien est accessible aux rôles de l'audience de la fiche", () => {
    for (const e of BUILTIN_ENTRIES.filter((x) => x.href)) {
      const required = SCREEN_PERMISSION[e.href!.split("?")[0]];
      if (!required) continue;
      expect(e.audience.all, `${e.key} ne peut pas viser tout le monde`).toBeUndefined();
      for (const permission of e.audience.permissions ?? []) {
        const holders = Object.entries(ROLE_PERMISSIONS).filter(([, perms]) => perms.includes(permission));
        for (const [role, perms] of holders) {
          expect(perms.includes(required), `${e.key} : ${role} a ${permission} mais pas ${required}`).toBe(true);
        }
      }
      for (const role of e.audience.roles ?? []) {
        expect(ROLE_PERMISSIONS[role]?.includes(required), `${e.key} : ${role}`).toBe(true);
      }
    }
  });

  it("chaque fiche appartient à un module connu", () => {
    for (const e of BUILTIN_ENTRIES) {
      const owner = moduleOf(e);
      if (owner) expect(ALL_MODULES, e.key).toContain(owner);
    }
    expect(moduleOf({ href: "/accounting/tresorerie?onglet=remise" })).toBe("treasury");
    expect(moduleOf({ href: "/profile" })).toBe("core");
  });

  it("une fiche d'un module désactivé disparaît, même son refus", () => {
    const viewer = viewerFor("STAR", { modules: ["core", "planning"] });
    const { visible, refusable } = viewerEntries(BUILTIN_ENTRIES, viewer);
    const keys = [...visible, ...refusable].map((e) => e.key);
    expect(keys).not.toContain("KB-102");
    expect(keys).not.toContain("D21");
    expect(keys).not.toContain("KB-141");
    expect(keys).toContain("KB-021");
  });

  it("un STAR ne voit pas les fiches réservées, mais reçoit leur refus", () => {
    const { visible, refusable } = viewerEntries(BUILTIN_ENTRIES, viewerFor("STAR", { predicates: ["linkedStar"] }));
    const visibleKeys = visible.map((e) => e.key);
    expect(visibleKeys).toContain("KB-021");
    expect(visibleKeys).not.toContain("KB-040");
    expect(visibleKeys).not.toContain("D11");
    expect(refusable.map((e) => e.key)).toContain("D11");
  });

  it("fusionne corrections, masquages, ajouts et formulations rattachées", async () => {
    prismaMock.assistantEntry.findMany.mockResolvedValue([
      { id: "o1", source: "OVERRIDE", builtinKey: "KB-021", title: "Absence", questions: ["je serai absent"], answer: "Nouveau texte", href: null, hrefLabel: null, roles: [], module: null, screens: [], disabled: false },
      { id: "o2", source: "OVERRIDE", builtinKey: "KB-004", title: "", questions: [], answer: "", href: null, hrefLabel: null, roles: [], module: null, screens: [], disabled: true },
      { id: "c1", source: "CUSTOM", builtinKey: null, title: "Parking", questions: ["où se garer ?"], answer: "Parking derrière l'église.", href: null, hrefLabel: null, roles: ["STAR"], module: null, screens: [], disabled: false },
    ]);
    prismaMock.assistantAlias.findMany.mockResolvedValue([{ id: "a1", entryKey: "KB-020", text: "c'est quand mon tour" }]);
    const { entries, hidden } = await loadKnowledge();
    const byKey = new Map(entries.map((e) => [e.key, e]));
    expect(byKey.get("KB-021")).toMatchObject({ answer: "Nouveau texte", origin: "override", audience: { predicates: ["linkedStar"] } });
    expect(byKey.has("KB-004")).toBe(false);
    expect(hidden.has("KB-004")).toBe(true);
    expect(byKey.get("C-c1")).toMatchObject({ origin: "custom", audience: { roles: ["STAR"] } });
    expect(byKey.get("KB-020")?.aliases).toEqual(["c'est quand mon tour"]);
    // Une mise à jour de Koinonia garde les fiches fournies non corrigées.
    expect(byKey.get("KB-001")?.origin).toBe("builtin");
  });

  it("propose les questions fréquentes de l'écran courant", () => {
    const keys = entriesForScreen(BUILTIN_ENTRIES, "/disponibilites").map((e) => e.key);
    expect(keys).toContain("KB-021");
    expect(keys).toContain("KB-043");
    expect(entriesForScreen(BUILTIN_ENTRIES, undefined)).toEqual([]);
  });

  it("les liens externes n'existent pas dans la base fournie", () => {
    expect(existsSync(path.join(process.cwd(), "src/app/installer/page.tsx"))).toBe(true);
    for (const e of BUILTIN_ENTRIES) expect(e.answer).not.toMatch(/https?:\/\//);
  });
});
