import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission, isSuperAdmin } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

async function requireChurchManageOrSuperAdmin() {
  const session = await requireAuth();
  if (isSuperAdmin(session.user.email)) return session;

  return requirePermission("church:manage");
}

export async function GET() {
  try {
    await requireChurchManageOrSuperAdmin();

    const churches = await prisma.church.findMany({
      include: {
        _count: { select: { users: true, ministries: true, events: true } },
      },
      orderBy: { name: "asc" },
    });

    return successResponse(churches);
  } catch (error) {
    return errorResponse(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
  }).optional(),
});

export async function PATCH(request: Request) {
  try {
    const patchSession = await requireChurchManageOrSuperAdmin();
    const body = await request.json();
    const { ids, action, data } = bulkSchema.parse(body);

    if (action === "delete") {
      await prisma.$transaction(async (tx) => {
        const ministryIds = (
          await tx.ministry.findMany({ where: { churchId: { in: ids } }, select: { id: true } })
        ).map((m) => m.id);
        const deptIds = ministryIds.length > 0
          ? (await tx.department.findMany({ where: { ministryId: { in: ministryIds } }, select: { id: true } })).map((d) => d.id)
          : [];
        if (deptIds.length > 0) {
          const eventDeptIds = (
            await tx.eventDepartment.findMany({ where: { departmentId: { in: deptIds } }, select: { id: true } })
          ).map((ed) => ed.id);
          await tx.planning.deleteMany({ where: { eventDepartmentId: { in: eventDeptIds } } });
          await tx.memberDepartment.deleteMany({ where: { departmentId: { in: deptIds } } });
          await tx.eventDepartment.deleteMany({ where: { departmentId: { in: deptIds } } });
          await tx.userDepartment.deleteMany({ where: { departmentId: { in: deptIds } } });
        }
        // Also delete event departments linked via events of these churches
        const eventIds = (
          await tx.event.findMany({ where: { churchId: { in: ids } }, select: { id: true } })
        ).map((e) => e.id);
        if (eventIds.length > 0) {
          const evtDeptIds = (
            await tx.eventDepartment.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } })
          ).map((ed) => ed.id);
          await tx.planning.deleteMany({ where: { eventDepartmentId: { in: evtDeptIds } } });
          await tx.eventDepartment.deleteMany({ where: { eventId: { in: eventIds } } });
        }
        if (deptIds.length > 0) {
          await tx.department.deleteMany({ where: { ministryId: { in: ministryIds } } });
        }
        if (ministryIds.length > 0) {
          await tx.ministry.deleteMany({ where: { churchId: { in: ids } } });
        }
        await tx.event.deleteMany({ where: { churchId: { in: ids } } });
        // Clean up user roles
        const roleIds = (
          await tx.userChurchRole.findMany({ where: { churchId: { in: ids } }, select: { id: true } })
        ).map((r) => r.id);
        if (roleIds.length > 0) {
          await tx.userDepartment.deleteMany({ where: { userChurchRoleId: { in: roleIds } } });
        }
        await tx.userChurchRole.deleteMany({ where: { churchId: { in: ids } } });
        await tx.church.deleteMany({ where: { id: { in: ids } } });
      });
      for (const id of ids) {
        await logAudit({ userId: patchSession.user.id, action: "DELETE", entityType: "Church", entityId: id });
      }
      return successResponse({ deleted: ids.length });
    }

    if (!data || Object.keys(data).length === 0) {
      return errorResponse(new Error("Aucune donnée à mettre à jour"));
    }

    await prisma.church.updateMany({
      where: { id: { in: ids } },
      data,
    });

    for (const id of ids) {
      await logAudit({ userId: patchSession.user.id, action: "UPDATE", entityType: "Church", entityId: id, details: data });
    }
    return successResponse({ updated: ids.length });
  } catch (error) {
    return errorResponse(error);
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  slug: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const postSession = await requireChurchManageOrSuperAdmin();
    const body = await request.json();
    const parsed = createSchema.parse(body);
    const slug = parsed.slug || generateSlug(parsed.name);

    const church = await prisma.church.create({
      data: { name: parsed.name, slug },
    });

    // Auto-promote all SUPER_ADMIN users to the new church
    const superAdminRoles = await prisma.userChurchRole.findMany({
      where: { role: "SUPER_ADMIN" },
      select: { userId: true },
    });
    const superAdminUserIds = new Set(superAdminRoles.map((r) => r.userId));

    // Also include users whose email is in SUPER_ADMIN_EMAILS but have no role yet
    const superAdminEmailUsers = await prisma.user.findMany({
      where: {
        email: { in: (process.env.SUPER_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean) },
      },
      select: { id: true },
    });
    for (const u of superAdminEmailUsers) {
      superAdminUserIds.add(u.id);
    }

    for (const userId of superAdminUserIds) {
      await prisma.userChurchRole.upsert({
        where: {
          userId_churchId_role: {
            userId,
            churchId: church.id,
            role: "SUPER_ADMIN",
          },
        },
        update: {},
        create: {
          userId,
          churchId: church.id,
          role: "SUPER_ADMIN",
        },
      });
    }

    await logAudit({ userId: postSession.user.id, churchId: church.id, action: "CREATE", entityType: "Church", entityId: church.id, details: { name: parsed.name, slug } });

    return successResponse(church, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
