/**
 * Script de synchronisation S3 → S3
 *
 * Copie les objets d'un bucket source vers un bucket destination.
 * Idempotent : les objets déjà présents (même clé + même ETag) sont ignorés.
 *
 * Usage :
 *   SRC_ENDPOINT=... SRC_REGION=... SRC_BUCKET=... SRC_ACCESS_KEY=... SRC_SECRET_KEY=... \
 *   DST_ENDPOINT=... DST_REGION=... DST_BUCKET=... DST_ACCESS_KEY=... DST_SECRET_KEY=... \
 *   npx tsx prisma/scripts/sync-s3.ts [options]
 *
 * Options :
 *   --dry-run          Affiche ce qui serait copié sans rien écrire
 *   --prefix=<prefix>  Ne copie que les objets dont la clé commence par <prefix>
 *                      (ex: --prefix=media-events/)
 *   --force            Recopie même les objets déjà présents (ignore l'ETag)
 *   --concurrency=<n>  Nombre de copies en parallèle (défaut: 8)
 *
 * Raccourci "Mediaflow → Koinonia" (lit les vars du .env + MEDIAFLOW_S3_*) :
 *   MEDIAFLOW_S3_ENDPOINT=... MEDIAFLOW_S3_BUCKET=... \
 *   MEDIAFLOW_S3_ACCESS_KEY=... MEDIAFLOW_S3_SECRET_KEY=... \
 *   npx tsx prisma/scripts/sync-s3.ts --from-mediaflow [--prefix=...] [--dry-run]
 */

import "dotenv/config";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE   = process.argv.includes("--force");
const FROM_MEDIAFLOW = process.argv.includes("--from-mediaflow");

const prefixArg = process.argv.find((a) => a.startsWith("--prefix="));
const PREFIX = prefixArg ? prefixArg.split("=").slice(1).join("=") : undefined;

const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split("=")[1], 10) : 8;

function ok(msg: string)    { console.log(`  ✓ ${msg}`); }
function warn(msg: string)  { console.log(`  ⚠  ${msg}`); }
function fail(msg: string)  { console.error(`  ✗ ${msg}`); }
function progress(msg: string) { process.stdout.write(`\r  ${msg}                    `); }

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

// ─── Listing complet (pagination) ────────────────────────────────────────────

interface S3Object {
  key: string;
  etag: string;
  size: number;
  contentType?: string;
}

async function listAll(client: S3Client, bucket: string, prefix?: string): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let continuationToken: string | undefined;

  do {
    const res: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of res.Contents ?? []) {
      if (obj.Key && obj.ETag) {
        objects.push({
          key: obj.Key,
          etag: obj.ETag.replace(/"/g, ""),
          size: obj.Size ?? 0,
        });
      }
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    progress(`Listing… ${objects.length} objets trouvés`);
  } while (continuationToken);

  process.stdout.write("\n");
  return objects;
}

// ─── Vérification existence côté destination ──────────────────────────────────

async function existsInDst(client: S3Client, bucket: string, key: string, etag: string): Promise<boolean> {
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const dstEtag = (res.ETag ?? "").replace(/"/g, "");
    return dstEtag === etag;
  } catch {
    return false;
  }
}

// ─── Copie d'un objet ─────────────────────────────────────────────────────────

async function copyObject(
  src: S3Client, srcBucket: string,
  dst: S3Client, dstBucket: string,
  obj: S3Object
): Promise<"copied" | "skipped" | "error"> {
  if (!FORCE) {
    const already = await existsInDst(dst, dstBucket, obj.key, obj.etag);
    if (already) return "skipped";
  }

  if (DRY_RUN) {
    ok(`[dry-run] copierait : ${obj.key} (${formatSize(obj.size)})`);
    return "copied";
  }

  try {
    // Télécharge depuis la source
    const getRes = await src.send(new GetObjectCommand({ Bucket: srcBucket, Key: obj.key }));
    const body = await getRes.Body?.transformToByteArray();
    if (!body) throw new Error("Body vide");

    // Upload vers la destination
    await dst.send(new PutObjectCommand({
      Bucket: dstBucket,
      Key: obj.key,
      Body: body,
      ContentType: getRes.ContentType,
      ContentLength: body.length,
    }));

    return "copied";
  } catch (err: unknown) {
    const e = err as { message?: string };
    fail(`${obj.key} → ${e.message}`);
    return "error";
  }
}

// ─── Pool de concurrence ──────────────────────────────────────────────────────

