import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serveLocalFile, S3_CONFIGURED } from "@/lib/file-storage";
import { ApiError, errorResponse } from "@/lib/api-utils";
import { canReadAttachment } from "@/modules/accounting";

// Local file serving — only active when S3 is not configured (dev mode)
export async function GET(request: Request) {
  try {
    if (S3_CONFIGURED) throw new ApiError(404, "Not found");

    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const s3Key   = searchParams.get("key");
    const filename = searchParams.get("filename") ?? "fichier";

    if (!s3Key) throw new ApiError(400, "Clé manquante");

    // Mêmes règles que le téléchargement principal (canReadAttachment) : déposant, ou
    // accounting:manage dans l'église de la pièce — qui fait autorité, rattachée ou non.
    const attachment = await prisma.financialAttachment.findFirst({ where: { s3Key } });
    if (!attachment) throw new ApiError(404, "Fichier introuvable");
    if (!(await canReadAttachment(attachment, session))) throw new ApiError(403, "Accès refusé");

    const file = await serveLocalFile(s3Key);
    if (!file) throw new ApiError(404, "Fichier introuvable sur le disque");

    return new Response(file.buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":        file.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length":      String(file.buffer.length),
        "Cache-Control":       "private, no-cache",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
