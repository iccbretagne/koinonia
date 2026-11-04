import { successResponse, errorResponse } from "@/lib/api-utils";
import { deletePost, renamePost } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { postSchema } from "./contract";

type Params = { params: Promise<{ id: string; postId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, postId } = await params;
    const { session } = await requireEventAction(id, "configure");
    const { name } = postSchema.parse(await request.json());
    return successResponse(await renamePost(id, postId, session.user.id, name));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, postId } = await params;
    const { session } = await requireEventAction(id, "configure");
    await deletePost(id, postId, session.user.id);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
