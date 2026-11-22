import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireFormManage } from "@/modules/forms/auth";
import { addFormManager, listFormManagers } from "@/modules/forms";
import { managerSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireFormManage(id);
    return successResponse(await listFormManagers(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, churchId } = await requireFormManage(id, { owner: true });
    const { userId } = managerSchema.parse(await request.json());
    return successResponse(await addFormManager(id, churchId, session.user.id, userId), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
