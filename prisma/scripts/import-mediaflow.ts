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
 * Le script est IDEMPOTENT : relancer sans risque (upsert / skipDuplicates).
 */

import "dotenv/config";
import * as mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../src/generated/prisma/client";

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) console.log("⚠️   MODE DRY-RUN — aucune écriture\n");

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

// ─── Types Mediaflow (schéma réel vérifié via DESCRIBE) ───────────────────────

interface MfChurch  { id: string; name: string }
interface MfUser    { id: string; email: string; name: string | null; image: string | null; role: string; createdAt: Date }
interface MfEvent   { id: string; name: string; date: Date; description: string | null; status: string; churchId: string; createdById: string; createdAt: Date; updatedAt: Date }
interface MfProject { id: string; name: string; description: string | null; churchId: string; createdById: string; createdAt: Date; updatedAt: Date }
interface MfPhoto   { id: string; filename: string; originalKey: string; thumbnailKey: string; mimeType: string; size: number; width: number | null; height: number | null; status: string; validatedAt: Date | null; validatedBy: string | null; eventId: string; uploadedAt: Date }
interface MfFile    { id: string; type: string; status: string; filename: string; mimeType: string; size: number; width: number | null; height: number | null; duration: number | null; eventId: string | null; projectId: string | null; createdAt: Date; updatedAt: Date }
interface MfVersion { id: string; versionNumber: number; originalKey: string; thumbnailKey: string; notes: string | null; mediaId: string; createdById: string; createdAt: Date }
interface MfComment { id: string; type: string; content: string; timecode: number | null; parentId: string | null; mediaId: string; authorId: string | null; authorName: string | null; authorImage: string | null; createdAt: Date; updatedAt: Date }
interface MfToken   { id: string; token: string; type: string; label: string | null; config: string | null; eventId: string | null; projectId: string | null; expiresAt: Date | null; lastUsedAt: Date | null; usageCount: number; createdAt: Date }
interface MfSettings { id: string; logoKey: string | null; faviconKey: string | null; logoFilename: string | null; faviconFilename: string | null; retentionDays: number; createdAt: Date }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function step(n: number, label: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Étape ${n} — ${label}`);
  console.log("─".repeat(60));
}
function ok(msg: string)   { console.log(`  ✓ ${msg}`); }
function warn(msg: string) { console.log(`  ⚠  ${msg}`); }
function info(msg: string) { console.log(`  · ${msg}`); }

// ─── Mappings de statuts ──────────────────────────────────────────────────────

function mapEventStatus(s: string) {
  if (s === "REVIEWED")  return "REVIEWED" as const;
  if (s === "ARCHIVED")  return "ARCHIVED" as const;
  if (s === "DRAFT")     return "DRAFT" as const;
  return "PENDING_REVIEW" as const;
}

function mapPhotoStatus(s: string) {
  const m: Record<string, "PENDING" | "APPROVED" | "REJECTED" | "PREVALIDATED" | "PREREJECTED"> = {
    APPROVED: "APPROVED", REJECTED: "REJECTED",
    PREVALIDATED: "PREVALIDATED", PREREJECTED: "PREREJECTED",
  };
  return m[s] ?? "PENDING";
}

function mapFileType(s: string) {
  if (s === "VISUAL") return "VISUAL" as const;
  if (s === "VIDEO")  return "VIDEO" as const;
  return "PHOTO" as const;
}

function mapFileStatus(s: string) {
  const m: Record<string, "PENDING" | "APPROVED" | "REJECTED" | "PREVALIDATED" | "PREREJECTED" | "DRAFT" | "IN_REVIEW" | "REVISION_REQUESTED" | "FINAL_APPROVED"> = {
    APPROVED: "APPROVED", REJECTED: "REJECTED",
    PREVALIDATED: "PREVALIDATED", PREREJECTED: "PREREJECTED",
    DRAFT: "DRAFT", IN_REVIEW: "IN_REVIEW",
    REVISION_REQUESTED: "REVISION_REQUESTED", FINAL_APPROVED: "FINAL_APPROVED",
  };
  return m[s] ?? "PENDING";
}

function mapTokenType(s: string) {
  const m: Record<string, "VALIDATOR" | "PREVALIDATOR" | "MEDIA" | "GALLERY"> = {
    VALIDATOR: "VALIDATOR", PREVALIDATOR: "PREVALIDATOR",
    MEDIA: "MEDIA", GALLERY: "GALLERY",
  };
  return m[s] ?? "VALIDATOR";
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
    // ── Étape 0 : Lecture des données source ─────────────────────────────────
    step(0, "Lecture Mediaflow");

    const mfChurches: MfChurch[]   = await mf.query("SELECT id, name FROM Church");
    const mfUsers: MfUser[]        = await mf.query("SELECT id, email, name, image, role, createdAt FROM User");
    const mfEvents: MfEvent[]      = await mf.query("SELECT id, name, date, description, status, churchId, createdById, createdAt, updatedAt FROM Event");
    const mfProjects: MfProject[]  = await mf.query("SELECT id, name, description, churchId, createdById, createdAt, updatedAt FROM Project");
    const mfPhotos: MfPhoto[]      = await mf.query("SELECT id, filename, originalKey, thumbnailKey, mimeType, size, width, height, status, validatedAt, validatedBy, eventId, uploadedAt FROM Photo");
    const mfFiles: MfFile[]        = await mf.query("SELECT id, type, status, filename, mimeType, size, width, height, duration, eventId, projectId, createdAt, updatedAt FROM Media");
    const mfVersions: MfVersion[]  = await mf.query("SELECT id, versionNumber, originalKey, thumbnailKey, notes, mediaId, createdById, createdAt FROM MediaVersion");
    const mfComments: MfComment[]  = await mf.query("SELECT id, type, content, timecode, parentId, mediaId, authorId, authorName, authorImage, createdAt, updatedAt FROM Comment");
    const mfTokens: MfToken[]      = await mf.query("SELECT id, token, type, label, config, eventId, projectId, expiresAt, lastUsedAt, usageCount, createdAt FROM ShareToken");
    const mfSettingsList: MfSettings[] = await mf.query("SELECT id, logoKey, faviconKey, logoFilename, faviconFilename, retentionDays, createdAt FROM AppSettings LIMIT 1");

    info(`${mfChurches.length} churches`);
    info(`${mfUsers.length} users`);
    info(`${mfEvents.length} événements, ${mfProjects.length} projets`);
    info(`${mfPhotos.length} photos`);
    info(`${mfFiles.length} fichiers Media, ${mfVersions.length} versions`);
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

    const unmappedChurches = mfChurches.filter((c) => !churchMap.has(c.id));
    if (unmappedChurches.length > 0) {
      warn(`${unmappedChurches.length} church(es) non mappée(s) — les données liées seront ignorées`);
    }

    // ── Étape 2 : Users ──────────────────────────────────────────────────────
    // Les users Mediaflow n'ont pas de churchId direct.
    // Cas A : email existant dans Koinonia → réutilise l'ID Platform
    // Cas B : email inconnu → crée avec l'ID Mediaflow (FK internes préservées)
    step(2, "Users");

    const userMap = new Map<string, string>(); // mf_id → koinonia_id

    const kUsers = await prisma.user.findMany({ select: { id: true, email: true } });
    const kEmailMap = new Map(kUsers.map((u) => [u.email.toLowerCase(), u.id]));

    const newUsers = [];
    for (const mfu of mfUsers) {
      const existing = kEmailMap.get(mfu.email.toLowerCase());
      if (existing) {
        userMap.set(mfu.id, existing);
      } else {
        userMap.set(mfu.id, mfu.id);
        newUsers.push(mfu);
      }
    }

    if (!DRY_RUN && newUsers.length > 0) {
      await prisma.user.createMany({
        data: newUsers.map((u) => ({
          id: u.id,
          email: u.email.toLowerCase(),
          name: u.name ?? null,
          image: u.image ?? null,
          createdAt: u.createdAt,
        })),
        skipDuplicates: true,
      });
    }

    ok(`Cas A (email existant) : ${mfUsers.length - newUsers.length}`);
    ok(`Cas B (nouvel user)    : ${newUsers.length}`);

    // Dériver la church principale de chaque user ADMIN depuis ses événements
    // (User n'a pas de churchId dans Mediaflow)
    const userPrimaryChurch = new Map<string, string>(); // mf_userId → mf_churchId
    for (const e of mfEvents) {
      if (!userPrimaryChurch.has(e.createdById)) {
        userPrimaryChurch.set(e.createdById, e.churchId);
      }
    }

    const adminUsers = mfUsers.filter((u) => u.role === "ADMIN");
    const roleRows = adminUsers
      .map((u) => {
        const mfChurchId = userPrimaryChurch.get(u.id);
        if (!mfChurchId || !churchMap.has(mfChurchId)) return null;
        return {
          id: `mf-import-${u.id}`,
          userId: userMap.get(u.id)!,
          churchId: churchMap.get(mfChurchId)!,
          role: "ADMIN" as const,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (!DRY_RUN && roleRows.length > 0) {
      await prisma.userChurchRole.createMany({ data: roleRows, skipDuplicates: true });
    }
    info(`Rôles ADMIN assignés : ${roleRows.length}`);

    // ── Étape 3 : MediaProjects (depuis Project Mediaflow) ───────────────────
    step(3, "MediaProjects");

    const projectMap = new Map<string, string>(); // mf_id → koinonia_id

    const superAdmin = await prisma.user.findFirst({ where: { isSuperAdmin: true }, select: { id: true } });
    const fallbackCreatorId = superAdmin?.id ?? userMap.values().next().value ?? "";

    const projectsToCreate = mfProjects
      .filter((p) => churchMap.has(p.churchId))
      .map((p) => {
        projectMap.set(p.id, p.id);
        return {
          id: p.id,
          name: p.name,
          description: p.description ?? null,
          churchId: churchMap.get(p.churchId)!,
          createdById: userMap.get(p.createdById) ?? fallbackCreatorId,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      });

    if (!DRY_RUN && projectsToCreate.length > 0) {
      await prisma.mediaProject.createMany({ data: projectsToCreate, skipDuplicates: true });
    }
    ok(`MediaProjects importés : ${projectsToCreate.length}`);

    // ── Étape 4 : MediaEvents ────────────────────────────────────────────────
    step(4, "MediaEvents");

    // Pré-charger les events planning pour la liaison heuristique (±2h)
    const planningEvents = await prisma.event.findMany({
      select: { id: true, date: true, churchId: true },
    });

    const eventMap = new Map<string, string>(); // mf_id → koinonia_id

    const eventsToCreate = mfEvents
      .filter((e) => churchMap.has(e.churchId))
      .map((e) => {
        const churchId = churchMap.get(e.churchId)!;
        const createdById = userMap.get(e.createdById) ?? fallbackCreatorId;

        // Heuristique : event planning le plus proche à ±2h dans la même église
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
          name: e.name,
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

    // ── Étape 5 : MediaPhotos ────────────────────────────────────────────────
    step(5, "MediaPhotos");

    const photosToCreate = mfPhotos
      .filter((p) => eventMap.has(p.eventId))
      .map((p) => ({
        id: p.id,
        filename: p.filename,
        originalKey: p.originalKey,
        thumbnailKey: p.thumbnailKey,
        mimeType: p.mimeType,
        size: p.size,
        width: p.width ?? null,
        height: p.height ?? null,
        status: mapPhotoStatus(p.status),
        validatedAt: p.validatedAt ?? null,
        validatedBy: p.validatedBy ?? null,
        mediaEventId: eventMap.get(p.eventId)!,
        uploadedAt: p.uploadedAt,
      }));

    if (!DRY_RUN && photosToCreate.length > 0) {
      for (let i = 0; i < photosToCreate.length; i += 500) {
        await prisma.mediaPhoto.createMany({ data: photosToCreate.slice(i, i + 500), skipDuplicates: true });
      }
    }
    ok(`MediaPhotos importées : ${photosToCreate.length}`);

    // ── Étape 6 : MediaFiles + MediaFileVersions ─────────────────────────────
    step(6, "MediaFiles + versions");

    const fileMap = new Map<string, string>(); // mf_id → koinonia_id

    // Un Media peut être lié à un Event ou à un Project
    const filesToCreate = mfFiles
      .filter((f) => (f.eventId && eventMap.has(f.eventId)) || (f.projectId && projectMap.has(f.projectId)))
      .map((f) => {
        fileMap.set(f.id, f.id);
        return {
          id: f.id,
          type: mapFileType(f.type),
          status: mapFileStatus(f.status),
          filename: f.filename,
          mimeType: f.mimeType,
          size: f.size,
          width: f.width ?? null,
          height: f.height ?? null,
          duration: f.duration ?? null,
          mediaEventId: (f.eventId && eventMap.get(f.eventId)) ?? null,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        };
      });

    const filesSkipped = mfFiles.length - filesToCreate.length;
    if (filesSkipped > 0) warn(`${filesSkipped} fichiers ignorés (event/project non mappé)`);

    if (!DRY_RUN && filesToCreate.length > 0) {
      await prisma.mediaFile.createMany({ data: filesToCreate, skipDuplicates: true });
    }
    ok(`MediaFiles importés : ${filesToCreate.length}`);

    const versionsToCreate = mfVersions
      .filter((v) => fileMap.has(v.mediaId))
      .map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        originalKey: v.originalKey,
        thumbnailKey: v.thumbnailKey,
        notes: v.notes ?? null,
        mediaFileId: fileMap.get(v.mediaId)!,
        createdById: userMap.get(v.createdById) ?? fallbackCreatorId,
        createdAt: v.createdAt,
      }));

    if (!DRY_RUN && versionsToCreate.length > 0) {
      await prisma.mediaFileVersion.createMany({ data: versionsToCreate, skipDuplicates: true });
    }
    ok(`MediaFileVersions importées : ${versionsToCreate.length}`);

    // ── Étape 7 : MediaComments ──────────────────────────────────────────────
    step(7, "MediaComments");

    const commentsToCreate = mfComments
      .filter((c) => fileMap.has(c.mediaId))
      .map((c) => ({
        id: c.id,
        type: (c.type === "TIMECODE" ? "TIMECODE" : "GENERAL") as "TIMECODE" | "GENERAL",
        content: c.content,
        authorName: c.authorName ?? null,
        authorImage: c.authorImage ?? null,
        timecode: c.timecode ?? null,
        parentId: c.parentId ?? null,
        mediaFileId: fileMap.get(c.mediaId)!,
        authorId: (c.authorId && userMap.get(c.authorId)) ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));

    if (!DRY_RUN && commentsToCreate.length > 0) {
      await prisma.mediaComment.createMany({ data: commentsToCreate, skipDuplicates: true });
    }
    ok(`MediaComments importés : ${commentsToCreate.length}`);

    // ── Étape 8 : MediaShareTokens (CRITIQUE — tokens préservés) ─────────────
    step(8, "MediaShareTokens ← CRITIQUE");

    const tokensToCreate = mfTokens
      .filter((t) =>
        (t.eventId && eventMap.has(t.eventId)) ||
        (t.projectId && projectMap.has(t.projectId))
      )
      .map((t) => ({
        id: t.id,
        token: t.token,   // valeur préservée exactement
        type: mapTokenType(t.type),
        label: t.label ?? null,
        config: t.config ? JSON.parse(t.config) : null,
        mediaEventId: (t.eventId && eventMap.get(t.eventId)) ?? null,
        expiresAt: t.expiresAt ?? null,
        lastUsedAt: t.lastUsedAt ?? null,
        usageCount: t.usageCount ?? 0,
        createdAt: t.createdAt,
      }));

    const tokensSkipped = mfTokens.length - tokensToCreate.length;
    if (tokensSkipped > 0) warn(`${tokensSkipped} tokens ignorés (event/project non mappé)`);

    if (!DRY_RUN && tokensToCreate.length > 0) {
      await prisma.mediaShareToken.createMany({ data: tokensToCreate, skipDuplicates: true });
    }
    ok(`MediaShareTokens importés : ${tokensToCreate.length} — tokens préservés`);

    // ── Étape 9 : MediaSettings ──────────────────────────────────────────────
    step(9, "MediaSettings");

    const mfSettings = mfSettingsList[0] ?? null;
    if (mfSettings && !DRY_RUN) {
      const existing = await prisma.mediaSettings.findUnique({ where: { id: "default" } });
      if (!existing) {
        await prisma.mediaSettings.create({
          data: {
            id: "default",
            logoKey: mfSettings.logoKey,
            faviconKey: mfSettings.faviconKey,
            logoFilename: mfSettings.logoFilename,
            faviconFilename: mfSettings.faviconFilename,
            retentionDays: mfSettings.retentionDays,
            createdAt: mfSettings.createdAt,
          },
        });
        ok("MediaSettings créé");
      } else {
        // Ne remplace que les champs null
        const patch: Record<string, unknown> = {};
        if (!existing.logoKey && mfSettings.logoKey)                 patch.logoKey = mfSettings.logoKey;
        if (!existing.faviconKey && mfSettings.faviconKey)           patch.faviconKey = mfSettings.faviconKey;
        if (!existing.logoFilename && mfSettings.logoFilename)       patch.logoFilename = mfSettings.logoFilename;
        if (!existing.faviconFilename && mfSettings.faviconFilename) patch.faviconFilename = mfSettings.faviconFilename;
        if (Object.keys(patch).length > 0) {
          await prisma.mediaSettings.update({ where: { id: "default" }, data: patch });
          ok(`MediaSettings patché : ${Object.keys(patch).join(", ")}`);
        } else {
          ok("MediaSettings déjà configuré — aucune modification");
        }
      }
    } else {
      info(mfSettings ? "dry-run : MediaSettings ignoré" : "Aucun settings dans Mediaflow");
    }

    // ── Étape 10 : Invariants post-import ────────────────────────────────────
    step(10, "Vérification des invariants");

    if (!DRY_RUN) {
      let allOk = true;

      const check = (label: string, violations: number) => {
        const pass = violations === 0;
        if (!pass) allOk = false;
        console.log(`  ${pass ? "✓" : "✗"} ${label} : ${pass ? "OK" : `${violations} violation(s)`}`);
      };

      const q = async (sql: string) => {
        const [r] = await prisma.$queryRawUnsafe<[{ c: bigint }]>(sql);
        return Number(r.c);
      };

      check("I1: media_events.churchId valides",
        await q("SELECT COUNT(*) as c FROM media_events me LEFT JOIN churches c ON c.id = me.churchId WHERE c.id IS NULL"));
      check("I2: media_events.createdById valides",
        await q("SELECT COUNT(*) as c FROM media_events me LEFT JOIN users u ON u.id = me.createdById WHERE u.id IS NULL"));
      check("I3: media_photos sans media_event",
        await q("SELECT COUNT(*) as c FROM media_photos mp LEFT JOIN media_events me ON me.id = mp.mediaEventId WHERE me.id IS NULL"));
      check("I4: media_file_versions sans media_file",
        await q("SELECT COUNT(*) as c FROM media_file_versions mfv LEFT JOIN media_files mf ON mf.id = mfv.mediaFileId WHERE mf.id IS NULL"));
      check("I5: media_share_tokens orphelins",
        await q("SELECT COUNT(*) as c FROM media_share_tokens mst WHERE mst.mediaEventId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM media_events me WHERE me.id = mst.mediaEventId)"));
      check("I6: tokens uniques",
        await q("SELECT COUNT(*) as c FROM (SELECT token FROM media_share_tokens GROUP BY token HAVING COUNT(*) > 1) t"));

      console.log("\n" + (allOk ? "✅  Tous les invariants sont OK" : "❌  Des invariants ont échoué"));

      // Résumé des comptages
      console.log("\n── Résumé ────────────────────────────────────────────");
      console.log(`  media_projects      : ${await prisma.mediaProject.count()}`);
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

main().catch((err) => {
  console.error("\n❌ ", err.message ?? err);
  process.exit(1);
});
