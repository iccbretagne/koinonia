import { requireMediaUploadAccess, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import {
  validatePhotoFile,
  getExtensionFromMimeType,
  getQuarantineKey,
  getSignedPutUrl,
} from "@/modules/media";
import { signSchema } from "./contract";

/** POST — génère une presigned PUT URL pour upload direct navigateur → S3. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireMediaUploadAccess(churchId, "PHOTOS");

    const body = signSchema.parse(await request.json());
    validatePhotoFile(body.filename, body.mimeType, body.size);

    const quarantineId = crypto.randomUUID();
    const ext = getExtensionFromMimeType(body.mimeType);
    const quarantineKey = getQuarantineKey(id, quarantineId, ext);

    const url = await getSignedPutUrl(quarantineKey, body.mimeType);

    return successResponse({ quarantineId, url });
  } catch (error) {
    return errorResponse(error);
  }
}
