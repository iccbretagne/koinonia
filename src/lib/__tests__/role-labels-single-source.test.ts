// Spec 054 (Lot 1, T52) — `src/lib/roles.ts` doit rester la SEULE source des libellés de rôle
// (`ROLE_LABELS`/`ROLE_SHORT_LABELS`/`ROLE_DESCRIPTIONS`/`ROLE_CATEGORY`/`ROLE_CATEGORY_LABELS`).
// Avant cette spec, 7 tables locales recopiaient ces libellés (`GuideContent.tsx`,
// `AccessClient.tsx`, `UsersClient.tsx`, `LinkRequestsClient.tsx`, `NoAccessClient.tsx`,
// `RequestForm.tsx`…) — ce test-gardien détecte une redéclaration locale portant sur `Role`,
// même nom de convention (`ROLE_LABELS`…) ailleurs dans `src/`. Suit le même principe qu'ALLOWLIST
// de `rbac-no-role-proxy.test.ts` : une redéclaration légitime doit être justifiée ici, pas
// silencieusement acceptée.
//
// Le motif exige la présence de `Role`/`RequestedRole` dans le type de la déclaration : les
// tables locales `ROLE_LABELS` d'autres domaines (agenda, care, integration/leaders — rôles
// internes à ces modules, sans rapport avec l'enum `Role`) ne sont donc jamais concernées.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_DIR = join(__dirname, "../..");
const ROOT_DIR = join(__dirname, "../../..");
const IGNORED_DIR_NAMES = new Set(["__tests__", "generated"]);
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);
const PATTERN =
  /\bconst\s+(ROLE_LABELS|ROLE_SHORT_LABELS|ROLE_DESCRIPTIONS|ROLE_CATEGORY|ROLE_CATEGORY_LABELS)\b[^=]*\b(Role|RequestedRole)\b/;

const ALLOWLIST: Record<string, string> = {
  // `RequestedRole` ajoute `DEPUTY` (adjoint de département) aux 4 rôles assignables via une
  // demande d'accès — `DEPUTY` n'est pas un membre de l'enum `Role` (c'est le flag `isDeputy`
  // d'un DEPARTMENT_HEAD), donc ne peut pas venir de `@/lib/roles` tel quel. Les 4 vrais rôles
  // référencent `ROLE_LABELS_BASE.<ROLE>` importé de `@/lib/roles` ; seul `DEPUTY` est un littéral.
  "src/app/(auth)/admin/members/LinkRequestsClient.tsx": "Record<NonNullable<RequestedRole>, string> avec DEPUTY (hors enum Role) en plus des 4 rôles importés de @/lib/roles",
  "src/app/no-access/NoAccessClient.tsx": "Record<NonNullable<RequestedRole>, string> avec DEPUTY (hors enum Role) en plus des 4 rôles importés de @/lib/roles",
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, acc);
    } else if (SCANNED_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      acc.push(full);
    }
  }
  return acc;
}

function toRelPath(file: string): string {
  return relative(ROOT_DIR, file).split(sep).join("/");
}

describe("aucune table de libellés de rôle (Role) hors src/lib/roles.ts (spec 054, T52)", () => {
  const files = walk(SRC_DIR)
    .map(toRelPath)
    .filter((rel) => rel !== "src/lib/roles.ts")
    .filter((rel) => PATTERN.test(readFileSync(join(ROOT_DIR, rel), "utf-8")));

  it.each(files)("%s est dans la liste blanche, avec une raison", (rel) => {
    expect(
      ALLOWLIST[rel],
      `${rel} redéclare localement une table de libellés de rôle (Role) — ajoute-le à ALLOWLIST avec sa justification, ou importe depuis @/lib/roles`
    ).toBeTruthy();
  });

  it.each(Object.keys(ALLOWLIST))("%s (liste blanche) contient toujours le motif", (rel) => {
    expect(
      PATTERN.test(readFileSync(join(ROOT_DIR, rel), "utf-8")),
      `${rel} ne contient plus la redéclaration attendue — retire l'entrée obsolète`
    ).toBe(true);
  });
});
