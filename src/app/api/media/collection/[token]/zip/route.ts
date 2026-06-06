/**
 * POST /api/media/collection/[token]/zip
 * Streame un ZIP de la collection (photos approuvées + visuels approuvés).
 * Body: { photoIds?: string[]; fileIds?: string[] } — si absent, tout est inclus.
 */
import { prisma } from "@/lib/prisma";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getS3ObjectStream } from "@/modules/media";
import type { CollectionConfig } from "@/modules/media";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  photoIds: z.array(z.string()).optional(),
  fileIds:  z.array(z.string()).optional(),
});

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

    type PhotoEntry = { filename: string; originalKey: string; folder: string };
    type FileEntry  = { filename: string; originalKey: string; folder: string };

    const photoEntries: PhotoEntry[] = [];
    const fileEntries:  FileEntry[]  = [];

    // ── Photos ─────────────────────────────────────────────────────────────────
    if ((scope === "photos" || scope === "both") && eventIds.length > 0) {
      const events = await prisma.mediaEvent.findMany({
        where: { id: { in: eventIds } },
        select: {
          id: true,
          name: true,
          photos: {
            where: {
              status: "APPROVED",
              ...(body.photoIds?.length ? { id: { in: body.photoIds } } : {}),
            },
            select: { filename: true, originalKey: true },
          },
        },
      });

      for (const event of events) {
        const safeFolder = event.name.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 50);
        for (const p of event.photos) {
          photoEntries.push({ filename: p.filename, originalKey: p.originalKey, folder: safeFolder });
        }
      }
    }

    // ── Fichiers visuels ───────────────────────────────────────────────────────
    if ((scope === "files" || scope === "both") && projectIds.length > 0) {
      const projects = await prisma.mediaProject.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true,
          name: true,
          files: {
            where: {
              status: { in: ["APPROVED", "FINAL_APPROVED"] },
              ...(body.fileIds?.length ? { id: { in: body.fileIds } } : {}),
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

      for (const project of projects) {
        const safeFolder = project.name.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 50);
        for (const f of project.files) {
          if (f.versions[0]?.originalKey) {
            fileEntries.push({ filename: f.filename, originalKey: f.versions[0].originalKey, folder: safeFolder });
          }
        }
      }
    }

    const totalEntries = photoEntries.length + fileEntries.length;
    if (totalEntries === 0) throw new ApiError(404, "Aucun fichier disponible");

    const label = shareToken.label ?? "collection";
    const safeLabel = label.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 60);

    const archive = archiver("zip", { zlib: { level: 1 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    (async () => {
      const allEntries = [...photoEntries, ...fileEntries];
      for (const entry of allEntries) {
        try {
          const stream = await getS3ObjectStream(entry.originalKey);
          archive.append(stream, { name: `${entry.folder}/${entry.filename}` });
        } catch {
          // Fichier manquant en S3 — skip sans planter le ZIP
        }
      }
      await archive.finalize();
    })();

    const readable = new ReadableStream({
      start(controller) {
        passthrough.on("data", (chunk) => controller.enqueue(chunk));
        passthrough.on("end", () => controller.close());
        passthrough.on("error", (err) => controller.error(err));
      },
    });

    return new Response(readable, {
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
