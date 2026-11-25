import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { rolePermissions } from "@/lib/registry";
import { setPaymentTreasuryAccount } from "@/modules/accounting";
import { validatePaymentAccountChange } from "../../../_treasury";
import { treasuryAccountSchema } from "./contract";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const perms = session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? []);
    if (!perms.includes("accounting:manage")) throw new ApiError(403, "Accès refusé");

    const body = treasuryAccountSchema.parse(await request.json());
    const result = await setPaymentTreasuryAccount(id, body.treasuryAccountId, { id: session.user.id!, churchId }, (input) =>
      validatePaymentAccountChange(churchId, input)
    );
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
