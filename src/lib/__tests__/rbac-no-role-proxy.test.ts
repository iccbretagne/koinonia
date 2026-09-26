import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Test-gardien de l'ADR-0017 (spec 054, issue #583) : une garde doit vérifier la permission qui
 * nomme l'action qu'elle protège, jamais une permission voisine détenue par les bons rôles pour
 * une autre raison. `members:manage` (gérer les fiches STAR de son périmètre) et `events:manage`
 * (gérer les événements) ont servi de raccourci pour « Admin/Secrétaire », ce qui a
 * silencieusement donné accès aux dossiers d'accueil et aux parcours d'intégration à tout
 * Ministre et tout Responsable de département (#583).
 *
 * Toute occurrence du littéral `"members:manage"`/`"events:manage"` dans `src/` doit figurer
 * dans `ALLOWLIST` ci-dessous avec sa justification — sinon le test échoue. Une entrée dont le
 * fichier ne contient plus le littéral est elle aussi signalée (liste à jour).
 */

const SRC_DIR = join(__dirname, "../../../src");
const ROOT_DIR = join(__dirname, "../../..");
const IGNORED_DIR_NAMES = new Set(["__tests__"]);
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);
const PATTERN = /"members:manage"|"events:manage"/;

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

const MEMBERS_MANAGE_LEGIT = "members:manage — gestion des fiches STAR de son périmètre (D1, inchangé)";
const EVENTS_MANAGE_LEGIT = "events:manage — gestion des événements (permission propre)";
const EVENTS_MANAGE_FRAGILE =
  "events:manage — raccourci « Admin/Secrétaire » toléré : aucun sur-octroi aujourd'hui (seuls " +
  "ces rôles la détiennent), mais cassera silencieusement le jour où un autre rôle l'obtiendra " +
  "(audit-rbac.md, groupe C — décision : documenté, non corrigé)";

const ALLOWLIST: Record<string, string> = {
  "src/modules/planning/manifest.ts": "déclaration des permissions elles-mêmes",

  "src/app/api/members/route.ts": MEMBERS_MANAGE_LEGIT,
  "src/app/api/members/[memberId]/route.ts": MEMBERS_MANAGE_LEGIT,
  "src/app/api/members/[memberId]/departments/route.ts": MEMBERS_MANAGE_LEGIT,
  "src/app/api/members/lookup/route.ts":
    "members:manage — recherche de STAR à l'échelle de l'église, volontairement hors périmètre (voir commentaire du fichier)",
  "src/app/api/admin/members/duplicates/route.ts": `${MEMBERS_MANAGE_LEGIT} ; liste filtrée au périmètre`,
  "src/app/api/admin/members/merge/route.ts": `${MEMBERS_MANAGE_LEGIT} ; fusion refusée si une fiche déborde (isMemberFullyInScope)`,
  "src/app/(auth)/admin/members/page.tsx": `${MEMBERS_MANAGE_LEGIT} (bouton Doublons)`,
  "src/app/(auth)/admin/members/duplicates/page.tsx": `${MEMBERS_MANAGE_LEGIT} ; liste filtrée au périmètre`,

  "src/app/(auth)/admin/departments/functions/page.tsx": EVENTS_MANAGE_LEGIT,
  "src/app/(auth)/admin/events/page.tsx": EVENTS_MANAGE_LEGIT,
  "src/app/(auth)/admin/events/[eventId]/page.tsx": EVENTS_MANAGE_LEGIT,
  "src/app/(auth)/admin/events/[eventId]/report/page.tsx": `${EVENTS_MANAGE_LEGIT} (ou reports:view)`,
  "src/app/(auth)/admin/welcome-duty/page.tsx": EVENTS_MANAGE_LEGIT,
  "src/app/(auth)/events/page.tsx": EVENTS_MANAGE_LEGIT,
  "src/app/api/departments/[departmentId]/route.ts": EVENTS_MANAGE_LEGIT,
  "src/app/api/events/route.ts": EVENTS_MANAGE_LEGIT,
  "src/app/api/events/[eventId]/route.ts": EVENTS_MANAGE_LEGIT,
  "src/app/api/events/[eventId]/report/route.ts": `${EVENTS_MANAGE_LEGIT} (ou reports:view/reports:edit)`,
  "src/app/api/events/[eventId]/departments/route.ts": EVENTS_MANAGE_LEGIT,
  "src/app/api/welcome-duty/families/route.ts": EVENTS_MANAGE_LEGIT,
  "src/app/api/welcome-duty/families/[id]/route.ts": EVENTS_MANAGE_LEGIT,
  "src/app/api/welcome-duty/assignments/route.ts": EVENTS_MANAGE_LEGIT,
  "src/app/api/welcome-duty/assignments/[id]/route.ts": EVENTS_MANAGE_LEGIT,
  "src/app/api/welcome-duty/suggestions/route.ts": EVENTS_MANAGE_LEGIT,
  "src/app/api/welcome-duty/available-families/route.ts": EVENTS_MANAGE_LEGIT,

  "src/app/(auth)/layout.tsx": EVENTS_MANAGE_FRAGILE,
  "src/app/(auth)/communication/requests/page.tsx": EVENTS_MANAGE_FRAGILE,
  "src/app/(auth)/media/(visuels)/requests/page.tsx": EVENTS_MANAGE_FRAGILE,
  "src/app/(auth)/secretariat/requests/page.tsx": EVENTS_MANAGE_FRAGILE,
  "src/lib/media-space.ts": EVENTS_MANAGE_FRAGILE,
  "src/app/api/requests/route.ts": EVENTS_MANAGE_FRAGILE,
  "src/app/api/requests/[id]/route.ts": EVENTS_MANAGE_FRAGILE,
  "src/app/api/announcements/route.ts": EVENTS_MANAGE_FRAGILE,
  "src/app/api/announcements/[id]/route.ts": EVENTS_MANAGE_FRAGILE,
};

function toRelPath(file: string): string {
  return relative(ROOT_DIR, file).split(sep).join("/");
}

describe("aucun raccourci de rôle hors liste blanche (ADR-0017, #583)", () => {
  const files = walk(SRC_DIR);
  const filesWithLiteral = files
    .map(toRelPath)
    .filter((rel) => PATTERN.test(readFileSync(join(ROOT_DIR, rel), "utf-8")));

  it("a bien trouvé des fichiers à vérifier (le test n'est pas vide)", () => {
    expect(filesWithLiteral.length).toBeGreaterThan(0);
  });

  it.each(filesWithLiteral)("%s est dans la liste blanche, avec une raison", (rel) => {
    expect(ALLOWLIST[rel], `${rel} utilise "members:manage"/"events:manage" sans justification — ajoute-le à ALLOWLIST ou retire le raccourci`).toBeTruthy();
  });

  it.each(Object.keys(ALLOWLIST))("%s (liste blanche) contient toujours le littéral", (rel) => {
    const full = join(ROOT_DIR, rel);
    expect(PATTERN.test(readFileSync(full, "utf-8")), `${rel} ne contient plus "members:manage"/"events:manage" — retire l'entrée obsolète`).toBe(true);
  });
});
