/**
 * Migration des cultes Audiobookshelf → module audio Koinonia.
 *
 * Opération ponctuelle (recette puis prod). Voir `specs/022-migration-audiobookshelf/`.
 *
 *   tsx prisma/scripts/migrate-audiobookshelf/index.ts --root <dir> [options]
 *
 * Options :
 *   --root <dir>        racine contenant `cultes/` et `predications/` (obligatoire)
 *   --dry-run           construit le manifeste + rapport, n'écrit rien
 *   --only <dossier>    limite l'import à ce dossier de culte (répétable)
 *   --limit <n>         limite l'import aux n premiers cultes non traités
 *   --purge <dossier>   supprime un culte importé non publié et le retire du ledger
 *
 * Contexte d'exécution : ce script ne fait PAS partie de l'artefact de déploiement
 * (`.next/standalone` — le tar de `deploy*.yml` exclut `prisma/scripts`, `tsx` et `src/`).
 * Il se lance depuis un checkout complet du dépôt (`npm ci`, `tsx`), voir `README.md`.
 *
 * Pré-requis : `ffprobe` accessible (ou `FFPROBE_PATH`), variables `DATABASE_URL` et
 * `MEDIA_S3_*` renseignées (`DOTENV_CONFIG_PATH=/opt/koinonia/shared/.env` pour pointer
 * l'env de la cible), worker audio actif sur la cible pour consommer les jobs RENDER.
 */

import "dotenv/config";
import { readFile } from "fs/promises";
import path from "path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createAudioService,
  applySequences,
  publishAudioService,
  unpublishAudioService,
  deleteAudioService,
  getAudioSourceKey,
} from "@/modules/audio";
import { ApiError } from "@/lib/errors";
import { scanRoot } from "./scan";
import { buildManifest } from "./parse";
import { assertValidManifest } from "./manifest";
import { assertFfprobe, probeDurationMs } from "./probe";
import { putObjectWithEtag } from "./s3";
import { readLedger, appendLedger, removeFromLedger, latestEntryByFolder } from "./ledger";
import { classifyFolders } from "./resolution";
import type { Manifest, ManifestCulte } from "./types";

const CHURCH_SLUG = "icc-rennes";
const CHURCH_NAME = "ICC Rennes";
const PUBLISHER_EMAIL = "ouattara.ismael@gmail.com";

interface Args {
  root: string | null;
  dryRun: boolean;
  only: string[];
  limit: number | null;
  purge: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { root: null, dryRun: false, only: [], limit: null, purge: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--root") args.root = argv[++i] ?? null;
    else if (a === "--only") args.only.push(argv[++i] ?? "");
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--purge") args.purge = argv[++i] ?? null;
    else throw new Error(`Option inconnue : ${a}`);
  }
  return args;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Kio`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mio`;
}

function printReport(manifest: Manifest): void {
  const { cultes, report } = manifest;
  const seqCount = cultes.reduce((s, c) => s + c.sequences.length, 0);
  console.log(`\n=== Manifeste ===`);
  console.log(`Cultes détectés : ${cultes.length}`);
  console.log(`Séquences totales : ${seqCount}`);
  console.log(`Substitutions prédication : ${report.substitutions.length}`);
  console.log(`Cultes sans prédication : ${report.cultesWithoutPredication.length}`);

  const lines: [string, string[]][] = [
    ["Dossiers non reconnus", report.unrecognizedFolders],
    ["Fichiers exclus (MLA…)", report.excludedFiles.map((e) => `${e.folder} / ${e.name}`)],
    ["Titres non canoniques (gardés tels quels)", report.nonCanonicalTitles.map((e) => `${e.folder} : « ${e.raw} »`)],
    ["Collisions de titre (dédupliquées)", report.collisions.map((e) => `${e.folder} : « ${e.title} »`)],
    ["Cultes sans séquence prédication", report.cultesWithoutPredication],
    ["Prédication appariée mais inutilisée", report.matchedPredicationUnused.map((e) => `${e.folder} → ${e.predication}`)],
  ];
  for (const [label, items] of lines) {
    if (items.length === 0) continue;
    console.log(`\n-- ${label} (${items.length}) --`);
    for (const it of items) console.log(`   ${it}`);
  }

  console.log(`\n-- Détail des cultes --`);
  for (const c of cultes) {
    const speaker = c.speaker ? ` — ${c.speaker}` : "";
    console.log(`\n[${c.date}] ${c.title}${speaker}  (${c.folder}, ${c.type})`);
    console.log(`   ${new Date(c.serviceDateUtc).toISOString()}`);
    if (c.series) console.log(`   Série : ${c.series}`);
    for (const s of c.sequences) {
      const tag = s.fromPredicationsLibrary ? " [predications]" : s.isPredication ? " [prédication]" : "";
      console.log(`   ${s.order}. ${s.title}${tag}  (${formatBytes(s.sizeBytes)})`);
    }
  }
}

