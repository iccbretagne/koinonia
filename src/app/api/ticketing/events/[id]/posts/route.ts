import { successResponse, errorResponse } from "@/lib/api-utils";
import { createPost, listTeam } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { postSchema } from "./contract";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireEventAction(id, "configure");
    return successResponse(await listTeam(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    const { name } = postSchema.parse(await request.json());
    return successResponse(await createPost(id, session.user.id, name), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
