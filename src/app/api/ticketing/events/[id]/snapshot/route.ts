import { successResponse, errorResponse } from "@/lib/api-utils";
import { cateringSnapshot, receptionSnapshot } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { snapshotQuerySchema } from "./contract";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { for: kind } = snapshotQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    await requireEventAction(id, kind === "reception" ? "reception" : "catering");
    const snapshot = kind === "reception" ? await receptionSnapshot(id) : await cateringSnapshot(id);
    return successResponse(snapshot);
  } catch (error) {
    return errorResponse(error);
  }
}
