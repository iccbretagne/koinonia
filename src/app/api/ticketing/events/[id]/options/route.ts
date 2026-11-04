import { successResponse, errorResponse } from "@/lib/api-utils";
import { createOption } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { optionCreateSchema } from "./contract";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    const data = optionCreateSchema.parse(await request.json());
    return successResponse(await createOption(id, session.user.id, data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
