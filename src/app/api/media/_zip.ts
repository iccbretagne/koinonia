import archiver from "archiver";
import { PassThrough } from "node:stream";
import { getS3ObjectStream } from "@/modules/media";

export type ZipEntry = { filename: string; originalKey: string; folder: string };

/** ZIP en flux : un fichier absent du stockage est ignoré sans interrompre l'archive. */
export function streamZip(entries: ZipEntry[]): ReadableStream {
  const archive = archiver("zip", { zlib: { level: 1 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  (async () => {
    for (const entry of entries) {
      try {
        const stream = await getS3ObjectStream(entry.originalKey);
        archive.append(stream, { name: `${entry.folder}/${entry.filename}` });
      } catch {
        // Fichier manquant en S3 — skip sans planter le ZIP
      }
    }
    await archive.finalize();
  })().catch((err) => passthrough.destroy(err));

  return new ReadableStream({
    start(controller) {
      passthrough.on("data", (chunk) => controller.enqueue(chunk));
      passthrough.on("end", () => controller.close());
      passthrough.on("error", (err) => controller.error(err));
    },
  });
}

