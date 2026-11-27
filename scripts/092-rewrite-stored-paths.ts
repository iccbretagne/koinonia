/**
 * Spec 092, lot 4 — réécriture des adresses d'écran mémorisées en base.
 *
 * Champs : AssistantEntry.href, AssistantEntry.screens, SystemMessage.linkUrl, Notification.link.
 * Règles : `src/lib/stored-paths.ts` (pur, testé), table fixe `src/lib/legacy-paths.ts`.
 *
 * **Manuel uniquement** : jamais lancé par la CI, `prisma migrate deploy` ni le déploiement.
 *
 * Usage :
 *   npx tsx scripts/092-rewrite-stored-paths.ts              # essai à blanc (défaut) : compte, n'écrit rien
 *   npx tsx scripts/092-rewrite-stored-paths.ts --apply      # écrit, après sauvegarde JSON
 *   npx tsx scripts/092-rewrite-stored-paths.ts --reverse [--apply]   # retour aux anciennes adresses
 *   npx tsx scripts/092-rewrite-stored-paths.ts --restore <sauvegarde.json> [--apply]  # remet les valeurs sauvegardées
 *
 * Options : --backup-dir <dossier> (défaut : ./backups-092, ignoré par git), --origin <https://…> (défaut : APP_URL) pour
 * les liens absolus vers l'application. Idempotent : un second passage ne trouve rien à changer.
 * Lots de 500 lignes, chaque lot dans une transaction.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { chunk, legacyMentions, rewriteLink, rewriteScreens, type RewriteDirection } from "../src/lib/stored-paths";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const APPLY = flag("--apply");
const DIRECTION: RewriteDirection = flag("--reverse") ? "reverse" : "forward";
const RESTORE = option("--restore");
const BACKUP_DIR = resolve(option("--backup-dir") ?? "backups-092");
const ORIGIN = option("--origin") ?? process.env.APP_URL ?? null;
const BATCH = 500;

type Field = "assistant.href" | "assistant.screens" | "systemMessage.linkUrl" | "notification.link";
interface Change {
  readonly field: Field;
  readonly id: string;
  readonly before: unknown;
  readonly after: unknown;
}

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });

async function collect(): Promise<{ changes: Change[]; mentions: { id: string; paths: string[] }[] }> {
  const changes: Change[] = [];
  const mentions: { id: string; paths: string[] }[] = [];

  const entries = await prisma.assistantEntry.findMany({ select: { id: true, href: true, screens: true, answer: true } });
  for (const e of entries) {
    const href = rewriteLink(e.href, DIRECTION, ORIGIN);
    if (href !== null) changes.push({ field: "assistant.href", id: e.id, before: e.href, after: href });
    const screens = rewriteScreens(e.screens, DIRECTION);
    if (screens !== null) changes.push({ field: "assistant.screens", id: e.id, before: e.screens, after: screens });
    const cited = DIRECTION === "forward" ? legacyMentions(e.answer) : [];
    if (cited.length) mentions.push({ id: e.id, paths: cited });
  }

  const messages = await prisma.systemMessage.findMany({ where: { linkUrl: { not: null } }, select: { id: true, linkUrl: true } });
  for (const m of messages) {
    const next = rewriteLink(m.linkUrl, DIRECTION, ORIGIN);
    if (next !== null) changes.push({ field: "systemMessage.linkUrl", id: m.id, before: m.linkUrl, after: next });
  }

  // Notifications : lecture par pages (table volumineuse), curseur sur l'identifiant.
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.notification.findMany({
      where: { link: { not: null } },
      select: { id: true, link: true },
      orderBy: { id: "asc" },
      take: 5000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;
    for (const n of page) {
      const next = rewriteLink(n.link, DIRECTION, ORIGIN);
      if (next !== null) changes.push({ field: "notification.link", id: n.id, before: n.link, after: next });
    }
    cursor = page[page.length - 1].id;
  }
  return { changes, mentions };
}

function fromBackup(file: string): Change[] {
  const data = JSON.parse(readFileSync(file, "utf8")) as { changes: Change[] };
  if (!Array.isArray(data.changes)) throw new Error(`Sauvegarde illisible : ${file}`);
  // Remettre la valeur d'avant.
  return data.changes.map((c) => ({ field: c.field, id: c.id, before: c.after, after: c.before }));
}

async function write(changes: readonly Change[]) {
  for (const batch of chunk(changes, BATCH)) {
    await prisma.$transaction(
      batch.map((c) => {
        switch (c.field) {
          case "assistant.href":
            return prisma.assistantEntry.update({ where: { id: c.id }, data: { href: c.after as string | null } });
          case "assistant.screens":
            return prisma.assistantEntry.update({ where: { id: c.id }, data: { screens: c.after as string[] } });
          case "systemMessage.linkUrl":
            return prisma.systemMessage.update({ where: { id: c.id }, data: { linkUrl: c.after as string | null } });
          case "notification.link":
            return prisma.notification.update({ where: { id: c.id }, data: { link: c.after as string | null } });
        }
      })
    );
    process.stdout.write(".");
  }
  process.stdout.write("\n");
}

async function main() {
  const mode = RESTORE ? `restauration de ${RESTORE}` : DIRECTION === "reverse" ? "retour aux anciennes adresses" : "nouvelles adresses";
  console.log(`Spec 092 — adresses mémorisées : ${mode}${APPLY ? "" : " (essai à blanc, rien n'est écrit)"}`);
  console.log(`Origine de l'application : ${ORIGIN ?? "(aucune : liens absolus ignorés)"}`);

  const { changes, mentions } = RESTORE ? { changes: fromBackup(RESTORE), mentions: [] } : await collect();
  const byField = new Map<Field, number>();
  for (const c of changes) byField.set(c.field, (byField.get(c.field) ?? 0) + 1);
  for (const field of ["assistant.href", "assistant.screens", "systemMessage.linkUrl", "notification.link"] as const) {
    console.log(`  ${field.padEnd(22)} ${byField.get(field) ?? 0}`);
  }
  for (const c of changes.slice(0, 10)) console.log(`    ${c.field} ${c.id} : ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`);
  if (changes.length > 10) console.log(`    … et ${changes.length - 10} autres`);
  if (mentions.length) {
    console.log(`Réponses de l'assistant qui citent une ancienne adresse (à relire à la main, non modifiées) : ${mentions.length}`);
    for (const m of mentions) console.log(`    ${m.id} : ${m.paths.join(", ")}`);
  }

  if (!APPLY) {
    console.log("Essai à blanc terminé. Relancer avec --apply pour écrire.");
    return;
  }
  if (changes.length === 0) {
    console.log("Rien à changer.");
    return;
  }
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(BACKUP_DIR, `092-stored-paths-${RESTORE ? "restore" : DIRECTION}-${stamp}.json`);
  writeFileSync(backup, JSON.stringify({ createdAt: new Date().toISOString(), mode, origin: ORIGIN, changes }, null, 2));
  console.log(`Sauvegarde : ${backup}`);
  await write(changes);
  console.log(`${changes.length} valeur(s) écrite(s). Retour arrière : --restore ${backup} --apply`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
