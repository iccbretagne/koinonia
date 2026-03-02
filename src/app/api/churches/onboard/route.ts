import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const onboardSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  slug: z
    .string()
    .min(1, "L'identifiant est requis")
    .regex(/^[a-z0-9-]+$/, "L'identifiant ne peut contenir que des lettres minuscules, chiffres et tirets"),
  adminEmail: z.string().email("Email invalide").optional().or(z.literal("")),
});

export async function POST(request: Request) {
  try {
    const session = await requirePermission("church:manage");
    const body = await request.json();
    const { name, slug, adminEmail } = onboardSchema.parse(body);

    // Check slug uniqueness
    const existing = await prisma.church.findUnique({ where: { slug } });
    if (existing) {
      throw new ApiError(409, "Cet identifiant est déjà utilisé");
    }

    const church = await prisma.$transaction(async (tx) => {
      const newChurch = await tx.church.create({
        data: { name, slug },
      });

      // If admin email specified, create or find user and assign ADMIN role
      if (adminEmail) {
        let user = await tx.user.findUnique({ where: { email: adminEmail } });

        if (!user) {
          user = await tx.user.create({
            data: { email: adminEmail },
          });
        }

        await tx.userChurchRole.create({
          data: {
            userId: user.id,
            churchId: newChurch.id,
            role: "ADMIN",
          },
        });
      }

      // Also give the current super admin access
      await tx.userChurchRole.upsert({
        where: {
          userId_churchId_role: {
            userId: session.user.id,
            churchId: newChurch.id,
            role: "SUPER_ADMIN",
          },
        },
        update: {},
        create: {
          userId: session.user.id,
          churchId: newChurch.id,
          role: "SUPER_ADMIN",
        },
      });

      return newChurch;
    });

    await logAudit({
      userId: session.user.id,
      churchId: church.id,
      action: "CREATE",
      entityType: "Church",
      entityId: church.id,
      details: { name, slug, adminEmail },
    });

    return successResponse(church, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
