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
    const shareToken = await validateMediaShareToken(token, ["MEDIA", "MEDIA_ALL"]);

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const allStatuses = shareToken.type === "MEDIA_ALL";

    // Résout les entrées à zipper (photos d'événement ou fichiers de projet).
    let entries: { filename: string; originalKey: string }[] = [];
    let zipBaseName = "medias";

    if (shareToken.mediaEvent) {
      const event = shareToken.mediaEvent;
      const photos = await prisma.mediaPhoto.findMany({
        where: {
          mediaEventId: event.id,
          ...(!allStatuses && { status: "APPROVED" as const }),
          ...(body.photoIds?.length ? { id: { in: body.photoIds } } : {}),
        },
        select: { filename: true, originalKey: true },
        orderBy: { uploadedAt: "asc" },
      });
      entries = photos;
      zipBaseName = event.name;
    } else if (shareToken.mediaProject) {
      const project = shareToken.mediaProject;
      const selectedIds = body.photoIds?.length ? new Set(body.photoIds) : null;
      entries = project.files
        .filter(
          (f) =>
            (allStatuses || ["APPROVED", "FINAL_APPROVED"].includes(f.status)) &&
            (!selectedIds || selectedIds.has(f.id))
        )
        .map((f) => ({ filename: f.filename, originalKey: f.versions[0]?.originalKey ?? "" }))
        .filter((e) => e.originalKey);
      zipBaseName = project.name;
    } else {
      throw new ApiError(404, "Contenu introuvable");
    }

    if (entries.length === 0) throw new ApiError(404, "Aucun fichier disponible");

    // Nom du fichier ZIP : nom événement/projet sanitisé
    const safeName = zipBaseName.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 60);
    const zipFilename = `${safeName}.zip`;

    const archive = archiver("zip", { zlib: { level: 1 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Ajout séquentiel des médias dans le ZIP
    (async () => {
      for (const entry of entries) {
        try {
          const stream = await getS3ObjectStream(entry.originalKey);
          archive.append(stream, { name: entry.filename });
        } catch {
          // Objet manquant en S3 — on skip sans planter le ZIP
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
