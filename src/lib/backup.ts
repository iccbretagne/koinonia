import { execFile } from "child_process";
import { createGzip } from "zlib";
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { s3 } from "./s3";
import { logger } from "./logger";

export interface BackupResult {
  key: string;
  sizeBytes: number;
  durationMs: number;
}

export interface BackupEntry {
  key: string;
  lastModified: Date;
  sizeBytes: number;
}

function parseDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL || "");
  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

function getBucket(): string {
  return process.env.S3_BUCKET || "koinonia-backups";
}

export async function createBackup(): Promise<BackupResult> {
  const start = Date.now();
  const db = parseDatabaseUrl();
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
  const key = `backups/${timestamp}/db.sql.gz`;

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const args = [
      "--single-transaction",
      "--quick",
      "--routines",
      "--triggers",
      "-h", db.host,
      "-P", db.port,
      "-u", db.user,
      db.database,
    ];

    const child = execFile("mysqldump", args, {
      maxBuffer: 512 * 1024 * 1024,
      env: { ...process.env, MYSQL_PWD: db.password },
    });

    const chunks: Buffer[] = [];
    const gzip = createGzip();

    child.stdout!.pipe(gzip);
    gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gzip.on("end", () => resolve(Buffer.concat(chunks)));
    gzip.on("error", reject);
    child.on("error", reject);
    child.stderr!.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) logger.warn({ msg: "mysqldump stderr", detail: msg });
    });
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`mysqldump exited with code ${code}`));
    });
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: "application/gzip",
    })
  );

  return {
    key,
    sizeBytes: buffer.length,
    durationMs: Date.now() - start,
  };
}

export async function listBackups(): Promise<BackupEntry[]> {
  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: "backups/",
    })
  );

  const entries: BackupEntry[] = (result.Contents || [])
    .filter((obj) => obj.Key?.endsWith(".sql.gz"))
    .map((obj) => ({
      key: obj.Key!,
      lastModified: obj.LastModified!,
      sizeBytes: obj.Size || 0,
    }));

  entries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return entries;
}

export async function cleanupOldBackups(retentionDays: number): Promise<number> {
  const entries = await listBackups();
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const toDelete = entries.filter((e) => e.lastModified < cutoff);

  if (toDelete.length === 0) return 0;

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: getBucket(),
      Delete: {
        Objects: toDelete.map((e) => ({ Key: e.key })),
        Quiet: true,
      },
    })
  );

  logger.info({ msg: "Cleaned up old backups", count: toDelete.length, cutoff: cutoff.toISOString() });
  return toDelete.length;
}
