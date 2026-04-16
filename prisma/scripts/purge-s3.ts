/**
 * Script de purge S3 — USAGE LOCAL UNIQUEMENT
 *
 * ⚠  Ce script supprime des objets S3 de façon irréversible.
 *    Il est bloqué en NODE_ENV=production.
 *    Toujours faire un --dry-run avant la suppression réelle.
 *
 * Usage :
 *   npx tsx prisma/scripts/purge-s3.ts <cible> [options]
 *
 * Cibles (une requise) :
 *   --media                    Bucket média du .env (MEDIA_S3_* / fallback S3_*)
 *   --backup                   Bucket backups du .env (S3_*)
 *   --endpoint=<url>           Bucket arbitraire — à combiner avec les vars ci-dessous
 *     --bucket=<nom>           Nom du bucket (requis avec --endpoint)
 *     --access-key=<key>       Access key (requis avec --endpoint)
 *     --secret-key=<secret>    Secret key (requis avec --endpoint)
 *     --region=<region>        Région (optionnel, défaut: us-east-1)
 *
 * Filtres :
 *   --prefix=<prefix>          Ne cible que les objets dont la clé commence par <prefix>
 *   --older-than=<n>           Ne cible que les objets modifiés il y a plus de <n> jours
 *
 * Comportement :
 *   --dry-run                  Affiche ce qui serait supprimé sans rien effacer
 *   --yes                      Saute la confirmation interactive
 *
 * Exemples :
 *   # Bucket média du .env — aperçu
 *   npx tsx prisma/scripts/purge-s3.ts --media --dry-run
 *
 *   # Bucket Mediaflow (OVH) — purger les zips vieux de 30 jours
 *   npx tsx prisma/scripts/purge-s3.ts \
 *     --endpoint=https://s3.gra.io.cloud.ovh.net \
 *     --bucket=mediaflow \
 *     --access-key=xxx --secret-key=yyy --region=gra \
 *     --prefix=media-events/ --older-than=30 --dry-run
 *
 *   # Vider complètement un bucket arbitraire
 *   npx tsx prisma/scripts/purge-s3.ts \
 *     --endpoint=https://s3.gra.io.cloud.ovh.net \
 *     --bucket=old-bucket \
 *     --access-key=xxx --secret-key=yyy \
 *     --dry-run
 */

import "dotenv/config";
import * as readline from "readline";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

// ─── Garde production ─────────────────────────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  console.error("\n❌  Ce script est bloqué en NODE_ENV=production.");
  console.error("    Exécutez-le uniquement en local.\n");
  process.exit(1);
}

// ─── Args ─────────────────────────────────────────────────────────────────────

const DRY_RUN     = process.argv.includes("--dry-run");
const YES         = process.argv.includes("--yes");
const USE_MEDIA   = process.argv.includes("--media");
const USE_BACKUP  = process.argv.includes("--backup");

