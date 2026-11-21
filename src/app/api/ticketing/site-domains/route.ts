import { requireSuperAdmin } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { listDomains } from "@/modules/ticketing";

export async function GET() {
  try {
    await requireSuperAdmin();
    return successResponse(await listDomains());
  } catch (error) {
    return errorResponse(error);
  }
}
