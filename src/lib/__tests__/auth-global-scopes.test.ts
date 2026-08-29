// Spec 024 — critère « les portées globales sont énumérables ». Un contrôle d'autorisation
// sans église cible (Super Admin ou domaine transverse) doit rester un acte délibéré et
// visible en revue, pas une omission qui repasse inaperçue. Ce test compare l'usage réel de
// `requireSuperAdmin` et `requirePlatformPermission` (importés depuis @/lib/auth) à une
// liste blanche commitée : tout nouvel appel fait échouer la suite tant qu'il n'y est pas
// ajouté explicitement.
//
// Ne couvre PAS les gardes globales locales pré-existantes et indépendantes de ce refactor
// (ex. les fonctions `requireSuperAdmin` dupliquées localement dans certaines routes admin/
// backups et churches) : elles n'ont jamais dépendu de l'ancien `requirePermission` sans
// église et ne présentaient donc pas le défaut H-01.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP_ROOT = join(__dirname, "../../app");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

function findGlobalScopeUsages(guardName: string): string[] {
  const hits: string[] = [];
  for (const file of listSourceFiles(APP_ROOT)) {
    const content = readFileSync(file, "utf-8");
    const importsGuard = new RegExp(
      `import\\s*{[^}]*\\b${guardName}\\b[^}]*}\\s*from\\s*["']@/lib/auth["']`
    ).test(content);
    if (importsGuard && content.includes(`${guardName}(`)) {
      hits.push(relative(APP_ROOT, file));
    }
  }
  return hits.sort();
}

const EXPECTED_SUPER_ADMIN_FILES = [
  "(auth)/admin/audit-logs/page.tsx",
  "(auth)/admin/churches/[churchId]/page.tsx",
  "(auth)/admin/churches/onboard/page.tsx",
  "(auth)/admin/churches/page.tsx",
].sort();

const EXPECTED_PLATFORM_PERMISSION_FILES = [
  "api/jobs/freelance/missions/route.ts",
  "api/jobs/freelance/profiles/route.ts",
  "api/jobs/route.ts",
  "api/jobs/seekers/route.ts",
].sort();

describe("portées globales énumérables (T18)", () => {
  it("requireSuperAdmin n'est appelé que depuis la liste blanche commitée", () => {
    expect(findGlobalScopeUsages("requireSuperAdmin")).toEqual(EXPECTED_SUPER_ADMIN_FILES);
  });

  it("requirePlatformPermission n'est appelé que depuis la liste blanche commitée (module emploi)", () => {
    expect(findGlobalScopeUsages("requirePlatformPermission")).toEqual(
      EXPECTED_PLATFORM_PERMISSION_FILES
    );
  });
});
