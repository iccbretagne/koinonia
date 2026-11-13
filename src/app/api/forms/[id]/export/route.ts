import { errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireFormManage } from "@/modules/forms/auth";
import { exportResponses } from "@/modules/forms";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, churchId } = await requireFormManage(id);
    const { buffer, fileName, count } = await exportResponses(id);
    await logAudit({ userId: session.user.id, churchId, action: "EXPORT", entityType: "Form", entityId: id, details: { responses: count } });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
