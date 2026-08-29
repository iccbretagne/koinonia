import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getFileUrl, deleteFile } from "@/lib/file-storage";
import { canReadAttachment } from "@/modules/accounting";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireAuth();

    // L'église de la pièce fait autorité — jamais le contexte d'église affiché, qui peut être
    // manipulé côté client (spec 025, même principe que spec 024).
    const attachment = await prisma.financialAttachment.findUnique({ where: { id } });
    if (!attachment) throw new ApiError(404, "Pièce jointe introuvable");

    if (!(await canReadAttachment(attachment, session))) {
      throw new ApiError(403, "Accès refusé");
    }

    const url = await getFileUrl(attachment.s3Key, attachment.filename);
    return successResponse({ url, filename: attachment.filename, mimeType: attachment.mimeType });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireAuth();

    const attachment = await prisma.financialAttachment.findUnique({
      where: { id },
      include: { request: { select: { submittedById: true, status: true } } },
    });
    if (!attachment) throw new ApiError(404, "Pièce jointe introuvable");

    const isOrphan = !attachment.request;
    const isSubmitter = attachment.uploadedById === session.user.id!;
    const isRequestSubmitter = attachment.request?.submittedById === session.user.id!;
    const canDelete = isOrphan
      ? isSubmitter
      : isRequestSubmitter && attachment.request?.status === "SUBMITTED";

    if (!canDelete) throw new ApiError(403, "Impossible de supprimer cette pièce jointe");

    await deleteFile(attachment.s3Key).catch(() => {});
    await prisma.financialAttachment.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
