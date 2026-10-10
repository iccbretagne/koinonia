import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { previewImport } from "@/lib/config-import";
import { previewSchema } from "./contract";

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    if (!session.user.isSuperAdmin) {
      throw new ApiError(403, "Réservé aux super-administrateurs");
    }

    const body = previewSchema.parse(await request.json());

    if (body._meta.schemaVersion !== 1) {
      throw new ApiError(400, `Version de schéma non supportée : ${body._meta.schemaVersion}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const preview = await previewImport(body as any);
    return successResponse(preview);
  } catch (error) {
    return errorResponse(error);
  }
}
