import { successResponse, errorResponse } from "@/lib/api-utils";
import { createAssignment } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { assignmentSchema } from "./contract";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    const data = assignmentSchema.parse(await request.json());
    return successResponse(await createAssignment(id, session.user.id, data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
