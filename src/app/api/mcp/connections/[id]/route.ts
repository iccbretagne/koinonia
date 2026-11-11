/** DELETE /api/mcp/connections/[id] — révocation d'une connexion (spec 081). */
import { requireAuth, requireChurchPermission } from "@/lib/auth";
import { errorResponse } from "@/lib/api-utils";
import { revokeConnection } from "@/modules/mcp";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    await revokeConnection(id, session.user.id, (churchId) =>
      requireChurchPermission("church:settings", churchId).then(
        () => true,
        () => false
      )
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
