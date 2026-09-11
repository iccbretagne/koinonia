import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  canDepositAnnouncementSheet,
  canReadAnnouncementSheet,
  notifyReaders,
} from "@/modules/planning";
import { fileExists, getSignedDownloadUrl, deleteMediaFile } from "@/modules/storage";

const confirmSchema = z.object({
  key: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:view", churchId);

    if (!(await canDepositAnnouncementSheet(session, churchId))) {
      throw new ApiError(403, "Droit insuffisant pour déposer une feuille d'annonces");
    }

    const body = confirmSchema.parse(await request.json());

    const event = await prisma.event.findFirst({ where: { id: eventId, churchId } });
    if (!event) throw new ApiError(404, "Événement introuvable");

    if (!(await fileExists(body.key))) {
      throw new ApiError(404, "Fichier introuvable — le dépôt n'a pas abouti");
    }

    const existing = await prisma.announcementSheet.findUnique({ where: { eventId } });

    const sheet = await prisma.announcementSheet.upsert({
      where: { eventId },
      create: {
        churchId,
        eventId,
        key: body.key,
        filename: body.filename,
        mimeType: body.mimeType,
        uploadedById: session.user.id,
      },
      update: {
        key: body.key,
        filename: body.filename,
        mimeType: body.mimeType,
        uploadedById: session.user.id,
        uploadedAt: new Date(),
      },
    });

    if (existing && existing.key !== body.key) {
      await deleteMediaFile(existing.key);
    }

    await notifyReaders(churchId, eventId, event.title, existing !== null);

    return successResponse({ sheet }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:view", churchId);

    if (!(await canReadAnnouncementSheet(session, churchId))) {
      throw new ApiError(403, "Droit insuffisant pour consulter la feuille d'annonces");
    }

    const sheet = await prisma.announcementSheet.findUnique({
      where: { eventId },
      include: { uploadedBy: { select: { name: true, displayName: true } } },
    });

    if (!sheet) return successResponse({ sheet: null });

    const downloadUrl = await getSignedDownloadUrl(sheet.key, sheet.filename);

    return successResponse({
      sheet: {
        filename: sheet.filename,
        uploadedAt: sheet.uploadedAt.toISOString(),
        uploadedBy: sheet.uploadedBy.displayName ?? sheet.uploadedBy.name,
      },
      downloadUrl,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:view", churchId);

    if (!(await canDepositAnnouncementSheet(session, churchId))) {
      throw new ApiError(403, "Droit insuffisant pour retirer la feuille d'annonces");
    }

    const sheet = await prisma.announcementSheet.findUnique({ where: { eventId } });
    if (!sheet) throw new ApiError(404, "Aucune feuille d'annonces déposée pour cet événement");

    await prisma.announcementSheet.delete({ where: { eventId } });
    await deleteMediaFile(sheet.key);

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
