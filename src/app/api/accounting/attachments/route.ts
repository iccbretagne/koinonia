import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { storeFile } from "@/lib/file-storage";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export async function POST(request: Request) {
  try {
    const session = await requirePermission("accounting:submit");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const requestId = formData.get("requestId") as string | null;

    if (!file) throw new ApiError(400, "Fichier manquant");
    if (!ALLOWED_TYPES.includes(file.type)) throw new ApiError(400, "Format non supporté (JPEG, PNG, PDF uniquement)");
    if (file.size > MAX_SIZE) throw new ApiError(400, "Fichier trop volumineux (max 5 Mo)");

    if (requestId) {
      const req = await prisma.financialRequest.findUnique({ where: { id: requestId } });
      if (!req || req.churchId !== churchId) throw new ApiError(404, "Demande introuvable");
      if (req.status !== "SUBMITTED") throw new ApiError(400, "Impossible d'ajouter une pièce jointe après traitement");
      if (req.submittedById !== session.user.id!) throw new ApiError(403, "Accès refusé");
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const s3Key = `accounting/${churchId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await storeFile(s3Key, buffer, file.type);

    const attachment = await prisma.financialAttachment.create({
      data: {
        requestId:    requestId ?? undefined,
        uploadedById: session.user.id!,
        s3Key,
        filename: file.name,
        mimeType: file.type,
        size:     file.size,
      },
    });

    return successResponse(attachment, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
