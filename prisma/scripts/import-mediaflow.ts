/**
 * Script d'import Mediaflow → ICC Platform
 *
 * Usage :
 *   MEDIAFLOW_DB_URL="mysql://user:pass@host:3306/mediaflow" \
 *   npx tsx prisma/scripts/import-mediaflow.ts [--dry-run]
 *
 * Options :
 *   --dry-run   Affiche ce qui serait importé sans rien écrire
 *
 * Prérequis :
 *   - DATABASE_URL dans .env (BDD Koinonia cible)
 *   - MEDIAFLOW_DB_URL en variable d'environnement (BDD Mediaflow source)
 *   - Les deux peuvent être sur des serveurs différents
 *
 * Le script est IDEMPOTENT : relancer sans risque (upsert / skipDuplicates).
 */

import "dotenv/config";
import * as mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../src/generated/prisma/client";

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) console.log("⚠️  MODE DRY-RUN — aucune écriture\n");

// ─── Clients BDD ─────────────────────────────────────────────────────────────

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
});

function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306"),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    bigIntAsNumber: true,
  };
}

// ─── Types Mediaflow (adaptés au schéma réel) ─────────────────────────────────

interface MfChurch   { id: string; name: string }
interface MfUser     { id: string; email: string; name: string; image: string | null; role: string; churchId: string; createdAt: Date }
interface MfEvent    { id: string; title: string; date: Date; description: string | null; status: string; churchId: string; createdById: string | null; createdAt: Date; updatedAt: Date }
interface MfPhoto    { id: string; s3Key: string; thumbnailKey: string | null; filename: string | null; mimeType: string | null; size: number | null; width: number | null; height: number | null; status: string; validatedAt: Date | null; validatedBy: string | null; uploadedAt: Date | null; createdAt: Date; eventId: string }
interface MfFile     { id: string; type: string; status: string; filename: string; mimeType: string | null; size: number | null; width: number | null; height: number | null; duration: number | null; eventId: string; createdAt: Date; updatedAt: Date }
interface MfVersion  { id: string; versionNumber: number; s3Key: string; thumbnailKey: string | null; notes: string | null; fileId: string; createdById: string | null; createdAt: Date }
interface MfComment  { id: string; type: string; content: string; authorName: string | null; authorImage: string | null; timecode: number | null; parentId: string | null; fileId: string; authorId: string | null; createdAt: Date; updatedAt: Date }
interface MfToken    { id: string; token: string; type: string; label: string | null; config: string | null; eventId: string; expiresAt: Date | null; lastUsedAt: Date | null; usageCount: number; createdAt: Date }
interface MfSettings { logoKey: string | null; faviconKey: string | null; logoFilename: string | null; faviconFilename: string | null; retentionDays: number | null; createdAt: Date }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function step(n: number, label: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Étape ${n} — ${label}`);
  console.log("─".repeat(60));
}

function ok(msg: string) { console.log(`  ✓ ${msg}`); }
function warn(msg: string) { console.log(`  ⚠  ${msg}`); }
function info(msg: string) { console.log(`  · ${msg}`); }

// ─── Mappings de statuts ──────────────────────────────────────────────────────

function mapEventStatus(s: string) {
  if (s === "REVIEWED" || s === "DONE") return "REVIEWED" as const;
  if (s === "ARCHIVED") return "ARCHIVED" as const;
  if (s === "DRAFT") return "DRAFT" as const;
  return "PENDING_REVIEW" as const;
}

function mapPhotoStatus(s: string) {
  if (s === "APPROVED")     return "APPROVED" as const;
  if (s === "REJECTED")     return "REJECTED" as const;
  if (s === "PREVALIDATED") return "PREVALIDATED" as const;
  if (s === "PREREJECTED")  return "PREREJECTED" as const;
  return "PENDING" as const;
}

function mapFileType(s: string) {
  if (s === "VISUAL") return "VISUAL" as const;
  if (s === "VIDEO")  return "VIDEO" as const;
  return "PHOTO" as const;
}

function mapFileStatus(s: string) {
  const map: Record<string, "PENDING" | "APPROVED" | "REJECTED" | "PREVALIDATED" | "PREREJECTED" | "DRAFT" | "IN_REVIEW" | "REVISION_REQUESTED" | "FINAL_APPROVED"> = {
    APPROVED: "APPROVED", REJECTED: "REJECTED",
    PREVALIDATED: "PREVALIDATED", PREREJECTED: "PREREJECTED",
    DRAFT: "DRAFT", IN_REVIEW: "IN_REVIEW",
    REVISION_REQUESTED: "REVISION_REQUESTED", FINAL_APPROVED: "FINAL_APPROVED",
  };
  return map[s] ?? "PENDING";
}

function mapTokenType(s: string) {
  const map: Record<string, "VALIDATOR" | "PREVALIDATOR" | "MEDIA" | "GALLERY"> = {
    VALIDATOR: "VALIDATOR", PREVALIDATOR: "PREVALIDATOR",
    MEDIA: "MEDIA", GALLERY: "GALLERY",
  };
  return map[s] ?? "VALIDATOR";
}

// ─── Script principal ─────────────────────────────────────────────────────────

async function main() {
  const mfUrl = process.env.MEDIAFLOW_DB_URL;
  if (!mfUrl) {
    console.error("❌  MEDIAFLOW_DB_URL est requis");
    process.exit(1);
  }

  console.log("Connexion à Mediaflow…");
  const mf = await mariadb.createConnection(parseDbUrl(mfUrl));
  console.log("✓ Connecté à Mediaflow");

  try {
    // ── Étape 0 : Pré-validation ─────────────────────────────────────────────
    step(0, "Pré-validation");

    const mfChurches: MfChurch[] = await mf.query("SELECT id, name FROM church");
    const mfUsers: MfUser[]      = await mf.query("SELECT id, email, name, image, role, churchId, createdAt FROM `user`");
    const mfEvents: MfEvent[]    = await mf.query("SELECT id, title, date, description, status, churchId, createdById, createdAt, updatedAt FROM event");
    const mfPhotos: MfPhoto[]    = await mf.query("SELECT id, s3Key, thumbnailKey, filename, mimeType, size, width, height, status, validatedAt, validatedBy, uploadedAt, createdAt, eventId FROM photo");
    const mfFiles: MfFile[]      = await mf.query("SELECT id, type, status, filename, mimeType, size, width, height, duration, eventId, createdAt, updatedAt FROM media_file");
    const mfVersions: MfVersion[] = await mf.query("SELECT id, versionNumber, s3Key, thumbnailKey, notes, fileId, createdById, createdAt FROM media_file_version");
    const mfComments: MfComment[] = await mf.query("SELECT id, type, content, authorName, authorImage, timecode, parentId, fileId, authorId, createdAt, updatedAt FROM comment");
    const mfTokens: MfToken[]    = await mf.query("SELECT id, token, type, label, config, eventId, expiresAt, lastUsedAt, usageCount, createdAt FROM share_token");
    const mfSettingsList: MfSettings[] = await mf.query("SELECT logoKey, faviconKey, logoFilename, faviconFilename, retentionDays, createdAt FROM settings LIMIT 1");

    info(`${mfChurches.length} churches`);
    info(`${mfUsers.length} users`);
    info(`${mfEvents.length} événements`);
    info(`${mfPhotos.length} photos`);
    info(`${mfFiles.length} fichiers, ${mfVersions.length} versions`);
    info(`${mfComments.length} commentaires`);
    info(`${mfTokens.length} share tokens`);

    // ── Étape 1 : Mapping churches ───────────────────────────────────────────
    step(1, "Mapping des churches");

    const kChurches = await prisma.church.findMany({ select: { id: true, name: true } });

    const churchMap = new Map<string, string>(); // mf_id → koinonia_id
    for (const mfc of mfChurches) {
      const match = kChurches.find(
        (kc) => kc.name.trim().toLowerCase() === mfc.name.trim().toLowerCase()
      );
      if (match) {
        churchMap.set(mfc.id, match.id);
        ok(`"${mfc.name}" → ${match.id}`);
      } else {
        warn(`"${mfc.name}" non trouvée dans Koinonia — sera ignorée`);
      }
    }

    const unmapped = mfChurches.filter((c) => !churchMap.has(c.id));
    if (unmapped.length > 0) {
      warn(`${unmapped.length} church(es) non mappée(s). Vérifier les noms.`);
    }

    // ── Étape 2 : Déduplication et import des users ──────────────────────────
    step(2, "Users");

    const userMap = new Map<string, string>(); // mf_id → koinonia_id

    // Cas A : email existant dans Koinonia
    const kUsers = await prisma.user.findMany({ select: { id: true, email: true } });
    const kEmailMap = new Map(kUsers.map((u) => [u.email.toLowerCase(), u.id]));

    let caseA = 0, caseB = 0;
    for (const mfu of mfUsers) {
      const existing = kEmailMap.get(mfu.email.toLowerCase());
      if (existing) {
        userMap.set(mfu.id, existing);
        caseA++;
      }
    }

    // Cas B : users inconnus → créer avec l'ID Mediaflow
    const newUsers = mfUsers.filter((u) => !userMap.has(u.id));
    if (!DRY_RUN && newUsers.length > 0) {
      await prisma.user.createMany({
        data: newUsers.map((u) => ({
          id: u.id,
          email: u.email.toLowerCase(),
          name: u.name,
          image: u.image ?? null,
          createdAt: u.createdAt,
        })),
        skipDuplicates: true,
      });
    }
    for (const u of newUsers) {
      userMap.set(u.id, u.id); // même ID
      caseB++;
    }

    ok(`Cas A (email existant) : ${caseA}`);
    ok(`Cas B (nouvel user)    : ${caseB}`);

    // Attribution du rôle ADMIN dans leur church d'origine
    // Adapter le filtre "mfu.role === 'ADMIN'" selon l'enum réel de Mediaflow
    const adminUsers = mfUsers.filter((u) => u.role === "ADMIN" && churchMap.has(u.churchId));
    if (!DRY_RUN && adminUsers.length > 0) {
      const superAdmin = await prisma.user.findFirst({ where: { isSuperAdmin: true }, select: { id: true } });
      const fallbackId = superAdmin?.id ?? "";

      await prisma.userChurchRole.createMany({
        data: adminUsers.map((u) => ({
          id: `mf-import-${u.id}`,
          userId: userMap.get(u.id) ?? fallbackId,
          churchId: churchMap.get(u.churchId)!,
          role: "ADMIN" as const,
        })),
        skipDuplicates: true,
      });
    }
    info(`Rôles ADMIN assignés : ${adminUsers.length}`);

    // ── Étape 3 : MediaEvents ────────────────────────────────────────────────
    step(3, "MediaEvents");

    // Pré-charger les events planning pour la liaison heuristique
    const planningEvents = await prisma.event.findMany({
      select: { id: true, date: true, churchId: true },
    });

    const eventMap = new Map<string, string>(); // mf_id → koinonia_id (IDs identiques ici)

    const superAdmin = await prisma.user.findFirst({ where: { isSuperAdmin: true }, select: { id: true } });
    const fallbackCreatorId = superAdmin?.id ?? "";

    const eventsToCreate = mfEvents
      .filter((e) => churchMap.has(e.churchId))
      .map((e) => {
        const churchId = churchMap.get(e.churchId)!;
        const createdById = (e.createdById && userMap.get(e.createdById)) ?? fallbackCreatorId;

        // Heuristique : événement planning le plus proche à ±2h dans la même église
        let planningEventId: string | null = null;
        let minDiff = Infinity;
        for (const pe of planningEvents) {
          if (pe.churchId !== churchId) continue;
          const diff = Math.abs(pe.date.getTime() - e.date.getTime());
          if (diff < minDiff && diff <= 2 * 60 * 60 * 1000) {
            minDiff = diff;
            planningEventId = pe.id;
          }
        }

        eventMap.set(e.id, e.id);
        return {
          id: e.id,
          name: e.title,
          date: e.date,
          description: e.description ?? null,
          status: mapEventStatus(e.status),
          planningEventId,
          churchId,
          createdById,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        };
      });

    const linked = eventsToCreate.filter((e) => e.planningEventId !== null).length;
    info(`${eventsToCreate.length} à importer, ${linked} liés à un événement planning`);

    if (!DRY_RUN && eventsToCreate.length > 0) {
      await prisma.mediaEvent.createMany({ data: eventsToCreate, skipDuplicates: true });
    }
    ok(`MediaEvents importés : ${eventsToCreate.length}`);

    // ── Étape 4 : MediaPhotos ────────────────────────────────────────────────
    step(4, "MediaPhotos");

    const photosToCreate = mfPhotos
      .filter((p) => eventMap.has(p.eventId))
      .map((p) => ({
        id: p.id,
        filename: p.filename ?? p.s3Key.split("/").pop() ?? "photo",
        originalKey: p.s3Key,
        thumbnailKey: p.thumbnailKey ?? p.s3Key,
        mimeType: p.mimeType ?? "image/jpeg",
        size: p.size ?? 0,
        width: p.width ?? null,
        height: p.height ?? null,
        status: mapPhotoStatus(p.status),
        validatedAt: p.validatedAt ?? null,
        validatedBy: p.validatedBy ?? null,
        mediaEventId: eventMap.get(p.eventId)!,
        uploadedAt: p.uploadedAt ?? p.createdAt,
      }));

    if (!DRY_RUN && photosToCreate.length > 0) {
      // Par batch de 500 pour éviter les timeouts
      for (let i = 0; i < photosToCreate.length; i += 500) {
        await prisma.mediaPhoto.createMany({ data: photosToCreate.slice(i, i + 500), skipDuplicates: true });
      }
    }
    ok(`MediaPhotos importées : ${photosToCreate.length}`);

    // ── Étape 5 : MediaFiles + MediaFileVersions ─────────────────────────────
    step(5, "MediaFiles + versions");

    const fileMap = new Map<string, string>(); // mf_id → koinonia_id

    const filesToCreate = mfFiles
      .filter((f) => eventMap.has(f.eventId))
      .map((f) => {
        fileMap.set(f.id, f.id);
        return {
          id: f.id,
          type: mapFileType(f.type),
          status: mapFileStatus(f.status),
          filename: f.filename,
          mimeType: f.mimeType ?? "application/octet-stream",
          size: f.size ?? 0,
          width: f.width ?? null,
          height: f.height ?? null,
          duration: f.duration ?? null,
          mediaEventId: eventMap.get(f.eventId)!,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        };
      });

    if (!DRY_RUN && filesToCreate.length > 0) {
      await prisma.mediaFile.createMany({ data: filesToCreate, skipDuplicates: true });
    }
    ok(`MediaFiles importés : ${filesToCreate.length}`);

    const versionsToCreate = mfVersions
      .filter((v) => fileMap.has(v.fileId))
      .map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        originalKey: v.s3Key,
        thumbnailKey: v.thumbnailKey ?? v.s3Key,
        notes: v.notes ?? null,
        mediaFileId: fileMap.get(v.fileId)!,
        createdById: (v.createdById && userMap.get(v.createdById)) ?? fallbackCreatorId,
        createdAt: v.createdAt,
      }));

    if (!DRY_RUN && versionsToCreate.length > 0) {
      await prisma.mediaFileVersion.createMany({ data: versionsToCreate, skipDuplicates: true });
    }
    ok(`MediaFileVersions importées : ${versionsToCreate.length}`);

    // ── Étape 6 : MediaComments ──────────────────────────────────────────────
    step(6, "MediaComments");

    const commentsToCreate = mfComments
      .filter((c) => fileMap.has(c.fileId))
      .map((c) => ({
        id: c.id,
        type: (c.type === "TIMECODE" ? "TIMECODE" : "GENERAL") as "TIMECODE" | "GENERAL",
        content: c.content,
        authorName: c.authorName ?? null,
        authorImage: c.authorImage ?? null,
        timecode: c.timecode ?? null,
        parentId: c.parentId ?? null,
        mediaFileId: fileMap.get(c.fileId)!,
        authorId: (c.authorId && userMap.get(c.authorId)) ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));

    if (!DRY_RUN && commentsToCreate.length > 0) {
      await prisma.mediaComment.createMany({ data: commentsToCreate, skipDuplicates: true });
    }
    ok(`MediaComments importés : ${commentsToCreate.length}`);

    // ── Étape 7 : MediaShareTokens (CRITIQUE — tokens préservés) ─────────────
    step(7, "MediaShareTokens ← CRITIQUE");

    const tokensToCreate = mfTokens
      .filter((t) => eventMap.has(t.eventId))
      .map((t) => ({
        id: t.id,
        token: t.token,          // valeur préservée exactement
        type: mapTokenType(t.type),
        label: t.label ?? null,
        config: t.config ? JSON.parse(t.config) : null,
        mediaEventId: eventMap.get(t.eventId)!,
        expiresAt: t.expiresAt ?? null,
        lastUsedAt: t.lastUsedAt ?? null,
        usageCount: t.usageCount ?? 0,
        createdAt: t.createdAt,
      }));

    if (!DRY_RUN && tokensToCreate.length > 0) {
      await prisma.mediaShareToken.createMany({ data: tokensToCreate, skipDuplicates: true });
    }
    ok(`MediaShareTokens importés : ${tokensToCreate.length} — tous tokens préservés`);

    // ── Étape 8 : MediaSettings ──────────────────────────────────────────────
    step(8, "MediaSettings");

    const mfSettings = mfSettingsList[0] ?? null;
    if (mfSettings && !DRY_RUN) {
      await prisma.mediaSettings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          logoKey: mfSettings.logoKey,
          faviconKey: mfSettings.faviconKey,
          logoFilename: mfSettings.logoFilename,
          faviconFilename: mfSettings.faviconFilename,
          retentionDays: mfSettings.retentionDays ?? 30,
          createdAt: mfSettings.createdAt,
        },
        update: {
          // Ne remplace que les champs null dans Koinonia
          logoKey: { set: undefined },       // mis à jour manuellement ci-dessous
          faviconKey: { set: undefined },
        },
      }).then(async (existing) => {
        // Remplir uniquement les champs null
        const patch: Record<string, unknown> = {};
        if (!existing.logoKey && mfSettings.logoKey)             patch.logoKey = mfSettings.logoKey;
        if (!existing.faviconKey && mfSettings.faviconKey)       patch.faviconKey = mfSettings.faviconKey;
        if (!existing.logoFilename && mfSettings.logoFilename)   patch.logoFilename = mfSettings.logoFilename;
        if (!existing.faviconFilename && mfSettings.faviconFilename) patch.faviconFilename = mfSettings.faviconFilename;
        if (Object.keys(patch).length > 0) {
          await prisma.mediaSettings.update({ where: { id: "default" }, data: patch });
        }
      });
      ok("MediaSettings upserted");
    } else {
      info(mfSettings ? "dry-run : MediaSettings ignoré" : "Aucun settings dans Mediaflow");
    }

    // ── Étape 9 : Invariants post-import ────────────────────────────────────
    step(9, "Vérification des invariants");

    if (!DRY_RUN) {
      let allOk = true;

      // I1 : Aucun media_event sans church valide
      const [i1r] = await prisma.$queryRaw<[{ c: number }]>`
        SELECT COUNT(*) as c FROM media_events me
        LEFT JOIN churches c ON c.id = me.churchId WHERE c.id IS NULL
      `;
      report("I1: media_events.churchId valides", Number(i1r.c), allOk = allOk && Number(i1r.c) === 0);

      const [i2r] = await prisma.$queryRaw<[{ c: number }]>`
        SELECT COUNT(*) as c FROM media_events me
        LEFT JOIN users u ON u.id = me.createdById WHERE u.id IS NULL
      `;
      report("I2: media_events.createdById valides", Number(i2r.c), allOk = allOk && Number(i2r.c) === 0);

      const [i3r] = await prisma.$queryRaw<[{ c: number }]>`
        SELECT COUNT(*) as c FROM media_photos mp
        LEFT JOIN media_events me ON me.id = mp.mediaEventId WHERE me.id IS NULL
      `;
      report("I3: media_photos sans orphelin", Number(i3r.c), allOk = allOk && Number(i3r.c) === 0);

      const [i4r] = await prisma.$queryRaw<[{ c: number }]>`
        SELECT COUNT(*) as c FROM media_file_versions mfv
        LEFT JOIN media_files mf ON mf.id = mfv.mediaFileId WHERE mf.id IS NULL
      `;
      report("I4: media_file_versions sans orphelin", Number(i4r.c), allOk = allOk && Number(i4r.c) === 0);

      const [i5r] = await prisma.$queryRaw<[{ c: number }]>`
        SELECT COUNT(*) as c FROM media_share_tokens mst
        LEFT JOIN media_events me ON me.id = mst.mediaEventId WHERE me.id IS NULL
      `;
      report("I5: media_share_tokens sans orphelin", Number(i5r.c), allOk = allOk && Number(i5r.c) === 0);

      const i6r = await prisma.$queryRaw<{ token: string; cnt: number }[]>`
        SELECT token, COUNT(*) as cnt FROM media_share_tokens
        GROUP BY token HAVING cnt > 1
      `;
      const dupTokens = i6r.length;
      report("I6: tokens uniques", dupTokens, allOk = allOk && dupTokens === 0);

      console.log("\n" + (allOk ? "✅  Tous les invariants sont OK" : "❌  Des invariants ont échoué — vérifier avant de continuer"));

      // Comptages finaux
      console.log("\n── Résumé ────────────────────────────────────────────");
      console.log(`  media_events        : ${await prisma.mediaEvent.count()}`);
      console.log(`  media_photos        : ${await prisma.mediaPhoto.count()}`);
      console.log(`  media_files         : ${await prisma.mediaFile.count()}`);
      console.log(`  media_file_versions : ${await prisma.mediaFileVersion.count()}`);
      console.log(`  media_share_tokens  : ${await prisma.mediaShareToken.count()}`);
      console.log(`  media_comments      : ${await prisma.mediaComment.count()}`);
    } else {
      console.log("  (dry-run : invariants non vérifiés)");
    }

    console.log("\n✅  Import terminé" + (DRY_RUN ? " (dry-run)" : ""));

  } finally {
    await mf.end();
    await prisma.$disconnect();
  }
}

function report(label: string, violations: number, passing: boolean) {
  const icon = passing ? "✓" : "✗";
  console.log(`  ${icon} ${label} : ${violations === 0 ? "OK" : `${violations} violation(s)`}`);
}

main().catch((err) => {
  console.error("\n❌ ", err.message ?? err);
  process.exit(1);
});
