/**
 * POST /api/media/collection/[token]/zip
 * Streame un ZIP de la collection (photos approuvées + visuels approuvés).
 * Body: { photoIds?: string[]; fileIds?: string[] } — si absent, tout est inclus.
 */
import { prisma } from "@/lib/prisma";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getS3ObjectStream, collectionPhotoWhere } from "@/modules/media";
import type { CollectionConfig } from "@/modules/media";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  photoIds: z.array(z.string()).optional(),
  fileIds:  z.array(z.string()).optional(),
});

type ZipEntry = { filename: string; originalKey: string; folder: string };

const safeFolderName = (name: string) => name.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 50);

/** Photos de la collection, rangées par événement (ou seulement celles choisies). */
async function photoZipEntries(config: CollectionConfig, eventIds: string[], photoIds?: string[]): Promise<ZipEntry[]> {
  if (eventIds.length === 0) return [];
  const events = await prisma.mediaEvent.findMany({
    where: { id: { in: eventIds } },
    select: {
      id: true,
      name: true,
      photos: {
        where: {
          ...collectionPhotoWhere(config),
          ...(photoIds?.length ? { id: { in: photoIds } } : {}),
        },
        select: { filename: true, originalKey: true },
      },
    },
  });
  return events.flatMap((event) =>
    event.photos.map((p) => ({ filename: p.filename, originalKey: p.originalKey, folder: safeFolderName(event.name) }))
  );
}

/** Dernière version des visuels approuvés, rangés par projet (ou seulement ceux choisis). */
async function fileZipEntries(projectIds: string[], fileIds?: string[]): Promise<ZipEntry[]> {
  if (projectIds.length === 0) return [];
  const projects = await prisma.mediaProject.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      name: true,
      files: {
        where: {
          status: { in: ["APPROVED", "FINAL_APPROVED"] },
          ...(fileIds?.length ? { id: { in: fileIds } } : {}),
        },
        select: {
          filename: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { originalKey: true },
          },
        },
      },
    },
  });
  return projects.flatMap((project) =>
    project.files.flatMap((f) => {
      const originalKey = f.versions[0]?.originalKey;
      return originalKey ? [{ filename: f.filename, originalKey, folder: safeFolderName(project.name) }] : [];
    })
  );
}

/** ZIP en flux : un fichier absent du stockage est ignoré sans interrompre l'archive. */
function streamZip(entries: ZipEntry[]): ReadableStream {
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, "COLLECTION");
    const config = shareToken.config as CollectionConfig | null;
    if (!config) throw new ApiError(400, "Configuration manquante");

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const { scope, eventIds, projectIds } = config;

    const photoEntries = scope === "photos" || scope === "both" ? await photoZipEntries(config, eventIds, body.photoIds) : [];
    const fileEntries = scope === "files" || scope === "both" ? await fileZipEntries(projectIds, body.fileIds) : [];

    const totalEntries = photoEntries.length + fileEntries.length;
    if (totalEntries === 0) throw new ApiError(404, "Aucun fichier disponible");

    const label = shareToken.label ?? "collection";
    const safeLabel = label.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 60);

    return new Response(streamZip([...photoEntries, ...fileEntries]), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeLabel}.zip"`,
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
