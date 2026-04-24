/**
 * POST /api/media/download/[token]/zip
 * Streame un ZIP contenant les photos approuvées sélectionnées.
 * Body: { photoIds?: string[] }  — si absent, toutes les photos approuvées de l'événement.
 */
import { prisma } from "@/lib/prisma";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getS3ObjectStream } from "@/modules/media";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  photoIds: z.array(z.string()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, "MEDIA");
    const event = shareToken.mediaEvent;
    if (!event) throw new ApiError(404, "Événement introuvable");

    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const where = {
      mediaEventId: event.id,
      status: "APPROVED" as const,
      ...(body.photoIds?.length ? { id: { in: body.photoIds } } : {}),
    };

    const photos = await prisma.mediaPhoto.findMany({
      where,
      select: { id: true, filename: true, originalKey: true },
      orderBy: { uploadedAt: "asc" },
    });

    if (photos.length === 0) throw new ApiError(404, "Aucune photo approuvée");

    // Nom du fichier ZIP : nom événement sanitisé
    const safeName = event.name.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 60);
    const zipFilename = `${safeName}.zip`;

    const archive = archiver("zip", { zlib: { level: 1 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Ajout séquentiel des photos dans le ZIP
    (async () => {
      for (const photo of photos) {
        try {
          const stream = await getS3ObjectStream(photo.originalKey);
          archive.append(stream, { name: photo.filename });
        } catch {
          // Photo manquante en S3 — on skip sans planter le ZIP
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
        "Content-Disposition": `attachment; filename="${zipFilename}"`,
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