async function importCulte(
  prisma: PrismaClient,
  churchId: string,
  publishedById: string,
  culte: ManifestCulte
): Promise<void> {
  const service = await createAudioService(
    {
      churchId,
      serviceDate: new Date(culte.serviceDateUtc),
      title: culte.title,
      speaker: culte.speaker ?? undefined,
      series: culte.series ?? undefined,
      type: culte.type,
    },
    prisma
  );

  const predicationMatched = culte.sequences.some((s) => s.fromPredicationsLibrary);

  // Écrit avant tout effet externe supplémentaire (upload S3, publication) : si l'import
  // échoue après ce point, `--purge` retrouve ce service via cette entrée `started`.
  await appendLedger({
    folder: culte.folder,
    serviceId: service.id,
    date: culte.date,
    sequences: culte.sequences.length,
    predicationMatched,
    at: new Date().toISOString(),
    status: "started",
  });

  const sequences: { sourceId: string; order: number; title: string }[] = [];
  for (const seq of culte.sequences) {
    const ext = (path.extname(seq.filePath).slice(1) || "mp3").toLowerCase();
    const source = await prisma.audioSource.create({
      data: {
        serviceId: service.id,
        kind: "SEQUENCE",
        s3Key: "",
        originalFilename: path.basename(seq.filePath),
        sizeBytes: BigInt(seq.sizeBytes),
        uploadStatus: "PENDING",
      },
    });

    const key = getAudioSourceKey(service.id, source.id, ext);
    const body = await readFile(seq.filePath);
    const etag = await putObjectWithEtag(key, body, "audio/mpeg");
    const durationMs = await probeDurationMs(seq.filePath);

    await prisma.audioSource.update({
      where: { id: source.id },
      data: { s3Key: key, etag, durationMs, uploadStatus: "DONE" },
    });

    sequences.push({ sourceId: source.id, order: seq.order, title: seq.title });
    console.log(`   ✓ ${seq.order}. ${seq.title} (${formatBytes(body.length)}, ${Math.round(durationMs / 1000)} s)`);
  }

  await applySequences(service.id, churchId, sequences, prisma);
  await publishAudioService(service.id, churchId, publishedById, prisma);

  await appendLedger({
    folder: culte.folder,
    serviceId: service.id,
    date: culte.date,
    sequences: sequences.length,
    predicationMatched,
    at: new Date().toISOString(),
    status: "done",
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.root && !args.purge) throw new Error("--root est obligatoire");

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL absent — lancer depuis un checkout du dépôt avec l'env de la cible : " +
        "`DOTENV_CONFIG_PATH=/opt/koinonia/shared/.env tsx …` ou copier ce fichier en `.env`."
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
  try {
    const church = await prisma.church.findFirst({
      where: { OR: [{ slug: CHURCH_SLUG }, { name: CHURCH_NAME }] },
    });
    if (!church) throw new Error(`Église introuvable (slug « ${CHURCH_SLUG} » ou nom « ${CHURCH_NAME} »)`);

    const publisher = await prisma.user.findUnique({ where: { email: PUBLISHER_EMAIL } });
    if (!publisher) throw new Error(`Utilisateur publieur introuvable (email « ${PUBLISHER_EMAIL} »)`);

    if (args.purge) {
      const entry = latestEntryByFolder(await readLedger(), args.purge);
      if (!entry) {
        console.log(`Aucune entrée de ledger pour « ${args.purge} » — rien à purger.`);
        return;
      }
      try {
        await deleteAudioService(entry.serviceId, church.id, prisma);
      } catch (err) {
        // Fenêtre étroite : `publishAudioService` a réussi mais l'entrée `done` n'a jamais
        // été écrite (crash entre les deux). Dépublier avant de réessayer.
        if (err instanceof ApiError && err.statusCode === 400) {
          await unpublishAudioService(entry.serviceId, church.id, prisma);
          await deleteAudioService(entry.serviceId, church.id, prisma);
        } else {
          throw err;
        }
      }
      await removeFromLedger(args.purge);
      console.log(`Culte « ${args.purge} » (${entry.serviceId}) supprimé et retiré du ledger.`);
      return;
    }

    await assertFfprobe();

    console.log(`Lecture de ${args.root} …`);
    const scan = await scanRoot(args.root!);
    const manifest = buildManifest(scan);
    assertValidManifest(manifest);
    printReport(manifest);

    if (args.dryRun) {
      console.log(`\n(dry-run — aucune écriture)`);
      return;
    }

    const ledgerEntries = await readLedger();
    const { toImport, alreadyDone, pendingCleanup } = classifyFolders(
      manifest.cultes.map((c) => c.folder),
      ledgerEntries
    );

    if (pendingCleanup.length > 0) {
      console.log(`\n⚠ Tentatives inabouties détectées — à purger avant réimport :`);
      for (const folder of pendingCleanup) {
        console.log(`   --purge "${folder}"`);
      }
    }

    let candidates = manifest.cultes.filter((c) => toImport.includes(c.folder));
    if (args.only.length > 0) candidates = candidates.filter((c) => args.only.includes(c.folder));
    if (args.limit !== null) candidates = candidates.slice(0, args.limit);

    console.log(
      `\n=== Import ===\n${candidates.length} culte(s) à importer` +
        (alreadyDone.length ? ` (${alreadyDone.length} déjà dans le ledger)` : "") +
        (pendingCleanup.length ? ` (${pendingCleanup.length} en attente de purge, exclu(s))` : "")
    );

    const failed: string[] = [];
    for (const culte of candidates) {
      console.log(`\n→ ${culte.folder}`);
      try {
        await importCulte(prisma, church.id, publisher.id, culte);
        console.log(`   publié (READY) — ${culte.sequences.length} job(s) RENDER en file`);
      } catch (err) {
        failed.push(culte.folder);
        console.error(`   ✗ échec : ${(err as Error).message}`);
        console.error(`     reprise : node … --purge "${culte.folder}"  puis relancer`);
      }
    }

    console.log(`\n=== Terminé ===`);
    console.log(`Importés : ${candidates.length - failed.length} / ${candidates.length}`);
    if (failed.length) console.log(`Échecs : ${failed.map((f) => `« ${f} »`).join(", ")}`);
    console.log(
      `Suivre le rendu : SELECT status, count(*) FROM audio_jobs GROUP BY status;\n` +
        `Vérifier que le worker audio tourne sur la cible.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
