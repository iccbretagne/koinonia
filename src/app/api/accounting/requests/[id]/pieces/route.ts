import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { submitPieces } from "@/modules/accounting";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const existing = await prisma.financialRequest.findUnique({ where: { id }, select: { churchId: true, submittedById: true } });
    // L'église de la demande fait autorité : le demandeur doit en être membre.
    const member = existing && session.user.churchRoles.some((r) => r.churchId === existing.churchId);
    if (!existing || (!member && !session.user.isSuperAdmin)) throw new ApiError(404, "Demande introuvable");

    const files = (await request.formData()).getAll("files").filter((f): f is File => f instanceof File);
    const result = await submitPieces(id, { id: session.user.id!, name: session.user.name ?? session.user.email ?? "Le demandeur" }, files);
    return successResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
