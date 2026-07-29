/**
 * Import des réservations futures depuis MRBS vers Koinonia.
 *
 * Comme les autres scripts de `prisma/scripts/`, s'exécute **uniquement en local**
 * (jamais sur le serveur) — se connecter aux deux bases de production via un tunnel
 * SSH, jamais en les exposant publiquement :
 *
 *   ssh -N -L 3307:127.0.0.1:3306 koinonia@<hote-koinonia>       # DATABASE_URL
 *   ssh -N -L 3308:127.0.0.1:3306 <utilisateur>@<hote-mrbs>      # MRBS_DATABASE_URL
 *
 * Usage :
 *   DATABASE_URL=mysql://koinonia:***@127.0.0.1:3307/koinonia \
 *   MRBS_DATABASE_URL=mariadb://mrbs:***@127.0.0.1:3308/mrbs \
 *   npx tsx prisma/scripts/import-mrbs-reservations.ts --dry-run
 *
 * - Ne lit que les réservations MRBS dont `end_time` est dans le futur.
 * - Salle MRBS → salle Koinonia : mapping manuel (voir ROOM_MAPPING ci-dessous).
 * - Créateur MRBS → utilisateur Koinonia : résolu via `mrbs_user_links`
 *   (déjà alimenté par /admin/mrbs-links). Les entrées sans lien sont
 *   importées sous FALLBACK_USER_EMAIL si renseigné (signalées à part dans
 *   le rapport, avec le nom MRBS d'origine conservé pour traçabilité) ;
 *   sinon elles sont ignorées.
 * - Idempotent : une réservation déjà présente (même salle + mêmes horaires)
 *   est ignorée, on peut relancer le script sans risque de doublon.
 * - --dry-run : affiche ce qui serait créé/ignoré sans toucher la BDD Koinonia.
 *
 * Recette : pour une répétition à blanc qui écrit réellement quelque part sans
 * toucher la prod, pointer DATABASE_URL sur la BDD de recette (koinonia_staging)
 * tout en gardant MRBS_DATABASE_URL sur la prod MRBS (lecture seule) — nécessite
 * d'adapter CHURCH_SLUG/ROOM_MAPPING aux données de la recette.
 *
 * Prérequis avant exécution : CHURCH_SLUG et ROOM_MAPPING complétés ci-dessous.
 */

import "dotenv/config";
import * as mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createReservation } from "../../src/modules/rooms";

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
const DRY_RUN = process.argv.includes("--dry-run");

// ─── À COMPLÉTER AVANT EXÉCUTION ────────────────────────────────────────────

const CHURCH_SLUG = "icc-rennes";

// Clé = room_name MRBS (mrbs_room.room_name), valeur = name Room Koinonia.
// Toute salle MRBS absente de ce mapping est ignorée (et listée dans le rapport).
const ROOM_MAPPING: Record<string, string> = {
  "Auditorium": "Auditorium",
  "Salle 01": "Bethleem",
  "Salle 02": "Nazareth",
  "Salle ado": "Béthanie",
  "Salle intégration": "Canaan"
};

// Email d'un compte Koinonia (ex. un Admin) sous lequel importer les réservations
// dont le créateur MRBS n'a pas de lien dans mrbs_user_links. Laisser vide pour
// ignorer ces réservations au lieu de les attribuer à ce compte.
const FALLBACK_USER_EMAIL: string | null = null; // ex: "admin@example.com"

// ─────────────────────────────────────────────────────────────────────────

interface MrbsEntry {
  id: number;
  start_time: number;
  end_time: number;
  room_name: string;
  create_by: string;
  name: string;
}

async function fetchFutureMrbsEntries(): Promise<MrbsEntry[]> {
  const url = process.env.MRBS_DATABASE_URL;
  if (!url) throw new Error("MRBS_DATABASE_URL manquant dans .env");

  const conn = await mariadb.createConnection(url);
  try {
    const rows = await conn.query(
      `SELECT e.id, e.start_time, e.end_time, e.create_by, e.name, r.room_name
       FROM mrbs_entry e
       JOIN mrbs_room r ON r.id = e.room_id
       WHERE e.end_time > UNIX_TIMESTAMP()
       ORDER BY e.start_time ASC`
    );
    return rows;
  } finally {
    await conn.end();
  }
}