async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onDone?: (idx: number, total: number) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIdx = 0;
  let doneIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await tasks[idx]();
      doneIdx++;
      onDone?.(doneIdx, tasks.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  Koinonia — Sync S3 → S3");
  if (DRY_RUN) console.log("  ⚠  MODE DRY-RUN — aucune écriture");
  console.log("════════════════════════════════════════════════════════════\n");

  // ── Résolution des variables ──────────────────────────────────────────────
  let srcEndpoint: string | undefined;
  let srcRegion:   string | undefined;
  let srcBucket:   string;
  let srcAccessKey: string | undefined;
  let srcSecretKey: string | undefined;

  let dstEndpoint: string | undefined;
  let dstRegion:   string | undefined;
  let dstBucket:   string;
  let dstAccessKey: string | undefined;
  let dstSecretKey: string | undefined;

  if (FROM_MEDIAFLOW) {
    // Source = Mediaflow S3 (vars dédiées)
    srcEndpoint  = process.env.MEDIAFLOW_S3_ENDPOINT;
    srcRegion    = process.env.MEDIAFLOW_S3_REGION;
    srcBucket    = process.env.MEDIAFLOW_S3_BUCKET || "";
    srcAccessKey = process.env.MEDIAFLOW_S3_ACCESS_KEY;
    srcSecretKey = process.env.MEDIAFLOW_S3_SECRET_KEY;

    // Destination = Koinonia média (MEDIA_S3_* obligatoires)
    dstEndpoint  = process.env.MEDIA_S3_ENDPOINT;
    dstRegion    = process.env.MEDIA_S3_REGION;
    dstBucket    = process.env.MEDIA_S3_BUCKET || "";
    dstAccessKey = process.env.MEDIA_S3_ACCESS_KEY_ID;
    dstSecretKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY;
  } else {
    // Variables explicites
    srcEndpoint  = process.env.SRC_ENDPOINT;
    srcRegion    = process.env.SRC_REGION;
    srcBucket    = process.env.SRC_BUCKET || "";
    srcAccessKey = process.env.SRC_ACCESS_KEY;
    srcSecretKey = process.env.SRC_SECRET_KEY;

    dstEndpoint  = process.env.DST_ENDPOINT;
    dstRegion    = process.env.DST_REGION;
    dstBucket    = process.env.DST_BUCKET || "";
    dstAccessKey = process.env.DST_ACCESS_KEY;
    dstSecretKey = process.env.DST_SECRET_KEY;
  }

  // ── Validation ───────────────────────────────────────────────────────────
  const missing: string[] = [];
  if (!srcBucket)   missing.push(FROM_MEDIAFLOW ? "MEDIAFLOW_S3_BUCKET"   : "SRC_BUCKET");
  if (!srcAccessKey) missing.push(FROM_MEDIAFLOW ? "MEDIAFLOW_S3_ACCESS_KEY" : "SRC_ACCESS_KEY");
  if (!srcSecretKey) missing.push(FROM_MEDIAFLOW ? "MEDIAFLOW_S3_SECRET_KEY" : "SRC_SECRET_KEY");
  if (!dstBucket)   missing.push(FROM_MEDIAFLOW ? "MEDIA_S3_BUCKET / S3_BUCKET" : "DST_BUCKET");
  if (!dstAccessKey) missing.push(FROM_MEDIAFLOW ? "MEDIA_S3_ACCESS_KEY_ID / S3_ACCESS_KEY_ID" : "DST_ACCESS_KEY");
  if (!dstSecretKey) missing.push(FROM_MEDIAFLOW ? "MEDIA_S3_SECRET_ACCESS_KEY / S3_SECRET_ACCESS_KEY" : "DST_SECRET_KEY");

  if (missing.length > 0) {
    fail(`Variables manquantes :\n${missing.map((m) => `    ${m}`).join("\n")}`);
    process.exit(1);
  }

  // ── Affichage config ─────────────────────────────────────────────────────
  console.log("  Source");
  console.log(`    endpoint : ${srcEndpoint || "(défaut AWS)"}`);
  console.log(`    bucket   : ${srcBucket}`);
  console.log(`    region   : ${srcRegion || "us-east-1"}`);
  console.log("");
  console.log("  Destination");
  console.log(`    endpoint : ${dstEndpoint || "(défaut AWS)"}`);
  console.log(`    bucket   : ${dstBucket}`);
  console.log(`    region   : ${dstRegion || "us-east-1"}`);
  if (PREFIX)      console.log(`\n  Préfixe   : ${PREFIX}`);
  if (FORCE)       console.log("  Mode      : --force (recopie même si déjà présent)");
  console.log(`  Parallélisme : ${CONCURRENCY} copies simultanées`);
  console.log("");

  const src = makeClient({ endpoint: srcEndpoint, region: srcRegion, accessKeyId: srcAccessKey, secretAccessKey: srcSecretKey });
  const dst = makeClient({ endpoint: dstEndpoint, region: dstRegion, accessKeyId: dstAccessKey, secretAccessKey: dstSecretKey });

  // ── Listing source ────────────────────────────────────────────────────────
  console.log(`  Listing "${srcBucket}"${PREFIX ? ` (préfixe: ${PREFIX})` : ""}…`);
  let objects: S3Object[];
  try {
    objects = await listAll(src, srcBucket, PREFIX);
  } catch (err: unknown) {
    const e = err as { message?: string; name?: string };
    fail(`Impossible de lister la source : ${e.name}: ${e.message}`);
    process.exit(1);
  }

  if (objects.length === 0) {
    warn("Aucun objet trouvé dans la source.");
    return;
  }

  const totalSize = objects.reduce((s, o) => s + o.size, 0);
  console.log(`  ${objects.length} objet(s) — ${formatSize(totalSize)} au total\n`);

  // ── Copie ─────────────────────────────────────────────────────────────────
  let copied = 0;
  let skipped = 0;
  let errors = 0;

  const tasks = objects.map((obj) => () =>
    copyObject(src, srcBucket, dst, dstBucket!, obj)
  );

  const results = await runPool(tasks, CONCURRENCY, (done, total) => {
    progress(`Progression : ${done}/${total} (✓ ${copied} copiés, · ${skipped} ignorés, ✗ ${errors} erreurs)`);
  });

  process.stdout.write("\n");

  for (const r of results) {
    if (r === "copied")  copied++;
    if (r === "skipped") skipped++;
    if (r === "error")   errors++;
  }

  // ── Résumé ────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  Résultat${DRY_RUN ? " (dry-run)" : ""}`);
  console.log("────────────────────────────────────────────────────────────");
  console.log(`  ✓ Copiés   : ${copied}`);
  console.log(`  · Ignorés  : ${skipped} (déjà à jour)`);
  if (errors > 0)
    console.log(`  ✗ Erreurs  : ${errors}`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n❌  Erreur inattendue :", err);
  process.exit(1);
});
