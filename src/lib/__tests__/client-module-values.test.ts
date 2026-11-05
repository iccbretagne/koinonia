import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Une valeur exportée d'un fichier « use client » (constante, tableau, fonction utilitaire)
 * n'est, côté serveur, qu'une référence vers le client : `TREASURY_TABS.find is not a function`
 * a cassé la page de la trésorerie en recette alors que les tests unitaires passaient. Un fichier
 * serveur n'importe donc d'un module client que des composants (nom en majuscule) et des types ;
 * les valeurs partagées vivent dans un module neutre.
 */
const SRC = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "generated" && name !== "__tests__" && name !== "__mocks__") walk(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const isClient = (file: string) => /^\s*["']use client["']/.test(readFileSync(file, "utf8").slice(0, 300));

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) return base + ext;
  return null;
}

const IMPORT = /import\s+(type\s+)?(?:\w+\s*,\s*)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;

describe("frontière serveur / client", () => {
  it("aucun fichier serveur n'importe une valeur non-composant d'un module « use client »", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (isClient(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(IMPORT)) {
        if (m[1]) continue;
        const target = resolve(file, m[3]);
        if (!target || !isClient(target)) continue;
        const values = m[2]
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n && !n.startsWith("type "))
          .map((n) => n.split(/\s+as\s+/)[0]);
        const suspicious = values.filter((n) => !/^[A-Z][a-z]/.test(n));
        if (suspicious.length) offenders.push(`${path.relative(SRC, file)} ← ${path.relative(SRC, target)} : ${suspicious.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
