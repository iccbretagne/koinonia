import { z } from "zod";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  canDepositAnnouncementSheet,
  validateSheetFile,
  getAnnouncementSheetKey,
  ALLOWED_SHEET_MIME_TYPES,
} from "@/modules/planning";
import { getSignedPutUrl } from "@/modules/storage";

const signSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  size: z.number().int().positive(),
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

    const body = signSchema.parse(await request.json());
    validateSheetFile(body.mimeType, body.size);

    const ext = ALLOWED_SHEET_MIME_TYPES[body.mimeType];
    const key = getAnnouncementSheetKey(churchId, eventId, crypto.randomUUID(), ext);
    const url = await getSignedPutUrl(key, body.mimeType);

    return successResponse({ key, url });
  } catch (error) {
    return errorResponse(error);
  }
}
