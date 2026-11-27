import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

/**
 * Spec 092 (T0.12) — cliquet des littéraux d'écran.
 *
 * Toute adresse d'écran connecté se construit par `src/lib/paths.ts` (`paths.*`) : c'est ce qui
 * permettra de changer les adresses (lot 4) en un seul fichier. Ce test refuse toute chaîne ou
 * gabarit qui **commence** par un préfixe d'écran (`url-mapping.txt`) ailleurs que dans :
 *
 * - le registre lui-même (`paths.ts`, `legacy-paths.ts`) ;
 * - les déclarations de surface HTTP (ADR-0012) : manifestes de modules, `NOYAU_ROUTES`
 *   (`src/lib/module-routes.ts`), `src/core/` — ce sont des préfixes de routage, pas des liens ;
 * - les contrats d'API (`contract.ts`, documentation pure) ;
 * - les tests.
 *
 * Les commentaires et le texte affiché ne sont pas concernés (analyse syntaxique, pas de
 * recherche de texte). Une exception se justifie dans `RESIDUAL`, au plus près de la raison.
 */

const ROOT = join(__dirname, "../../..");
const SRC = join(ROOT, "src");

/**
 * Premiers segments des écrans connectés : adresses actuelles (lot 4) **et** anciennes adresses
 * (specs/092-navigation-par-metier/url-mapping.txt), pour qu'aucune ne revienne en dur.
 */
const SCREEN_PREFIXES = [
  // Actuels
  "accueil", "admin", "demandes", "evenements", "finances", "guide", "mcp", "medias", "messages",
  "pastoral", "personnes", "planning", "plateforme", "profile", "ressources",
  // Anciens (redirigés par legacy-paths.ts)
  "absences", "accounting", "agenda", "audio", "billetterie", "candidatures", "care", "collectes",
  "communication", "dashboard", "disponibilites", "dons", "events", "formulaires", "integration",
  "jobs", "media", "requests", "rooms", "secretariat",
];

/** Adresses publiques par jeton, hors `(auth)` : `/media/{c,d,g,v}/<jeton>`. */
const PUBLIC_LITERALS = [/^\/media\/[cdgv](\/|$)/];

const EXCLUDED_FILES = new Set([
  "src/lib/paths.ts",
  "src/lib/legacy-paths.ts",
  "src/lib/module-routes.ts",
]);

/** Littéraux restants, chacun justifié. Fichier → nombre de littéraux tolérés. */
const MEDIA_SHARE = "lien public par jeton `/media/{c,d,g,v}/<jeton>` (hors écrans connectés), segment choisi à l'exécution";
const RESIDUAL: Record<string, { count: number; reason: string }> = {
  "src/modules/media/services/tokens.ts": { count: 1, reason: MEDIA_SHARE },
  "src/modules/media/services/shares.ts": { count: 1, reason: MEDIA_SHARE },
  "src/app/api/_media-share/handlers.ts": { count: 1, reason: MEDIA_SHARE },
  "src/app/(auth)/medias/photos/[id]/MediaEventDetail.tsx": { count: 1, reason: MEDIA_SHARE },
  "src/app/(auth)/medias/visuels/[id]/MediaProjectDetail.tsx": { count: 1, reason: MEDIA_SHARE },
};

function excluded(rel: string): boolean {
  if (EXCLUDED_FILES.has(rel)) return true;
  if (rel.startsWith("src/generated/") || rel.startsWith("src/core/")) return true;
  if (/(^|\/)__tests__\//.test(rel) || /\.test\.tsx?$/.test(rel)) return true;
  if (/^src\/modules\/[^/]+\/manifest\.ts$/.test(rel)) return true;
  if (/\/contract\.ts$/.test(rel)) return true;
  return false;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

const LITERAL = new RegExp(`^/(${SCREEN_PREFIXES.join("|")})(?=$|[/?#])`);

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    // `${origine}/ecran…` (lien absolu, lot 4) : la tête est vide, l'adresse suit la 1re substitution.
    if (node.head.text === "" && node.templateSpans.length) {
      const [first, ...rest] = node.templateSpans;
      return first.literal.text + (rest.length ? "\u0000" : "");
    }
    return node.head.text + (node.templateSpans.length ? "\u0000" : "");
  }
  return null;
}

function screenLiterals(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const text = literalText(node);
    if (text !== null) {
      // Un gabarit dont la tête s'arrête juste après le préfixe (`/admin${x}`) compte aussi.
      const head = text.replace(/\u0000$/, "");
      if ((LITERAL.test(head) || LITERAL.test(head + "/")) && !PUBLIC_LITERALS.some((r) => r.test(head))) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        found.push(`${line}: ${node.getText(sf).slice(0, 80)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("cliquet des littéraux d'écran (spec 092)", () => {
  const files = walk(SRC)
    .map((f) => relative(ROOT, f).split(sep).join("/"))
    .filter((rel) => !excluded(rel));
  const byFile = new Map<string, string[]>();
  for (const rel of files) {
    const hits = screenLiterals(rel, readFileSync(join(ROOT, rel), "utf8"));
    if (hits.length) byFile.set(rel, hits);
  }

  it("analyse bien le code de l'application", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("aucun littéral d'écran hors de src/lib/paths.ts (sauf résidu justifié)", () => {
    const offenders = [...byFile]
      .filter(([rel, hits]) => hits.length > (RESIDUAL[rel]?.count ?? 0))
      .map(([rel, hits]) => `${rel}\n    ${hits.join("\n    ")}`);
    expect(offenders, `Construire ces adresses avec paths.* (@/lib/paths) :\n${offenders.join("\n")}`).toEqual([]);
  });

  it("chaque entrée du résidu est justifiée et toujours nécessaire", () => {
    for (const [rel, { count, reason }] of Object.entries(RESIDUAL)) {
      expect(reason.length, rel).toBeGreaterThan(20);
      expect(byFile.get(rel)?.length ?? 0, `${rel} : résidu obsolète, à retirer`).toBe(count);
    }
  });
});
