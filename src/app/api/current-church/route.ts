import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { cookies } from "next/headers";
import { z } from "zod";

const schema = z.object({
  churchId: z.string().min(1, "L'ID de l'église est requis"),
});

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { churchId } = schema.parse(body);

    const hasRoleAccess = session.user.churchRoles.some((r) => r.churchId === churchId);
    const hasPastoralAccess = (session.user.pastoralChurchIds ?? []).includes(churchId);
    if (!hasRoleAccess && !hasPastoralAccess) {
      throw new ApiError(403, "Vous n'avez pas accès à cette église");
    }

    const cookieStore = await cookies();
    cookieStore.set("current-church", churchId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return successResponse({ churchId });
  } catch (error) {
    return errorResponse(error);
  }
}
