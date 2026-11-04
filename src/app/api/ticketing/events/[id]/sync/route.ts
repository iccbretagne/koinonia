import { successResponse, errorResponse } from "@/lib/api-utils";
import { applyOperations } from "@/modules/ticketing";
import { requireEventRole } from "@/modules/ticketing/auth";
import { readJson } from "../../../_shared";
import { syncSchema } from "./contract";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, access } = await requireEventRole(id, ["ORGANIZER", "RECEPTION", "CATERING"]);
    const data = syncSchema.parse(await readJson(request, 512 * 1024));
    return successResponse(await applyOperations(id, data, { userId: session.user.id, roles: access.roles }));
  } catch (error) {
    return errorResponse(error);
  }
}
