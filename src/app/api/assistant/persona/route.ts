import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { personaSchema } from "@/modules/assistant/schemas";

export async function GET() {
  try {
    const session = await requireAuth();
    const user = await prisma.user.findUnique({ where: { id: session.user.id! }, select: { assistantPersona: true } });
    return successResponse({ persona: user?.assistantPersona ?? "NIA" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuth();
    const { persona } = personaSchema.parse(await request.json());
    await prisma.user.update({ where: { id: session.user.id! }, data: { assistantPersona: persona } });
    return successResponse({ persona });
  } catch (error) {
    return errorResponse(error);
  }
}