async function main() {
  const church = await prisma.church.findFirst({ where: { slug: CHURCH_SLUG }, select: { id: true, name: true } });
  if (!church) throw new Error(`Église introuvable (slug: ${CHURCH_SLUG})`);
  console.log(`Église : ${church.name} (${church.id})`);

  const rooms = await prisma.room.findMany({ where: { churchId: church.id }, select: { id: true, name: true } });
  const roomIdByName = new Map(rooms.map((r) => [r.name, r.id]));

  const links = await prisma.mrbsUserLink.findMany({ where: { churchId: church.id }, select: { mrbsUsername: true, userId: true } });
  const userIdByMrbsName = new Map(links.map((l) => [l.mrbsUsername, l.userId]));

  let fallbackUserId: string | null = null;
  if (FALLBACK_USER_EMAIL) {
    const fallbackUser = await prisma.user.findUnique({ where: { email: FALLBACK_USER_EMAIL }, select: { id: true } });
    if (!fallbackUser) throw new Error(`FALLBACK_USER_EMAIL introuvable : ${FALLBACK_USER_EMAIL}`);
    fallbackUserId = fallbackUser.id;
  }

  const entries = await fetchFutureMrbsEntries();
  console.log(`Réservations MRBS futures : ${entries.length}\n`);

  const toImport: { entry: MrbsEntry; roomId: string; createdById: string; usedFallback: boolean }[] = [];
  const unmappedRoom: MrbsEntry[] = [];
  const unmappedUser: MrbsEntry[] = [];
  const fallbackUsed: MrbsEntry[] = [];

  for (const entry of entries) {
    const roomName = ROOM_MAPPING[entry.room_name];
    const roomId = roomName ? roomIdByName.get(roomName) : undefined;
    if (!roomId) { unmappedRoom.push(entry); continue; }

    const linkedUserId = userIdByMrbsName.get(entry.create_by);
    if (!linkedUserId && !fallbackUserId) { unmappedUser.push(entry); continue; }

    const usedFallback = !linkedUserId;
    if (usedFallback) fallbackUsed.push(entry);
    toImport.push({ entry, roomId, createdById: (linkedUserId ?? fallbackUserId)!, usedFallback });
  }

  if (unmappedRoom.length > 0) {
    console.log(`⚠ Salles non mappées (ignorées) : ${unmappedRoom.length}`);
    for (const e of [...new Map(unmappedRoom.map((e) => [e.room_name, e])).values()]) {
      console.log(`  - ${e.room_name}`);
    }
    console.log();
  }

  if (unmappedUser.length > 0) {
    console.log(`⚠ Créateurs MRBS sans lien Koinonia (ignorés, à lier via /admin/mrbs-links) : ${unmappedUser.length} réservation(s)`);
    for (const name of new Set(unmappedUser.map((e) => e.create_by))) {
      console.log(`  - ${name}`);
    }
    console.log();
  }

  if (fallbackUsed.length > 0) {
    console.log(`↪ Créateurs MRBS sans lien, importés sous ${FALLBACK_USER_EMAIL} : ${fallbackUsed.length} réservation(s)`);
    for (const name of new Set(fallbackUsed.map((e) => e.create_by))) {
      console.log(`  - ${name}`);
    }
    console.log();
  }

  console.log(`À importer : ${toImport.length}\n`);

  let created = 0, skippedExisting = 0, skippedConflict = 0;

  for (const { entry, roomId, createdById, usedFallback } of toImport) {
    const startAt = new Date(entry.start_time * 1000);
    const endAt = new Date(entry.end_time * 1000);
    const title = usedFallback ? `${entry.name || "(sans titre)"} (MRBS: ${entry.create_by})` : (entry.name || "(sans titre)");

    const already = await prisma.roomReservation.findFirst({
      where: { roomId, startAt, endAt, status: "CONFIRMED" },
      select: { id: true },
    });
    if (already) { skippedExisting++; continue; }

    if (DRY_RUN) {
      console.log(`[DRY-RUN] ${startAt.toISOString()} → ${endAt.toISOString()}  ${entry.room_name.padEnd(20)}  ${title}`);
      created++;
      continue;
    }

    const result = await createReservation({
      churchId: church.id,
      roomId,
      title,
      startAt,
      endAt,
      createdById,
    });

    if (result.reservations.length > 0) {
      console.log(`✓ ${startAt.toISOString()} → ${endAt.toISOString()}  ${entry.room_name.padEnd(20)}  ${title}`);
      created++;
    } else {
      console.log(`✗ Conflit ignoré : ${startAt.toISOString()} → ${endAt.toISOString()}  ${entry.room_name}  ${title}`);
      skippedConflict++;
    }
  }

  console.log(`\n${DRY_RUN ? "[DRY-RUN] " : ""}Terminé : ${created} créée(s), ${skippedExisting} déjà présente(s), ${skippedConflict} en conflit.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
