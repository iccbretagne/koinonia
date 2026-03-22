import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("members:view", churchId);

    // Scope par département : seuls les rôles dans cette église comptent
    const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
    const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];
    const hasGlobalRole = session.user.isSuperAdmin || churchRoles.some((r) => GLOBAL_ROLES.includes(r.role));
    const scopedDeptIds = hasGlobalRole
      ? null
      : Array.from(new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id))));

    if (scopedDeptIds && departmentId && !scopedDeptIds.includes(departmentId)) {
      throw new ApiError(403, "Accès refusé à ce département");
    }

    const members = await prisma.member.findMany({
      where: {
        department: { ministry: { churchId } },
        ...(departmentId
          ? { departmentId }
          : scopedDeptIds
            ? { departmentId: { in: scopedDeptIds } }
            : {}),
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            ministry: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return successResponse(members);
  } catch (error) {
    return errorResponse(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    departmentId: z.string().min(1).optional(),
  }).optional(),
});

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { ids, action, data } = bulkSchema.parse(body);

    // Résoudre l'église à partir du premier membre
    if (ids.length === 0) throw new ApiError(400, "Au moins un ID requis");
    const { resolveChurchId } = await import("@/lib/auth");
    const firstMemberChurchId = await resolveChurchId("member", ids[0]);

    // Verify ALL ids belong to the same church
    if (ids.length > 1) {
      const allChurchIds = await Promise.all(ids.map((id) => resolveChurchId("member", id)));
      if (allChurchIds.some((cid) => cid !== firstMemberChurchId)) {
        throw new ApiError(400, "Tous les STAR doivent appartenir à la même église");
      }
    }

    const session = await requireChurchPermission("members:manage", firstMemberChurchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    // Scope par département dans cette église
    const churchRoles = session.user.churchRoles.filter((r) => r.churchId === firstMemberChurchId);
    const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];
    const hasGlobalRole = session.user.isSuperAdmin || churchRoles.some((r) => GLOBAL_ROLES.includes(r.role));
    const scopedDeptIds = hasGlobalRole
      ? null
      : Array.from(new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id))));

    if (scopedDeptIds) {
      const members = await prisma.member.findMany({
        where: { id: { in: ids } },
        select: { departmentId: true },
      });

      const allInScope = members.every((m) =>
        scopedDeptIds.includes(m.departmentId)
      );
      if (!allInScope) {
        throw new ApiError(403, "Certains STAR sont hors de votre périmètre");
      }

      if (action === "update" && data?.departmentId && !scopedDeptIds.includes(data.departmentId)) {
        throw new ApiError(403, "Département cible non autorisé");
      }
    }

    if (action === "delete") {
      await prisma.$transaction([
        prisma.planning.deleteMany({ where: { memberId: { in: ids } } }),
        prisma.member.deleteMany({ where: { id: { in: ids } } }),
      ]);
      for (const id of ids) {
        await logAudit({ userId: session.user.id, churchId: firstMemberChurchId, action: "DELETE", entityType: "Member", entityId: id });
      }
      return successResponse({ deleted: ids.length });
    }

    if (!data || Object.keys(data).length === 0) {
      return errorResponse(new Error("Aucune donnée à mettre à jour"));
    }

    await prisma.member.updateMany({
      where: { id: { in: ids } },
      data,
    });

    for (const id of ids) {
      await logAudit({ userId: session.user.id, churchId: firstMemberChurchId, action: "UPDATE", entityType: "Member", entityId: id, details: data });
    }
    return successResponse({ updated: ids.length });
  } catch (error) {
    return errorResponse(error);
  }
}

const createSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  departmentId: z.string().min(1, "Le département est requis"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    // Résoudre l'église du département cible
    const { resolveChurchId } = await import("@/lib/auth");
    const deptChurchId = await resolveChurchId("department", data.departmentId);
    const session = await requireChurchPermission("members:manage", deptChurchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    // Scope par département dans cette église
    const churchRoles = session.user.churchRoles.filter((r) => r.churchId === deptChurchId);
    const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];
    const hasGlobalRole = session.user.isSuperAdmin || churchRoles.some((r) => GLOBAL_ROLES.includes(r.role));
    const scopedDeptIds = hasGlobalRole
      ? null
      : Array.from(new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id))));

    if (scopedDeptIds && !scopedDeptIds.includes(data.departmentId)) {
      throw new ApiError(403, "Vous ne pouvez pas créer un STAR dans ce département");
    }

    const member = await prisma.member.create({
      data,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            ministry: { select: { id: true, name: true } },
          },
        },
      },
    });

    await logAudit({ userId: session.user.id, churchId: deptChurchId, action: "CREATE", entityType: "Member", entityId: member.id, details: { firstName: data.firstName, lastName: data.lastName } });

    return successResponse(member, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
