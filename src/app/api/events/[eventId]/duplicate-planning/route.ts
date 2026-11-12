import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { schema } from "./contract";
import { duplicatePlanning } from "./_core";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId: sourceEventId } = await params;
    const churchId = await resolveChurchId("event", sourceEventId);
    const session = await requireChurchPermission("planning:edit", churchId);
    const body = await request.json();
    const { targetEventId } = schema.parse(body);

    const result = await duplicatePlanning(session, churchId, sourceEventId, targetEventId);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
