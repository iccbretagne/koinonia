import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { requireAgendaView } from "@/modules/agenda/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  name: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide").nullable().optional(),
  role: z.enum(["PASTEUR", "ASSISTANT_PASTEUR", "BERGER"]),
  userId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireAgendaView(churchId);

    const profiles = await prisma.pastoralProfile.findMany({
      where: { churchId },
      include: {
        user: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return successResponse(profiles);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const session = await requireChurchPermission("church:manage", data.churchId);

    if (data.userId) {
      const role = await prisma.userChurchRole.findFirst({
        where: { userId: data.userId, churchId: data.churchId },
        select: { id: true },
      });
      if (!role) throw new ApiError(400, "Utilisateur introuvable ou n'appartient pas à cette église");
    }

    const profile = await prisma.pastoralProfile.create({
      data: {
        churchId: data.churchId,
        name: data.name,
        email: data.email ?? null,
        role: data.role,
        userId: data.userId ?? null,
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "PastoralProfile",
      entityId: profile.id,
      details: { name: data.name, role: data.role },
    });

    return successResponse(profile, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
