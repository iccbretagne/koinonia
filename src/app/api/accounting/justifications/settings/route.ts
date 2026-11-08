import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getJustificationSettings, updateJustificationSettings } from "@/modules/accounting";
import { requireJustificationViewer } from "../_viewer";
import { settingsSchema } from "./contract";

async function requireManager() {
  const viewer = await requireJustificationViewer();
  if (!viewer.manage) throw new ApiError(403, "Accès refusé");
  return viewer;
}

export async function GET() {
  try {
    const viewer = await requireManager();
    return successResponse(await getJustificationSettings(viewer.churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const viewer = await requireManager();
    const body = settingsSchema.parse(await request.json());
    return successResponse(await updateJustificationSettings(viewer.churchId, viewer.userId, body));
  } catch (error) {
    return errorResponse(error);
  }
}
