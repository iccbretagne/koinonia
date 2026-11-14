import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireFormManage } from "@/modules/forms/auth";
import { listFacilitators, setFacilitators } from "@/modules/forms";
import { readJson } from "../../_shared";
import { facilitatorsSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireFormManage(id);
    return successResponse(await listFacilitators(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, churchId } = await requireFormManage(id);
    const { facilitators } = facilitatorsSchema.parse(await readJson(request));
    const saved = await setFacilitators(id, churchId, facilitators);
    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "FormFacilitators",
      entityId: id,
      details: { facilitators: facilitators.map((f) => ({ userId: f.userId, allScope: f.allScope, scopes: f.scopes })) },
    });
    return successResponse(saved);
  } catch (error) {
    return errorResponse(error);
  }
}
