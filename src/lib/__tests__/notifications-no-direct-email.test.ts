import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Test-gardien de la spec 053 (ADR-0016) : `sendEmail` (`@/lib/email`) ne doit être importé,
 * dans `src/`, que par `src/lib/notifications.ts` (le seul endroit où la préférence utilisateur
 * est appliquée) et par une liste blanche explicite de sites « sans compte utilisateur » ou
 * « adresse institutionnelle », où la préférence individuelle ne s'applique pas. Comptage
 * statique des imports, sur le modèle de `scripts/check-prisma-boundary.sh` et de
 * `routes-exhaustivite.test.ts`.
 *
 * Un nouveau site d'email pour un compte existant doit passer par
 * `createNotification`/`notifyUsers`/`notifyUsersWithRole`/`notifyDeptMembers`/
 * `dispatchUserEmails` (`@/lib/notifications`) — jamais par un `sendEmail` direct. Ajouter un
 * fichier à cette liste blanche est une décision explicite, pas un contournement silencieux :
 * elle doit se justifier comme les entrées existantes ci-dessous.
 */

const SRC_DIR = join(__dirname, "../..");

const IGNORED_DIR_NAMES = new Set(["__tests__", "node_modules", "generated"]);
const SCANNED_EXTENSIONS = [".ts", ".tsx"];

/** Chaque entrée : pourquoi ce site reste en dehors du mécanisme de préférence. */
const WHITELIST = new Set([
  "src/lib/notifications.ts", // le mécanisme lui-même (spec 053)
  "src/modules/care/services/notifications.ts", // branche « profil pastoral / demandeur sans compte »
  "src/modules/care/services/appointments.ts", // confirmation de dépôt du formulaire public
  "src/app/api/cron/route.ts", // membre sans compte lié (T25) + digest planning vers church.secretariatEmails (institutionnelle)
  "src/app/api/cron/reminders/route.ts", // membre sans compte lié (T26)
  "src/app/api/accounting/requests/route.ts", // adresse institutionnelle church.accountingEmails
  "src/app/api/agenda/requests/[id]/schedule/route.ts", // profil pastoral sans compte, planification
  "src/app/api/integration/requests/route.ts", // confirmation de dépôt du formulaire public d'accueil
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, acc);
    } else if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext)) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

/** Import nommé de `sendEmail` depuis `@/lib/email` (les autres exports du module sont sans risque). */
const SEND_EMAIL_IMPORT = /import\s*\{[^}]*\bsendEmail\b[^}]*\}\s*from\s*["']@\/lib\/email["']/;

describe("garde-fou : sendEmail direct réservé au mécanisme et à sa liste blanche (spec 053)", () => {
  const files = walk(SRC_DIR);
  const importers = files
    .filter((f) => SEND_EMAIL_IMPORT.test(readFileSync(f, "utf-8")))
    .map((f) => relative(join(__dirname, "../../.."), f).split(sep).join("/"));

  it("a bien trouvé des fichiers à vérifier (le test n'est pas vide)", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("aucun fichier hors liste blanche n'importe sendEmail directement", () => {
    const unauthorized = importers.filter((f) => !WHITELIST.has(f));
    expect(unauthorized, `Import direct de sendEmail non couvert par la liste blanche : ${unauthorized.join(", ")}`).toEqual([]);
  });

  it("chaque entrée de la liste blanche importe encore sendEmail (pas d'entrée obsolète)", () => {
    const stale = [...WHITELIST].filter((f) => !importers.includes(f));
    expect(stale, `Entrée(s) de la liste blanche qui n'importent plus sendEmail — à retirer : ${stale.join(", ")}`).toEqual([]);
  });
});

/**
 * Garde-fou complémentaire (spec 053, lot 2, T58) : après la migration de tous les sites
 * d'écriture directe, plus aucun `prisma.notification.create`/`createMany` ni
 * `tx.notification.create`/`createMany` ne doit subsister hors de `src/lib/notifications.ts` —
 * sans quoi cette écriture échapperait au domaine et à la préférence utilisateur. Un nouveau
 * site doit toujours passer par `createNotification`/`notifyUsers`/`notifyUsersWithRole`/
 * `notifyDeptMembers`.
 */
const DIRECT_NOTIFICATION_WRITE = /\.notification\s*\.\s*(create|createMany)\s*\(/;
const NOTIFICATIONS_LIB_PATH = "src/lib/notifications.ts";

describe("garde-fou : écriture de Notification réservée aux helpers de src/lib/notifications.ts (spec 053, lot 2)", () => {
  const files = walk(SRC_DIR);
  const writers = files
    .filter((f) => DIRECT_NOTIFICATION_WRITE.test(readFileSync(f, "utf-8")))
    .map((f) => relative(join(__dirname, "../../.."), f).split(sep).join("/"));

  it("seul src/lib/notifications.ts écrit directement dans Notification", () => {
    const unauthorized = writers.filter((f) => f !== NOTIFICATIONS_LIB_PATH);
    expect(unauthorized, `Écriture directe de Notification hors du mécanisme : ${unauthorized.join(", ")}`).toEqual([]);
  });

  it("src/lib/notifications.ts écrit toujours directement (le test n'est pas devenu trivial)", () => {
    expect(writers).toContain(NOTIFICATIONS_LIB_PATH);
  });
});