function argVal(name: string): string | undefined {
  const a = process.argv.find((a) => a.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : undefined;
}

const PREFIX          = argVal("prefix");
const OLDER_THAN_DAYS = argVal("older-than") ? parseInt(argVal("older-than")!, 10) : undefined;
const CUTOFF_DATE     = OLDER_THAN_DAYS
  ? new Date(Date.now() - OLDER_THAN_DAYS * 86_400_000)
  : undefined;

// Cible arbitraire
const CUSTOM_ENDPOINT   = argVal("endpoint");
const CUSTOM_BUCKET     = argVal("bucket");
const CUSTOM_ACCESS_KEY = argVal("access-key");
const CUSTOM_SECRET_KEY = argVal("secret-key");
const CUSTOM_REGION     = argVal("region");
const USE_CUSTOM        = !!CUSTOM_ENDPOINT;

if (!USE_MEDIA && !USE_BACKUP && !USE_CUSTOM) {
  console.error("\n❌  Spécifiez une cible : --media, --backup, ou --endpoint=<url> --bucket=<nom> --access-key=<key> --secret-key=<secret>\n");
  process.exit(1);
}

if (USE_CUSTOM && (!CUSTOM_BUCKET || !CUSTOM_ACCESS_KEY || !CUSTOM_SECRET_KEY)) {
  console.error("\n❌  --endpoint requiert --bucket, --access-key et --secret-key.\n");
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(msg: string)   { console.log(`  ✓ ${msg}`); }
function warn(msg: string) { console.log(`  ⚠  ${msg}`); }
function fail(msg: string) { console.error(`  ✗ ${msg}`); }
function info(msg: string) { console.log(`  · ${msg}`); }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

function formatDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function makeClient(vars: {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}): S3Client {
  return new S3Client({
    endpoint: vars.endpoint,
    region: vars.region || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: vars.accessKeyId || "",
      secretAccessKey: vars.secretAccessKey || "",
    },
  });
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question} [oui/NON] : `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "oui");
    });
  });
}

// ─── Listing avec filtres ─────────────────────────────────────────────────────

interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
}

async function listFiltered(
  client: S3Client,
  bucket: string,
  prefix?: string,
  cutoff?: Date
): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let token: string | undefined;
  let scanned = 0;

  do {
    const res: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    );

    for (const obj of res.Contents ?? []) {
      scanned++;
      if (!obj.Key || !obj.LastModified) continue;
      if (cutoff && obj.LastModified > cutoff) continue; // trop récent
      objects.push({ key: obj.Key, size: obj.Size ?? 0, lastModified: obj.LastModified });
    }

    process.stdout.write(`\r  Scan : ${scanned} objets parcourus, ${objects.length} sélectionnés…`);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  process.stdout.write("\n");
  return objects;
}

// ─── Suppression par batch (max 1000 par requête) ─────────────────────────────

async function deleteAll(client: S3Client, bucket: string, objects: S3Object[]): Promise<number> {
  const BATCH = 1000;
  let deleted = 0;

  for (let i = 0; i < objects.length; i += BATCH) {
    const batch = objects.slice(i, i + BATCH);
    const res = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map((o) => ({ Key: o.key })),
          Quiet: false,
        },
      })
    );

    deleted += res.Deleted?.length ?? 0;

    if (res.Errors && res.Errors.length > 0) {
      for (const err of res.Errors) {
        fail(`${err.Key} → ${err.Code}: ${err.Message}`);
      }
    }

    process.stdout.write(`\r  Suppression : ${deleted}/${objects.length}…`);
  }

  process.stdout.write("\n");
  return deleted;
}

// ─── Aperçu des préfixes touchés ──────────────────────────────────────────────

function showBreakdown(objects: S3Object[]) {
  const byPrefix = new Map<string, { count: number; size: number }>();

  for (const obj of objects) {
    // Regroupe par premier niveau de préfixe
    const parts = obj.key.split("/");
    const key = parts.length > 1 ? parts[0] + "/" : "(racine)";
    const cur = byPrefix.get(key) ?? { count: 0, size: 0 };
    byPrefix.set(key, { count: cur.count + 1, size: cur.size + obj.size });
  }

  const sorted = Array.from(byPrefix.entries()).sort((a, b) => b[1].size - a[1].size);
  for (const [prefix, { count, size }] of sorted) {
    info(`  ${prefix.padEnd(40)} ${String(count).padStart(6)} objets   ${formatSize(size).padStart(10)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runPurge(_label: string, client: S3Client, bucket: string) {
  console.log(`\n  Bucket   : ${bucket}`);
  if (PREFIX)          console.log(`  Préfixe  : ${PREFIX}`);
  if (CUTOFF_DATE)     console.log(`  Antérieur à : ${formatDate(CUTOFF_DATE)} (--older-than=${OLDER_THAN_DAYS}j)`);
  if (DRY_RUN)         console.log("  Mode     : DRY-RUN (aucune suppression)");
  console.log("");

  // ── Listing ──────────────────────────────────────────────────────────────
  let objects: S3Object[];
  try {
    objects = await listFiltered(client, bucket, PREFIX, CUTOFF_DATE);
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    fail(`Impossible de lister "${bucket}" : ${e.name}: ${e.message}`);
    return;
  }

  if (objects.length === 0) {
    warn("Aucun objet correspondant aux critères.");
    return;
  }

  const totalSize = objects.reduce((s, o) => s + o.size, 0);

  console.log(`\n  ${objects.length} objet(s) sélectionné(s) — ${formatSize(totalSize)}`);
  console.log("");
  showBreakdown(objects);

  // Aperçu des 5 premiers
  if (objects.length <= 10) {
    console.log("");
    for (const obj of objects) {
      info(`  ${formatDate(obj.lastModified)}  ${formatSize(obj.size).padStart(10)}  ${obj.key}`);
    }
  } else {
    console.log(`\n  Premiers objets :`);
    for (const obj of objects.slice(0, 5)) {
      info(`    ${formatDate(obj.lastModified)}  ${formatSize(obj.size).padStart(10)}  ${obj.key}`);
    }
    info(`    … et ${objects.length - 5} autres`);
  }

  // ── Dry-run : s'arrête ici ────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log(`\n  [dry-run] ${objects.length} objet(s) seraient supprimés (${formatSize(totalSize)})`);
    return;
  }

  // ── Confirmation ─────────────────────────────────────────────────────────
  console.log("");
  warn(`ATTENTION : cette opération est IRRÉVERSIBLE.`);

  let confirmed = YES;
  if (!confirmed) {
    confirmed = await confirm(
      `Supprimer ${objects.length} objet(s) (${formatSize(totalSize)}) du bucket "${bucket}" ?`
    );
  }

  if (!confirmed) {
    info("Annulé.");
    return;
  }

  // ── Suppression ───────────────────────────────────────────────────────────
  console.log("");
  const deleted = await deleteAll(client, bucket, objects);
  ok(`${deleted} objet(s) supprimé(s) sur ${objects.length} — ${formatSize(totalSize)} libérés`);
}

async function main() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  Koinonia — Purge S3  ⚠  IRRÉVERSIBLE");
  console.log("════════════════════════════════════════════════════════════");

  if (USE_MEDIA) {
    const endpoint   = process.env.MEDIA_S3_ENDPOINT          || process.env.S3_ENDPOINT;
    const region     = process.env.MEDIA_S3_REGION            || process.env.S3_REGION;
    const bucket     = process.env.MEDIA_S3_BUCKET            || process.env.S3_BUCKET || "";
    const accessKey  = process.env.MEDIA_S3_ACCESS_KEY_ID     || process.env.S3_ACCESS_KEY_ID;
    const secretKey  = process.env.MEDIA_S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;

    if (!bucket || !accessKey || !secretKey) {
      fail("Configuration média incomplète (MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, MEDIA_S3_SECRET_ACCESS_KEY).");
      process.exit(1);
    }

    const client = makeClient({ endpoint, region, accessKeyId: accessKey, secretAccessKey: secretKey });
    await runPurge("Média", client, bucket);
  }

  if (USE_BACKUP) {
    const endpoint   = process.env.S3_ENDPOINT;
    const region     = process.env.S3_REGION;
    const bucket     = process.env.S3_BUCKET || "";
    const accessKey  = process.env.S3_ACCESS_KEY_ID;
    const secretKey  = process.env.S3_SECRET_ACCESS_KEY;

    if (!bucket || !accessKey || !secretKey) {
      fail("Configuration backup incomplète (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).");
      process.exit(1);
    }

    const client = makeClient({ endpoint, region, accessKeyId: accessKey, secretAccessKey: secretKey });
    await runPurge("Backup", client, bucket);
  }

  if (USE_CUSTOM) {
    const client = makeClient({
      endpoint:        CUSTOM_ENDPOINT,
      region:          CUSTOM_REGION,
      accessKeyId:     CUSTOM_ACCESS_KEY,
      secretAccessKey: CUSTOM_SECRET_KEY,
    });
    await runPurge("Custom", client, CUSTOM_BUCKET!);
  }

  console.log("\n════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n❌  Erreur inattendue :", err);
  process.exit(1);
});
