/**
 * Script de diagnostic S3
 *
 * Usage :
 *   npx tsx prisma/scripts/debug-s3.ts [--media] [--backup]
 *
 * Options :
 *   --media    Teste le bucket média (MEDIA_S3_* avec fallback S3_*)
 *   --backup   Teste le bucket backups (S3_*)
 *   (aucune)   Teste les deux
 */

import "dotenv/config";
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(msg: string)   { console.log(`  ✓ ${msg}`); }
function fail(msg: string) { console.log(`  ✗ ${msg}`); }
function info(msg: string) { console.log(`  · ${msg}`); }
function redactKey(v: string | undefined)    { return v ? v.slice(0, 6) + "…"        : "(non défini)"; }
function redactSecret(v: string | undefined) { return v ? "***" + v.slice(-4)        : "(non défini)"; }
function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
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

// ─── Config display ───────────────────────────────────────────────────────────

function displayConfig(label: string, vars: {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  section(`Configuration — ${label}`);
  info(`endpoint        : ${vars.endpoint || "(non défini)"}`);
  info(`region          : ${vars.region   || "(non défini, défaut: us-east-1)"}`);
  info(`bucket          : ${vars.bucket   || "(non défini)"}`);
  info(`access_key_id   : ${vars.accessKeyId}`);
  info(`secret_key      : ${vars.secretAccessKey}`);
}

// ─── Tests de connectivité ────────────────────────────────────────────────────

async function testBucket(client: S3Client, bucket: string, label: string) {
  section(`Tests — ${label}`);

  if (!bucket) {
    fail("Bucket non configuré — tests ignorés");
    return;
  }

  // 1. HeadBucket (existence + droits d'accès)
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    ok(`HeadBucket "${bucket}" → accessible`);
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    if (e.$metadata?.httpStatusCode === 403) {
      fail(`HeadBucket → 403 Forbidden (credentials invalides ou bucket privé sans accès list)`);
    } else if (e.$metadata?.httpStatusCode === 404) {
      fail(`HeadBucket → 404 Not Found (bucket "${bucket}" inexistant)`);
    } else {
      fail(`HeadBucket → ${e.name}: ${e.message}`);
    }
  }

  // 2. ListObjectsV2 (droit de listing)
  let listOk = false;
  try {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }));
    const count = res.KeyCount ?? 0;
    ok(`ListObjectsV2 → ${count} objet(s) visible(s) (max 5 listés)`);
    if (res.Contents && res.Contents.length > 0) {
      info(`  Premier objet : ${res.Contents[0].Key}`);
    }
    listOk = true;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    fail(`ListObjectsV2 → ${e.name}: ${e.message}`);
  }

  // 3. PutObject (droit d'écriture)
  const testKey = `__debug-s3-test-${Date.now()}.txt`;
  let putOk = false;
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: Buffer.from("koinonia-s3-debug-test"),
      ContentType: "text/plain",
    }));
    ok(`PutObject "${testKey}" → écriture OK`);
    putOk = true;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    fail(`PutObject → ${e.name}: ${e.message}`);
  }

  // 4. GetObject (droit de lecture)
  if (putOk) {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }));
      const body = await res.Body?.transformToString();
      if (body === "koinonia-s3-debug-test") {
        ok(`GetObject "${testKey}" → lecture OK (contenu vérifié)`);
      } else {
        fail(`GetObject → contenu inattendu: "${body}"`);
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      fail(`GetObject → ${e.name}: ${e.message}`);
    }

    // 5. DeleteObject (nettoyage)
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
      ok(`DeleteObject "${testKey}" → suppression OK`);
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      fail(`DeleteObject → ${e.name}: ${e.message} (objet de test laissé dans le bucket)`);
    }
  }

  // 6. Listing d'un préfixe spécifique aux médias (si bucket média)
  if (listOk && label.includes("Média")) {
    try {
      const res = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "media-events/",
        MaxKeys: 5,
      }));
      const count = res.KeyCount ?? 0;
      ok(`ListObjectsV2 préfixe "media-events/" → ${count} objet(s)`);
      if (res.Contents && res.Contents.length > 0) {
        res.Contents.forEach((obj) => info(`    ${obj.Key}`));
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      fail(`ListObjectsV2 "media-events/" → ${e.name}: ${e.message}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const testMedia  = args.includes("--media")  || args.length === 0;
  const testBackup = args.includes("--backup") || args.length === 0;

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  Koinonia — Diagnostic S3");
  console.log("════════════════════════════════════════════════════════════");

  // ── Bucket média ──────────────────────────────────────────────────────────
  if (testMedia) {
    const mediaEndpoint   = process.env.MEDIA_S3_ENDPOINT;
    const mediaRegion     = process.env.MEDIA_S3_REGION;
    const mediaBucket     = process.env.MEDIA_S3_BUCKET || "";
    const mediaAccessKey  = process.env.MEDIA_S3_ACCESS_KEY_ID;
    const mediaSecretKey  = process.env.MEDIA_S3_SECRET_ACCESS_KEY;

    const usesMediaVars = !!(process.env.MEDIA_S3_ENDPOINT || process.env.MEDIA_S3_BUCKET);

    displayConfig(
      `Média${usesMediaVars ? " (MEDIA_S3_*)" : " (fallback S3_*)"}`,
      { endpoint: mediaEndpoint, region: mediaRegion, bucket: mediaBucket,
        accessKeyId: redactKey(mediaAccessKey), secretAccessKey: redactSecret(mediaSecretKey) }
    );

    if (!mediaEndpoint || !mediaBucket || !mediaAccessKey || !mediaSecretKey) {
      section("Tests — Média");
      fail("Configuration incomplète — vérifiez MEDIA_S3_* (ou S3_*) dans votre .env");
    } else {
      const client = makeClient({
        endpoint: mediaEndpoint, region: mediaRegion,
        accessKeyId: mediaAccessKey, secretAccessKey: mediaSecretKey,
      });
      await testBucket(client, mediaBucket, "Média");
    }
  }

  // ── Bucket backups ────────────────────────────────────────────────────────
  if (testBackup) {
    const backupEndpoint  = process.env.BACKUP_S3_ENDPOINT;
    const backupRegion    = process.env.BACKUP_S3_REGION;
    const backupBucket    = process.env.BACKUP_S3_BUCKET || "";
    const backupAccessKey = process.env.BACKUP_S3_ACCESS_KEY_ID;
    const backupSecretKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;

    displayConfig(
      "Backup (S3_*)",
      { endpoint: backupEndpoint, region: backupRegion, bucket: backupBucket,
        accessKeyId: redactKey(backupAccessKey), secretAccessKey: redactSecret(backupSecretKey) }
    );

    if (!backupEndpoint || !backupBucket || !backupAccessKey || !backupSecretKey) {
      section("Tests — Backup");
      fail("Configuration incomplète — vérifiez S3_* dans votre .env");
    } else {
      const client = makeClient({
        endpoint: backupEndpoint, region: backupRegion,
        accessKeyId: backupAccessKey, secretAccessKey: backupSecretKey,
      });
      await testBucket(client, backupBucket, "Backup");
    }
  }

  console.log("\n════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n❌  Erreur inattendue :", err);
  process.exit(1);
});
