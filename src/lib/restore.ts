import { spawn } from "child_process";
import { createGunzip } from "zlib";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./s3";
import { logger } from "./logger";
import type { Readable } from "stream";

export interface RestoreResult {
  key: string;
  durationMs: number;
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

export async function restoreBackup(key: string): Promise<RestoreResult> {
  if (!key.startsWith("backups/") || !key.endsWith(".sql.gz")) {
    throw new Error("Invalid backup key");
  }

  const start = Date.now();
  const db = parseDatabaseUrl();

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET || "koinonia-backups",
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error("Empty response from S3");
  }

  await new Promise<void>((resolve, reject) => {
    const gunzip = createGunzip();
    const mysql = spawn("mysql", [
      "-h", db.host,
      "-P", db.port,
      "-u", db.user,
      db.database,
    ], {
      env: { ...process.env, MYSQL_PWD: db.password },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderrOutput = "";
    mysql.stderr.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    mysql.on("error", reject);
    mysql.on("exit", (code) => {
      if (code !== 0) {
        logger.error({ msg: "mysql import failed", code, stderr: stderrOutput });
        reject(new Error(`mysql import exited with code ${code}`));
      } else {
        resolve();
      }
    });

    const s3Stream = response.Body as Readable;
    s3Stream.pipe(gunzip).pipe(mysql.stdin);

    gunzip.on("error", (err) => {
      mysql.kill();
      reject(err);
    });
    s3Stream.on("error", (err) => {
      mysql.kill();
      reject(err);
    });
  });

  logger.info({ msg: "Backup restored", key, durationMs: Date.now() - start });

  return {
    key,
    durationMs: Date.now() - start,
  };
}
