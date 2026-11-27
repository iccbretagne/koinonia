import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SCREENS, PREFIXES, paths, type ScreenKey } from "../paths";

/**
 * Spec 092 (T0.8) — registre des écrans : exhaustif dans les deux sens par rapport aux
 * `page.tsx` de `src/app/(auth)`, et chaque constructeur produit une adresse conforme à son motif.
 */

const AUTH_DIR = join(__dirname, "../../app/(auth)");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry === "page.tsx") acc.push(full);
  }
  return acc;
}

function toPattern(file: string): string {
  const segs = relative(AUTH_DIR, file).split(sep);
  segs.pop();
  const url = "/" + segs.filter((s) => !(s.startsWith("(") && s.endsWith(")"))).join("/");
  return url === "/" ? "/" : url.replace(/\/$/, "");
}

const pages = walk(AUTH_DIR).map(toPattern).sort();
const patterns = Object.values(SCREENS) as string[];

function ctorOf(key: ScreenKey): (...args: unknown[]) => string {
  let node: unknown = paths;
  for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
  return node as (...args: unknown[]) => string;
}

function regexOf(pattern: string): RegExp {
  const body = pattern
    .split("/")
    .map((s) => (s.startsWith("[") ? "[^/?#]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${body}(\\?[^#]*)?$`);
}

describe("registre des écrans (paths.ts)", () => {
  it("trouve bien les pages connectées", () => {
    expect(pages.length).toBeGreaterThan(100);
  });

  it("chaque page.tsx de (auth) a une entrée dans SCREENS", () => {
    const missing = pages.filter((p) => !patterns.includes(p));
    expect(missing, missing.join(", ")).toEqual([]);
  });

  it("chaque motif de SCREENS correspond à une page.tsx réelle", () => {
    const orphan = patterns.filter((p) => !pages.includes(p));
    expect(orphan, orphan.join(", ")).toEqual([]);
  });

  it("aucun motif en double", () => {
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it.each(Object.keys(SCREENS) as ScreenKey[])("%s : le constructeur produit une adresse conforme au motif", (key) => {
    const ctor = ctorOf(key);
    expect(typeof ctor, `paths.${key}`).toBe("function");
    const pattern = SCREENS[key];
    const arity = (pattern.match(/\[[^\]]+\]/g) ?? []).length;
    const args = Array.from({ length: arity }, (_, i) => `id${i}`);
    expect(ctor(...args)).toMatch(regexOf(pattern));
    expect(ctor(...args, { a: "1" })).toMatch(regexOf(pattern));
  });

  it("chaque constructeur est enregistré sous sa clé (pas de constructeur hors registre)", () => {
    const keys = new Set<string>();
    const visit = (node: unknown, prefix: string) => {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "function") keys.add(key);
        if (v && (typeof v === "object" || typeof v === "function")) visit(v, key);
      }
    };
    visit(paths, "");
    expect([...keys].sort()).toEqual(Object.keys(SCREENS).sort());
  });

  it("encode les segments dynamiques : aucune injection de segment, de requête ni d'origine", () => {
    expect(paths.accounting.request("a/b?c#d")).toBe("/accounting/requests/a%2Fb%3Fc%23d");
    expect(() => paths.admin.event("..")).toThrow();
    expect(() => paths.admin.event(".")).toThrow();
    expect(paths.admin.event("a..b")).toBe("/admin/events/a..b");
    expect(paths.collectes.apercu("x y", "//evil.example")).toBe("/collectes/x%20y/apercu/%2F%2Fevil.example");
    expect(() => paths.accounting.request("")).toThrow();
    expect(() => (paths.accounting.request as (a: unknown) => string)(undefined)).toThrow();
  });

  it("encode la requête et omet les valeurs absentes", () => {
    expect(paths.dashboard({ dept: "d 1&x=y", event: undefined, all: false })).toBe("/dashboard?dept=d+1%26x%3Dy");
    expect(paths.dashboard({ dept: "d1", n: 2, on: true })).toBe("/dashboard?dept=d1&n=2&on=true");
    expect(paths.dashboard({})).toBe("/dashboard");
  });

  it("les préfixes ne sont pas des écrans mais préfixent des écrans", () => {
    for (const prefix of Object.values(PREFIXES)) {
      expect(patterns).not.toContain(prefix);
      expect(patterns.some((p) => p.startsWith(`${prefix}/`)), prefix).toBe(true);
    }
  });
});
